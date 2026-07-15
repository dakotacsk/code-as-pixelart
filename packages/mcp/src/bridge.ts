import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run, type CliIO } from "@code-as-pixelart/cli";

export interface PixResult {
  exitCode: number;
  stdout: string[];
  stderr: string[];
  data: unknown;
}

export async function invokePix(argv: string[]): Promise<PixResult> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const io: CliIO = { stdout: (message) => stdout.push(message), stderr: (message) => stderr.push(message) };
  const exitCode = await run(argv, io);
  const raw = (exitCode === 0 ? stdout : stderr).at(-1) ?? "";
  let data: unknown = raw;
  try { data = JSON.parse(raw); } catch { /* Help and human validation output remain text. */ }
  return { exitCode, stdout, stderr, data };
}

export async function withJsonInput<T>(value: unknown, task: (filename: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "pix-mcp-"));
  const filename = join(directory, "input.json");
  try {
    await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    return await task(filename);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
