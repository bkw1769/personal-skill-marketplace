# Element kits (배경 요소 키트) — mandatory for backgrounds

Every background is built from two kinds of art (decided 2026-10-13):

- **Background plate (원경 배경판)** for what is far away: sky, far mountain ranges, distant hills and forest bands. One full-bleed watercolor painting per location and time of day, painted straight onto the paper with no cut rim, paler and simpler than everything in front of it (template 8 below). It sits behind everything like the painted backdrop of a stage.
- **Element pieces (근경 요소)** for everything near enough to touch: houses, trees, walls, rocks, ponds, reeds, branches. Each is a separate cut-paper piece with a visible paper margin, generated on a magenta kit sheet (template 6), cut into a transparent sprite and pasted onto the plate per scene. `out/character-designs/2026-10-08-golden-axe-v1/kits/sprites/pine-branch.png` is the reference look.

The contrast is the point: the far world reads as a soft painted backdrop and the near world as pieces cut out and glued on top, so depth comes from finish as well as size. Pieces are never painted into the plate and the plate never contains anything a character could stand next to. Location sheets (template 5) remain mood references only.

Default finish for pieces: torn-paper collage (`references/styles/torn-paper-collage.md`) on top of the story's style module. Plates use the style module alone.

## Contents

- Pipeline
- Element inventory
- Layers and naming
- Kit sheet template (template 6)
- Background plate template (template 8)
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
| `plate` | sky, far mountain ranges, far hills, distant forest bands, painted as one background plate (template 8), not cut | 0.1 | full frame |
| `sky` | only sky items that move on their own (drifting cloud, rising sun, moon); painted without a paper rim, cut with `"text": true` | 0.05 | 80-200 |
| `mid` | single hills, groves, big trees, houses, pavilions | 0.4 | 300-650 |
| `near` | walls, gates, jar terraces, fences, rocks, ponds, paths, single trees | 0.7 | 120-420 |
| `front` | reeds, grass tufts, flowers, branches entering the frame | 1.0 | 80-300 |
| `fx` | sparkles, splashes, mist, smoke, ripples (often no torn rim: see the template) | 1.0 | any |

Characters are drawn between `near` and `front`.

The old `far` layer (mountain pieces with torn rims) is retired: those forms belong in the plate. Golden-axe kit `sky-far` (v1) predates this rule; its mountain and hill pieces are superseded by plates, and its clouds are kept only where a cloud has to drift.

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
- Textures (bark, roof straw, stone, water) are a few irregular short brush strokes of varied size and direction, never a repeated pattern or stamped symbol: "bark suggested by a few irregular short brush strokes". A bare "bark scales" gave rows of identical diamonds on golden-axe v2 trunks.
- See-through objects (brushwood gates and fences, lattices, ladders, nets, a gate standing ajar) are painted on a solid backing: say "painted on one continuous piece of cream paper; between the branches and in any gap the paper shows what is behind it (the pale ochre yard and a soft shadow) as opaque watercolor; no magenta and no holes inside the piece". Then only the outline is cut. Without it the gaps hold the magenta backdrop, which survives cutting as purple lines (golden-axe brushwood gate, 2026-10-14). The piece then hides what is behind its gaps, so paint the backing in the colour of the ground it will stand on.
- `fx` pieces (sparkles, mist, splash) are often better without a paper rim: say "painted directly as loose watercolor marks with no paper rim" for those pieces only, and expect to cut them with `"text": true`.

Name list: keep the slot names in the record (`prompts.json` → `pieces`) in the same order; `find-pieces.mjs --names` uses them.

## Background plate template (template 8)

One plate per location and time of day (`plate-<location>-<time>`, e.g. `plate-pond-day`, `plate-pond-sunset`). Make the day plate first, then attach it as Image 2 for the other times with "same composition as Image 2, only the light and sky change", so a scene can cut between times without the mountains moving. Do not darken a day plate for night in code: it turns muddy; paint a night plate.

