import { emptyGrid } from "./grid.js";
import type { PixelGrid, PixelProject } from "./types.js";

export interface RasterImage {
  width: number;
  height: number;
  pixels: Uint8Array | Uint8ClampedArray;
}

export interface PixelateOptions {
  name?: string;
  width?: number;
  height?: number;
  colors?: number;
  alphaThreshold?: number;
  removeBackground?: boolean;
  backgroundTolerance?: number;
  cropToContent?: boolean;
}

interface ColorSample { red: number; green: number; blue: number; count: number }

export function pixelateImage(image: RasterImage, options: PixelateOptions = {}): PixelProject {
  validateImage(image);
  const width = options.width ?? 32;
  const height = options.height ?? width;
  const colorCount = options.colors ?? 12;
  const alphaThreshold = options.alphaThreshold ?? 24;
  const tolerance = options.backgroundTolerance ?? 34;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 8 || height < 8 || width > 256 || height > 256) throw new Error("Sprite dimensions must be integers from 8 to 256");
  if (!Number.isInteger(colorCount) || colorCount < 2 || colorCount > 64) throw new Error("Palette colors must be an integer from 2 to 64");

  const edgeColor = averageCorners(image);
  const isVisible = (index: number) => image.pixels[index + 3]! > alphaThreshold && (!options.removeBackground || colorDistance(image.pixels[index]!, image.pixels[index + 1]!, image.pixels[index + 2]!, edgeColor) > tolerance * tolerance);
  const bounds = options.cropToContent === false ? { x: 0, y: 0, width: image.width, height: image.height } : contentBounds(image, isVisible);
  const downsampled = downsampleContained(image, bounds, width, height, isVisible);
  const samples = collectColors(downsampled, alphaThreshold);
  const palette = medianCut(samples, Math.min(colorCount, samples.length));
  const grid = emptyGrid(width, height);
  for (let index = 0; index < width * height; index += 1) {
    const pixelIndex = index * 4;
    if (downsampled[pixelIndex + 3]! <= alphaThreshold || palette.length === 0) continue;
    grid.cells[index] = `color-${String(nearestPalette(downsampled[pixelIndex]!, downsampled[pixelIndex + 1]!, downsampled[pixelIndex + 2]!, palette) + 1).padStart(2, "0")}`;
  }
  return projectFromGrid(grid, palette, options.name ?? "Imported mascot", image.width, image.height);
}

function projectFromGrid(grid: PixelGrid, palette: ColorSample[], name: string, sourceWidth: number, sourceHeight: number): PixelProject {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "mascot";
  return {
    schemaVersion: 1,
    id: slug,
    name,
    ticksPerSecond: 12,
    palette: palette.map((color, index) => ({ id: `color-${String(index + 1).padStart(2, "0")}`, name: `Imported ${index + 1}`, color: toHex(color.red, color.green, color.blue) })),
    characters: [{
      id: slug,
      name,
      width: grid.width,
      height: grid.height,
      origin: { x: Math.floor(grid.width / 2), y: grid.height - 1 },
      pivot: { x: Math.floor(grid.width / 2), y: Math.floor(grid.height / 2) },
      bounds: { x: 0, y: 0, width: grid.width, height: grid.height },
      anchors: { center: { x: Math.floor(grid.width / 2), y: Math.floor(grid.height / 2) }, feet: { x: Math.floor(grid.width / 2), y: grid.height - 1 } },
      parts: [{ id: "root", name: "Imported sprite", pivot: { x: Math.floor(grid.width / 2), y: Math.floor(grid.height / 2) } }],
      layers: [{ id: "sprite", name: "Imported sprite", partId: "root", zIndex: 10, visible: true, locked: false, linked: false }],
      views: [{ id: "front", name: "Front", frames: [{ id: "front-idle", name: "Idle", durationTicks: 6, cels: { sprite: { grid, offset: { x: 0, y: 0 } } } }] }],
      poses: [{ id: "neutral", name: "Neutral", transforms: {}, patches: [] }],
      variants: [],
      animations: [{ id: "front-idle", name: "Front idle", viewId: "front", frames: [{ frameId: "front-idle", durationTicks: 6 }], loop: true, tags: ["idle", "front"] }],
      metadata: { source: "image-import", sourceDimensions: `${sourceWidth}x${sourceHeight}`, conversion: "deterministic-area-sampling-median-cut" },
    }],
    metadata: { description: "A deterministic image-to-sprite import ready for agent refinement." },
  };
}

function validateImage(image: RasterImage): void {
  if (!Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 1 || image.height < 1) throw new Error("Image dimensions must be positive integers");
  if (image.pixels.length !== image.width * image.height * 4) throw new Error("Image pixel buffer must contain width * height * 4 RGBA bytes");
}

function averageCorners(image: RasterImage): [number, number, number] {
  const points = [[0, 0], [image.width - 1, 0], [0, image.height - 1], [image.width - 1, image.height - 1]];
  let red = 0; let green = 0; let blue = 0;
  for (const [x, y] of points) { const index = (y! * image.width + x!) * 4; red += image.pixels[index]!; green += image.pixels[index + 1]!; blue += image.pixels[index + 2]!; }
  return [Math.round(red / 4), Math.round(green / 4), Math.round(blue / 4)];
}

