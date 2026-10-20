# Art for layered shots

The pipeline as built for crosswalk-green-time (walkers) and water-meter-freeze (base still) on 2026-10-20. Image generation ran through Codex (`codex exec`, portrait 1024 x 1536, about 1 minute per image). The prompts below are patterns that worked once each, not tested templates: always look at the result.

## Overview

1. Generate the normal shot **with** the movers.
2. Make the **empty plate**: an edit of that shot with the movers removed.
3. Make a **cut-out sheet** of the movers on flat magenta.
4. **Cut** the sheet into sprites (sheet-to-sprites).
5. **Wire** sprites and plate into the episode page.
6. **Measure** coordinates on the plate.

Why this order: the plate and the sheet are both derived from the shot with people, so style, camera angle, light and figure scale match, and the original shot remains a usable still for other lines.

## 1. The normal shot with the movers

Write it in the episode's `art/prompts.json` like any shot (style + frame + shot + rules blocks, the episode hero attached as STRICT STYLE AND SETTING REFERENCE), then write the full prompt text (preamble + style + frame + shot + rules, in that order) to `art/prompts/<name>.txt`, and generate it with `art/run.sh <name>`. `run.sh` reads only `art/prompts/<name>.txt`; `prompts.json` is the record, and nothing builds the `.txt` files from it (a missing one fails with "no such file or directory: .../prompts/<name>.txt", as in tactile-paving `batch-1.log`). The `-empty` and `-cutout` prompts below always go through the hand command with `-i art/<shot>.png`, never `run.sh`.

- Choose a camera where the motion reads. A straight top-down view made the crossing a clean vertical walk; a low side view would hide the distance.
- Keep the movers' lanes inside the safe frame: the top 15% is calm for the title, the band around 60% height is quiet for captions, the bottom 20% is simple for the player controls. The `frame` block of `prompts.json` already says this.
- Put exact counts in the prompt (number of figures, stripes, bars). Codex drew 5 bars and 16 dots where the law says 4 and 36.

## 2. The empty plate (an EDIT)

Input: the shot with people, attached as the only image and called the EDIT TARGET. Pattern (crosswalk-top-empty):

```text
Use your image generation tool to create ONE new image. Input image: the EDIT TARGET. Reproduce this exact image -
same <camera>, same <every fixed element, in the same positions>, same lighting, colours, materials and
<lens effect, e.g. tilt-shift blur>, same 1024x1536 portrait framing - but REMOVE EVERY <MOVER>: all <movers>
and their cast shadows are gone, and the <surfaces> that were under them are filled in naturally so the
<place> is completely empty. Do not move, add or restyle anything else. Absolutely no text, letters,
numbers, logos or watermarks.
```

- List every fixed element by name (stripes, lane lines, curbs, tactile paving, trees, poles, signals). Named things are what the edit keeps in place.
- Say "and their cast shadows". Ghost shadows on an empty road give the trick away, and the engine draws its own shadow under each sprite.
- Check the result against the original. Stripes, curbs and poles must sit on the same pixels, because coordinates measured on one are used on both:

  ```bash
  magick compare -metric AE -fuzz 8% src/shorts/episodes/<id>/art/<shot>.png src/shorts/episodes/<id>/art/<shot>-empty.png <scratch-dir>/diff.png
  ```

  Open `diff.png`: only the movers' area may light up. Then measure one fixed feature (a curb corner, a pole base) on both images; it must be on the same pixel.

## 3. The cut-out sheet

Input: the same shot with people, attached as a STRICT STYLE REFERENCE for the figures only. Pattern (walkers-cutout):

