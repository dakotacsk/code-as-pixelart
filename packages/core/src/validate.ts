import type { Character, PixelProject, ValidationIssue, ValidationResult, Variant } from "./types.js";

const HEX_COLOR = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;

export function validateProject(project: PixelProject): ValidationResult {
  const issues: ValidationIssue[] = [];
  const add = (path: string, code: string, message: string, repair: string, severity: "error" | "warning" = "error") => {
    issues.push({ path, code, message, repair, severity });
  };

  if (project.schemaVersion !== 1) add("schemaVersion", "UNSUPPORTED_SCHEMA", "Only schema version 1 is supported.", "Migrate the document to schemaVersion 1.");
  if (!Number.isInteger(project.ticksPerSecond) || project.ticksPerSecond < 1) add("ticksPerSecond", "INVALID_TICKS", "ticksPerSecond must be a positive integer.", "Use an integer such as 12 or 24.");
  checkUnique(project.palette, "palette", add);
  const paletteIds = new Set(project.palette.map((token) => token.id));
  project.palette.forEach((token, index) => {
    if (!HEX_COLOR.test(token.color)) add(`palette[${index}].color`, "INVALID_COLOR", `${token.color} is not #RRGGBB or #RRGGBBAA.`, "Use an eight- or six-digit hexadecimal color.");
  });
  checkUnique(project.characters, "characters", add);
  project.characters.forEach((character, index) => validateCharacter(character, `characters[${index}]`, paletteIds, add));
  return { valid: !issues.some((issue) => issue.severity === "error"), issues };
}

type AddIssue = (path: string, code: string, message: string, repair: string, severity?: "error" | "warning") => void;

function validateCharacter(character: Character, path: string, paletteIds: Set<string>, add: AddIssue): void {
  if (!Number.isInteger(character.width) || !Number.isInteger(character.height) || character.width < 1 || character.height < 1) {
    add(path, "INVALID_SIZE", "Character dimensions must be positive integers.", "Use a conventional pixel size such as 16x16, 32x32, or 64x64.");
  }
  checkUnique(character.parts, `${path}.parts`, add);
  checkUnique(character.layers, `${path}.layers`, add);
  checkUnique(character.views, `${path}.views`, add);
  checkUnique(character.poses, `${path}.poses`, add);
  checkUnique(character.variants, `${path}.variants`, add);
  checkUnique(character.animations, `${path}.animations`, add);

  const partIds = new Set(character.parts.map((part) => part.id));
  const layerIds = new Set(character.layers.map((layer) => layer.id));
  character.parts.forEach((part, index) => {
    if (part.parentId && !partIds.has(part.parentId)) add(`${path}.parts[${index}].parentId`, "MISSING_PART", `Parent part ${part.parentId} does not exist.`, "Reference an existing part or remove parentId.");
    if (hasParentCycle(character, part.id)) add(`${path}.parts[${index}].parentId`, "PART_CYCLE", `Part ${part.id} participates in a parent cycle.`, "Break the parent relationship cycle.");
  });
  character.layers.forEach((layer, index) => {
    if (!partIds.has(layer.partId)) add(`${path}.layers[${index}].partId`, "MISSING_PART", `Part ${layer.partId} does not exist.`, "Assign the layer to an existing semantic part.");
    if (!Number.isInteger(layer.zIndex)) add(`${path}.layers[${index}].zIndex`, "INVALID_Z_INDEX", "Layer zIndex must be an integer.", "Use an integer rendering order.");
  });
  character.views.forEach((view, viewIndex) => {
    checkUnique(view.frames, `${path}.views[${viewIndex}].frames`, add);
    view.frames.forEach((frame, frameIndex) => {
      if (!Number.isInteger(frame.durationTicks) || frame.durationTicks < 1) add(`${path}.views[${viewIndex}].frames[${frameIndex}].durationTicks`, "INVALID_DURATION", "Frame duration must be a positive integer.", "Use at least one timeline tick.");
      for (const [layerId, cel] of Object.entries(frame.cels)) {
        const celPath = `${path}.views[${viewIndex}].frames[${frameIndex}].cels.${layerId}`;
        if (!layerIds.has(layerId)) add(celPath, "MISSING_LAYER", `Cel references missing layer ${layerId}.`, "Add the layer or remove the cel.");
        if (cel.grid.width !== character.width || cel.grid.height !== character.height || cel.grid.cells.length !== character.width * character.height) {
          add(`${celPath}.grid`, "GRID_SIZE_MISMATCH", "Cel grid does not match the character canvas.", `Normalize the grid to ${character.width}x${character.height}.`);
        }
        cel.grid.cells.forEach((tokenId, cellIndex) => {
          if (tokenId && !paletteIds.has(tokenId)) add(`${celPath}.grid.cells[${cellIndex}]`, "MISSING_TOKEN", `Palette token ${tokenId} does not exist.`, "Add the token or replace this pixel.");
        });
        if (!Number.isInteger(cel.offset.x) || !Number.isInteger(cel.offset.y)) add(`${celPath}.offset`, "FRACTIONAL_OFFSET", "Cel offsets must be integers.", "Round offsets to whole pixels.");
      }
    });
  });
  character.variants.forEach((variant, index) => validateVariant(character, variant, `${path}.variants[${index}]`, paletteIds, add));
  character.animations.forEach((clip, index) => {
    const view = character.views.find((item) => item.id === clip.viewId);
    if (!view) add(`${path}.animations[${index}].viewId`, "MISSING_VIEW", `View ${clip.viewId} does not exist.`, "Reference an authored directional view.");
    const frameIds = new Set(view?.frames.map((frame) => frame.id) ?? []);
    clip.frames.forEach((frame, frameIndex) => {
      if (!frameIds.has(frame.frameId)) add(`${path}.animations[${index}].frames[${frameIndex}]`, "MISSING_FRAME", `Frame ${frame.frameId} does not exist in ${clip.viewId}.`, "Reference a frame in the animation's view.");
    });
  });
}

