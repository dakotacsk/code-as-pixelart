import { emptyGrid } from "./grid.js";
import type { Cel, DirectionalView, PixelGrid, PixelProject } from "./types.js";

const WIDTH = 24;
const HEIGHT = 24;
const LAYERS = ["hair", "face", "coat", "arms", "legs", "equipment"] as const;
type LayerId = typeof LAYERS[number];
type Direction = "front" | "three-quarter" | "side" | "back";
type Step = "idle" | "walk-a" | "walk-b";

export function createDemoProject(): PixelProject {
  const views: DirectionalView[] = (["front", "three-quarter", "side", "back"] as Direction[]).map(makeView);
  const equipmentOverrides: Record<string, Cel> = {};
  for (const view of views) {
    for (const frame of view.frames) equipmentOverrides[`${view.id}:${frame.id}:equipment`] = { grid: makeEquipment(view.id as Direction), offset: { x: 0, y: 0 } };
  }
  return {
    schemaVersion: 1,
    id: "field-notes",
    name: "Field Notes",
    ticksPerSecond: 12,
    palette: [
      { id: "ink", name: "Outline", color: "#24171A" },
      { id: "skin", name: "Skin", color: "#D7A17E" },
      { id: "skin-shadow", name: "Skin shadow", color: "#A96E5B" },
      { id: "hair", name: "Hair", color: "#783D36" },
      { id: "hair-night", name: "Night hair", color: "#40383F" },
      { id: "coat", name: "Field coat", color: "#6F7760" },
      { id: "coat-light", name: "Coat light", color: "#98A07E" },
      { id: "coat-night", name: "Night coat", color: "#565D6A" },
      { id: "shirt", name: "Shirt", color: "#D6C6B5" },
      { id: "trouser", name: "Trousers", color: "#403B36" },
      { id: "boot", name: "Boots", color: "#2B2421" },
      { id: "steel", name: "Steel", color: "#B5B9B2" },
      { id: "leather", name: "Leather", color: "#704B37" },
      { id: "eye", name: "Eyes", color: "#34252A" }
    ],
    characters: [{
      id: "mara",
      name: "Mara Vale",
      width: WIDTH,
      height: HEIGHT,
      origin: { x: 12, y: 22 },
      pivot: { x: 12, y: 14 },
      bounds: { x: 4, y: 2, width: 16, height: 21 },
      anchors: { hand: { x: 18, y: 13 }, head: { x: 12, y: 6 }, feet: { x: 12, y: 22 } },
      parts: [
        { id: "root", name: "Root", pivot: { x: 12, y: 22 } },
        { id: "head", name: "Head", pivot: { x: 12, y: 7 }, parentId: "root" },
        { id: "torso", name: "Torso", pivot: { x: 12, y: 13 }, parentId: "root" },
        { id: "arms", name: "Arms", pivot: { x: 12, y: 12 }, parentId: "torso" },
        { id: "legs", name: "Legs", pivot: { x: 12, y: 18 }, parentId: "root" },
        { id: "equipment", name: "Equipment", pivot: { x: 18, y: 13 }, parentId: "arms" }
      ],
      layers: [
        { id: "legs", name: "Legs", partId: "legs", zIndex: 10, visible: true, locked: false, linked: true },
        { id: "coat", name: "Field coat", partId: "torso", zIndex: 20, visible: true, locked: false, linked: true },
        { id: "arms", name: "Arms", partId: "arms", zIndex: 30, visible: true, locked: false, linked: false },
        { id: "face", name: "Face", partId: "head", zIndex: 40, visible: true, locked: false, linked: true },
        { id: "hair", name: "Hair", partId: "head", zIndex: 50, visible: true, locked: false, linked: true },
        { id: "equipment", name: "Equipment", partId: "equipment", zIndex: 60, visible: true, locked: false, linked: false }
      ],
      views,
      poses: [
        { id: "neutral", name: "Neutral", transforms: {}, patches: [] },
        { id: "wave", name: "Wave", transforms: { arms: { x: 0, y: -2, flipX: false, visible: true } }, patches: [] }
      ],
      variants: [
        { id: "night-shift", name: "Night shift", paletteMap: { coat: "coat-night", hair: "hair-night" }, celOverrides: {}, metadata: { outfit: "night" } },
        { id: "field-kit", name: "Field kit", paletteMap: {}, celOverrides: equipmentOverrides, metadata: { equipment: "short sword" } }
      ],
      animations: views.flatMap((view) => [
        { id: `${view.id}-idle`, name: `${view.name} idle`, viewId: view.id, frames: [{ frameId: `${view.id}-idle`, durationTicks: 6 }], loop: true, tags: ["idle", view.id] },
        { id: `${view.id}-walk`, name: `${view.name} walk`, viewId: view.id, frames: [{ frameId: `${view.id}-walk-a`, durationTicks: 2 }, { frameId: `${view.id}-walk-b`, durationTicks: 2 }], loop: true, tags: ["walk", view.id] }
      ]),
      metadata: { role: "field cartographer", handedness: "right", expression: "focused" }
    }],
    metadata: { description: "A source-coded multi-angle character project." }
  };
}

