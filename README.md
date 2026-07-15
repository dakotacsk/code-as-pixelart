# PIX: code as pixel art

MIT licensed. Download, adapt, and redistribute the framework and its Codex skill.

PIX treats a character as structured source: semantic colors, named parts, authored directional views, layered cels, poses, variants, anchors, and deterministic animation timing.

The repository contains four workspaces:

- `@code-as-pixelart/core`: strict TypeScript document model, validation, invertible operations, renderer, animation, and sprite-sheet packing.
- `@code-as-pixelart/cli`: machine-readable `pix` commands for image conversion, semantic edits, animation plans, validation, and PNG/GIF/sheet export.
- `@code-as-pixelart/mcp`: a local MCP server that gives coding agents narrow, validated pixel-art tools.
- `@code-as-pixelart/studio`: a browser editor using the familiar toolbar, canvas, inspector, palette, and layer/frame/cel timeline of established pixel-art tools.

## Start the studio

```sh
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
node packages/cli/dist/bin.js validate mara.json --json
node packages/cli/dist/bin.js gif mara.json --animation front-walk --scale 4 --out mara-walk.gif
node packages/cli/dist/bin.js render mara.json --view front --frame front-idle --out mara.png
node packages/cli/dist/bin.js sheet mara.json --animation front-walk --out mara-walk.png
```

The generated PNG files are exports. The `.pixel.json` document is the portable, diffable source of truth.

## Agent tool

Build once, then point an MCP-compatible coding agent at the checked-in [`.mcp.json`](./.mcp.json), or start the stdio server directly:

```sh
npm run build
node packages/mcp/dist/bin.js
```

The server exposes six focused tools: import an image, inspect, validate, apply typed operations, create a frame animation, and render PNG/GIF/sheet assets. Writes can include an expected source hash so an agent cannot silently overwrite newer pixel edits from the studio.

## Install as a Codex skill

After downloading or cloning this repository:

```sh
npm install
npm run build
npm run skill:install
```

The installer links the self-contained [Code as Pixel Art skill](./skills/code-as-pixelart/SKILL.md) into the local Codex skill directory. Its bundled `scripts/pix` wrapper keeps the framework executable available from any workspace. Restart Codex after first installation so the new skill is discovered.

See [the agent authoring contract](./docs/AGENT_AUTHORING.md) and [MCP setup](./docs/MCP.md) for the deterministic write, validate, render, and repair loop.
