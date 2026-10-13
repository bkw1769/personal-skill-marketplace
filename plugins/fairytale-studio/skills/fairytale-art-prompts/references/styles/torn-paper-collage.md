# Finish: torn-paper collage (찢은 종이 콜라주)

Status: drafted 2026-10-08; first used on the four golden-axe kits (`out/character-designs/2026-10-08-golden-axe-v1/`, not yet approved). Result: all 30 pieces separated and cut cleanly on the magenta backdrop; rims were torn on three sheets and sticker-smooth on one.

Look in one line: every background element is its own small watercolor-and-ink painting on a piece of watercolor paper, torn out by hand along its outline, and later pasted onto a drawing-paper ground with a thin shadow under the torn edge.

Applies to element pieces (mid, near, front) and to character cut-out sheets (template 7 in `sheet-templates.md`). Background plates (far distance) never get it: the far world stays a soft painted backdrop so the cut-out pieces stand out against it.

This is a **finish module**, not a replacement style. The drawing inside each piece still follows a style module (watercolor-ink today): same pen line, same washes, same palette. The finish only changes how the piece ends: a torn deckled paper rim instead of a soft wash fading into the page. Characters stay drawn sprites (no torn rim) unless the user asks for collage characters too; then use the same block on character kits.

Why it exists: backgrounds made as whole pictures cannot be re-arranged, re-used across scenes or animated in layers (parallax, a gate that opens, a tree that sways). Pieces cut from one shared kit can, and the torn rim plus a pasted shadow make the composite read as a deliberate handmade collage instead of a cut-out with hard edges.

## COLLAGE BLOCK (paste verbatim, after the style block)

```text
Each element is its own small ink-and-watercolor painting on a separate piece of off-white cold-press watercolor paper, torn out by hand around the element: an irregular torn deckled edge with a thin uneven white paper margin (about 1 to 3 percent of the piece width) showing all around the painted element, tiny soft paper fibres along the tear, the paper margin following the element's outline loosely, like a cut-out pasted into a children's picture book. The painting stays inside its paper piece; nothing is painted on the backdrop. Pieces lie perfectly flat and are lit evenly from the front: no cast shadows, no curl, no lifted corners, no glue marks.
```

## Backdrop block (element-kit sheets only; paste verbatim)

The kit sheet is not paper: it is one flat colour that no element uses, so the cutter can separate the white torn rim from it. Magenta is the default because nothing in the watercolor-ink palette or the joseon tilt is magenta.

```text
Backdrop: the whole sheet is one flat, uniform, untextured solid pure magenta (#FF00FF) background, evenly lit with no gradient, vignette, paper grain, noise or shadow, filling the frame to every edge. Pieces sit on it with wide clear magenta gaps between them and never touch each other or the sheet edge. No title, captions, labels, numbers, swatches or any other text on the sheet.
```

If a story needs magenta or hot-pink elements (a flower field, a royal robe), switch the backdrop to pure flat cyan (#00FFFF) and say so in the record.

## Negatives (paste into Constraints of a kit sheet, replacing the style module's "no cut-paper collage")

```text
No photorealism, no 3D, no paper-craft relief, no layered shadow box, no scissor-cut straight or smooth edges, no die-cut sticker outline, no digital gradients, no polished vector, no complex realistic shading, no glossy finish. No ground plane, horizon, floor shadow or scenery behind a piece; every piece is isolated.
```

## Composite look (for the video or a still)

The composite supplies what the kit leaves out on purpose:

- Ground: one drawing-paper sheet (off-white, visible grain), painted with at most a pale sky wash and a pale ground wash. It is the "도화지".
- Shadow: each pasted piece gets a soft warm-grey drop shadow, offset down-right by about 0.6 % of the piece height, blur about 1 %, opacity 0.25-0.35. Farther layers get a lighter shadow.
- Tilt: a fixed small rotation per piece (-2 to +2 degrees) so the paste looks handmade; never animate the tilt except for a sway.
- Scale and overlap: pieces overlap like real paste-ups (the front wall covers the bottom of the house), never float apart with paper gaps between neighbours on the same ground line.

## Known failure modes and fixes

| Symptom | Fix line to add |
|---|---|
| Buildings arrive with their own yard, fence, wall, jars and flowers attached (seen on golden-axe village-mid) | `the building alone with only a thin strip of ground at its base: no wall, fence, jars, plants or yard around it; those are separate pieces` |
| Rims came out as smooth die-cut sticker outlines on one of four sheets (seen on golden-axe village-mid) | put `torn by hand: irregular deckled edge with soft fibres, never a smooth sticker outline` both in the collage block position and at the end of Constraints |
| Model paints a little ground, grass or shadow under each piece | `every piece is isolated on the magenta backdrop: no ground patch, grass strip, puddle or shadow under it` |
| Backdrop gets a gradient or paper texture | repeat the backdrop block at the end of Constraints |
| Pieces crowd and touch | reduce the slot count (8 or fewer per sheet) and repeat `wide clear magenta gaps` |
| Paint leaks onto the backdrop or the rim disappears | `a visible white paper margin all around every painted element` |
| Magenta tint creeps into the paintings | `paintings use only the listed palette; the magenta exists only as the flat backdrop` |
