---
name: sheet-to-sprites
description: Cut characters, faces, props, hand-lettered labels and torn-paper background element kits (house, jar terrace, wall, tree, mountain pieces on a flat magenta backdrop, found and named automatically) out of hand-drawn concept sheets (watercolor, pen, pencil on paper-colored backgrounds) into transparent PNG sprites with a crop table, a sprites.json manifest and a visual contact sheet, using a bundled Node script with no dependencies. Use this whenever the user wants to 시안에서 캐릭터 잘라줘, 배경 투명하게, 스프라이트로 분리, 누끼, 애니메이션용으로 캐릭터 분리, 배경 요소 잘라줘, 요소 키트 분리, turn a character sheet or model sheet into separate images, remove the paper background from a drawing, or prepare sheet art for a storybook video or game, even if they never say "sprite".
---

# Sheet to sprites

Turns a generated or scanned sheet (several figures on paper) into one transparent PNG per figure. The cutter is deterministic code; the judgment is in choosing the crop rectangles and checking the result, so the workflow alternates between the two.

## What you need

- Node.js 18+ (uses only built-ins; PNG decode/encode is bundled).
- Sheet PNGs: 8-bit, non-interlaced (what image generators and most editors produce). Convert other formats first, e.g. `sips -s format png in.jpg --out in.png` on macOS.
- Figures separated by clear paper. Touching figures cannot be split by colour; ask for a regenerated sheet with gaps instead of fighting it (this is why the art-prompt rules demand separated figures).

## Element kits (torn-paper background pieces)

Kit sheets from the `fairytale-art-prompts` element-kit template have one flat backdrop colour (magenta by default) and no text, so the rectangles can be found by code instead of by eye:

```bash
node <skill-dir>/scripts/find-pieces.mjs <kit.png> --crops <set>/crops.json --key <kit-key> --names cottage-dori,wall-straight,jangdokdae
```

- Backdrop colour = median of the sheet's outer pixel frame; anything farther than `--tol` (48) is a piece. Fibres and sparkles within `--gap` (6 px) of a piece join it; pieces under `--min-area` (0.3 % of the sheet) are dropped as specks; each rectangle gets `--margin` (14 px) of backdrop.
- Names are given in the kit prompt's slot order and assigned in reading order (rows top to bottom, left to right). A count mismatch stops with the list of found rectangles: two pieces touch or one is missing; regenerate the sheet rather than drawing boxes by hand. Without `--names` pieces are numbered `<key>-1..n`.
- Every crop gets `"largest": true`. Re-running for the same key replaces only that sheet's crops, so all kits of a story can share one crops.json.

Then cut as below (step 3). Check in `_contact.png` that the white torn rim survives all around and no magenta fringe is left: pink halo → raise `tol` for that crop; rim eaten → lower it. Element sprites are anchored bottom-centre like characters.

## Workflow

1. **Look at the sheet** (open the image) and list the pieces worth cutting: each full-body pose, each face, each prop, and any hand-lettered title or labels the video may reuse.
2. **Write `crops.json` next to the sheets** (format in `references/crops-format.md`). Give generous rectangles that contain the whole figure plus paper on every side: start the box above the highest point (hair tufts, helmet plumes, ears, raised hands are the parts that get cut) and outside the widest point (capes, shields, flowing hair). The cutter trims to the drawing itself, so too-big is cheap and too-small cuts. Names are kebab-case because they become file names.
3. **Draw the boxes and cut:**

   ```bash
   node <skill-dir>/scripts/cut-sprites.mjs path/to/crops.json --out path/to/sprites --boxes
   ```

   - **Automatic headroom:** when solid drawing runs into a side of a rectangle (3+ ink pixels on the border line), that side grows 8 px at a time (up to 160 px) until the drawing is clear. It stops early at the sheet edge, or when the next step would swallow a whole neighbouring figure. The console lists every grown crop (`grew ody: top +16px`) and every crop that is still cut, with the reason.
   - `_boxes-<sheet>.png`: red = the rectangle as written, green = the rectangle after growing. Check that no box clips a figure and no green box reaches into a neighbour.
   - `_contact.png`: all sprites on a checkerboard in `sprites.json` order; green frame = grown, red frame = still cut. Check every cell: complete heads and hands, clean edges, no paper halo, no fragments of neighbours, no stray paint dots.
   - Keep the fix: `--update-crops` writes the grown rectangles back into crops.json, so the next run and any other tool reading crops.json use the corrected boxes.
   - `--strict` exits with an error while any sprite is still cut (use it in scripts); `--no-grow` reproduces the rectangles exactly as written.
   - Iterate on a few names only with `--only girl,girl-front`.
4. **Fix what growth could not, with options or coordinates, not by hand-editing pixels** (details in `references/crops-format.md`):
   - Still cut at `sheet edge`: the drawing leaves the sheet; regenerate the sheet with more margin (art-prompts headroom rule).
   - Still cut at `neighbour`: two figures are too close; widen by hand towards the free side or regenerate with more space.
   - Still cut at `max`: a long part (spear, banner) sticks out far; widen by hand or raise `growMax` for that crop.
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
7. Headroom check: count solid pixels (alpha ≥ 0.5) on each border line of the rectangle; 3 or more means the drawing continues outside, so grow that side and repeat. A step is rejected when the solid area jumps by more than half (a whole neighbour came inside); neighbours only partly inside are already removed by step 4.

`sprites.json` records the rectangle actually used in `crop`, and for grown crops also `requested` and `grown`; still-cut crops carry `clipped` and `blocked_by`.

A worked example (34 crops over three Troy sheets, including faces, props and labels) is in `references/example-troy-crops.json`.
