# Element kits (배경 요소 키트) — mandatory for backgrounds

Every background, set dressing and scene prop is made as an **element kit**: separate pieces (house, jar terrace, stone wall, tree, mountain, cloud, ...) generated on kit sheets, cut into transparent sprites, and pasted together per scene. A whole-scene background picture is never the production asset. Location sheets (template 5) remain useful only as mood and layout references for the user to approve before the kits are made.

Default finish: torn-paper collage (`references/styles/torn-paper-collage.md`) on top of the story's style module.

## Contents

- Pipeline
- Element inventory
- Layers and naming
- Kit sheet template (template 6)
- Scale classes
- Cutting
- Compositing
- Review checklist for kits

## Pipeline

1. **Inventory** the elements from the storyboard (`scenes[].location`, `action`) and the era module's element library. One list per story in the character bible under "Element kit".
2. **Layout reference (optional):** one location sheet per location for mood; after approval its vignettes tell which elements each scene needs.
3. **Kit sheets:** group the inventory into sheets of at most 8 pieces, by layer (all far pieces together, all buildings together, ...), so pieces on one sheet share a scale class. Generate with the anchor cast sheet attached as palette reference.
4. **Cut** each kit with `sheet-to-sprites` (`find-pieces.mjs` names the pieces in slot order, then `cut-sprites.mjs`).
5. **Composite** per scene in back-to-front layer order (storybook-video `paste()`), or as a still for review.

## Element inventory

Each element is one countable object or one tight cluster that is always used together. Split anything that might move, repeat or be re-arranged:

- Separate: house body vs. a gate that opens; a tree vs. its falling leaves; a pond vs. the reeds in front of it (reeds overlap characters).
- Keep together: a jar terrace (jars stand on one stone platform), a cairn, a cluster of three rocks.
- Variants: make 2-3 variants of anything that repeats on screen (pine A/B/C, cloud A/B/C, rock A/B) so the composite does not look stamped.
- States: same element in another state is its own piece with a suffix (`pond-magic` for the glowing pond, `house-dori-night`).

## Layers and naming

Names are kebab-case `<element>[-<variant>]` and become file names. Each piece belongs to one layer; the layer decides paste order, default size and parallax.

| Layer | Contents | Parallax | Typical on-screen height (1080p) |
|---|---|---|---|
| `sky` | sun, moon, cloud pieces, birds far away | 0.05 | 80-200 |
| `far` | mountain ranges, far hills, distant forest bands | 0.15 | 200-450 (width 900-1900) |
| `mid` | single hills, groves, big trees, houses, pavilions | 0.4 | 300-650 |
| `near` | walls, gates, jar terraces, fences, rocks, ponds, paths, single trees | 0.7 | 120-420 |
| `front` | reeds, grass tufts, flowers, branches entering the frame | 1.0 | 80-300 |
| `fx` | sparkles, splashes, mist, smoke, ripples (often no torn rim: see the template) | 1.0 | any |

Characters are drawn between `near` and `front`.

## Kit sheet template (template 6)

Canvas: 1536x1024 landscape. Up to 8 pieces in 2 rows of 4, or 3 wide pieces in 3 rows for `far` pieces (mountain ranges need width).

```text
Use case: illustration-story. Asset type: background element kit sheet (<layer>) for the children's fairy tale "<title>", audience ages <age>. These are separate set pieces to be cut out and pasted together later, not a scene.

Input images: Image 1 is the approved character lineup, a STRICT PALETTE AND STYLE reference only, not an edit target; do not draw any character. <style refs with role sentences: creature-4 for buildings, nature and nature-2 for landscape pieces>.

<STYLE BLOCK from the style module>

<COLLAGE BLOCK from torn-paper-collage.md>

<ERA BLOCK from the era module>

Composition: an element kit of exactly <N> separate pieces arranged in <rows> rows, in this reading order (left to right, top to bottom). Every piece is complete, seen from the front at eye level with a straight base, and drawn at the same scale as the others on this sheet so their sizes compare truthfully. Pieces —
1 <name>: <element sentence>.
2 <name>: <element sentence>.
...

<Backdrop block from torn-paper-collage.md>

Palette: <style palette with era tilt>.

Constraints: <collage negatives> <era anachronism negatives> <audience-safety negatives> No people or animals unless a piece names them. Each piece is a single isolated object on the backdrop.
```

Rules for element sentences:

- Positive and concrete, one sentence: shape, materials, colours from the palette, the one telling era detail. "thatched-roof cottage with a round golden straw roof held by a rope net, white mud walls, one paper-screen door, a small wooden step".
- State the base: "standing on a short torn strip of its own ground" only for pieces that need a footing (a house on its yard edge); otherwise "straight base cut along the bottom of the object".
- Repeat the size relation inside the sheet when it matters: "the jar terrace is about one third the height of the cottage".
- `fx` pieces (sparkles, mist, splash) are often better without a paper rim: say "painted directly as loose watercolor marks with no paper rim" for those pieces only, and expect to cut them with `"text": true`.

Name list: keep the slot names in the record (`prompts.json` → `pieces`) in the same order; `find-pieces.mjs --names` uses them.

## Scale classes

Pieces drawn on one sheet share one scale, so group by layer. Record a `scale_ref` per kit in prompts.json: the piece whose real height anchors the sheet (for example the cottage door ≈ Dori's height). The compositor then sizes pieces from one number per kit instead of guessing per piece.

## Cutting

```bash
node <sheet-to-sprites>/scripts/find-pieces.mjs <kit.png> --crops <set>/crops.json --key <kit-key> --names <slot names in order>
```

```bash
node <sheet-to-sprites>/scripts/cut-sprites.mjs <set>/crops.json --out <set>/sprites --boxes
```

`find-pieces` reads the flat backdrop colour from the sheet border, finds each piece, names them in reading order and writes crops with the kit cut options (`largest`, `tol: 48`, `soft: 220`). If it finds fewer pieces than names and the sheet shows a thin backdrop gap between them, retry with `--gap 2` (golden-axe village-near needed it: fibres of neighbouring rims came within 6 px); if the pieces really touch or one is missing, regenerate the sheet (more gap, fewer pieces) rather than drawing boxes by hand. In the contact sheet check that the white torn rim is kept all around and no magenta fringe remains. The kit options leave under 1 % of edge pixels with a magenta cast (default cutter options left about 94 %, because the white-to-magenta blend band counted as opaque); if a halo remains, adjust `soft` (fade range) before `tol`.

## Compositing

Per scene, paste back to front: `paper` ground → `sky` → `far` → `mid` → `near` → characters → `front` → `fx`. Overlap pieces like a real paste-up; anchor each piece by its bottom centre on its ground line; keep the per-piece tilt and the soft drop shadow from the collage finish. In storybook-video use `paste(ctx, name, x, y, height, {tilt, shadow, parallax})` (see that skill's architecture reference). For a still review image, compose the same layers on a 1920x1080 canvas.

## Review checklist for kits

- Exactly the listed pieces, in the listed order, none touching each other or the sheet edge; no text anywhere.
- Every piece has a visible torn white rim all around, no ground patch or shadow, nothing painted on the backdrop.
- Backdrop is one flat colour to every edge (no gradient, no texture).
- Same pen line, wash and palette as the anchor cast sheet; same era details.
- Sizes on one sheet compare truthfully (jar terrace smaller than the house, the gate fits a person).
- `find-pieces` finds exactly N pieces; `cut-sprites` contact sheet shows clean rims.