function makeView(direction: Direction): DirectionalView {
  const name = direction === "three-quarter" ? "Three-quarter" : `${direction[0]!.toUpperCase()}${direction.slice(1)}`;
  return {
    id: direction,
    name,
    frames: (["idle", "walk-a", "walk-b"] as Step[]).map((step) => ({
      id: `${direction}-${step}`,
      name: step === "idle" ? "Idle" : step === "walk-a" ? "Walk 1" : "Walk 2",
      durationTicks: step === "idle" ? 6 : 2,
      cels: Object.fromEntries(LAYERS.map((layerId) => [layerId, { grid: drawLayer(layerId, direction, step), offset: { x: 0, y: 0 } }]))
    }))
  };
}

function drawLayer(layer: LayerId, direction: Direction, step: Step): PixelGrid {
  const canvas = emptyGrid(WIDTH, HEIGHT);
  const middle = direction === "side" ? 13 : direction === "three-quarter" ? 12 : 11;
  const leftLegShift = step === "walk-a" ? -1 : step === "walk-b" ? 1 : 0;
  const rightLegShift = -leftLegShift;
  if (layer === "legs") {
    rect(canvas, middle - 3 + leftLegShift, 16, 3, 5, "trouser");
    rect(canvas, middle + 1 + rightLegShift, 16, 3, 5, "trouser");
    rect(canvas, middle - 4 + leftLegShift, 21, 4, 2, "boot");
    rect(canvas, middle + 1 + rightLegShift, 21, 4, 2, "boot");
  }
  if (layer === "coat") {
    rect(canvas, middle - 4, 10, direction === "side" ? 7 : 9, 7, "ink");
    rect(canvas, middle - 3, 10, direction === "side" ? 5 : 7, 6, "coat");
    rect(canvas, middle - 2, 10, 2, 5, "coat-light");
    if (direction !== "back") rect(canvas, middle, 11, 1, 5, "shirt");
  }
  if (layer === "arms") {
    const swing = step === "walk-a" ? 1 : step === "walk-b" ? -1 : 0;
    rect(canvas, middle - 6, 11 + swing, 2, 6, "coat");
    rect(canvas, middle + 5, 11 - swing, 2, 6, "coat");
    point(canvas, middle - 6, 17 + swing, "skin");
    point(canvas, middle + 5, 17 - swing, "skin");
  }
  if (layer === "face") {
    rect(canvas, middle - 3, 4, direction === "side" ? 6 : 7, 6, "skin");
    rect(canvas, middle - 3, 8, direction === "side" ? 6 : 7, 2, "skin-shadow");
    if (direction === "front") {
      point(canvas, middle - 1, 6, "eye"); point(canvas, middle + 2, 6, "eye");
    } else if (direction === "three-quarter") {
      point(canvas, middle, 6, "eye"); point(canvas, middle + 3, 6, "eye");
    } else if (direction === "side") point(canvas, middle + 3, 6, "eye");
  }
  if (layer === "hair") {
    rect(canvas, middle - 4, 2, direction === "side" ? 7 : 9, 3, "hair");
    rect(canvas, middle - 4, 4, 2, 5, "hair");
    if (direction === "back") rect(canvas, middle - 3, 4, 7, 6, "hair");
    else if (direction !== "side") rect(canvas, middle + 3, 4, 2, 3, "hair");
    outlineTop(canvas, middle - 4, direction === "side" ? 7 : 9, 2);
  }
  return canvas;
}

function makeEquipment(direction: Direction): PixelGrid {
  const canvas = emptyGrid(WIDTH, HEIGHT);
  const x = direction === "side" ? 18 : 19;
  rect(canvas, x, 9, 1, 9, "steel");
  rect(canvas, x - 1, 17, 3, 1, "leather");
  point(canvas, x, 18, "leather");
  return canvas;
}

function rect(canvas: PixelGrid, x: number, y: number, width: number, height: number, tokenId: string): void {
  for (let row = y; row < y + height; row += 1) for (let column = x; column < x + width; column += 1) point(canvas, column, row, tokenId);
}

function point(canvas: PixelGrid, x: number, y: number, tokenId: string): void {
  if (x >= 0 && y >= 0 && x < canvas.width && y < canvas.height) canvas.cells[y * canvas.width + x] = tokenId;
}

function outlineTop(canvas: PixelGrid, x: number, width: number, y: number): void {
  for (let column = x; column < x + width; column += 1) point(canvas, column, y, "ink");
  point(canvas, x, y + 1, "ink");
  point(canvas, x + width - 1, y + 1, "ink");
}
