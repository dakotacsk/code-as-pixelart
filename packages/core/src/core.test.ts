import { describe, expect, it } from "vitest";
import { applyOperation, createDemoProject, createManifest, encodeGif, grid, invertOperation, packSpriteSheet, pixelateImage, renderAnimation, renderFrame, validateProject } from "./index.js";

describe("pixel project", () => {
  it("validates the source-coded multi-angle demo", () => {
    const result = validateProject(createDemoProject());
    expect(result.valid, JSON.stringify(result.issues, null, 2)).toBe(true);
  });

  it("normalizes readable grid rows", () => {
    expect(grid([".A", "AA"], { A: "ink" })).toEqual({ width: 2, height: 2, cells: [null, "ink", "ink", "ink"] });
  });

  it("applies and inverts pixel edits", () => {
    const project = createDemoProject();
    const operation = { type: "setPixel", characterId: "mara", viewId: "front", frameId: "front-idle", layerId: "face", x: 0, y: 0, tokenId: "eye" } as const;
    const inverse = invertOperation(project, operation);
    const edited = applyOperation(project, operation);
    expect(applyOperation(edited, inverse)).toEqual(project);
  });

  it("applies and inverts flood fills", () => {
    const project = createDemoProject();
    const operation = { type: "fillRegion", characterId: "mara", viewId: "front", frameId: "front-idle", layerId: "face", x: 0, y: 0, tokenId: "coat" } as const;
    const inverse = invertOperation(project, operation);
    expect(applyOperation(applyOperation(project, operation), inverse)).toEqual(project);
  });

  it("renders identical source to an identical hash", () => {
    const project = createDemoProject();
    const options = { characterId: "mara", viewId: "front", frameId: "front-idle" };
    expect(renderFrame(project, options).hash).toBe(renderFrame(project, options).hash);
  });

  it("propagates semantic palette variants without changing source pixels", () => {
    const project = createDemoProject();
    const base = renderFrame(project, { characterId: "mara", viewId: "front", frameId: "front-idle" });
    const variant = renderFrame(project, { characterId: "mara", viewId: "front", frameId: "front-idle", variantId: "night-shift" });
    expect(variant.hash).not.toBe(base.hash);
    expect(project.palette.find((token) => token.id === "coat")?.color).toBe("#6F7760");
  });

  it("packs animation frames and creates a stable manifest", () => {
    const project = createDemoProject();
    const frames = renderAnimation(project, { characterId: "mara", animationId: "front-walk" });
    const sheet = packSpriteSheet(frames, "horizontal");
    const manifest = createManifest(project, project.characters[0]!, "front-walk", frames, sheet);
    expect(sheet.width).toBe(48);
    expect(sheet.height).toBe(24);
    expect(manifest.frames).toHaveLength(2);
    expect(manifest.frames.every((frame) => frame.hash.length === 8)).toBe(true);
  });

  it("reports inheritance cycles with repair guidance", () => {
    const project = createDemoProject();
    project.characters[0]!.variants[0]!.baseVariantId = "field-kit";
    project.characters[0]!.variants[1]!.baseVariantId = "night-shift";
    const result = validateProject(project);
    expect(result.valid).toBe(false);
    expect(result.issues.find((issue) => issue.code === "VARIANT_CYCLE")?.repair).toMatch(/Break/);
  });

  it("restores deleted views, layers, frame references, and cel offsets exactly", () => {
    const project = createDemoProject();
    project.characters[0]!.views[0]!.frames[0]!.cels.hair!.offset = { x: 2, y: -1 };
    for (const operation of [
      { type: "removeView", characterId: "mara", viewId: "front" },
      { type: "removeLayer", characterId: "mara", layerId: "hair" },
      { type: "removeFrame", characterId: "mara", viewId: "front", frameId: "front-walk-a" },
    ] as const) {
      const inverse = invertOperation(project, operation);
      expect(applyOperation(applyOperation(project, operation), inverse)).toEqual(project);
    }
  });

  it("updates timeline settings and swaps cels reversibly", () => {
    const project = createDemoProject();
    const operations = [
      { type: "updateProject", patch: { ticksPerSecond: 18 } },
      { type: "updateAnimation", characterId: "mara", animationId: "front-walk", patch: { loop: false } },
      { type: "swapCels", characterId: "mara", viewId: "front", sourceFrameId: "front-idle", sourceLayerId: "face", targetFrameId: "front-walk-a", targetLayerId: "hair" },
    ] as const;
    for (const operation of operations) {
      const inverse = invertOperation(project, operation);
      expect(applyOperation(applyOperation(project, operation), inverse)).toEqual(project);
    }
  });

  it("restores a removed animation at its original position", () => {
    const project = createDemoProject();
    const operation = { type: "removeAnimation", characterId: "mara", animationId: "front-walk" } as const;
    const inverse = invertOperation(project, operation);
    expect(applyOperation(applyOperation(project, operation), inverse)).toEqual(project);
  });

  it("turns an RGBA mascot image into a valid editable project", () => {
    const pixels = new Uint8ClampedArray(8 * 8 * 4).fill(255);
    for (let y = 2; y < 7; y += 1) for (let x = 2; x < 6; x += 1) {
      const index = (y * 8 + x) * 4;
      pixels[index] = 180; pixels[index + 1] = 40; pixels[index + 2] = 30; pixels[index + 3] = 255;
    }
    const project = pixelateImage({ width: 8, height: 8, pixels }, { name: "Red mascot", width: 16, height: 16, colors: 4, removeBackground: true });
    expect(validateProject(project).valid).toBe(true);
    expect(project.characters[0]!.width).toBe(16);
    expect(Object.values(project.characters[0]!.views[0]!.frames[0]!.cels).flatMap((cel) => cel.grid.cells).filter(Boolean).length).toBeGreaterThan(0);
    expect(project.palette.length).toBeLessThanOrEqual(4);
    expect(project.palette.every((token) => !token.color.includes("NAN"))).toBe(true);
    expect(project.characters[0]!.parts.map((part) => part.id)).toContain("root");
  });

  it("imports fully transparent images without invalid colors or empty quantizer buckets", () => {
    const project = pixelateImage({ width: 64, height: 64, pixels: new Uint8ClampedArray(64 * 64 * 4) }, { width: 64, height: 64, colors: 12 });
    expect(validateProject(project).valid).toBe(true);
    expect(project.palette).toEqual([]);
  });

  it("rejects sprite-sheet manifests with exact repair guidance", () => {
    const result = validateProject({ animationId: "walk", sourceHash: "abc", frames: [] });
    expect(result.valid).toBe(false);
    expect(result.issues[0]).toMatchObject({ code: "SPRITE_SHEET_MANIFEST", message: "This is a sprite-sheet manifest, not project source." });
  });

  it("adds parts and resizes every cel with exact operation inversion", () => {
    const project = createDemoProject();
    const add = { type: "addPart", characterId: "mara", part: { id: "tail", name: "Tail", pivot: { x: 3, y: 8 }, parentId: "root" } } as const;
    expect(applyOperation(applyOperation(project, add), invertOperation(project, add))).toEqual(project);
    const resize = { type: "resizeCharacter", characterId: "mara", width: 32, height: 48 } as const;
    const resized = applyOperation(project, resize);
    expect(Object.values(resized.characters[0]!.views[0]!.frames[0]!.cels)[0]!.grid).toMatchObject({ width: 32, height: 48 });
    expect(applyOperation(resized, invertOperation(project, resize))).toEqual(project);
  });

  it("encodes deterministic looping GIF bytes from rendered animation", () => {
    const project = createDemoProject();
    const frames = renderAnimation(project, { characterId: "mara", animationId: "front-walk" });
    const first = encodeGif(frames, { ticksPerSecond: project.ticksPerSecond, scale: 2, loop: true });
    const second = encodeGif(frames, { ticksPerSecond: project.ticksPerSecond, scale: 2, loop: true });
    expect(new TextDecoder().decode(first.slice(0, 6))).toBe("GIF89a");
    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(100);
  });
});
