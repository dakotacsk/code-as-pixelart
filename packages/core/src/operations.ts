import { fillRegion as fillGrid, getPixel, setPixel as setGridPixel, emptyGrid } from "./grid.js";
import type { Cel, Character, DirectionalView, Frame, Layer, PixelGrid, PixelOperation, PixelProject } from "./types.js";

export function defineProject(project: PixelProject): PixelProject {
  return structuredClone(project);
}

export function applyOperation(project: PixelProject, operation: PixelOperation): PixelProject {
  if (operation.type === "batch") {
    return operation.operations.reduce(applyOperation, project);
  }

  if (operation.type === "updateProject") {
    const next = structuredClone(project);
    Object.assign(next, operation.patch);
    return next;
  }

  const next = structuredClone(project);
  if (operation.type === "replacePaletteToken") {
    const token = next.palette.find((item) => item.id === operation.tokenId);
    if (!token) throw new Error(`Palette token not found: ${operation.tokenId}`);
    token.color = operation.color;
    return next;
  }

  const character = getCharacter(next, operation.characterId);
  switch (operation.type) {
    case "setPixel": {
      const cel = getCel(character, operation.viewId, operation.frameId, operation.layerId);
      cel.grid = setGridPixel(cel.grid, operation.x, operation.y, operation.tokenId);
      break;
    }
    case "fillRegion": {
      const cel = getCel(character, operation.viewId, operation.frameId, operation.layerId);
      cel.grid = fillGrid(cel.grid, operation.x, operation.y, operation.tokenId);
      break;
    }
    case "movePart": {
      const layerIds = new Set(character.layers.filter((layer) => layer.partId === operation.partId).map((layer) => layer.id));
      const frame = getFrame(character, operation.viewId, operation.frameId);
      for (const [layerId, cel] of Object.entries(frame.cels)) {
        if (layerIds.has(layerId)) {
          cel.offset.x += operation.dx;
          cel.offset.y += operation.dy;
        }
      }
      break;
    }
    case "patchPose": {
      const pose = character.poses.find((item) => item.id === operation.poseId);
      if (!pose) throw new Error(`Pose not found: ${operation.poseId}`);
      pose.transforms[operation.partId] = structuredClone(operation.transform);
      break;
    }
    case "addPart":
      if (character.parts.some((part) => part.id === operation.part.id)) throw new Error(`Part already exists: ${operation.part.id}`);
      character.parts.splice(operation.index ?? character.parts.length, 0, structuredClone(operation.part));
      break;
    case "removePart":
      if (character.layers.some((layer) => layer.partId === operation.partId)) throw new Error(`Cannot remove part ${operation.partId} while layers reference it`);
      if (character.parts.some((part) => part.parentId === operation.partId)) throw new Error(`Cannot remove part ${operation.partId} while child parts reference it`);
      character.parts = character.parts.filter((part) => part.id !== operation.partId);
      for (const pose of character.poses) delete pose.transforms[operation.partId];
      break;
    case "resizeCharacter":
      resizeCharacter(character, operation.width, operation.height);
      break;
    case "restoreCharacter": {
      const index = next.characters.findIndex((item) => item.id === operation.characterId);
      next.characters[index] = structuredClone(operation.character);
      break;
    }
    case "addView":
      if (character.views.some((view) => view.id === operation.view.id)) throw new Error(`View already exists: ${operation.view.id}`);
      character.views.splice(operation.index ?? character.views.length, 0, structuredClone(operation.view));
      for (const snapshot of operation.animations ?? []) character.animations.splice(snapshot.index, 0, structuredClone(snapshot.clip));
      break;
    case "removeView":
      character.views = character.views.filter((view) => view.id !== operation.viewId);
      character.animations = character.animations.filter((clip) => clip.viewId !== operation.viewId);
      break;
    case "addLayer":
      addLayer(character, operation.layer, operation.cels);
      break;
    case "removeLayer":
      character.layers = character.layers.filter((layer) => layer.id !== operation.layerId);
      for (const view of character.views) for (const frame of view.frames) delete frame.cels[operation.layerId];
      break;
    case "updateLayer": {
      const layer = character.layers.find((item) => item.id === operation.layerId);
      if (!layer) throw new Error(`Layer not found: ${operation.layerId}`);
      Object.assign(layer, operation.patch);
      character.layers.sort((a, b) => a.zIndex - b.zIndex);
      break;
    }
    case "reorderLayer": {
      const [layer] = character.layers.splice(operation.fromIndex, 1);
      if (!layer) throw new Error(`Layer index not found: ${operation.fromIndex}`);
      character.layers.splice(operation.toIndex, 0, layer);
      character.layers.forEach((item, index) => { item.zIndex = (index + 1) * 10; });
      break;
    }
    case "addFrame": {
      const view = getView(character, operation.viewId);
      const index = operation.index ?? view.frames.length;
      view.frames.splice(index, 0, structuredClone(operation.frame));
      for (const snapshot of operation.animationRefs ?? []) {
        const clip = character.animations.find((item) => item.id === snapshot.clipId);
        if (clip) clip.frames.splice(snapshot.index, 0, structuredClone(snapshot.reference));
      }
      break;
    }
    case "removeFrame": {
      const view = getView(character, operation.viewId);
      view.frames = view.frames.filter((frame) => frame.id !== operation.frameId);
      for (const clip of character.animations.filter((item) => item.viewId === operation.viewId)) {
        clip.frames = clip.frames.filter((item) => item.frameId !== operation.frameId);
      }
      break;
    }
    case "updateFrame": {
      const frame = getFrame(character, operation.viewId, operation.frameId);
      Object.assign(frame, operation.patch);
      break;
    }
    case "reorderFrame": {
      const view = getView(character, operation.viewId);
      const [frame] = view.frames.splice(operation.fromIndex, 1);
      if (!frame) throw new Error(`Frame index not found: ${operation.fromIndex}`);
      view.frames.splice(operation.toIndex, 0, frame);
      break;
    }
    case "swapCels": {
      const sourceFrame = getFrame(character, operation.viewId, operation.sourceFrameId);
      const targetFrame = getFrame(character, operation.viewId, operation.targetFrameId);
      const source = sourceFrame.cels[operation.sourceLayerId];
      const target = targetFrame.cels[operation.targetLayerId];
      if (!source || !target) throw new Error("Both source and target cels must exist");
      sourceFrame.cels[operation.sourceLayerId] = target;
      targetFrame.cels[operation.targetLayerId] = source;
      break;
    }
    case "addAnimation":
      if (character.animations.some((item) => item.id === operation.animation.id)) throw new Error(`Animation already exists: ${operation.animation.id}`);
      character.animations.splice(operation.index ?? character.animations.length, 0, structuredClone(operation.animation));
      break;
    case "removeAnimation":
      character.animations = character.animations.filter((item) => item.id !== operation.animationId);
      break;
    case "updateAnimation": {
      const animation = character.animations.find((item) => item.id === operation.animationId);
      if (!animation) throw new Error(`Animation not found: ${operation.animationId}`);
      Object.assign(animation, operation.patch);
      break;
    }
    default:
      throw new Error(`Unknown pixel operation: ${String((operation as { type?: unknown }).type)}`);
  }
  return next;
}