```text
Use case: illustration-story. Asset type: background plate (far distance only) for the children's fairy tale "<title>", audience ages <age>. This is the far painted backdrop; nearer houses, trees, rocks, water and characters are separate cut-out pieces that will be pasted on top later.

Input images: Image 1 is the approved character lineup, a STRICT PALETTE AND STYLE reference only; do not draw any character. <nature, nature-2 role sentences>.

<STYLE BLOCK from the style module>

<ERA BLOCK landscape lines only>

Composition: one wide landscape painting that fills the whole canvas edge to edge, painted directly on warm cream cold-press watercolor paper (close to #f4efe2), with no paper rim, torn edge, border, frame or vignette. Back to front: <sky: time of day, light colour, a few soft cloud shapes>; <far: mountain ranges / far hills / distant forest band, with the era's landscape details>; <ground field: the location's own ground colour, see Ground fields below>. Atmospheric distance: the farther a form, the paler, cooler and simpler it is, with fewer and lighter pen lines than the characters; the farthest ridges have no outline at all. The horizon sits at about <58> percent of the height. The lower <38> percent is a calm ground field in the location's own colour, slightly deeper and warmer toward the bottom edge so pasted pieces feel grounded, with only a few loose brush marks and no objects, left open for pasted pieces and characters. Balanced and unfocused: no single landmark in the centre and nothing a pasted piece would have to line up with. No text.

Palette: <style palette with era tilt>, lighter and slightly cooler than the pieces.

Constraints: no characters, people, animals, houses, walls, fences, close trees, rocks, water edges or props; no cut-paper rim, torn edge, sticker outline, frame or border; no hard foreground objects; no photorealism, no 3D, no digital gradients, no glossy finish.
```

Ground fields (fill `<ground field>` per location; golden-axe v2 left every plate with the same empty pale-green lower half, so a forest plate did not read as a forest and every piece seemed to float):

| Location | Ground field sentence |
|---|---|
| Village, yard | a warm packed-earth yard in soft yellow ochre with a little grass at the far edge |
| Forest | a deep green forest floor with soft darker tree-shadow patches and fallen-needle brown |
| Pond, waterside | a waterside meadow in fresh green with a slightly bluer damp band toward the water side (the water itself is a piece) |
| Path | a pale dirt path colour in light ochre-grey, flanked by soft grass green |
| Night (any place) | a dark green-grey field with a few lighter moonlit patches; no blue ground and no horizontal wavy strokes, which read as water |

High horizon (forest floor about 30 %, village overview about 25 %): the sentence "the lower part is a calm ground field ... no objects" makes the model leave that area empty, so a bird's-eye plate came out with its patchwork shrunk to a strip. For those plates replace it: "the lower 71 percent shows the valley floor seen from above, ... continuing all the way to the bottom edge, its fields getting larger and simpler toward the bottom, pale flat washes with few lines".

Far trees: describe far pines and forest bands as "irregular soft green brush dabs with no visible trunks, never a row of identical umbrella or lollipop shapes". "Tiny umbrella-shaped pines drawn with a few dabs" gave stamped monkey-puzzle trees on all eight golden-axe v2 plates.

Size and use: the generator gives 1536x1024; the video draws it with `plate()` (storybook-video) scaled to cover 1920x1080 with a little overscan so parallax never shows an edge. The slight upscale is harmless because far forms are soft by design. Record plates in prompts.json with `"sheet": "plate"`, `"layer": "plate"`, `"location"` and `"time"`.

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

