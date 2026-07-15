import { getCharacter, getFrame } from "./operations.js";
import type { Cel, Character, PixelProject, RenderedFrame, RenderFrameOptions, TokenId, Variant } from "./types.js";

export function renderFrame(project: PixelProject, options: RenderFrameOptions): RenderedFrame {
  const character = getCharacter(project, options.characterId);
  const frame = getFrame(character, options.viewId, options.frameId);
  const pose = options.poseId ? character.poses.find((item) => item.id === options.poseId) : undefined;
  if (options.poseId && !pose) throw new Error(`Pose not found: ${options.poseId}`);
  const variant = options.variantId ? resolveVariant(character, options.variantId) : undefined;
  const palette = new Map(project.palette.map((token) => [token.id, parseColor(token.color)]));
  const pixels = new Uint8ClampedArray(character.width * character.height * 4);

  for (const layer of [...character.layers].sort((a, b) => a.zIndex - b.zIndex)) {
    if (!layer.visible) continue;
    const transform = pose?.transforms[layer.partId] ?? { x: 0, y: 0, flipX: false, visible: true };
    if (!transform.visible) continue;
    const overrideKey = `${options.viewId}:${options.frameId}:${layer.id}`;
    const cel = variant?.celOverrides[overrideKey] ?? frame.cels[layer.id];
    if (!cel) continue;
    const patches = (pose?.patches ?? []).filter((patch) => patch.viewId === options.viewId && patch.layerId === layer.id && (!patch.frameId || patch.frameId === options.frameId));
    drawCel(pixels, character, cel, transform, variant, palette, patches);
  }
  return { width: character.width, height: character.height, pixels, hash: hashPixels(pixels), frameId: frame.id, durationTicks: frame.durationTicks };
}

export function renderAnimation(project: PixelProject, options: { characterId: string; animationId: string; poseId?: string; variantId?: string }): RenderedFrame[] {
  const character = getCharacter(project, options.characterId);
  const clip = character.animations.find((item) => item.id === options.animationId);
  if (!clip) throw new Error(`Animation not found: ${options.animationId}`);
  return clip.frames.map((reference) => {
    const rendered = renderFrame(project, { characterId: character.id, viewId: clip.viewId, frameId: reference.frameId, ...(options.poseId ? { poseId: options.poseId } : {}), ...(options.variantId ? { variantId: options.variantId } : {}) });
    return reference.durationTicks ? { ...rendered, durationTicks: reference.durationTicks } : rendered;
  });
}

function drawCel(output: Uint8ClampedArray, character: Character, cel: Cel, transform: { x: number; y: number; flipX: boolean }, variant: Variant | undefined, palette: Map<string, [number, number, number, number]>, patches: Array<{ x: number; y: number; tokenId: TokenId | null }>): void {
  const opacity = cel.opacity ?? 1;
  const patchMap = new Map(patches.map((patch) => [`${patch.x},${patch.y}`, patch]));
  const applied = new Set<string>();
  for (let sourceY = 0; sourceY < cel.grid.height; sourceY += 1) {
    for (let sourceX = 0; sourceX < cel.grid.width; sourceX += 1) {
      const readX = transform.flipX ? cel.grid.width - 1 - sourceX : sourceX;
      const x = sourceX + cel.offset.x + transform.x;
      const y = sourceY + cel.offset.y + transform.y;
      const patchKey = `${x},${y}`;
      const patch = patchMap.get(patchKey);
      if (patch) applied.add(patchKey);
      const sourceToken = patch ? patch.tokenId : cel.grid.cells[sourceY * cel.grid.width + readX] ?? null;
      const tokenId = mapToken(sourceToken, variant);
      if (!tokenId) continue;
      blendAt(output, character.width, character.height, x, y, palette.get(tokenId), opacity);
    }
  }
  for (const patch of patches) {
    if (applied.has(`${patch.x},${patch.y}`)) continue;
    const tokenId = mapToken(patch.tokenId, variant);
    if (tokenId) blendAt(output, character.width, character.height, patch.x, patch.y, palette.get(tokenId), opacity);
  }
}

function resolveVariant(character: Character, variantId: string): Variant {
  const chain: Variant[] = [];
  const seen = new Set<string>();
  let current = character.variants.find((variant) => variant.id === variantId);
  if (!current) throw new Error(`Variant not found: ${variantId}`);
  while (current) {
    if (seen.has(current.id)) throw new Error(`Variant inheritance cycle at ${current.id}`);
    seen.add(current.id);
    chain.unshift(current);
    current = current.baseVariantId ? character.variants.find((variant) => variant.id === current!.baseVariantId) : undefined;
  }
  return chain.reduce<Variant>((combined, item) => ({
    id: variantId,
    name: item.name,
    paletteMap: { ...combined.paletteMap, ...item.paletteMap },
    celOverrides: { ...combined.celOverrides, ...item.celOverrides },
    ...(item.metadata ? { metadata: { ...(combined.metadata ?? {}), ...item.metadata } } : {}),
  }), { id: variantId, name: variantId, paletteMap: {}, celOverrides: {} });
}

function mapToken(tokenId: TokenId | null, variant: Variant | undefined): TokenId | null {
  if (!tokenId) return null;
  let current = tokenId;
  const seen = new Set<string>();
  while (variant?.paletteMap[current] && !seen.has(current)) {
    seen.add(current);
    current = variant.paletteMap[current]!;
  }
  return current;
}

function parseColor(color: string): [number, number, number, number] {
  if (!/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(color)) throw new Error(`Invalid color: ${color}`);
  return [Number.parseInt(color.slice(1, 3), 16), Number.parseInt(color.slice(3, 5), 16), Number.parseInt(color.slice(5, 7), 16), color.length === 9 ? Number.parseInt(color.slice(7, 9), 16) : 255];
}

function blendAt(output: Uint8ClampedArray, width: number, height: number, x: number, y: number, color: [number, number, number, number] | undefined, opacity: number): void {
  if (!color || x < 0 || y < 0 || x >= width || y >= height) return;
  const index = (y * width + x) * 4;
  const sourceAlpha = (color[3] / 255) * opacity;
  const destinationAlpha = output[index + 3]! / 255;
  const alpha = sourceAlpha + destinationAlpha * (1 - sourceAlpha);
  if (alpha <= 0) return;
  for (let channel = 0; channel < 3; channel += 1) {
    output[index + channel] = Math.round((color[channel]! * sourceAlpha + output[index + channel]! * destinationAlpha * (1 - sourceAlpha)) / alpha);
  }
  output[index + 3] = Math.round(alpha * 255);
}

export function hashPixels(pixels: Uint8ClampedArray): string {
  let hash = 0x811c9dc5;
  for (const byte of pixels) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
