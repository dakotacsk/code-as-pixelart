import type { PixelGrid, TokenId } from "./types.js";

export function emptyGrid(width: number, height: number): PixelGrid {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error("Grid dimensions must be positive integers");
  }
  return { width, height, cells: Array<TokenId | null>(width * height).fill(null) };
}

export function grid(rows: string[], symbols: Record<string, TokenId>): PixelGrid {
  if (rows.length === 0) throw new Error("A pixel grid needs at least one row");
  const width = [...rows[0]!].length;
  if (width === 0 || rows.some((row) => [...row].length !== width)) {
    throw new Error("Every pixel-art row must have the same non-zero width");
  }
  const cells = rows.flatMap((row) => [...row].map((symbol) => {
    if (symbol === "." || symbol === " ") return null;
    const token = symbols[symbol];
    if (!token) throw new Error(`Unknown pixel symbol: ${symbol}`);
    return token;
  }));
  return { width, height: rows.length, cells };
}

export function getPixel(source: PixelGrid, x: number, y: number): TokenId | null {
  if (x < 0 || y < 0 || x >= source.width || y >= source.height) return null;
  return source.cells[y * source.width + x] ?? null;
}

export function setPixel(source: PixelGrid, x: number, y: number, tokenId: TokenId | null): PixelGrid {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= source.width || y >= source.height) {
    throw new Error(`Pixel coordinate (${x}, ${y}) is outside ${source.width}x${source.height}`);
  }
  const cells = [...source.cells];
  cells[y * source.width + x] = tokenId;
  return { ...source, cells };
}

export function fillRegion(source: PixelGrid, x: number, y: number, tokenId: TokenId | null): PixelGrid {
  const target = getPixel(source, x, y);
  if (target === tokenId) return source;
  const cells = [...source.cells];
  const queue: Point[] = [{ x, y }];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const point = queue.shift()!;
    const key = `${point.x},${point.y}`;
    if (visited.has(key) || getFromCells(source.width, source.height, cells, point.x, point.y) !== target) continue;
    visited.add(key);
    cells[point.y * source.width + point.x] = tokenId;
    queue.push(
      { x: point.x - 1, y: point.y },
      { x: point.x + 1, y: point.y },
      { x: point.x, y: point.y - 1 },
      { x: point.x, y: point.y + 1 },
    );
  }
  return { ...source, cells };
}

interface Point { x: number; y: number }

function getFromCells(width: number, height: number, cells: Array<TokenId | null>, x: number, y: number): TokenId | null | undefined {
  if (x < 0 || y < 0 || x >= width || y >= height) return undefined;
  return cells[y * width + x] ?? null;
}
