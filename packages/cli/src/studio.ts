import { createServer, type Server } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { PixelProject } from "@code-as-pixelart/core";
import { hashProject, readProject, writeProjectAtomic } from "./media.js";

export interface StudioServer { server: Server; url: string; close(): Promise<void> }

export async function startStudioServer(projectFile: string, port = 4173): Promise<StudioServer> {
  const filename = resolve(projectFile);
  await readProject(filename);
  const studioRoot = resolve(fileURLToPath(new URL("../../../apps/studio/dist", import.meta.url)));
  const server = createServer(async (request, response) => {
    try {
      if (request.url?.startsWith("/api/project")) {
        if (request.method === "GET") {
          const project = await readProject(filename); const metadata = await stat(filename);
          return json(response, 200, { project, path: filename, hash: hashProject(project), modifiedAt: metadata.mtime.toISOString() });
        }
        if (request.method === "PUT") {
          const body = JSON.parse(await readBody(request)) as { project?: PixelProject; expectedHash?: string };
          const current = await readProject(filename); const currentHash = hashProject(current);
          if (body.expectedHash && body.expectedHash !== currentHash) return json(response, 409, { code: "PROJECT_CONFLICT", message: "Project changed on disk.", expectedHash: body.expectedHash, currentHash, repair: "Reload the disk version or save your edits to a new .pixel.json file." });
          if (!body.project) return json(response, 400, { code: "MISSING_PROJECT", message: "Request must include project source." });
          await writeProjectAtomic(filename, body.project);
          return json(response, 200, { ok: true, hash: hashProject(body.project), path: filename });
        }
      }
      const pathname = request.url?.split("?")[0] ?? "/";
      const requested = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
      const safePath = resolve(studioRoot, requested);
      const target = safePath.startsWith(studioRoot) ? safePath : join(studioRoot, "index.html");
      let bytes: Buffer;
      try { bytes = await readFile(target); } catch { bytes = await readFile(join(studioRoot, "index.html")); }
      response.writeHead(200, { "content-type": mime(extname(target)), "cache-control": "no-store" }); response.end(bytes);
    } catch (error) {
      json(response, 500, { code: "STUDIO_SERVER_ERROR", message: error instanceof Error ? error.message : String(error) });
    }
  });
  await new Promise<void>((resolveListen, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", () => resolveListen()); });
  const address = server.address(); const actualPort = typeof address === "object" && address ? address.port : port;
  return { server, url: `http://127.0.0.1:${actualPort}/?workspace=1`, close: () => new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose())) };
}

function readBody(request: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => { const chunks: Buffer[] = []; request.on("data", (chunk) => chunks.push(Buffer.from(chunk))); request.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8"))); request.on("error", reject); });
}
function json(response: import("node:http").ServerResponse, status: number, body: unknown): void { response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }); response.end(JSON.stringify(body)); }
function mime(extension: string): string { return ({ ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png" } as Record<string, string>)[extension] ?? "application/octet-stream"; }
