import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { invokePix, withJsonInput } from "./bridge.js";
import { createPixelArtServer } from "./server.js";

describe("MCP command bridge", () => {
  it("returns structured agent-readable CLI results", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pix-mcp-test-"));
    const project = join(directory, "project.json");
    expect((await invokePix(["init", project])).exitCode).toBe(0);
    const report = await invokePix(["inspect", project, "--json"]);
    expect(report.exitCode).toBe(0);
    expect(report.data).toMatchObject({ valid: true, schemaVersion: 1 });
  });

  it("provides temporary JSON inputs and removes them afterward", async () => {
    let filename = "";
    const text = await withJsonInput({ operations: [] }, async (path) => { filename = path; return readFile(path, "utf8"); });
    expect(JSON.parse(text)).toEqual({ operations: [] });
    await expect(readFile(filename, "utf8")).rejects.toThrow();
  });

  it("advertises and invokes the six focused MCP tools", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createPixelArtServer();
    const client = new Client({ name: "pix-test", version: "1.0.0" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
        "pixelart_apply_operations", "pixelart_create_animation", "pixelart_import_image", "pixelart_inspect_project", "pixelart_render_asset", "pixelart_validate_project",
      ]);
      const directory = await mkdtemp(join(tmpdir(), "pix-mcp-call-"));
      const project = join(directory, "project.json");
      await invokePix(["init", project]);
      const result = await client.callTool({ name: "pixelart_inspect_project", arguments: { projectPath: project } }) as { isError?: boolean; content: Array<{ type: string; text?: string }> };
      expect(result.isError).not.toBe(true);
      const content = result.content[0];
      expect(content?.type).toBe("text");
      if (content?.type !== "text" || !content.text) throw new Error("Expected text tool response");
      expect(JSON.parse(content.text)).toMatchObject({ valid: true, schemaVersion: 1 });
    } finally {
      await client.close();
      await server.close();
    }
  });
});