Per scene, draw back to front: background plate → moving `sky` items → `mid` → `near` → characters → `front` → `fx`. Overlap pieces like a real paste-up; anchor each piece by its bottom centre on its ground line; keep the per-piece tilt and the soft drop shadow from the collage finish. In storybook-video use `plate(ctx, name, {camX, parallax})` for the plate and `paste(ctx, name, x, y, height, {tilt, shadow, parallax})` for pieces (see that skill's architecture reference). Pieces and characters are painted in daylight: in a sunset, night or mist scene set the scene `light` so they take the plate's colour, and give a figure over water `waterRise` ripples. Cut all sheets with `--rim <story paper>` so the margins match. For a still review image, compose the same layers on a 1920x1080 canvas.

## Staging a scene (화면 배치)

General picture-book staging for pasting pieces on a plate (sources in the fairytale project's research report, plus common practice). Era files add where things stand in that world (e.g. `eras/joseon.md` Placement rules).

- **One home per shot, few pieces:** a house scene shows one house with at most one tree and its front wall; a neighbour's house gets its own shot. Remove anything the narration does not need (golden-axe review: two houses, extra trees, a cairn and a far pine beside the path all read as clutter).
- **Foreground grass runs edge to edge** when it frames the bottom of the picture (two wide bank pieces, one mirrored), never a short strip in the middle.
- **Ground lines:** the plate's horizon is about 58 % of the height. Anchor every piece by its base on the ground below it: farther pieces higher (just under the horizon) and smaller, nearer pieces lower and bigger. Same-size pieces on one baseline look like a shelf; vary both.
- **Overlap:** a nearer piece covers the base of a farther one (fence over the bottom of the cottage, reeds over the pond rim). Overlap is the strongest depth cue a paste-up has.
- **Subject in the middle ground:** the character stands on a ground line at about 80-90 % of the height, with clear space around the head and the action. Pieces never cover the face or the hands doing the action.
- **Foreground frames, never fills:** front pieces enter from a lower corner or the top edge (reeds, a branch) and keep the centre open. The bottom band (about 14 %) holds captions; keep it calm.
- **Shot distance changes per scene:** wide establishing view (small characters, more pieces, plate dominant), full-body medium (the default), close (face, two or three pieces, plate blurred or cropped). Do not hold one distance for many scenes.
- **Scale truth:** door ≈ the character's height, jangseung a little taller than an adult, big trees 3-4 adult heights, fence chest-high. Use the kit's `scale_ref`.
- **Fewer, bigger pieces** for the 3-5 band: 4-7 pieces per scene, not a crowded collage.

### Scene recipes from published picture books (2026-10-13)

Analysis of real golden-axe picture-book spreads plus Molly Bang's composition principles (fairytale project report `docs/research/reports/그림책 장면 분석과 배치 원칙.md`). The first test scenes looked like stickers on a board because every piece was small, whole and evenly spread. Published spreads do the opposite:

- **Bleed:** at least one big element per scene runs off the frame (a pond, a wall of trunks, a foreground bank, corner rocks). Make these as **edge pieces** (below), or enlarge an ordinary piece and let the frame crop it. A scene whose pieces all sit fully inside the frame reads as a sticker board.
- **Two zones for water:** a pond takes half the frame, its shoreline a curved diagonal from near the horizon to the bottom edge; land on the other half. Characters stand on the land side; a water spirit rises from the water side close to the camera.
- **Face-off:** two characters in dialogue stand on opposite sides facing each other. The powerful one (spirit) is bigger and higher in the frame, the small or sad one lower (Bang: top = freedom and power, bottom = weight; bigger = stronger).
- **Forest as a wall:** a cluster of 4-6 trunks of different widths on one side, cut by the top edge, a stump in front. Whole trees with full crowns only in the distance.
- **Character size:** medium shots 40-60 % of frame height; mix in wide establishing shots (characters 15-25 %) and close shots (face or upper body, plate cropped).
- **Clusters and open space:** 2-3 clusters (cottage + jars + persimmon tree), an open lane where the action happens, nothing spread evenly.
- **Grounding:** a soft flat contact shadow under every piece and character, and a foreground bank strip across the bottom so feet stand on something.
- **Corners:** close at least one lower corner with a cropped rock or grass clump.
- **Eye level changes:** high horizon for wide village views (more ground), low horizon for looking up at the spirit; move the plate with `plate(..., {dy})`.
- **Action beats close:** the decisive moment (the axe slipping into the pond) is a close shot with a sound word and motion lines (storybook-video `sfxWord`).
- **Home as a frontal stage** (open-bookshelf books, CC BY 4.0): the cottage spans 60-90 % of the frame width, often cropped at one side; the lower half is an empty earth yard; firewood stands against the wall, jars beside the wall, drying mats and the bench at the yard edges; the character stands in the open yard centre.
- **Ground is a big field:** yard, meadow or forest floor takes 40-75 % of the frame and everything stands on it; forest and spring scenes raise the horizon so the floor fills most of the frame.
- **Torn masses as framing:** big torn-paper masses (dark forest, hillside) enter from both sides and leave a diagonal lane for a path; the character walks on that lane, large (up to ~70 % of frame height). This is the same technique as our cut-paper pieces, so large pieces may enter from outside the frame.
- **Paths are diagonal bands** from deep in the frame to the bottom edge, linking places (mountain to cottage, forest to pond); characters walk on them, never beside them.

### Direction and gaze (방향과 시선)

Checked on the golden-axe test scenes (2026-10-13): every pose had been drawn facing right, so Daebak threw his axe away from the pond and Dori faced the camera instead of the spirit.

- **Face the target:** every character faces what it acts on or talks to: the tree it chops, the pond it throws into, the spirit it answers. Throws, swings and splashes travel from the actor toward the target, and the target lies in the direction of the pose.
- **Fixed geography per location:** decide once where things are on screen (golden axe: the village is off-screen left, the pond always on the right) and keep it in every scene at that location, so the water never jumps sides between consecutive shots (180-degree rule).
- **Journeys read left to right:** setting out moves right, in the page-turn direction; coming home moves left. Use a left-walking pose for the return, not the same right-walking pose.
- **Dialogue:** the two speakers face each other across the gap, and both poses must actually turn toward the other (a front-facing pose next to a profile reads as ignoring).
- **Look room:** leave more space in front of a face or a movement than behind it.
- **No mirroring of hanbok or wrapped robes:** flipping a sprite turns the jacket's right-over-left closing (우임, worn by the living) into 좌임, which was reserved for burial clothes. Generate the needed facing instead (cut-out sheet slots `-left` / `-right`). Mirroring is fine for animals, props and symmetric pieces.
- Record each pose's facing (`left`, `right`, `front`) in the character bible so scene layouts can pick the right one.

### Edge pieces

Pieces meant to be cropped by the frame: a very wide pond, a foreground meadow bank, trunk clusters cut at the top, corner rock clusters. In the kit sheet sentence name the straight cut sides ("its left side and bottom are straight cut edges") and add to the scale line that the torn rim runs only along natural edges. Paste them with the straight sides placed outside the frame. Golden-axe test sheet: `kit-edge-pieces` (2026-10-13).

Walls and fences in front of a house are one long piece with the gate built into it (`wall-long-<house>`: about eight times wider than tall, gate in the middle, both ends straight cut edges so it runs off both sides of the frame), not short segments pasted in a row: on golden-axe the segments read as separate pieces and the gate did not join them. Place the gate in front of the door and let the wall cover only the house's foundation.

Size: a piece shown big must be drawn big. Put large edge pieces one or two per sheet ("filling most of the sheet") so each comes out at 1,000 px or more, and never upscale a piece more than 1.5x in a scene. On `kit-edge-pieces` six pieces shared one sheet, came out 300-550 px and were upscaled 2-2.6x: soft painting, rims two to three times thicker than the characters', ripple lines turned into heavy zigzags. Golden-axe large sheets: `big-pond-wide`, `big-trunks`, `big-meadow-bank`, `big-houses-solo` (2026-10-14).

## Review checklist for kits

- Exactly the listed pieces, in the listed order, none touching each other or the sheet edge; no text anywhere.
- Every piece has a visible torn white rim all around, no ground patch or shadow, nothing painted on the backdrop.
- Backdrop is one flat colour to every edge (no gradient, no texture).
- Same pen line, wash and palette as the anchor cast sheet; same era details.
- Sizes on one sheet compare truthfully (jar terrace smaller than the house, the gate fits a person).
- No magenta inside any piece: gates, fences and other see-through parts have their solid backing (zoom into the gaps).
- `find-pieces` finds exactly N pieces; `cut-sprites` contact sheet shows clean rims.
- Plates: full bleed to every edge, no rim or frame, no near objects, lower part calm and open, farthest ridges paler than nearer ones; the other times of day keep the day plate's composition.
