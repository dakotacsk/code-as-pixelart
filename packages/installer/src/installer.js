import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const DEFAULT_REPOSITORY = "https://github.com/dakotacsk/code-as-pixelart.git";

export function resolveInstallPaths(environment = process.env) {
  const codexHome = environment.CODEX_HOME || join(homedir(), ".codex");
  const checkout = environment.PIX_INSTALL_ROOT || join(codexHome, "tools", "code-as-pixel-art");
  return { codexHome, checkout, skill: join(codexHome, "skills", "code-as-pixel-art") };
}

export async function install(options = {}) {
  requireNode20();
  const environment = options.environment || process.env;
  const { codexHome, checkout, skill } = resolveInstallPaths(environment);
  const repository = environment.PIX_REPOSITORY_URL || DEFAULT_REPOSITORY;
  const run = options.run || runCommand;

  await mkdir(dirname(checkout), { recursive: true });
  if (!existsSync(checkout)) {
    process.stdout.write(`Downloading Code as Pixel Art to ${checkout}\n`);
    run("git", ["clone", "--depth", "1", repository, checkout]);
  } else {
    if (!existsSync(join(checkout, ".git"))) throw new Error(`Install path exists but is not a Git checkout: ${checkout}`);
    if (options.update !== false) {
      process.stdout.write("Updating the managed framework checkout\n");
      run("git", ["-C", checkout, "pull", "--ff-only"]);
    }
  }

  if (environment.PIX_SKIP_BUILD !== "1") {
    process.stdout.write("Installing and building the agent runtime\n");
    run("npm", ["install"], { env: environment, cwd: checkout });
    run("npm", ["run", "build"], { env: environment, cwd: checkout });
  }

  process.stdout.write("Registering the Codex skill\n");
  run("npm", ["run", "skill:install"], { env: { ...environment, CODEX_HOME: codexHome }, cwd: checkout });
  process.stdout.write(`\nCode as Pixel Art is ready. Restart Codex, then invoke $code-as-pixel-art.\nSkill: ${skill}\nRuntime: ${checkout}\n`);
  return { codexHome, checkout, skill };
}

export function printHelp(stream = process.stdout) {
  stream.write(`code-as-pixel-art\n\nUsage:\n  npx code-as-pixel-art install\n\nCommands:\n  install        Download, build, and register the Codex skill\n  help           Show this help\n\nOptions:\n  --no-update    Keep an existing managed checkout at its current revision\n`);
}

function requireNode20() {
  const major = Number(process.versions.node.split(".")[0]);
  if (!Number.isInteger(major) || major < 20) throw new Error(`Node.js 20 or newer is required. Found ${process.version}.`);
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", env: options.env || process.env, ...(options.cwd ? { cwd: options.cwd } : {}) });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}`);
}