export function invertOperation(project: PixelProject, operation: PixelOperation): PixelOperation {
  if (operation.type === "batch") {
    let cursor = project;
    const operations: PixelOperation[] = [];
    for (const item of operation.operations) {
      operations.unshift(invertOperation(cursor, item));
      cursor = applyOperation(cursor, item);
    }
    return { type: "batch", operations };
  }
  if (operation.type === "updateProject") {
    const patch = Object.fromEntries(Object.keys(operation.patch).map((key) => [key, project[key as keyof PixelProject]])) as typeof operation.patch;
    return { ...operation, patch };
  }
  if (operation.type === "replacePaletteToken") {
    const token = project.palette.find((item) => item.id === operation.tokenId);
    if (!token) throw new Error(`Palette token not found: ${operation.tokenId}`);
    return { ...operation, color: token.color };
  }
  const character = getCharacter(project, operation.characterId);
  switch (operation.type) {
    case "setPixel": {
      const cel = getCel(character, operation.viewId, operation.frameId, operation.layerId);
      return { ...operation, tokenId: getPixel(cel.grid, operation.x, operation.y) };
    }
    case "fillRegion": {
      const before = getCel(character, operation.viewId, operation.frameId, operation.layerId).grid;
      const afterProject = applyOperation(project, operation);
      const after = getCel(getCharacter(afterProject, operation.characterId), operation.viewId, operation.frameId, operation.layerId).grid;
      const operations: PixelOperation[] = [];
      for (let i = 0; i < before.cells.length; i += 1) {
        if (before.cells[i] !== after.cells[i]) {
          operations.push({
            type: "setPixel",
            characterId: operation.characterId,
            viewId: operation.viewId,
            frameId: operation.frameId,
            layerId: operation.layerId,
            x: i % before.width,
            y: Math.floor(i / before.width),
            tokenId: before.cells[i] ?? null,
          });
        }
      }
      return { type: "batch", operations };
    }
    case "movePart":
      return { ...operation, dx: -operation.dx, dy: -operation.dy };
    case "patchPose": {
      const pose = character.poses.find((item) => item.id === operation.poseId);
      const previous = pose?.transforms[operation.partId] ?? { x: 0, y: 0, flipX: false, visible: true };
      return { ...operation, transform: structuredClone(previous) };
    }
    case "addPart":
      return { type: "removePart", characterId: operation.characterId, partId: operation.part.id };
    case "removePart": {
      const part = character.parts.find((item) => item.id === operation.partId);
      if (!part) throw new Error(`Part not found: ${operation.partId}`);
      return { type: "addPart", characterId: operation.characterId, part: structuredClone(part), index: character.parts.findIndex((item) => item.id === operation.partId) };
    }
    case "resizeCharacter":
      return { type: "restoreCharacter", characterId: operation.characterId, character: structuredClone(character) };
    case "restoreCharacter":
      return { type: "restoreCharacter", characterId: operation.characterId, character: structuredClone(character) };
    case "addView":
      return { type: "removeView", characterId: operation.characterId, viewId: operation.view.id };
    case "removeView": {
      const view = getView(character, operation.viewId);
      const index = character.views.findIndex((item) => item.id === operation.viewId);
      const animations = character.animations.flatMap((clip, animationIndex) => clip.viewId === operation.viewId ? [{ clip: structuredClone(clip), index: animationIndex }] : []);
      return { type: "addView", characterId: operation.characterId, view: structuredClone(view), index, animations };
    }
    case "addLayer":
      return { type: "removeLayer", characterId: operation.characterId, layerId: operation.layer.id };
    case "removeLayer": {
      const layer = character.layers.find((item) => item.id === operation.layerId);
      if (!layer) throw new Error(`Layer not found: ${operation.layerId}`);
      const cels: Record<string, Record<string, Cel>> = {};
      for (const view of character.views) {
        for (const frame of view.frames) {
          const cel = frame.cels[operation.layerId];
          if (cel) {
            cels[view.id] ??= {};
            cels[view.id]![frame.id] = structuredClone(cel);
          }
        }
      }
      return { type: "addLayer", characterId: operation.characterId, layer: structuredClone(layer), cels };
    }
    case "updateLayer": {
      const layer = character.layers.find((item) => item.id === operation.layerId);
      if (!layer) throw new Error(`Layer not found: ${operation.layerId}`);
      const patch = Object.fromEntries(Object.keys(operation.patch).map((key) => [key, layer[key as keyof Layer]])) as typeof operation.patch;
      return { ...operation, patch };
    }
    case "reorderLayer":
      return { ...operation, fromIndex: operation.toIndex, toIndex: operation.fromIndex };
    case "addFrame":
      return { type: "removeFrame", characterId: operation.characterId, viewId: operation.viewId, frameId: operation.frame.id };
    case "removeFrame": {
      const view = getView(character, operation.viewId);
      const index = view.frames.findIndex((frame) => frame.id === operation.frameId);
      if (index < 0) throw new Error(`Frame not found: ${operation.frameId}`);
      const animationRefs = character.animations.flatMap((clip) => clip.viewId === operation.viewId ? clip.frames.flatMap((reference, referenceIndex) => reference.frameId === operation.frameId ? [{ clipId: clip.id, index: referenceIndex, reference: structuredClone(reference) }] : []) : []);
      return { type: "addFrame", characterId: operation.characterId, viewId: operation.viewId, frame: structuredClone(view.frames[index]!), index, animationRefs };
    }
    case "updateFrame": {
      const frame = getFrame(character, operation.viewId, operation.frameId);
      const patch = Object.fromEntries(Object.keys(operation.patch).map((key) => [key, frame[key as keyof Frame]])) as typeof operation.patch;
      return { ...operation, patch };
    }
    case "reorderFrame":
      return { ...operation, fromIndex: operation.toIndex, toIndex: operation.fromIndex };
    case "swapCels":
      return { ...operation };
    case "addAnimation":
      return { type: "removeAnimation", characterId: operation.characterId, animationId: operation.animation.id };
    case "removeAnimation": {
      const animation = character.animations.find((item) => item.id === operation.animationId);
      if (!animation) throw new Error(`Animation not found: ${operation.animationId}`);
      return { type: "addAnimation", characterId: operation.characterId, animation: structuredClone(animation), index: character.animations.findIndex((item) => item.id === operation.animationId) };
    }
    case "updateAnimation": {
      const animation = character.animations.find((item) => item.id === operation.animationId);
      if (!animation) throw new Error(`Animation not found: ${operation.animationId}`);
      const patch = Object.fromEntries(Object.keys(operation.patch).map((key) => [key, animation[key as keyof typeof animation]])) as typeof operation.patch;
      return { ...operation, patch };
    }
  }
}

