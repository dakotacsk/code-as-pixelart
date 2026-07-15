#!/usr/bin/env node
import { install, printHelp } from "../src/installer.js";

const [command, ...args] = process.argv.slice(2);

if (command === "install") {
  await install({ update: !args.includes("--no-update") });
} else if (command === "--version" || command === "-v") {
  process.stdout.write("0.2.0\n");
} else if (!command || command === "help" || command === "--help" || command === "-h") {
  printHelp();
} else {
  process.stderr.write(`Unknown command: ${command}\n\n`);
  printHelp(process.stderr);
  process.exitCode = 2;
}
