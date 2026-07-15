import type { Character, PixelProject, RenderedFrame, SheetLayout, SpriteSheet } from "./types.js";

export function packSpriteSheet(frames: RenderedFrame[], layout: SheetLayout = "packed"): SpriteSheet {
  if (frames.length === 0) throw new Error("Cannot pack an empty animation");
  const frameWidth = frames[0]!.width;
  const frameHeight = frames[0]!.height;
  if (frames.some((frame) => frame.width !== frameWidth || frame.height !== frameHeight)) throw new Error("Every frame in a sprite sheet must have equal dimensions");
  const columns = layout === "horizontal" ? frames.length : layout === "vertical" ? 1 : Math.ceil(Math.sqrt(frames.length));
  const rows = Math.ceil(frames.length / columns);
  const width = columns * frameWidth;
  const height = rows * frameHeight;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const placements: SpriteSheet["frames"] = [];
  frames.forEach((frame, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = column * frameWidth;
    const y = row * frameHeight;
    placements.push({ frameId: frame.frameId, x, y, width: frameWidth, height: frameHeight });
    for (let sourceY = 0; sourceY < frameHeight; sourceY += 1) {
      const sourceStart = sourceY * frameWidth * 4;
      const destinationStart = ((y + sourceY) * width + x) * 4;
      pixels.set(frame.pixels.subarray(sourceStart, sourceStart + frameWidth * 4), destinationStart);
    }
  });
  return { width, height, pixels, frames: placements };
}

export function createManifest(project: PixelProject, character: Character, animationId: string, frames: RenderedFrame[], sheet: SpriteSheet) {
  const animation = character.animations.find((item) => item.id === animationId);
  if (!animation) throw new Error(`Animation not found: ${animationId}`);
  return {
    schemaVersion: 1,
    projectId: project.id,
    characterId: character.id,
    animationId,
    ticksPerSecond: project.ticksPerSecond,
    sheet: { width: sheet.width, height: sheet.height },
    origin: character.origin,
    pivot: character.pivot,
    anchors: character.anchors,
    frames: sheet.frames.map((placement, index) => ({ ...placement, durationTicks: frames[index]!.durationTicks, hash: frames[index]!.hash })),
  };
}
