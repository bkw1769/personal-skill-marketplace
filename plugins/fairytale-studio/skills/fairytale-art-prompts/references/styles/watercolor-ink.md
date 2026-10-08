# Style: watercolor-ink (펜 + 수채화 스케치북)

Status: proven. Source prompts: `assets/art/characters/troy/2026-10-07-v1/prompts.json` (troy-cast-v1, troy-expressions-v1, troy-horse-v1). The wording below is lifted from those prompts with the story-specific parts removed.

Look in one line: naive hand-drawn sketchbook figures, wobbly black pen, transparent pastel watercolor, lots of bare cold-press paper.

## Reference images

Folder: `assets/art/style-refs/watercolor-ink/` in the project (the photos are the user's and are not bundled with this skill; if the folder is missing, ask the user for the reference images or generate without them and say so). Attach them as style references and give each one its role sentence; the role sentence tells the model which trait to borrow and stops it from copying the subject matter.

| File | Role sentence | Use for |
|---|---|---|
| `creature-1.jpg` | sparse imperfect black pen contours, watercolor paper grain, transparent overlapping pastel washes, simple friendly silhouettes | every sheet |
| `creature-2.jpg` | quirky long thin limbs, asymmetrical dot/oval eyes, tiny mouths, expressive naive handmade figures | characters, expressions |
| `creature-3.jpg` | economical facial expression and sketch-like character movement | characters, expressions, poses |
| `creature-4.jpg` | whimsical storybook houses and crooked towers drawn with loose irregular ink lines, light hatching and pale watercolor | props, buildings, locations |
| `nature-2.jpg` | airy blue/yellow/green translucent wash palette and abundant unpainted paper | cast lineup, locations |
| `nature.jpg` | small landscape vignettes (water, reeds, pine shore) with loose washes, horizontal ink ripples and bare paper around each vignette | locations |
| `veg.jpg` | tiny anthropomorphic creatures with dot-eye faces and pale gentle washes | animals, sidekicks, small magical beings |
| `flowers.jpg` | botanical motifs (wildflowers, lavender, butterflies) with crisper petal lines and slightly richer washes | decorative motifs, meadows; tone it down to the pale palette |

Typical sets: cast lineup → creature-1, 2, 3, nature-2. Expressions → anchor + creature-2, 3. Props → anchor + creature-4, creature-1. Locations → creature-4, nature, nature-2.

Opening line for the input-images block:

```text
Input images: supplied local photos are STYLE REFERENCES ONLY, not edit targets.
```

## STYLE BLOCK (paste verbatim)

```text
Translate exactly this handmade ink-and-watercolor sketchbook language, staying much closer to the rough naive reference drawings than to polished commercial digital cartoons. Wobbly thin black pen outlines with occasional thicker strokes, broken/open edges, translucent uneven watery color with pooling and small outside-line bleeds, visible off-white cold-press paper texture, a few faint construction marks. Minimal two-dimensional drawing: no realistic lighting or shading, no airbrush, no glossy eyes, no vector-perfect edges, no generic chibi/anime style. Expressive primitive bean/oval body shapes with thin drawn arms and legs, slightly asymmetrical dot or small oval eyes, minimal eyebrows and tiny mouths. Clothes have only a few essential lines. Fewer lines than conventional commercial illustration; abundant unpainted paper. Render cleanly as a scanned artwork, without camera shadows, table edges or photographic distortion.
```

## Palette

```text
Palette: turquoise/sky blue, warm yellow ochre, leaf green, watery pink/coral, lilac accents and pale brown, unified across all characters.
```

Eras may add one or two tilt colors (see the era file); keep the total small so the set still reads as one family. Assign each main character two or three named colors in the character bible and never swap them.

## Negatives (paste into Constraints)

Character, expression, turnaround, prop and location sheets use this line. Element-kit sheets replace it with the torn-paper collage negatives (`torn-paper-collage.md`), because there the paper piece is the point.

```text
No photorealism, no 3D, no cut-paper collage, no digital gradients, no polished vector, no complex realistic shading, no glossy cartoon finish.
```

## Known failure modes and fixes

| Symptom (seen or expected) | Fix line to add |
|---|---|
| "Side" poses come out as three-quarter views (seen on the Troy sheets) | `side view means strict profile: nose points to the frame edge, only one eye visible` |
| Drift toward clean commercial cartoon | repeat `rough naive reference drawings, not polished commercial cartoons` in Constraints |
| Color swatches or title merge with tall subjects (seen on the horse sheet) | `keep the title and swatches in a clear top band; no subject may enter that band` |
| Paired characters overlap and cannot be cut apart (seen on Troy citizens) | `every figure stands apart with clear paper between them, even in pairs` |
| Hair tufts, helmet plumes and horse ears reach into the row above or the title band, so crop boxes cut them (seen on the Troy cast sheet) | `leave clear paper above the highest point of every figure: hair, plumes, ears and raised hands` |
| Faces gain detailed eyes or lashes | `eyes are simple dots or tiny ovals, no highlights, no lashes` |
