import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { invokePix, withJsonInput, type PixResult } from "./bridge.js";

const pathField = z.string().min(1).describe("Absolute or workspace-relative filesystem path");
const positiveInteger = z.number().int().positive();

function response(result: PixResult) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result.data, null, 2) }],
    ...(result.exitCode === 0 ? {} : { isError: true as const }),
  };
}

export function createPixelArtServer(): McpServer {
  const server = new McpServer({ name: "code-as-pixelart", version: "0.1.0" });

  server.registerTool("pixelart_import_image", {
    title: "Convert an image into editable pixel-art source",
    description: "Deterministically converts a mascot image into a validated PixelProject with semantic palette tokens, a real editable cel, stable identifiers, and transparent background handling.",
    inputSchema: {
      imagePath: pathField,
      outputPath: pathField,
      name: z.string().min(1).optional(),
      width: positiveInteger.min(8).max(256).default(32),
      height: positiveInteger.min(8).max(256).default(32),
      colors: positiveInteger.min(2).max(64).default(12),
      keepBackground: z.boolean().default(false),
    },
  }, async (input) => response(await invokePix(["import", input.imagePath, "--width", String(input.width), "--height", String(input.height), "--colors", String(input.colors), "--out", input.outputPath, ...(input.name ? ["--name", input.name] : []), ...(input.keepBackground ? ["--keep-background"] : [])])));

  server.registerTool("pixelart_inspect_project", {
    title: "Inspect semantic sprite source",
    description: "Returns a compact machine-readable inventory of project validity, palette tokens, characters, views, layers, variants, animation clips, dimensions, and stable identifiers before an agent proposes edits.",
    inputSchema: { projectPath: pathField },
  }, async ({ projectPath }) => response(await invokePix(["inspect", projectPath, "--json"])));

  server.registerTool("pixelart_validate_project", {
    title: "Validate pixel-art relationships",
    description: "Checks the complete project schema and cross-references, returning structured paths, error codes, and repair guidance suitable for an agent repair loop before rendering or handoff.",
    inputSchema: { projectPath: pathField },
  }, async ({ projectPath }) => response(await invokePix(["validate", projectPath, "--json"])));

  server.registerTool("pixelart_apply_operations", {
    title: "Apply semantic pixel operations",
    description: "Atomically applies typed pixel, palette, part, pose, layer, view, and frame operations to source data, with an optional expected hash that prevents an agent from overwriting newer human edits.",
    inputSchema: {
      projectPath: pathField,
      operations: z.array(z.record(z.string(), z.unknown())).min(1).max(1000),
      expectedHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
      outputPath: pathField.optional(),
    },
  }, async (input) => withJsonInput(input.operations, async (operationsPath) => response(await invokePix(["apply", input.projectPath, "--operations", operationsPath, ...(input.expectedHash ? ["--expected-hash", input.expectedHash] : []), ...(input.outputPath ? ["--out", input.outputPath] : [])]))));

  server.registerTool("pixelart_create_animation", {
    title: "Author a frame animation plan",
    description: "Creates a validated cel animation from a source frame using integer part moves and sparse pixel edits, preserving all source pixels while adding agent-authored frames and a named animation clip.",
    inputSchema: {
      projectPath: pathField,
      plan: z.record(z.string(), z.unknown()),
      expectedHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
      outputPath: pathField.optional(),
    },
  }, async (input) => withJsonInput(input.plan, async (planPath) => response(await invokePix(["animate", input.projectPath, "--plan", planPath, ...(input.expectedHash ? ["--expected-hash", input.expectedHash] : []), ...(input.outputPath ? ["--out", input.outputPath] : [])]))));

  server.registerTool("pixelart_render_asset", {
    title: "Render a PNG, GIF, or sprite sheet",
    description: "Renders deterministic nearest-neighbor output from validated source as a still PNG, looping GIF, or packed sprite sheet with manifest, never mutating the project during preview or export.",
    inputSchema: {
      projectPath: pathField,
      format: z.enum(["png", "gif", "sheet"]),
      outputPath: pathField,
      characterId: z.string().optional(),
      viewId: z.string().optional(),
      frameId: z.string().optional(),
      animationId: z.string().optional(),
      variantId: z.string().optional(),
      poseId: z.string().optional(),
      scale: positiveInteger.max(32).default(1),
    },
  }, async (input) => {
    const common = [input.projectPath, ...(input.characterId ? ["--character", input.characterId] : []), ...(input.variantId ? ["--variant", input.variantId] : []), ...(input.poseId ? ["--pose", input.poseId] : []), "--scale", String(input.scale), "--out", input.outputPath];
    if (input.format === "png") return response(await invokePix(["render", ...common, ...(input.viewId ? ["--view", input.viewId] : []), ...(input.frameId ? ["--frame", input.frameId] : [])]));
    if (!input.animationId) return { content: [{ type: "text" as const, text: JSON.stringify({ ok: false, code: "MISSING_ANIMATION", message: "animationId is required for GIF and sheet output" }) }], isError: true as const };
    return response(await invokePix([input.format, ...common, "--animation", input.animationId]));
  });

  return server;
}