function resizeCharacter(character: Character, width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 512 || height > 512) throw new Error("Character dimensions must be integers from 1 to 512");
  const oldWidth = character.width; const oldHeight = character.height;
  const scalePoint = (point: { x: number; y: number }) => ({ x: Math.round(point.x * width / oldWidth), y: Math.round(point.y * height / oldHeight) });
  for (const view of character.views) for (const frame of view.frames) for (const cel of Object.values(frame.cels)) {
    cel.grid = resizeGrid(cel.grid, width, height);
    cel.offset = scalePoint(cel.offset);
  }
  character.width = width; character.height = height;
  character.origin = scalePoint(character.origin); character.pivot = scalePoint(character.pivot);
  character.bounds = { ...scalePoint(character.bounds), width, height };
  character.anchors = Object.fromEntries(Object.entries(character.anchors).map(([id, point]) => [id, scalePoint(point)]));
  character.parts.forEach((part) => { part.pivot = scalePoint(part.pivot); });
  character.poses.forEach((pose) => Object.values(pose.transforms).forEach((transform) => Object.assign(transform, scalePoint(transform))));
}

function resizeGrid(grid: PixelGrid, width: number, height: number): PixelGrid {
  const resized = emptyGrid(width, height);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const sourceX = Math.min(grid.width - 1, Math.floor(x * grid.width / width));
    const sourceY = Math.min(grid.height - 1, Math.floor(y * grid.height / height));
    resized.cells[y * width + x] = grid.cells[sourceY * grid.width + sourceX] ?? null;
  }
  return resized;
}

