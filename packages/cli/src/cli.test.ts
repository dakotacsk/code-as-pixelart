import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { run } from "./index.js";

function capture() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return { stdout, stderr, io: { stdout: (message: string) => stdout.push(message), stderr: (message: string) => stderr.push(message) } };
}

describe("pix CLI", () => {
  it("initializes, validates, inspects, renders, and packs a project", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pix-cli-"));
    const project = join(directory, "project.json");
    const image = join(directory, "frame.png");
    const sheet = join(directory, "sheet.png");
    const manifest = join(directory, "sheet.json");
    const output = capture();
    expect(await run(["init", project], output.io)).toBe(0);
    expect(await run(["validate", project, "--json"], output.io)).toBe(0);
    expect(await run(["inspect", project, "--json"], output.io)).toBe(0);
    expect(await run(["render", project, "--view", "front", "--frame", "front-idle", "--out", image], output.io)).toBe(0);
    expect(await run(["sheet", project, "--animation", "front-walk", "--out", sheet, "--manifest", manifest], output.io)).toBe(0);
    expect((await readFile(image)).subarray(1, 4).toString()).toBe("PNG");
    expect(JSON.parse(await readFile(manifest, "utf8")).frames).toHaveLength(2);
    expect(output.stderr).toEqual([]);
  });

  it("returns structured errors for unknown commands", async () => {
    const output = capture();
    expect(await run(["nope"], output.io)).toBe(2);
    expect(JSON.parse(output.stderr[0]!).code).toBe("UNKNOWN_COMMAND");
  });

  it("imports a mascot, applies hash-guarded edits, plans animation, and emits a GIF", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pix-agent-"));
    const source = join(directory, "nugget.png");
    const project = join(directory, "nugget.pixel.json");
    const operations = join(directory, "edits.json");
    const plan = join(directory, "bounce.json");
    const animation = join(directory, "bounce.gif");
    const rgba = Buffer.alloc(16 * 16 * 4, 255);
    for (let y = 3; y < 13; y += 1) for (let x = 4; x < 12; x += 1) {
      const index = (y * 16 + x) * 4;
      rgba[index] = 134; rgba[index + 1] = 63; rgba[index + 2] = 42;
    }
    await sharp(rgba, { raw: { width: 16, height: 16, channels: 4 } }).png().toFile(source);

    const imported = capture();
    expect(await run(["import", source, "--size", "16", "--colors", "4", "--out", project], imported.io)).toBe(0);
    const importReport = JSON.parse(imported.stdout.at(-1)!);
    expect(importReport.projectHash).toMatch(/^[a-f0-9]{64}$/);

    await writeFile(operations, JSON.stringify([{ type: "replacePaletteToken", tokenId: "color-01", color: "#522A22" }]));
    const edited = capture();
    expect(await run(["apply", project, "--operations", operations, "--expected-hash", importReport.projectHash], edited.io)).toBe(0);
    const editReport = JSON.parse(edited.stdout.at(-1)!);
    expect(editReport.projectHash).not.toBe(importReport.projectHash);

    await writeFile(plan, JSON.stringify({
      characterId: "nugget", viewId: "front", sourceFrameId: "front-idle",
      animation: { id: "front-bounce", name: "Bounce", loop: true },
      frames: [
        { id: "bounce-1", name: "Ground", durationTicks: 2 },
        { id: "bounce-2", name: "Air", durationTicks: 2, moves: [{ partId: "root", dx: 0, dy: -1 }] },
      ],
    }));
    expect(await run(["animate", project, "--plan", plan, "--expected-hash", editReport.projectHash], capture().io)).toBe(0);
    expect(await run(["gif", project, "--animation", "front-bounce", "--scale", "3", "--out", animation], capture().io)).toBe(0);
    expect((await readFile(animation)).subarray(0, 6).toString()).toBe("GIF89a");
    expect(await run(["doctor"], capture().io)).toBe(0);
  });

  it("refuses stale agent writes with a structured conflict", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pix-conflict-"));
    const project = join(directory, "project.json");
    const operations = join(directory, "edits.json");
    await run(["init", project], capture().io);
    await writeFile(operations, JSON.stringify([{ type: "replacePaletteToken", tokenId: "outline", color: "#000000" }]));
    const output = capture();
    expect(await run(["apply", project, "--operations", operations, "--expected-hash", "stale"], output.io)).toBe(1);
    expect(JSON.parse(output.stderr[0]!).message).toContain("hash conflict");
  });
});
