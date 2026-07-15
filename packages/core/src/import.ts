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
  padding?: number;
  preserveDetails?: boolean;
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
  const padding = options.padding ?? 1;
  if (!Number.isInteger(padding) || padding < 0 || padding > Math.floor(Math.min(width, height) / 3)) throw new Error("Padding must be a non-negative integer that leaves room for the sprite");
  const downsampled = downsampleContained(image, bounds, width, height, isVisible, padding);
  const samples = collectColors(downsampled, alphaThreshold);
  const palette = quantizeColors(samples, Math.min(colorCount, samples.length), options.preserveDetails !== false);
  const tokens = semanticTokens(palette);
  const grid = emptyGrid(width, height);
  for (let index = 0; index < width * height; index += 1) {
    const pixelIndex = index * 4;
    if (downsampled[pixelIndex + 3]! <= alphaThreshold || palette.length === 0) continue;
    grid.cells[index] = tokens[nearestPalette(downsampled[pixelIndex]!, downsampled[pixelIndex + 1]!, downsampled[pixelIndex + 2]!, palette)]!.id;
  }
  return projectFromGrid(grid, tokens, options.name ?? "Imported mascot", image.width, image.height);
}

function projectFromGrid(grid: PixelGrid, palette: Array<{ id: string; name: string; color: string }>, name: string, sourceWidth: number, sourceHeight: number): PixelProject {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "mascot";
  const segmented = segmentGrid(grid);
  return {
    schemaVersion: 1,
    id: slug,
    name,
    ticksPerSecond: 12,
    palette,
    characters: [{
      id: slug,
      name,
      width: grid.width,
      height: grid.height,
      origin: { x: Math.floor(grid.width / 2), y: grid.height - 1 },
      pivot: { x: Math.floor(grid.width / 2), y: Math.floor(grid.height / 2) },
      bounds: { x: 0, y: 0, width: grid.width, height: grid.height },
      anchors: { center: { x: Math.floor(grid.width / 2), y: Math.floor(grid.height / 2) }, feet: { x: Math.floor(grid.width / 2), y: grid.height - 1 } },
      parts: segmented.parts,
      layers: segmented.layers,
      views: [{ id: "front", name: "Front", frames: [{ id: "front-idle", name: "Idle", durationTicks: 6, cels: segmented.cels }] }],
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

function downsampleContained(image: RasterImage, bounds: { x: number; y: number; width: number; height: number }, width: number, height: number, visible: (index: number) => boolean, padding: number): Uint8ClampedArray {
  const output = new Uint8ClampedArray(width * height * 4);
  const availableWidth = Math.max(1, width - padding * 2);
  const availableHeight = Math.max(1, height - padding * 2);
  const scale = Math.min(availableWidth / bounds.width, availableHeight / bounds.height);
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
  if (maximum <= 0 || samples.length === 0) return [];
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
    split = Math.max(1, Math.min(target.length - 1, split));
    const left = target.slice(0, split); const right = target.slice(split);
    if (left.length === 0 || right.length === 0) { boxes.push(target); break; }
    boxes.push(left, right);
  }
  return boxes.filter((box) => box.length > 0).map((box) => {
    const count = box.reduce((sum, color) => sum + color.count, 0);
    if (count <= 0) return { red: 0, green: 0, blue: 0, count: 0 };
    return { red: Math.round(box.reduce((sum, color) => sum + color.red * color.count, 0) / count), green: Math.round(box.reduce((sum, color) => sum + color.green * color.count, 0) / count), blue: Math.round(box.reduce((sum, color) => sum + color.blue * color.count, 0) / count), count };
  }).filter((color, index, all) => color.count > 0 && all.findIndex((candidate) => candidate.red === color.red && candidate.green === color.green && candidate.blue === color.blue) === index).sort((a, b) => luminance(a) - luminance(b));
}

function quantizeColors(samples: ColorSample[], maximum: number, preserveDetails: boolean): ColorSample[] {
  if (!preserveDetails || maximum < 3 || samples.length <= maximum) return medianCut(samples, maximum);
  const total = samples.reduce((sum, sample) => sum + sample.count, 0);
  const dominant = [...samples].sort((a, b) => b.count - a.count)[0];
  if (!dominant) return [];
  const protectedColors = [...samples]
    .filter((sample) => sample.count <= Math.max(2, Math.ceil(total * .035)))
    .sort((a, b) => colorDistance(b.red, b.green, b.blue, [dominant.red, dominant.green, dominant.blue]) - colorDistance(a.red, a.green, a.blue, [dominant.red, dominant.green, dominant.blue]))
    .slice(0, Math.min(2, maximum - 1));
  const protectedSet = new Set(protectedColors);
  const reduced = medianCut(samples.filter((sample) => !protectedSet.has(sample)), maximum - protectedColors.length);
  return [...reduced, ...protectedColors]
    .filter((color, index, all) => all.findIndex((candidate) => candidate.red === color.red && candidate.green === color.green && candidate.blue === color.blue) === index)
    .sort((a, b) => luminance(a) - luminance(b));
}

function semanticTokens(colors: ColorSample[]): Array<{ id: string; name: string; color: string }> {
  if (colors.length === 0) return [];
  const dominantIndex = colors.reduce((best, color, index) => color.count > colors[best]!.count ? index : best, 0);
  const outlineIndex = colors.length > 1 ? colors.reduce((best, color, index) => index !== dominantIndex && (best === dominantIndex || luminance(color) < luminance(colors[best]!)) ? index : best, dominantIndex) : -1;
  let marking = 0;
  return colors.map((color, index) => {
    const role = index === dominantIndex ? { id: "body", name: "Body" }
      : index === outlineIndex ? { id: "outline", name: "Outline" }
      : { id: `marking-${String(++marking).padStart(2, "0")}`, name: marking === 1 ? "Primary marking" : `Marking ${marking}` };
    return { ...role, color: toHex(color.red, color.green, color.blue) };
  });
}

function segmentGrid(grid: PixelGrid): { parts: PixelProject["characters"][number]["parts"]; layers: PixelProject["characters"][number]["layers"]; cels: PixelProject["characters"][number]["views"][number]["frames"][number]["cels"] } {
  const center = Math.floor(grid.width / 2);
  const headEnd = Math.max(1, Math.floor(grid.height * .38));
  const legsStart = Math.min(grid.height - 1, Math.floor(grid.height * .7));
  const definitions = [
    { id: "body", name: "Body", match: (_token: string, _x: number, y: number) => y >= headEnd && y < legsStart },
    { id: "head", name: "Head", match: (_token: string, _x: number, y: number) => y < headEnd },
    { id: "left-leg", name: "Left leg", match: (_token: string, x: number, y: number) => y >= legsStart && x < center },
    { id: "right-leg", name: "Right leg", match: (_token: string, x: number, y: number) => y >= legsStart && x >= center },
    { id: "markings", name: "Markings and details", match: (token: string) => token.startsWith("marking-") },
  ];
  const cellsByLayer = new Map(definitions.map((definition) => [definition.id, emptyGrid(grid.width, grid.height)]));
  grid.cells.forEach((token, index) => {
    if (!token) return;
    const x = index % grid.width; const y = Math.floor(index / grid.width);
    const definition = token.startsWith("marking-") ? definitions[4]! : definitions.find((candidate, candidateIndex) => candidateIndex < 4 && candidate.match(token, x, y)) ?? definitions[0]!;
    cellsByLayer.get(definition.id)!.cells[index] = token;
  });
  const active = definitions.filter((definition) => cellsByLayer.get(definition.id)!.cells.some(Boolean));
  const root = { id: "root", name: "Root", pivot: { x: center, y: Math.floor(grid.height / 2) } };
  const parts = [root, ...active.map((definition) => ({ id: definition.id, name: definition.name, pivot: layerPivot(cellsByLayer.get(definition.id)!), parentId: "root" }))];
  const layers = active.map((definition, index) => ({ id: definition.id, name: definition.name, partId: definition.id, zIndex: (index + 1) * 10, visible: true, locked: false, linked: false }));
  const cels = Object.fromEntries(active.map((definition) => [definition.id, { grid: cellsByLayer.get(definition.id)!, offset: { x: 0, y: 0 } }]));
  return { parts, layers, cels };
}

function layerPivot(grid: PixelGrid): { x: number; y: number } {
  const indexes = grid.cells.flatMap((token, index) => token ? [index] : []);
  if (indexes.length === 0) return { x: Math.floor(grid.width / 2), y: Math.floor(grid.height / 2) };
  return { x: Math.round(indexes.reduce((sum, index) => sum + index % grid.width, 0) / indexes.length), y: Math.round(indexes.reduce((sum, index) => sum + Math.floor(index / grid.width), 0) / indexes.length) };
}

function widestChannel(colors: ColorSample[]): "red" | "green" | "blue" { const ranges = (["red", "green", "blue"] as const).map((channel) => ({ channel, range: Math.max(...colors.map((color) => color[channel])) - Math.min(...colors.map((color) => color[channel])) })); return ranges.sort((a, b) => b.range - a.range)[0]!.channel; }
function boxScore(colors: ColorSample[]): number { const channel = widestChannel(colors); return (Math.max(...colors.map((color) => color[channel])) - Math.min(...colors.map((color) => color[channel]))) * colors.reduce((sum, color) => sum + color.count, 0); }
function nearestPalette(red: number, green: number, blue: number, palette: ColorSample[]): number { let closest = 0; let distance = Number.POSITIVE_INFINITY; palette.forEach((color, index) => { const candidate = colorDistance(red, green, blue, [color.red, color.green, color.blue]); if (candidate < distance) { distance = candidate; closest = index; } }); return closest; }
function colorDistance(red: number, green: number, blue: number, color: [number, number, number]): number { return (red - color[0]) ** 2 + (green - color[1]) ** 2 + (blue - color[2]) ** 2; }
function luminance(color: ColorSample): number { return color.red * .2126 + color.green * .7152 + color.blue * .0722; }
function toHex(red: number, green: number, blue: number): string { return `#${[red, green, blue].map((value) => value.toString(16).padStart(2, "0")).join("").toUpperCase()}`; }
