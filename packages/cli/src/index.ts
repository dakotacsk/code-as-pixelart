import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PNG } from "pngjs";
import {
  createDemoProject,
  createManifest,
  getCharacter,
  packSpriteSheet,
  renderAnimation,
  renderFrame,
  applyOperation,
  validateProject,
  type AnimationClip,
  type Frame,
  type PixelOperation,
  type PixelProject,
  type SheetLayout,
} from "@code-as-pixelart/core";
import { hashProject, importImageFile, readProject, writeAnimationGif, writeProjectAtomic } from "./media.js";
import { startStudioServer } from "./studio.js";

export * from "./media.js";
export * from "./studio.js";

export interface CliIO {
  stdout(message: string): void;
  stderr(message: string): void;
}

const defaultIO: CliIO = {
  stdout: (message) => process.stdout.write(`${message}\n`),
  stderr: (message) => process.stderr.write(`${message}\n`),
};

export async function run(argv: string[], io: CliIO = defaultIO): Promise<number> {
  const [command, ...args] = argv;
  try {
    switch (command) {
      case "init":
        return await init(args, io);
      case "validate":
        return await validate(args, io);
      case "render":
        return await render(args, io);
      case "sheet":
        return await sheet(args, io);
      case "inspect":
        return await inspect(args, io);
      case "import":
        return await importImage(args, io);
      case "apply":
        return await applyOperations(args, io);
      case "animate":
        return await animate(args, io);
      case "gif":
        return await gif(args, io);
      case "doctor":
        return await doctor(io);
      case "studio":
        return await studio(args, io);
      case "resize":
        return await resizeProject(args, io);
      case "help":
      case "--help":
      case "-h":
      case undefined:
        io.stdout(helpText());
        return command ? 0 : 1;
      default:
        io.stderr(JSON.stringify({ ok: false, code: "UNKNOWN_COMMAND", message: `Unknown command: ${command}`, repair: "Run pix help to list commands." }));
        return 2;
    }
  } catch (error) {
    io.stderr(JSON.stringify({ ok: false, code: "COMMAND_FAILED", message: error instanceof Error ? error.message : String(error) }));
    return 1;
  }
}

async function resizeProject(args: string[], io: CliIO): Promise<number> {
  const filename = requiredFile(args); const project = await validProject(filename);
  const characterId = value(args, "--character") ?? project.characters[0]?.id; if (!characterId) throw new Error("A valid --character is required");
  const size = value(args, "--size"); const width = numberValue(args, "--width", size ? Number(size) : NaN); const height = numberValue(args, "--height", size ? Number(size) : NaN);
  const updated = applyOperation(project, { type: "resizeCharacter", characterId, width, height });
  const output = resolve(value(args, "--out") ?? filename); await writeProjectAtomic(output, updated);
  io.stdout(JSON.stringify({ ok: true, command: "resize", output, characterId, dimensions: { width, height }, projectHash: hashProject(updated) })); return 0;
}

