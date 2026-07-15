---
name: code-as-pixel-art
description: Convert mascot and character reference images into editable pixel-art source, refine pixels with semantic operations, author directional sprite animations, and export deterministic PNG, GIF, and sprite-sheet assets. Use for requests to pixelate an uploaded image, preserve a character across views or variants, edit individual sprite pixels, create frame animation, or generate game-ready pixel assets.
---

# Code as pixel art

Use the `code-as-pixelart` MCP server when available. Otherwise run `scripts/pix` from this skill folder with the same command sequence. The wrapper locates and builds the bundled framework automatically.

## Required workflow

1. For a new reference image, call `pixelart_import_image`. Ask for dimensions only when the user's intended sprite scale is materially ambiguous; otherwise use 32 by 32 and 12 colors. Preserve transparency, keep a small padding boundary, and inspect the inferred semantic palette and parts before motion work.
2. Call `pixelart_inspect_project` before editing. Preserve all stable IDs and note active views, layers, parts, and clips.
3. Express changes with `pixelart_apply_operations`. Prefer the smallest batch that produces a useful preview. Use `setPixel`, `fillRegion`, `movePart`, and `replacePaletteToken` instead of rewriting raster data.
4. For motion, call `pixelart_create_animation` with explicit frame IDs, integer timing ticks, integer part offsets, and sparse pixel edits. Do not rotate or interpolate pixels.
5. Call `pixelart_validate_project`. Repair every error before rendering.
6. Call `pixelart_render_asset` for the smallest PNG preview. After approval or a clearly specified result, render the GIF or sprite sheet.
7. Report the source project path and exported asset path. The `.pixel.json` file is the source of truth, not the PNG or GIF.
8. When the user wants to refine the result visually, launch `pix studio <project.pixel.json>`. This direct mode opens the requested source, saves to the same file, and detects stale-hash conflicts.

## CLI fallback

Replace `<skill-dir>` with this skill folder:

```sh
<skill-dir>/scripts/pix import mascot.png --size 32 --colors 12 --out mascot.pixel.json
<skill-dir>/scripts/pix inspect mascot.pixel.json --json
<skill-dir>/scripts/pix apply mascot.pixel.json --operations edits.json --expected-hash HASH
<skill-dir>/scripts/pix animate mascot.pixel.json --plan idle.json --expected-hash HASH
<skill-dir>/scripts/pix validate mascot.pixel.json --json
<skill-dir>/scripts/pix gif mascot.pixel.json --animation front-idle --scale 4 --out mascot.gif
<skill-dir>/scripts/pix studio mascot.pixel.json
```

If the wrapper reports that the framework checkout is missing, ask the user to run `npx code-as-pixel-art install`, restart Codex, and retry.

## Safety and consistency

- Supply `expectedHash` on writes whenever a previous write returned a project hash. If it conflicts, inspect again and merge with the human's newer edits.
- Keep palette cells semantic and reusable. Change a shared palette token only when propagation is intended.
- Prefer inferred `head`, `body`, `left-leg`, `right-leg`, and `markings` parts for motion. Add a semantic part before animating a distinct region that import could not infer.
- Authored directions share proportions, parts, anchors, and colors, but each view owns its pixels.
- Make silhouettes readable before adding interior texture.
- Keep transparent backgrounds unless the user asks to retain the source background.
- Never claim animation was generated until the GIF or affected frames have been rendered successfully.

## Handoff files

When the user supplies a `.agent-request.json` from the studio, read `request`, `active`, and `project`. Save `project` as `.pixel.json`, inspect it, perform the requested operations, validate it, then return the updated source for opening in the studio.
