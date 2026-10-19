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

## Face vocabulary (one face type per character)

The style block's default face is "slightly asymmetrical dot or small oval eyes, minimal eyebrows and tiny mouths". Used for everyone, it makes a whole cast look like one person in different clothes. Give each main character its own face type from this list, write it into the character's identity sentence in the character bible, and never give two main characters the same eye type. Everything stays inside the naive hand-drawn language: simple shapes, a few pen strokes, no glossy anime eyes.

| Part | Types (pick one per character) |
|---|---|
| Eyes | `dot` small black dots · `bean` short vertical black ovals · `round-pupil` round white eyes with a small black pupil dot (lets the character look sideways or widen in fright) · `crescent` upward arcs, smiling closed eyes · `half-lid` round eyes with a heavy upper lid line, sleepy or sly · `slit` narrow sideways ovals with pupils shoved to one side, shifty · `line` short straight lines, calm or dozing · `button` big solid round black eyes, babies and small animals |
| Brows | none · short dashes · thick bushy strokes · high arches (surprise, vanity) · one raised (sly) |
| Nose | none · single dot · small triangle (animals) · round button · long line with a bump in profile |
| Mouth | tiny line · small "u" smile · wide closed grin · round open "o" · crooked half-smile · wobbly line |
| Cheeks | none · soft pink blush dots · freckles · stubble dots |

Expressions then come from the same parts: pupils move and shrink for fright, crescents for joy, brows tilt for worry. An expression sheet keeps each character's face type and changes only these parts.

Learned on tiger-persimmon (2026-10-19): `round-pupil` (white eyes with pupils) on a resting face reads as vacant googly eyes, keep it for fright moments or very cartoonish side characters; `button` eyes set wide apart with an "o" mouth make a baby look shocked, small `dot` eyes set close together and low on a big round face with a wide smile read as a happy baby. A proud or boastful character reads best with `bean` eyes under lifted brows.

References for faces: for an animal, look at photos of the real animal (CC0 or public domain; attached as shape-only references) and simplify its real features: a tiger has smallish almond amber eyes with round pupils and a white fur patch above each eye. Do not take eyes from another artist's stylization (the user rejected minhwa goggle eyes for the tiger). For babies use the picture-book baby proportions (Lorenz's baby schema): big high forehead, eyes set low on or below the middle of the face, about one eye-width apart, room below for the cheeks.

Lines to add when faces drift: `each character keeps its own face type from the character bible: <name> <eye type>, <name> <eye type>` and `no two characters share the same eyes`.

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
| Every character has the same dot eyes and tiny mouth, so the cast reads as one face (golden-axe and tiger-persimmon lineups) | give each a face type from the Face vocabulary in its identity sentence and add `no two characters share the same eyes` |
