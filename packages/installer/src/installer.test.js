import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { test } from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { install, resolveInstallPaths } from "./installer.js";

test("resolves a stable managed checkout under CODEX_HOME", () => {
  assert.deepEqual(resolveInstallPaths({ CODEX_HOME: "/tmp/pix-codex" }), {
    codexHome: "/tmp/pix-codex",
    checkout: "/tmp/pix-codex/tools/code-as-pixel-art",
    skill: "/tmp/pix-codex/skills/code-as-pixel-art",
  });
});

test("runs the deterministic clone, build, and registration sequence", async () => {
  const calls = [];
  const environment = { CODEX_HOME: "/tmp/pix-test-codex", PIX_INSTALL_ROOT: `/tmp/pix-test-${process.pid}`, PIX_REPOSITORY_URL: "https://example.test/pix.git" };
  await install({ environment, run: (command, args, options) => calls.push({ command, args, options }) });
  assert.deepEqual(calls.map(({ command, args }) => [command, ...args]), [
    ["git", "clone", "--depth", "1", "https://example.test/pix.git", environment.PIX_INSTALL_ROOT],
    ["npm", "install"],
    ["npm", "run", "build"],
    ["npm", "run", "skill:install"],
  ]);
  assert.equal(calls.at(-1).options.env.CODEX_HOME, environment.CODEX_HOME);
  assert.ok(calls.slice(1).every((call) => call.options.cwd === environment.PIX_INSTALL_ROOT));
});

test("fast-forwards an existing managed checkout without rebuilding when requested", async () => {
  const root = await mkdtemp(join(tmpdir(), "pix-installer-"));
  const checkout = join(root, "runtime");
  await mkdir(join(checkout, ".git"), { recursive: true });
  const calls = [];
  try {
    await install({ environment: { CODEX_HOME: join(root, "codex"), PIX_INSTALL_ROOT: checkout, PIX_SKIP_BUILD: "1" }, run: (command, args, options) => calls.push({ command, args, options }) });
    assert.deepEqual(calls.map(({ command, args }) => [command, ...args]), [
      ["git", "-C", checkout, "pull", "--ff-only"],
      ["npm", "run", "skill:install"],
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