function contentBounds(image: RasterImage, visible: (index: number) => boolean) {
  let minX = image.width; let minY = image.height; let maxX = -1; let maxY = -1;
  for (let y = 0; y < image.height; y += 1) for (let x = 0; x < image.width; x += 1) if (visible((y * image.width + x) * 4)) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  return maxX < 0 ? { x: 0, y: 0, width: image.width, height: image.height } : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function downsampleContained(image: RasterImage, bounds: { x: number; y: number; width: number; height: number }, width: number, height: number, visible: (index: number) => boolean): Uint8ClampedArray {
  const output = new Uint8ClampedArray(width * height * 4);
  const scale = Math.min(width / bounds.width, height / bounds.height);
  const drawWidth = Math.max(1, Math.round(bounds.width * scale));
  const drawHeight = Math.max(1, Math.round(bounds.height * scale));
  const startX = Math.floor((width - drawWidth) / 2);
  const startY = Math.floor((height - drawHeight) / 2);
  for (let y = 0; y < drawHeight; y += 1) for (let x = 0; x < drawWidth; x += 1) {
    const sourceStartX = bounds.x + Math.floor(x * bounds.width / drawWidth);
    const sourceEndX = bounds.x + Math.max(sourceStartX + 1, Math.ceil((x + 1) * bounds.width / drawWidth));
    const sourceStartY = bounds.y + Math.floor(y * bounds.height / drawHeight);
    const sourceEndY = bounds.y + Math.max(sourceStartY + 1, Math.ceil((y + 1) * bounds.height / drawHeight));
    let red = 0; let green = 0; let blue = 0; let alpha = 0; let count = 0;
    for (let sourceY = sourceStartY; sourceY < Math.min(sourceEndY, image.height); sourceY += 1) for (let sourceX = sourceStartX; sourceX < Math.min(sourceEndX, image.width); sourceX += 1) {
      const sourceIndex = (sourceY * image.width + sourceX) * 4;
      if (!visible(sourceIndex)) continue;
      red += image.pixels[sourceIndex]!; green += image.pixels[sourceIndex + 1]!; blue += image.pixels[sourceIndex + 2]!; alpha += image.pixels[sourceIndex + 3]!; count += 1;
    }
    if (count === 0) continue;
    const destinationIndex = ((startY + y) * width + startX + x) * 4;
    output[destinationIndex] = Math.round(red / count); output[destinationIndex + 1] = Math.round(green / count); output[destinationIndex + 2] = Math.round(blue / count); output[destinationIndex + 3] = Math.round(alpha / count);
  }
  return output;
}

function collectColors(pixels: Uint8ClampedArray, alphaThreshold: number): ColorSample[] {
  const colors = new Map<string, ColorSample>();
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3]! <= alphaThreshold) continue;
    const red = pixels[index]!; const green = pixels[index + 1]!; const blue = pixels[index + 2]!;
    const key = `${red},${green},${blue}`; const existing = colors.get(key);
    if (existing) existing.count += 1; else colors.set(key, { red, green, blue, count: 1 });
  }
  return [...colors.values()];
}

function medianCut(samples: ColorSample[], maximum: number): ColorSample[] {
  if (samples.length <= maximum) return [...samples].sort((a, b) => luminance(a) - luminance(b));
  let boxes: ColorSample[][] = [samples];
  while (boxes.length < maximum) {
    boxes.sort((a, b) => boxScore(b) - boxScore(a));
    const target = boxes.shift();
    if (!target || target.length < 2) { if (target) boxes.unshift(target); break; }
    const channel = widestChannel(target);
    target.sort((a, b) => a[channel] - b[channel]);
    const total = target.reduce((sum, color) => sum + color.count, 0); let cursor = 0; let split = 1;
    for (; split < target.length; split += 1) { cursor += target[split - 1]!.count; if (cursor >= total / 2) break; }
    boxes.push(target.slice(0, split), target.slice(split));
  }
  return boxes.map((box) => {
    const count = box.reduce((sum, color) => sum + color.count, 0);
    return { red: Math.round(box.reduce((sum, color) => sum + color.red * color.count, 0) / count), green: Math.round(box.reduce((sum, color) => sum + color.green * color.count, 0) / count), blue: Math.round(box.reduce((sum, color) => sum + color.blue * color.count, 0) / count), count };
  }).sort((a, b) => luminance(a) - luminance(b));
}

function widestChannel(colors: ColorSample[]): "red" | "green" | "blue" { const ranges = (["red", "green", "blue"] as const).map((channel) => ({ channel, range: Math.max(...colors.map((color) => color[channel])) - Math.min(...colors.map((color) => color[channel])) })); return ranges.sort((a, b) => b.range - a.range)[0]!.channel; }
function boxScore(colors: ColorSample[]): number { const channel = widestChannel(colors); return (Math.max(...colors.map((color) => color[channel])) - Math.min(...colors.map((color) => color[channel]))) * colors.reduce((sum, color) => sum + color.count, 0); }
function nearestPalette(red: number, green: number, blue: number, palette: ColorSample[]): number { let closest = 0; let distance = Number.POSITIVE_INFINITY; palette.forEach((color, index) => { const candidate = colorDistance(red, green, blue, [color.red, color.green, color.blue]); if (candidate < distance) { distance = candidate; closest = index; } }); return closest; }
function colorDistance(red: number, green: number, blue: number, color: [number, number, number]): number { return (red - color[0]) ** 2 + (green - color[1]) ** 2 + (blue - color[2]) ** 2; }
function luminance(color: ColorSample): number { return color.red * .2126 + color.green * .7152 + color.blue * .0722; }
function toHex(red: number, green: number, blue: number): string { return `#${[red, green, blue].map((value) => value.toString(16).padStart(2, "0")).join("").toUpperCase()}`; }
