# Agent authoring contract

Pixel art in this repository is source data. Do not edit exported PNG files and treat them as source.

## Reliable loop

1. If the user supplied a mascot image, convert it with `pix import` and keep the resulting `.pixel.json` as the source.
2. Read the project with `pix inspect character.json --json` and retain the returned source hash from write commands.
3. Change source using `pix apply` operations or a `pix animate` plan. Do not rewrite the whole JSON when a narrow operation can express the intent.
4. Run `pix validate character.json --json` and repair every error using its `path`, `code`, and `repair` fields.
5. Render the smallest affected surface with `pix render` or `pix gif`.
6. Export a sheet only after the individual frames are correct.
7. Compare deterministic hashes when repeatability matters.

## Invariants

- Coordinates, pivots, offsets, dimensions, z-indexes, and timing ticks are integers.
- Every non-transparent cell references a stable palette token ID.
- Use semantic palette IDs such as `coat-shadow`, not raw colors embedded in cells.
- Each angle is authored. Never rotate or interpolate a raster to manufacture another view.
- Reuse identity through palette tokens, parts, proportions, pivots, anchors, variants, and metadata.
- Preserve stable IDs across revisions so diffs and downstream manifests remain meaningful.
- Prefer core operations when editing interactively because every operation has an inverse.

## CLI examples

```sh
pix init mara.json
pix import mascot.png --size 32 --colors 12 --out mascot.pixel.json
pix validate mara.json --json
pix inspect mara.json --json
pix apply mara.json --operations edits.json --expected-hash 4d8... --out mara.json
pix animate mara.json --plan idle.json --expected-hash 8bc... --out mara.json
pix render mara.json --character mara --view front --frame front-idle --variant night-shift --out mara-front.png
pix gif mara.json --character mara --animation front-walk --scale 4 --out mara-walk.gif
pix sheet mara.json --character mara --animation front-walk --layout horizontal --out mara-walk.png --manifest mara-walk.json
```

An animation plan names the source frame and adds explicit frames. Every change remains inspectable:

```json
{
  "characterId": "mascot",
  "viewId": "front",
  "sourceFrameId": "front-idle",
  "animation": { "id": "front-breathe", "name": "Breathe", "loop": true },
  "frames": [
    { "id": "breathe-1", "name": "Rest", "durationTicks": 4 },
    { "id": "breathe-2", "name": "Rise", "durationTicks": 4, "moves": [{ "partId": "root", "dx": 0, "dy": -1 }] }
  ]
}
```
