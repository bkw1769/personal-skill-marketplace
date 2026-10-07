---
name: sheet-to-sprites
description: Cut characters, faces, props and hand-lettered labels out of hand-drawn concept sheets (watercolor, pen, pencil on paper-colored backgrounds) into transparent PNG sprites with a crop table, a sprites.json manifest and a visual contact sheet, using a bundled Node script with no dependencies. Use this whenever the user wants to 시안에서 캐릭터 잘라줘, 배경 투명하게, 스프라이트로 분리, 누끼, 애니메이션용으로 캐릭터 분리, turn a character sheet or model sheet into separate images, remove the paper background from a drawing, or prepare sheet art for a storybook video or game, even if they never say "sprite".
---

# Sheet to sprites

Turns a generated or scanned sheet (several figures on paper) into one transparent PNG per figure. The cutter is deterministic code; the judgment is in choosing the crop rectangles and checking the result, so the workflow alternates between the two.

## What you need

- Node.js 18+ (uses only built-ins; PNG decode/encode is bundled).
- Sheet PNGs: 8-bit, non-interlaced (what image generators and most editors produce). Convert other formats first, e.g. `sips -s format png in.jpg --out in.png` on macOS.
- Figures separated by clear paper. Touching figures cannot be split by colour; ask for a regenerated sheet with gaps instead of fighting it (this is why the art-prompt rules demand separated figures).

## Workflow

1. **Look at the sheet** (open the image) and list the pieces worth cutting: each full-body pose, each face, each prop, and any hand-lettered title or labels the video may reuse.
2. **Write `crops.json` next to the sheets** (format in `references/crops-format.md`). Give generous rectangles that contain the whole figure plus some paper on every side; the cutter trims to the drawing itself, so too-big is cheap and too-small cuts off hair, feet or the last stroke of a label. Names are kebab-case because they become file names.
3. **Draw the boxes and cut:**

   ```bash
   node <skill-dir>/scripts/cut-sprites.mjs path/to/crops.json --out path/to/sprites --boxes
   ```

   - `_boxes-<sheet>.png`: every rectangle drawn in red on its sheet. Check that no box clips a figure and no box swallows half of a neighbour.
   - `_contact.png`: all sprites on a checkerboard in `sprites.json` order. Check every cell: clean edges, no paper halo, no missing limbs, no fragments of neighbours, no stray paint dots.
   - Iterate on a few names only with `--only girl,girl-front`.
4. **Fix with options, not by hand-editing pixels** (details in `references/crops-format.md`):
   - Paint swatches or specks next to a prop → `"largest": true`.
   - Hand lettering → `"text": true` (no flood fill; alpha from ink darkness).
   - Pale washes disappearing → lower `"tol"` (default 24); paper left behind → raise it.
   - Paper islands between legs or inside wheels left opaque → lower `"holeMin"`.
   - A neighbour's elbow inside the box → tighten the rectangle on that side.
5. **Hand over.** Report the sprite count, any `empty` warnings, and the contact sheet. If the project keeps a labeled asset store (for example the `fairytale-assets` skill), register the sprites there with category `sprite` and the story tag.

## Output

`<out>/sprites.json`:

```json
{
  "schema": "sprites/1",
  "anchor": "bottom-center",
  "sprites": [
    { "name": "girl", "file": "girl.png", "sheet": "cast", "sheet_file": "troy-cast-v1.png",
      "crop": { "x": 105, "y": 140, "w": 205, "h": 368 }, "offset": { "x": 7, "y": 0 },
      "width": 175, "height": 363, "options": {}, "empty": false }
  ]
}
```

`offset` is where the trimmed sprite starts inside its crop, so the original sheet position is `crop.x + offset.x`. Full-body sprites are meant to be placed by their bottom-center point (feet on the ground line); faces and props usually by their center.

## How the cutter works (when results look wrong)

1. Paper colour = per-channel median of the crop border.
2. Flood fill from the border through pixels within `tol` of the paper colour.
3. Enclosed paper regions of at least `holeMin` pixels become transparent too.
4. Connected blobs are labeled; specks smaller than about 0.025% of the crop, border-touching blobs smaller than 30% of the main figure, and (with `largest`) any blob under 5% of the main figure are removed.
5. Pixels within 2 px of paper get partial alpha by colour distance, and the paper colour is un-mixed from them to avoid a light halo.
6. Trim to the drawing plus `pad` px (default 2).

A worked example (34 crops over three Troy sheets, including faces, props and labels) is in `references/example-troy-crops.json`.
