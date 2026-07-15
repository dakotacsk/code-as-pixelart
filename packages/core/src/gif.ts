import * as gifencModule from "gifenc";
import type { RenderedFrame } from "./types.js";

const gifenc = typeof gifencModule.quantize === "function" ? gifencModule : gifencModule.default;
const { GIFEncoder, applyPalette, quantize } = gifenc;

export interface GifOptions {
  ticksPerSecond: number;
  scale?: number;
  loop?: boolean;
  alphaThreshold?: number;
}

export function encodeGif(frames: RenderedFrame[], options: GifOptions): Uint8Array {
  if (frames.length === 0) throw new Error("Cannot encode an empty GIF");
  if (!Number.isInteger(options.ticksPerSecond) || options.ticksPerSecond < 1) throw new Error("ticksPerSecond must be a positive integer");
  const scale = options.scale ?? 1;
  if (!Number.isInteger(scale) || scale < 1 || scale > 32) throw new Error("GIF scale must be an integer from 1 to 32");
  const width = frames[0]!.width;
  const height = frames[0]!.height;
  if (frames.some((frame) => frame.width !== width || frame.height !== height)) throw new Error("Every GIF frame must use the same dimensions");

  const scaled = frames.map((frame) => scalePixels(frame.pixels, width, height, scale));
  const allPixels = new Uint8ClampedArray(scaled.reduce((total, pixels) => total + pixels.length, 0));
  let offset = 0;
  for (const pixels of scaled) { allPixels.set(pixels, offset); offset += pixels.length; }
  const alphaThreshold = options.alphaThreshold ?? 127;
  const palette = quantize(allPixels, 256, { format: "rgba4444", oneBitAlpha: alphaThreshold, clearAlpha: true, clearAlphaThreshold: alphaThreshold, clearAlphaColor: 0 });
  let transparentIndex = palette.findIndex((color) => (color[3] ?? 255) === 0);
  if (transparentIndex < 0) {
    if (palette.length < 256) { palette.unshift([0, 0, 0, 0]); transparentIndex = 0; }
    else transparentIndex = 0;
  }

  const gif = GIFEncoder();
  scaled.forEach((pixels, index) => {
    gif.writeFrame(applyPalette(pixels, palette, "rgba4444"), width * scale, height * scale, {
      ...(index === 0 ? { palette } : {}),
      transparent: true,
      transparentIndex,
      delay: Math.max(10, Math.round((frames[index]!.durationTicks / options.ticksPerSecond) * 1000)),
      repeat: options.loop === false ? -1 : 0,
      dispose: 2,
    });
  });
  gif.finish();
  return gif.bytes();
}

function scalePixels(source: Uint8ClampedArray, width: number, height: number, scale: number): Uint8ClampedArray {
  if (scale === 1) return new Uint8ClampedArray(source);
  const output = new Uint8ClampedArray(width * scale * height * scale * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const sourceIndex = (y * width + x) * 4;
    for (let offsetY = 0; offsetY < scale; offsetY += 1) for (let offsetX = 0; offsetX < scale; offsetX += 1) {
      const destinationIndex = (((y * scale + offsetY) * width * scale) + x * scale + offsetX) * 4;
      output.set(source.subarray(sourceIndex, sourceIndex + 4), destinationIndex);
    }
  }
  return output;
}