```text
Use your image generation tool to create ONE new image. Input image: a STRICT STYLE REFERENCE for the
<figures> only (match their material, <faces>, <hands>, clothes palette, warm upper-left light and
miniature-diorama look exactly; do not copy the <place>). Draw a cut-out sheet: <N> separate <figures> seen
from <the same camera angle as the reference: describe what is visible>, each one <facing direction, e.g.
walking UPWARD (toward the top of the image)>, standing alone on a perfectly flat, uniform, pure magenta
background (#FF00FF), arranged in a <cols> x <rows> grid with wide empty magenta gaps between them, nothing
touching, nothing crossing the image edge. NO cast shadows on the background, no ground, no floor texture,
the magenta is perfectly flat everywhere. The <N> figures, in reading order: 1) ..., 2) ..., ...
All are the same scale except <the child> (smaller). Portrait 1024x1536. Absolutely no text, letters,
numbers, logos or watermarks. Not a glossy CGI render: <handmade matte material>.
```

Why each part:
- **Same camera angle.** A figure seen from the side does not sit on a top-down road. Describe what the camera sees (top of the head, shoulders, a little of the legs).
- **One facing direction.** All figures face the same way: up for top-down walkers, right for side-view figures. The engine turns top-down ones with `rot: 180` (down) and mirrors side-view ones with `flip`, so one direction is enough. A side-view figure also needs every ground contact (soles, cane tip, wheels) on one row (`layers.md`, Side-view figures).
- **Flat pure magenta, no ground, no cast shadows.** find-pieces keys out the backdrop colour. A shadow on the sheet would be cut into the sprite and double the engine's shadow.
- **Grid with wide gaps, nothing touching or crossing the edge.** Pieces are found as separate blobs. Touching figures merge into one piece.
- **Named in reading order.** find-pieces names pieces in reading order (rows top to bottom, then left to right), so the prompt order becomes the sprite names.
- **Same scale.** Sprite size is set later by `h`, but a consistent sheet keeps the detail level even.
- **Enough pixels.** A sprite is drawn h x plate height x k pixels tall on the frame, k = 1.25 x zoom for a 1024 x 1536 plate, so its source height must be at least h x 1536 x 1.25 x the largest zoom of its shots, or it is upscaled. Crosswalk walkers were 264-386 px tall and drawn about 140 px (h 0.072 at zoom 1.05). A close-up figure with h 0.3 at zoom 1.12 needs about 650 px, which a 6-figure grid sheet (about 300 px each) cannot give: ask for 1-2 figures in a single column and state the target pixel height in the prompt.

## Attaching the right input image

`art/run.sh` attaches the episode hero by default (crosswalk: `crosswalk-hero.png`; mascot shots also get the mascot sheet). Steps 2 and 3 need the shot with people instead, and the Codex log does not record which image was attached. For crosswalk this was not written down, so the attachment is known only from the session notes.

Write each prompt to `art/prompts/<shot>-empty.txt` (or `art/prompts/<cast>-cutout.txt`), then run it by hand from the project root, never through `run.sh` (which would attach the hero instead of the shot):

```bash
codex exec --skip-git-repo-check -s read-only -C "$PWD" -i src/shorts/episodes/<id>/art/<shot>.png - \
  < src/shorts/episodes/<id>/art/prompts/<shot>-empty.txt > src/shorts/episodes/<id>/art/logs-<shot>-empty.txt 2>&1
node .claude/skills/fairytale-art-prompts/scripts/codex-image.mjs src/shorts/episodes/<id>/art/logs-<shot>-empty.txt
```

Copy the printed file to `art/<shot>-empty.png` and append `<shot>-empty <- <path> (input: art/<shot>.png)` to `art/sources.txt`. Never take the newest PNG in `~/.codex/generated_images`: parallel sessions write there. If Codex answers "model is at capacity", wait 60 s and retry (run.sh retries 4 times; by hand you retry yourself).

## 4. Cut the sprites

With the sheet-to-sprites skill (Node, no dependencies):