function validateVariant(character: Character, variant: Variant, path: string, paletteIds: Set<string>, add: AddIssue): void {
  if (variant.baseVariantId && !character.variants.some((item) => item.id === variant.baseVariantId)) add(`${path}.baseVariantId`, "MISSING_VARIANT", `Base variant ${variant.baseVariantId} does not exist.`, "Reference an existing variant or remove the inheritance.");
  if (hasVariantCycle(character, variant.id)) add(`${path}.baseVariantId`, "VARIANT_CYCLE", `Variant ${variant.id} participates in an inheritance cycle.`, "Break the variant inheritance cycle.");
  for (const [from, to] of Object.entries(variant.paletteMap)) {
    if (!paletteIds.has(from) || !paletteIds.has(to)) add(`${path}.paletteMap.${from}`, "MISSING_TOKEN", `Palette mapping ${from} -> ${to} references a missing token.`, "Map between existing palette token IDs.");
  }
}

function checkUnique(items: Array<{ id: string }>, path: string, add: AddIssue): void {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (!item.id) add(`${path}[${index}].id`, "MISSING_ID", "Stable IDs cannot be empty.", "Provide a unique, durable ID.");
    else if (seen.has(item.id)) add(`${path}[${index}].id`, "DUPLICATE_ID", `Duplicate ID: ${item.id}.`, "Rename one item while preserving stable references.");
    seen.add(item.id);
  });
}

function hasParentCycle(character: Character, start: string): boolean {
  const parents = new Map(character.parts.map((part) => [part.id, part.parentId]));
  const seen = new Set<string>();
  let current: string | undefined = start;
  while (current) {
    if (seen.has(current)) return true;
    seen.add(current);
    current = parents.get(current);
  }
  return false;
}

function hasVariantCycle(character: Character, start: string): boolean {
  const parents = new Map(character.variants.map((variant) => [variant.id, variant.baseVariantId]));
  const seen = new Set<string>();
  let current: string | undefined = start;
  while (current) {
    if (seen.has(current)) return true;
    seen.add(current);
    current = parents.get(current);
  }
  return false;
}
