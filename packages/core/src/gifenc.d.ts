declare module "gifenc" {
  export type GifPalette = number[][];
  export function quantize(data: Uint8Array | Uint8ClampedArray, maxColors: number, options?: { format?: "rgb565" | "rgb444" | "rgba4444"; oneBitAlpha?: boolean | number; clearAlpha?: boolean; clearAlphaThreshold?: number; clearAlphaColor?: number }): GifPalette;
  export function applyPalette(data: Uint8Array | Uint8ClampedArray, palette: GifPalette, format?: "rgb565" | "rgb444" | "rgba4444"): Uint8Array;
  export function GIFEncoder(options?: { auto?: boolean; initialCapacity?: number }): {
    writeFrame(index: Uint8Array, width: number, height: number, options?: { palette?: GifPalette; transparent?: boolean; transparentIndex?: number; delay?: number; repeat?: number; dispose?: number }): void;
    finish(): void;
    bytes(): Uint8Array;
  };
  const gifenc: {
    GIFEncoder: typeof GIFEncoder;
    applyPalette: typeof applyPalette;
    quantize: typeof quantize;
  };
  export default gifenc;
}