```bash
node <sheet-to-sprites-dir>/scripts/find-pieces.mjs src/shorts/episodes/<id>/art/<cast>-cutout.png \
  --crops src/shorts/episodes/<id>/art/sprites/crops.json --key <cast> --names walker-grey,walker-beige,walker-navy,walker-elder,walker-child,walker-suit
node <sheet-to-sprites-dir>/scripts/cut-sprites.mjs src/shorts/episodes/<id>/art/sprites/crops.json --out src/shorts/episodes/<id>/art/sprites --boxes
node <sheet-to-sprites-dir>/scripts/measure.mjs spill src/shorts/episodes/<id>/art/sprites
```

- find-pieces takes the backdrop colour from the median of the outer frame and writes one crop per piece with `{largest: true, tol: 48, soft: 220, key: true}`: `soft` removes the pink fringe, `key` removes magenta enclosed by the figure (between an arm and the body).
- A count mismatch ("found 5 piece(s) but 6 name(s)") means two figures touch or one is missing. Regenerate the sheet; do not draw boxes by hand. Pieces closer than 6 px merge, so for close pieces retry with `--gap 2`.
- **No `--rim`.** Rim recolouring is for torn-paper margins on storybook art. Diorama figurines have no paper margin.
- Open `_boxes-<cast>.png` (red = crop as written, green = grown) and `_contact.png`: heads, hands and canes complete, no pink halo.
- `measure.mjs spill` exits 2 while strong magenta is left. Fix that before using the sprites.
- Output: `sprites.json` (schema `sprites/1`, anchor `bottom-center`) and one PNG per figure. Crosswalk sprites are about 180-242 px wide and 264-386 px tall.

## 5. Wire into the episode

In `video/story.config.js` (and every `video-<voice>/story.config.js`):

```js
sprites: ['../art/sprites/sprites.json'],
plates: { 'crosswalk-top-empty': '../art/crosswalk-top-empty.png', /* ...the other stills */ },
```

If the episode's `video/js/scenes.js` predates layers or the overlay kinds you need, copy the engine's `js/` in first (`engine.md`).

## 6. Measure coordinates on the plate

Every path point, tape end, box and pin is a plate fraction: u = pixel x / plate width, v = pixel y / plate height. Never estimate them from a screenshot of the player, where the camera crop and zoom distort them. The balcony dimension line sat 7% off until it was measured.

Draw a 10% grid over the plate (ImageMagick; its default font fails, so pass one):

```bash
f=src/shorts/episodes/<id>/art/<plate>.png; W=$(magick identify -format %w "$f"); H=$(magick identify -format %h "$f"); args=()
for i in 1 2 3 4 5 6 7 8 9; do x=$((W*i/10)); y=$((H*i/10)); args+=(-stroke '#ff00ff' -strokewidth 2 -draw "line $x,0 $x,$H" -draw "line 0,$y $W,$y" -stroke none -fill yellow -annotate +$((x+4))+28 "0.$i" -annotate +4+$((y-6)) "0.$i"); done
magick "$f" -font /System/Library/Fonts/Supplemental/Arial.ttf -pointsize 26 "${args[@]}" <scratch-dir>/grid.png
```

1. Open the grid image (read it as an image, do not guess).
2. For a precise spot, crop around it and read the pixel position: `magick "$f" -crop 200x200+<x0>+<y0> +repage -scale 300% <scratch-dir>/zoom.png`, then pixel = x0 + (position in the zoom / 3).
3. Divide by the plate width and height. Round to 3 decimals.
4. Write the measurements down once per plate in `src/shorts/episodes/<id>/art/plates.md`: one block per plate with its size, the measured features, the sharp (tilt) band and the ground line, like the crosswalk map in `layers.md`. Link the file from the project's `docs/MEMORY.md`. Episode `research/notes.md` is for research only.
5. Check with a still at the first and last frame of the shot (`?still&t=<s>` or `__capture`). The camera crops a 2:3 plate to u 0.078-0.922 at zoom 1, so points near the side edges may be off-screen.

Write the grid and zoom images to a scratch folder, not into `art/`, so they are not mistaken for shots.

