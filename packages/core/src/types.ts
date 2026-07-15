export type TokenId = string;

export interface Point {
  x: number;
  y: number;
}

export interface Rect extends Point {
  width: number;
  height: number;
}

export interface PixelGrid {
  width: number;
  height: number;
  cells: Array<TokenId | null>;
}

export interface PaletteToken {
  id: TokenId;
  name: string;
  color: string;
}

export interface Part {
  id: string;
  name: string;
  pivot: Point;
  parentId?: string;
  metadata?: Record<string, string>;
}

export interface Layer {
  id: string;
  name: string;
  partId: string;
  zIndex: number;
  visible: boolean;
  locked: boolean;
  linked: boolean;
  groupId?: string;
}

export interface Cel {
  grid: PixelGrid;
  offset: Point;
  opacity?: number;
}

export interface Frame {
  id: string;
  name: string;
  durationTicks: number;
  cels: Record<string, Cel>;
}

export interface DirectionalView {
  id: string;
  name: string;
  frames: Frame[];
}

export interface PixelPatch extends Point {
  viewId: string;
  layerId: string;
  tokenId: TokenId | null;
  frameId?: string;
}

export interface PartTransform extends Point {
  flipX: boolean;
  visible: boolean;
}

export interface Pose {
  id: string;
  name: string;
  transforms: Record<string, PartTransform>;
  patches: PixelPatch[];
}

export interface Variant {
  id: string;
  name: string;
  baseVariantId?: string;
  paletteMap: Record<TokenId, TokenId>;
  celOverrides: Record<string, Cel>;
  metadata?: Record<string, string>;
}

export interface AnimationFrameRef {
  frameId: string;
  durationTicks?: number;
}

export interface AnimationClip {
  id: string;
  name: string;
  viewId: string;
  frames: AnimationFrameRef[];
  loop: boolean;
  tags: string[];
}

export interface Character {
  id: string;
  name: string;
  width: number;
  height: number;
  origin: Point;
  pivot: Point;
  bounds: Rect;
  anchors: Record<string, Point>;
  parts: Part[];
  layers: Layer[];
  views: DirectionalView[];
  poses: Pose[];
  variants: Variant[];
  animations: AnimationClip[];
  metadata: Record<string, string>;
}

export interface PixelProject {
  schemaVersion: 1;
  id: string;
  name: string;
  ticksPerSecond: number;
  palette: PaletteToken[];
  characters: Character[];
  metadata: Record<string, string>;
}

export interface ValidationIssue {
  path: string;
  code: string;
  message: string;
  repair: string;
  severity: "error" | "warning";
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export interface RenderFrameOptions {
  characterId: string;
  viewId: string;
  frameId: string;
  poseId?: string;
  variantId?: string;
}

export interface RenderedFrame {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  hash: string;
  frameId: string;
  durationTicks: number;
}

export type SheetLayout = "horizontal" | "vertical" | "packed";

export interface SpriteSheet {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  frames: Array<{ frameId: string; x: number; y: number; width: number; height: number }>;
}

export type PixelOperation =
  | { type: "updateProject"; patch: Partial<Pick<PixelProject, "name" | "ticksPerSecond">> }
  | { type: "setPixel"; characterId: string; viewId: string; frameId: string; layerId: string; x: number; y: number; tokenId: TokenId | null }
  | { type: "fillRegion"; characterId: string; viewId: string; frameId: string; layerId: string; x: number; y: number; tokenId: TokenId | null }
  | { type: "movePart"; characterId: string; viewId: string; frameId: string; partId: string; dx: number; dy: number }
  | { type: "replacePaletteToken"; tokenId: TokenId; color: string }
  | { type: "patchPose"; characterId: string; poseId: string; partId: string; transform: PartTransform }
  | { type: "addView"; characterId: string; view: DirectionalView; index?: number; animations?: Array<{ clip: AnimationClip; index: number }> }
  | { type: "removeView"; characterId: string; viewId: string }
  | { type: "addLayer"; characterId: string; layer: Layer; cels?: Record<string, Record<string, Cel>> }
  | { type: "removeLayer"; characterId: string; layerId: string }
  | { type: "updateLayer"; characterId: string; layerId: string; patch: Partial<Pick<Layer, "name" | "visible" | "locked" | "linked" | "zIndex" | "groupId">> }
  | { type: "reorderLayer"; characterId: string; fromIndex: number; toIndex: number }
  | { type: "addFrame"; characterId: string; viewId: string; frame: Frame; index?: number; animationRefs?: Array<{ clipId: string; index: number; reference: AnimationFrameRef }> }
  | { type: "removeFrame"; characterId: string; viewId: string; frameId: string }
  | { type: "updateFrame"; characterId: string; viewId: string; frameId: string; patch: Partial<Pick<Frame, "name" | "durationTicks">> }
  | { type: "reorderFrame"; characterId: string; viewId: string; fromIndex: number; toIndex: number }
  | { type: "swapCels"; characterId: string; viewId: string; sourceFrameId: string; sourceLayerId: string; targetFrameId: string; targetLayerId: string }
  | { type: "addAnimation"; characterId: string; animation: AnimationClip; index?: number }
  | { type: "removeAnimation"; characterId: string; animationId: string }
  | { type: "updateAnimation"; characterId: string; animationId: string; patch: Partial<Pick<AnimationClip, "name" | "loop" | "tags">> }
  | { type: "batch"; operations: PixelOperation[] };
