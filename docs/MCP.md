# Agent tool setup

PIX exposes a local stdio MCP server. It performs filesystem work only at paths an agent supplies and routes every mutation through the same validation and atomic-write pipeline as the CLI.

## Start it

```sh
npm install
npm run build
node packages/mcp/dist/bin.js
```

This repository includes `.mcp.json` for clients that discover project-local MCP servers. In other clients, configure the command as `node` with `packages/mcp/dist/bin.js` as its argument and use this repository as the working directory.

## Tool loop

1. `pixelart_import_image` converts the uploaded image to structured source.
2. `pixelart_inspect_project` identifies palette, layers, views, frames, variants, and animations.
3. `pixelart_apply_operations` makes focused edits. Pass the last project hash when available.
4. `pixelart_create_animation` adds integer frame changes from an explicit plan.
5. `pixelart_validate_project` returns paths and repairs for any broken relationship.
6. `pixelart_render_asset` previews a PNG or creates the final GIF or sprite sheet.

The studio's Agent tab can download a self-contained handoff containing the user's request, active IDs, frame hash, and complete editable source.