async function studio(args: string[], io: CliIO): Promise<number> {
  const filename = requiredFile(args);
  const server = await startStudioServer(filename, numberValue(args, "--port", 4173));
  io.stdout(JSON.stringify({ ok: true, command: "studio", project: resolve(filename), url: server.url }));
  if (!hasFlag(args, "--no-open")) {
    const { spawn } = await import("node:child_process");
    spawn(process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open", process.platform === "win32" ? ["/c", "start", server.url] : [server.url], { detached: true, stdio: "ignore" }).unref();
  }
  await new Promise<void>((resolveStop) => { const stop = () => void server.close().finally(resolveStop); process.once("SIGINT", stop); process.once("SIGTERM", stop); });
  return 0;
}

async function init(args: string[], io: CliIO): Promise<number> {
  const output = resolve(value(args, "--out") ?? positional(args, 0) ?? "pixel-project.json");
  await writeFile(output, `${JSON.stringify(createDemoProject(), null, 2)}\n`, "utf8");
  io.stdout(JSON.stringify({ ok: true, command: "init", output }));
  return 0;
}

async function validate(args: string[], io: CliIO): Promise<number> {
  const filename = requiredFile(args);
  const project = await loadProject(filename);
  const result = validateProject(project);
  if (hasFlag(args, "--json")) io.stdout(JSON.stringify(result, null, 2));
  else if (result.valid) io.stdout(`Valid pixel project: ${project.name}`);
  else result.issues.forEach((issue) => io.stderr(`${issue.path} [${issue.code}] ${issue.message} Repair: ${issue.repair}`));
  return result.valid ? 0 : 3;
}

async function render(args: string[], io: CliIO): Promise<number> {
  const filename = requiredFile(args);
  const project = await validProject(filename);
  const character = getCharacter(project, value(args, "--character") ?? project.characters[0]?.id ?? "");
  const viewId = value(args, "--view") ?? character.views[0]?.id;
  const view = character.views.find((item) => item.id === viewId);
  if (!viewId || !view) throw new Error("A valid --view is required");
  const frameId = value(args, "--frame") ?? view.frames[0]?.id;
  if (!frameId) throw new Error("A valid --frame is required");
  const poseId = value(args, "--pose");
  const variantId = value(args, "--variant");
  const rendered = renderFrame(project, { characterId: character.id, viewId, frameId, ...(poseId ? { poseId } : {}), ...(variantId ? { variantId } : {}) });
  const output = resolve(value(args, "--out") ?? `${character.id}-${viewId}-${frameId}.png`);
  await writePng(output, rendered.width, rendered.height, rendered.pixels, numberValue(args, "--scale", 1));
  io.stdout(JSON.stringify({ ok: true, command: "render", output, width: rendered.width, height: rendered.height, hash: rendered.hash }));
  return 0;
}

async function sheet(args: string[], io: CliIO): Promise<number> {
  const filename = requiredFile(args);
  const project = await validProject(filename);
  const character = getCharacter(project, value(args, "--character") ?? project.characters[0]?.id ?? "");
  const animationId = value(args, "--animation") ?? character.animations[0]?.id;
  if (!animationId) throw new Error("A valid --animation is required");
  const layout = (value(args, "--layout") ?? "packed") as SheetLayout;
  if (!(["horizontal", "vertical", "packed"] as string[]).includes(layout)) throw new Error("--layout must be horizontal, vertical, or packed");
  const poseId = value(args, "--pose");
  const variantId = value(args, "--variant");
  const frames = renderAnimation(project, { characterId: character.id, animationId, ...(poseId ? { poseId } : {}), ...(variantId ? { variantId } : {}) });
  const packed = packSpriteSheet(frames, layout);
  const manifest = createManifest(project, character, animationId, frames, packed);
  const output = resolve(value(args, "--out") ?? `${character.id}-${animationId}.png`);
  const manifestOutput = resolve(value(args, "--manifest") ?? output.replace(/\.png$/i, ".json"));
  await writePng(output, packed.width, packed.height, packed.pixels, numberValue(args, "--scale", 1));
  await writeFile(manifestOutput, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  io.stdout(JSON.stringify({ ok: true, command: "sheet", output, manifest: manifestOutput, frames: frames.length, width: packed.width, height: packed.height }));
  return 0;
}

async function inspect(args: string[], io: CliIO): Promise<number> {
  const filename = requiredFile(args);
  const project = await loadProject(filename);
  const validation = validateProject(project);
  const report = {
    schemaVersion: project.schemaVersion,
    id: project.id,
    name: project.name,
    valid: validation.valid,
    palette: project.palette.map(({ id, name, color }) => ({ id, name, color })),
    characters: project.characters.map((character) => ({
      id: character.id,
      name: character.name,
      dimensions: { width: character.width, height: character.height },
      parts: character.parts.map((part) => part.id),
      layers: character.layers.map((layer) => layer.id),
      views: character.views.map((view) => ({ id: view.id, frames: view.frames.length })),
      variants: character.variants.map((variant) => variant.id),
      animations: character.animations.map((clip) => ({ id: clip.id, viewId: clip.viewId, frames: clip.frames.length })),
    })),
    issues: validation.issues,
  };
  io.stdout(hasFlag(args, "--json") ? JSON.stringify(report, null, 2) : `${project.name}: ${report.characters.length} character(s), ${report.palette.length} palette token(s), ${validation.valid ? "valid" : "invalid"}`);
  return validation.valid ? 0 : 3;
}

async function importImage(args: string[], io: CliIO): Promise<number> {
  const filename = requiredFile(args);
  const output = resolve(value(args, "--out") ?? `${filename.replace(/\.[^.]+$/, "")}.pixel.json`);
  const requestedName = value(args, "--name");
  const project = await importImageFile(filename, {
    ...(requestedName ? { name: requestedName } : {}),
    width: numberValue(args, "--width", numberValue(args, "--size", 32)),
    height: numberValue(args, "--height", numberValue(args, "--size", 32)),
    colors: numberValue(args, "--colors", 12),
    removeBackground: !hasFlag(args, "--keep-background"),
    cropToContent: !hasFlag(args, "--no-crop"),
    backgroundTolerance: numberValue(args, "--background-tolerance", 34),
    padding: numberValue(args, "--padding", 1),
  });
  await writeProjectAtomic(output, project);
  io.stdout(JSON.stringify({ ok: true, command: "import", input: resolve(filename), output, projectHash: hashProject(project), characterId: project.characters[0]!.id, dimensions: { width: project.characters[0]!.width, height: project.characters[0]!.height }, colors: project.palette.length }));
  return 0;
}

async function applyOperations(args: string[], io: CliIO): Promise<number> {
  const filename = requiredFile(args);
  const operationsFile = value(args, "--operations") ?? positional(args, 1);
  if (!operationsFile) throw new Error("An operations JSON file is required with --operations <file>");
  const project = await validProject(filename);
  const expectedHash = value(args, "--expected-hash");
  const beforeHash = hashProject(project);
  if (expectedHash && expectedHash !== beforeHash) throw new Error(`Project hash conflict: expected ${expectedHash}, found ${beforeHash}. Inspect the current project before retrying.`);
  const parsed = JSON.parse(await readFile(resolve(operationsFile), "utf8")) as PixelOperation[] | { operations: PixelOperation[] };
  const operations = Array.isArray(parsed) ? parsed : parsed.operations;
  if (!Array.isArray(operations) || operations.length === 0) throw new Error("Operations file must contain a non-empty array or { operations: [...] }");
  const updated = applyOperation(project, { type: "batch", operations });
  const validation = validateProject(updated);
  if (!validation.valid) throw new Error(`Operations produced an invalid project: ${validation.issues[0]?.path} ${validation.issues[0]?.message}`);
  const output = resolve(value(args, "--out") ?? filename);
  await writeProjectAtomic(output, updated);
  io.stdout(JSON.stringify({ ok: true, command: "apply", input: resolve(filename), output, operations: operations.length, beforeHash, projectHash: hashProject(updated) }));
  return 0;
}

interface AnimationPlan {
  characterId: string;
  viewId: string;
  sourceFrameId: string;
  animation: { id: string; name: string; loop?: boolean; tags?: string[] };
  frames: Array<{ id: string; name: string; durationTicks: number; moves?: Array<{ partId: string; dx: number; dy: number }>; pixels?: Array<{ layerId: string; x: number; y: number; tokenId: string | null }> }>;
}

async function animate(args: string[], io: CliIO): Promise<number> {
  const filename = requiredFile(args);
  const planFile = value(args, "--plan") ?? positional(args, 1);
  if (!planFile) throw new Error("An animation plan JSON file is required with --plan <file>");
  const project = await validProject(filename);
  const expectedHash = value(args, "--expected-hash");
  if (expectedHash && expectedHash !== hashProject(project)) throw new Error("Project hash conflict. Inspect the current project and regenerate the animation plan.");
  const plan = JSON.parse(await readFile(resolve(planFile), "utf8")) as AnimationPlan;
  validateAnimationPlan(project, plan);
  const character = project.characters.find((item) => item.id === plan.characterId)!;
  const sourceView = character.views.find((item) => item.id === plan.viewId)!;
  const sourceFrame = sourceView.frames.find((item) => item.id === plan.sourceFrameId)!;
  const operations: PixelOperation[] = [];
  const references: AnimationClip["frames"] = [];
  for (const planned of plan.frames) {
    const frame: Frame = structuredClone(sourceFrame);
    frame.id = planned.id; frame.name = planned.name; frame.durationTicks = planned.durationTicks;
    operations.push({ type: "addFrame", characterId: character.id, viewId: sourceView.id, frame });
    for (const move of planned.moves ?? []) operations.push({ type: "movePart", characterId: character.id, viewId: sourceView.id, frameId: frame.id, partId: move.partId, dx: move.dx, dy: move.dy });
    for (const pixel of planned.pixels ?? []) operations.push({ type: "setPixel", characterId: character.id, viewId: sourceView.id, frameId: frame.id, layerId: pixel.layerId, x: pixel.x, y: pixel.y, tokenId: pixel.tokenId });
    references.push({ frameId: frame.id, durationTicks: frame.durationTicks });
  }
  operations.push({ type: "addAnimation", characterId: character.id, animation: { id: plan.animation.id, name: plan.animation.name, viewId: sourceView.id, frames: references, loop: plan.animation.loop ?? true, tags: plan.animation.tags ?? inferAnimationTags(plan.animation.id, plan.animation.name) } });
  const updated = applyOperation(project, { type: "batch", operations });
  const validation = validateProject(updated);
  if (!validation.valid) throw new Error(`Animation plan produced an invalid project: ${validation.issues[0]?.message}`);
  const output = resolve(value(args, "--out") ?? filename);
  await writeProjectAtomic(output, updated);
  io.stdout(JSON.stringify({ ok: true, command: "animate", output, animationId: plan.animation.id, frames: plan.frames.length, operations: operations.length, projectHash: hashProject(updated) }));
  return 0;
}

function inferAnimationTags(id: string, name: string): string[] {
  const text = `${id} ${name}`.toLowerCase(); const known = ["idle", "walk", "run", "jump", "bounce", "attack", "talk", "blink"];
  const inferred = known.filter((tag) => text.includes(tag)); return [...new Set(["agent-authored", ...inferred])];
}

async function gif(args: string[], io: CliIO): Promise<number> {
  const filename = requiredFile(args);
  const project = await validProject(filename);
  const characterId = value(args, "--character") ?? project.characters[0]?.id;
  if (!characterId) throw new Error("A valid --character is required");
  const character = project.characters.find((item) => item.id === characterId);
  const animationId = value(args, "--animation") ?? character?.animations[0]?.id;
  if (!animationId) throw new Error("A valid --animation is required");
  const output = resolve(value(args, "--out") ?? `${characterId}-${animationId}.gif`);
  const variantId = value(args, "--variant"); const poseId = value(args, "--pose");
  const result = await writeAnimationGif(project, { characterId, animationId, output, scale: numberValue(args, "--scale", 1), ...(variantId ? { variantId } : {}), ...(poseId ? { poseId } : {}) });
  io.stdout(JSON.stringify({ ok: true, command: "gif", output, animationId, ...result }));
  return 0;
}

async function doctor(io: CliIO): Promise<number> {
  const checks = [
    { name: "node", ok: Number(process.versions.node.split(".")[0]) >= 20, value: process.version, repair: "Install Node.js 20 or newer." },
    { name: "core", ok: validateProject(createDemoProject()).valid, value: "schema v1", repair: "Reinstall @code-as-pixelart/core." },
    { name: "image-import", ok: true, value: "sharp available", repair: "Reinstall the CLI so its image codec binaries match this platform." },
  ];
  const ok = checks.every((check) => check.ok);
  io.stdout(JSON.stringify({ ok, command: "doctor", checks }));
  return ok ? 0 : 4;
}

function validateAnimationPlan(project: PixelProject, plan: AnimationPlan): void {
  if (!plan || typeof plan !== "object") throw new Error("Animation plan must be a JSON object");
  const character = project.characters.find((item) => item.id === plan.characterId);
  const view = character?.views.find((item) => item.id === plan.viewId);
  if (!character) throw new Error(`Animation plan character not found: ${plan.characterId}`);
  if (!view) throw new Error(`Animation plan view not found: ${plan.viewId}`);
  if (!view.frames.some((item) => item.id === plan.sourceFrameId)) throw new Error(`Animation source frame not found: ${plan.sourceFrameId}`);
  if (!plan.animation?.id || !plan.animation.name) throw new Error("Animation plan needs animation.id and animation.name");
  if (character.animations.some((item) => item.id === plan.animation.id)) throw new Error(`Animation already exists: ${plan.animation.id}`);
  if (!Array.isArray(plan.frames) || plan.frames.length < 1 || plan.frames.length > 120) throw new Error("Animation plan frames must contain 1 to 120 frames");
  const ids = new Set(view.frames.map((item) => item.id));
  for (const frame of plan.frames) {
    if (!frame.id || ids.has(frame.id)) throw new Error(`Animation frame ID is missing or already used: ${frame.id}`);
    if (!Number.isInteger(frame.durationTicks) || frame.durationTicks < 1) throw new Error(`Frame ${frame.id} durationTicks must be a positive integer`);
    ids.add(frame.id);
    for (const move of frame.moves ?? []) if (!character.parts.some((item) => item.id === move.partId) || !Number.isInteger(move.dx) || !Number.isInteger(move.dy)) throw new Error(`Frame ${frame.id} contains an invalid part move`);
    for (const pixel of frame.pixels ?? []) if (!character.layers.some((item) => item.id === pixel.layerId) || !Number.isInteger(pixel.x) || !Number.isInteger(pixel.y)) throw new Error(`Frame ${frame.id} contains an invalid pixel edit`);
  }
}

async function validProject(filename: string): Promise<PixelProject> {
  const project = await loadProject(filename);
  const result = validateProject(project);
  if (!result.valid) throw new Error(`Project validation failed: ${result.issues[0]?.path} ${result.issues[0]?.message}`);
  return project;
}

async function loadProject(filename: string): Promise<PixelProject> {
  return readProject(filename);
}

async function writePng(filename: string, width: number, height: number, source: Uint8ClampedArray, scale: number): Promise<void> {
  if (!Number.isInteger(scale) || scale < 1) throw new Error("--scale must be a positive integer");
  const png = new PNG({ width: width * scale, height: height * scale });
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const sourceIndex = (y * width + x) * 4;
    for (let sy = 0; sy < scale; sy += 1) for (let sx = 0; sx < scale; sx += 1) {
      const destinationIndex = (((y * scale + sy) * width * scale) + x * scale + sx) * 4;
      for (let channel = 0; channel < 4; channel += 1) png.data[destinationIndex + channel] = source[sourceIndex + channel]!;
    }
  }
  await writeFile(filename, PNG.sync.write(png));
}

function requiredFile(args: string[]): string {
  const filename = positional(args, 0);
  if (!filename) throw new Error("A project JSON file is required");
  return filename;
}

function positional(args: string[], index: number): string | undefined {
  return args.filter((arg, argIndex) => !arg.startsWith("-") && (argIndex === 0 || !args[argIndex - 1]?.startsWith("--")))[index];
}

function value(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function numberValue(args: string[], flag: string, fallback: number): number {
  const raw = value(args, flag);
  return raw === undefined ? fallback : Number(raw);
}

function helpText(): string {
  return `pix - deterministic pixel art as code

Commands:
  pix init [output.json]
  pix validate <project.json> [--json]
  pix inspect <project.json> [--json]
  pix import <image> [--size 32] [--colors 12] [--out mascot.pixel.json]
  pix apply <project.json> --operations edits.json [--expected-hash sha256] [--out project.json]
  pix animate <project.json> --plan animation.json [--expected-hash sha256] [--out project.json]
  pix gif <project.json> --animation id [--scale n] [--out animation.gif]
  pix studio <project.pixel.json> [--port 4173] [--no-open]
  pix resize <project.pixel.json> --width n --height n [--character id] [--out project.pixel.json]
  pix doctor
  pix render <project.json> [--character id] [--view id] [--frame id] [--pose id] [--variant id] [--scale n] [--out image.png]
  pix sheet <project.json> --animation id [--layout packed|horizontal|vertical] [--scale n] [--out sheet.png] [--manifest sheet.json]`;
}