## Diagram base still (no movers)

For overlay-only motion, make one clean base still and let code draw the change. water-meter-freeze `box-empty`: "a clean straight-on close-up of the open water-meter box with the round meter and pipes, no frost, no ice, evenly lit, simple and centered (used as a base for animated diagrams)". The same still then serves several lines with different diagrams (l03 frost growing, l04 frost held + compare, l10 flow arrow).

- Ask for the state *before* the change (no frost), evenly lit and centred, with clear edges where the overlay will clip or point.
- Restyling an existing plate is also an EDIT that keeps the composition, so measured coordinates still fit (pruney-fingers soft wrinkles).
- Dials and displays stay blank in every prompt (no digits). Code adds a digit when the line needs one (crosswalk l08 countdown `9`).

## Changed-state still (for reveal)

When a line says that something changes state (freezes, rusts, fills, lights up), draw the changed state as a second still and let `reveal` spread it over the first (design rule 13). It must be an EDIT of the base still, so the two line up pixel for pixel.

- Attach the base still as the only input and call it the EDIT TARGET. Do not attach the style hero: the base already carries the style, and a second image invites a new composition.
- Ask to reproduce the exact image (same camera, framing, size, materials, light) and change ONLY the state.
- Name every fixed element and where it is, as for the empty plate. Named things stay put.
- Describe the change as handmade model material (matte hoarfrost crust, fern frost on the glass, short clear icicles), thicker on upper edges.
- Forbid what would read as a different event: cracks, broken glass, spray, lines, arrows, text.

Water meter `box-frozen` (EDIT of `box-empty`, prompt `art/prompts/box-frozen.txt`), shortened:

```text
Use your image generation tool to create ONE new image. Input image: the EDIT TARGET. Reproduce this exact image - same camera, same framing, same 1024x1536 portrait size, same miniature-diorama materials, lighting and tilt-shift look - and change ONLY one thing: everything inside the open water-meter box is now frozen solid in deep winter.
Keep in exactly the same place and shape: the beige plaster wall, the grey metal box frame and its open door on the left with its two brass hinges, the vertical pipe on the left, the bent pipe across the top, the pipe on the right, the brass nuts and fittings, the round meter body in the centre and its round glass cover with plain tick marks, the snow along the bottom edge.
The frozen look (made by hand like the rest of the model, matte, not glossy CGI): a thin crust of white hoarfrost and tiny feathery ice crystals on the pipes, fittings and meter body; the glass cover fogged pale white-blue with fern-like frost growing from its rim; a few short clear icicles under the horizontal pipe; frost along the inner edges of the box frame.
Do NOT draw cracks, broken glass, burst pipes, water spray, lines or arrows; the meter is frozen but intact. Absolutely no text, letters, numbers, digits, logos or watermarks. No people.
```

Run it with Codex directly (`codex exec ... -i art/<base>.png - < art/prompts/<name>.txt`, then `codex-image.mjs` on the log), because the episode's `run.sh` attaches the hero instead of the base. Before wiring it in, put the two stills side by side and check that the frame, pipes and door line up; then record the input in `sources.txt`.

## Pitfalls

- run.sh attaches the hero; the edit and the sheet need the shot with people. Record the input in `sources.txt`.
- Baked shadows on the sheet or ghost shadows on the plate: regenerate, do not paint them out.
- Figures on the sheet facing different ways: the `rot` and `flip` logic then differs per sprite; regenerate with one direction.
- Sheet camera angle different from the plate: the figures look pasted on. Regenerate.
- Two figures touching on the sheet: find-pieces counts one piece. Regenerate or retry with `--gap 2`; never hand-draw boxes.
- `--rim` on diorama figures recolours their edges. Leave it off.
- Leftover magenta: `measure.mjs spill` exit 2.
- Coordinates from screenshots: wrong by the camera crop. Measure on the PNG.
- Uncounted elements: count every countable thing in the still that the narration or an overlay describes.
