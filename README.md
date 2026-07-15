# PIX: code as pixel art

MIT licensed. Download, adapt, and redistribute the framework and its Codex skill.

PIX treats a character as structured source: semantic colors, named parts, authored directional views, layered cels, poses, variants, anchors, and deterministic animation timing.

The repository contains four workspaces:

- `@code-as-pixelart/core`: strict TypeScript document model, validation, invertible operations, renderer, animation, and sprite-sheet packing.
- `@code-as-pixelart/cli`: machine-readable `pix` commands for image conversion, semantic edits, animation plans, validation, and PNG/GIF/sheet export.
- `@code-as-pixelart/mcp`: a local MCP server that gives coding agents narrow, validated pixel-art tools.
- `@code-as-pixelart/studio`: a browser editor using the familiar toolbar, canvas, inspector, palette, and layer/frame/cel timeline of established pixel-art tools.

## Download and start the studio

```sh
git clone https://github.com/dakotacsk/code-as-pixelart.git
cd code-as-pixelart
npm install
npm run dev
```

Open `http://localhost:4173`.

## Build and verify

```sh
npm run check
npm test
npm run build
npm run test:e2e
```

## CLI

```sh
npm run build
node packages/cli/dist/bin.js init mara.json
node packages/cli/dist/bin.js import mascot.png --size 32 --colors 12 --out mascot.pixel.json
node packages/cli/dist/bin.js studio mascot.pixel.json
node packages/cli/dist/bin.js validate mara.json --json
node packages/cli/dist/bin.js gif mara.json --animation front-walk --scale 4 --out mara-walk.gif
node packages/cli/dist/bin.js render mara.json --view front --frame front-idle --out mara.png
node packages/cli/dist/bin.js sheet mara.json --animation front-walk --out mara-walk.png
```

The generated PNG files are exports. The `.pixel.json` document is the portable, diffable source of truth.

`pix studio <project.pixel.json>` opens that exact source file, shows its path/hash/dirty state, and saves back to the same file with conflict detection. The browser-only `npm run dev` mode still supports downloads, but direct Studio mode is the recommended edit loop.

Image import is alpha-safe and produces semantic palette roles plus separate head, body, leg, and marking layers when those regions are present. Tune edge removal with `--background-tolerance`, preserve breathing room with the default padding, then use `pix resize` for deterministic nearest-neighbor canvas changes.

## Agent tool

Build once, then point an MCP-compatible coding agent at the checked-in [`.mcp.json`](./.mcp.json), or start the stdio server directly:

```sh
npm run build
node packages/mcp/dist/bin.js
```

The server exposes six focused tools: import an image, inspect, validate, apply typed operations, create a frame animation, and render PNG/GIF/sheet assets. Writes can include an expected source hash so an agent cannot silently overwrite newer pixel edits from the studio. Imported characters expose semantic parts so an agent can animate a leg, head, body, or markings without treating the mascot as one flat bitmap.

## Install as a Codex skill

Install the complete skill and agent runtime with one command:

```sh
npx code-as-pixel-art install
```

The installer creates a managed framework checkout under the local Codex directory, builds the CLI and MCP runtime, and registers the [Code as Pixel Art skill](./skills/code-as-pixelart/SKILL.md). Restart Codex after installation so the new skill is discovered. Running the same command later safely fast-forwards the managed checkout and rebuilds it.

For framework development, clone the repository and use the workspace commands above instead.

See [the agent authoring contract](./docs/AGENT_AUTHORING.md) and [MCP setup](./docs/MCP.md) for the deterministic write, validate, render, and repair loop.