function addLayer(character: Character, layer: Layer, cels?: Record<string, Record<string, Cel>>): void {
  if (character.layers.some((item) => item.id === layer.id)) throw new Error(`Layer already exists: ${layer.id}`);
  character.layers.push(structuredClone(layer));
  character.layers.sort((a, b) => a.zIndex - b.zIndex);
  for (const view of character.views) {
    for (const frame of view.frames) frame.cels[layer.id] = structuredClone(cels?.[view.id]?.[frame.id] ?? { grid: emptyGrid(character.width, character.height), offset: { x: 0, y: 0 } });
  }
}

export function getCharacter(project: PixelProject, characterId: string): Character {
  const character = project.characters.find((item) => item.id === characterId);
  if (!character) throw new Error(`Character not found: ${characterId}`);
  return character;
}

export function getView(character: Character, viewId: string): DirectionalView {
  const view = character.views.find((item) => item.id === viewId);
  if (!view) throw new Error(`View not found: ${viewId}`);
  return view;
}

export function getFrame(character: Character, viewId: string, frameId: string): Frame {
  const frame = getView(character, viewId).frames.find((item) => item.id === frameId);
  if (!frame) throw new Error(`Frame not found: ${frameId}`);
  return frame;
}

function getCel(character: Character, viewId: string, frameId: string, layerId: string) {
  const cel = getFrame(character, viewId, frameId).cels[layerId];
  if (!cel) throw new Error(`Cel not found for layer: ${layerId}`);
  return cel;
}
