import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import sharp from "sharp";
import { encodeGif, pixelateImage, renderAnimation, validateProject, type PixelProject, type PixelateOptions } from "@code-as-pixelart/core";

export async function importImageFile(filename: string, options: PixelateOptions): Promise<PixelProject> {
  const image = sharp(resolve(filename), { failOn: "error" }).ensureAlpha();
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) throw new Error(`Could not read image dimensions: ${filename}`);
  const pixels = await image.raw().toBuffer();
  return pixelateImage({ width: metadata.width, height: metadata.height, pixels }, { ...options, name: options.name ?? basename(filename).replace(/\.[^.]+$/, "") });
}

export async function readProject(filename: string): Promise<PixelProject> {
  const parsed: unknown = JSON.parse(await readFile(resolve(filename), "utf8"));
  const validation = validateProject(parsed);
  if (!validation.valid) {
    const issue = validation.issues[0]!;
    throw new Error(`${issue.message} Repair: ${issue.repair}`);
  }
  return parsed as PixelProject;
}

export async function writeProjectAtomic(filename: string, project: PixelProject): Promise<void> {
  const validation = validateProject(project);
  if (!validation.valid) throw new Error(`Refusing to write invalid project: ${validation.issues[0]?.path} ${validation.issues[0]?.message}`);
  const output = resolve(filename);
  const temporary = join(dirname(output), `.${basename(output)}.${process.pid}.tmp`);
  await writeFile(temporary, `${JSON.stringify(project, null, 2)}\n`, "utf8");
  await rename(temporary, output);
}

export async function writeAnimationGif(project: PixelProject, options: { characterId: string; animationId: string; output: string; variantId?: string; poseId?: string; scale?: number }): Promise<{ bytes: number; hash: string; frames: number }> {
  const character = project.characters.find((item) => item.id === options.characterId);
  const animation = character?.animations.find((item) => item.id === options.animationId);
  if (!character) throw new Error(`Character not found: ${options.characterId}`);
  if (!animation) throw new Error(`Animation not found: ${options.animationId}`);
  const frames = renderAnimation(project, { characterId: character.id, animationId: animation.id, ...(options.variantId ? { variantId: options.variantId } : {}), ...(options.poseId ? { poseId: options.poseId } : {}) });
  const bytes = encodeGif(frames, { ticksPerSecond: project.ticksPerSecond, scale: options.scale ?? 1, loop: animation.loop });
  await writeFile(resolve(options.output), bytes);
  return { bytes: bytes.length, hash: createHash("sha256").update(bytes).digest("hex"), frames: frames.length };
}

export function hashProject(project: PixelProject): string {
  return createHash("sha256").update(JSON.stringify(project)).digest("hex");
}
