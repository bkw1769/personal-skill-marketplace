---
name: shorts-motion
description: Turn the still images of an informational Short into a moving video with code motion graphics in the portrait shorts engine (src/shorts/_engine), with no paid AI video - pick which lines get a motion beat (principle and number lines, about one beat every 15-20 s), choose the cheapest technique that says the line (camera moves and punch-ins, cut-out figurines walking over an empty plate, animated diagram overlays such as a measuring tape, timer, signal bar, spreading frost, compare bars, flow arrow, dimension line, label, counting number, X or check, keyword, pulse path, squeeze, ring and cross-section card, pinned to the picture with plate:true), make the art for layered shots (empty-plate edit, magenta cut-out sheet, sheet-to-sprites cutting, coordinates measured on the plate), write the shot and overlay fields in script.json, bring the episode page's engine copy up to date, check everything with a bundled checker (kinds, required fields, fractions, sprite names, overlays on screen at once, held overlays that blink, the page's engine copy, plates and sprites), map plate points to frame positions, build one storyboard per voice take with motion fitted to it, review stills of every motion scene, export and sync-check - and add a new overlay kind to the engine when a topic needs one. Use this whenever the user asks for 모션 그래픽, 모션그래픽, 움직이는 영상, 사진만 말고 움직이게, 사진+모션, 레이어 분리, 인형이 걸어가게, 사람이 지나가게, 도식 애니메이션, 줄자/타이머/화살표 애니메이션, 얼음이 번지는 효과, 그래프가 자라게, 장면을 더 역동적으로, 너무 밋밋해, motion graphics, animate the stills, and whenever the shots of a new short are being planned, even if they never say "motion".
---

# Shorts motion graphics

A still with a slow camera move holds a viewer for a few seconds. On the line that carries the idea, the viewer should see the idea happen: the walker crossing while the clock counts to 27, ice spreading inside the meter box. This skill adds that motion with code on top of the episode's own stills.

Why code and not AI video: the user chose "photo + motion graphics" on 2026-10-20. Code motion costs nothing, is deterministic, and re-renders for every voice take, because the same stills, sprites and coordinates drive every frame. Numbers on screen stay exact and traceable.

Three tools, cheapest first:

| Tool | Cost | Use it for |
|---|---|---|
| Camera move; chunk punch-ins | Free. The move is on every shot; punch-ins only when script.json has `"cuts": "chunk"` (see `references/overlays.md`, Chunk cuts) | Every shot |
| Diagram overlay (`overlays[]`) | A few JSON fields | Lengths, times, amounts, flow, a change of state, "this spot" |
| Sprite layers (`shots[].layers`) | One edit, one cut-out sheet, cutting | A person or thing whose movement is what the caption says (walking, crossing, following, stopping, speed) |

Otherwise prefer an overlay, even when a figure is in the still.

References: `references/overlays.md` (every overlay kind, `plate: true`, adding a kind), `references/layers.md` (moving sprites), `references/art-for-layers.md` (empty plate, cut-out sheet, coordinates, sprite size), `references/recipes.md` (real lines with exact JSON), `references/engine.md` (engine copies, camera mapping, builder, review hooks).

## Paths

| Placeholder | Means |
|---|---|
| `<skill-dir>` | The folder that holds this SKILL.md (`scripts/motion.mjs` is in it). |
| `<shorts-research-dir>`, `<storybook-video-dir>`, `<sheet-to-sprites-dir>` | That sibling skill: `.claude/skills/<name>/` in the project when it is there, else this plugin's `skills/<name>/`. When both exist, use the project copy (the project pins it); if their scripts differ, tell the user. |
| `<scratch-dir>` | The session scratchpad. Never `art/`, where grids and crops would be mistaken for shots. |

Commands run from the project root.

## Inputs

- `src/shorts/episodes/<id>/script.json`: lines with `chunks`, `shots` and `overlays`.
- `art/*.png` (the stills) and every page's `video*/story.config.js` (plates, sprites, narration).
- `research/facts.json` for every number that will appear on screen (shorts-research).
- The recorded voice of each take (storybook-narration): `timeline.json` and `full.wav` in the folder that the page's `narration.timeline` names, `src/shorts/out/<id>/tts-ko/` or `src/shorts/out/<id>/tts-ko-<voice>/`. The main page `video/` loads `storyboard.json`; an extra take's page `video-<voice>/` loads `storyboard-<voice>.json`. Crosswalk's main page reads `tts-ko-soft-m/`, the water meter's reads `tts-ko/`. Without a voice you can plan, write and check the fields, but not build or review.
- If the script or the stills are missing, ask for them. Motion is planned on top of a written script, never before it.

## Workflow

1. **Pick the motion beats.**
   - Read the script beat by beat. Motion goes on principle lines and number lines: where the caption states a mechanism, a length, a time, an amount or a change.
   - One motion beat every 15-20 s is plenty: 3-5 in a 60-80 s short. Crosswalk (72.05 s in the soft-m take, 79.74 s in professor-m) has l04, l05, the l06 signal bar, l12 and l13, plus the l08 digit; the water meter (67.53 s) has l03, l04, l10.
   - A beat is something the eye follows: `arrow-flow`, `tape`, `timer`, `signal-bar`, `pulse-path`, `squeeze`, `buckle`, `frost`, `compare`, `reveal`, `stages`, sprite layers. Pop-in cards are light: `number`, `keyword`, `label`, `dim`, `xmark`, `check`, `ring`. When adjacent lines both want motion, give one of them only a light overlay, and tell the user.
   - Hook, transitions and outro keep camera moves. Motion everywhere stops meaning anything, and every beat costs review time.
   - Write the plan as `line -> what moves -> what the caption says` and show it to the user before making any art.

2. **Choose the technique**, the cheapest one that says the line:

   | The caption says | Technique |
   |---|---|
   | a length or distance | `tape` (plate-pinned) or `dim` |
   | a time or duration | `timer`, or `signal-bar` when no timer is on screen |
   | an amount | `number` (counts up), `compare` for before/after |
   | flow or direction | `arrow-flow`, `pulse-path` |
   | spreading, freezing, a state change | `reveal` (a second, changed still fading in), `frost` (veins drawn on top), or a new kind |
   | graded levels (forecast stages, warning levels) | `stages` |
   | pressure, constriction | `squeeze` |
   | "this part" | `ring`, `label` with a pointer |
   | a myth / the right answer | `xmark` / `check` |
   | a mechanism in section | `buckle`, or a new card kind |
   | a person or thing whose movement is what the caption says (walking, crossing, following, stopping, speed) | sprite `layers` |

   Otherwise prefer an overlay, even when a figure is in the still. If nothing fits, add a new overlay kind (step 10). Most topics need one: `frost` and `compare` were added for the water meter.

3. **Make the art** (only for layered shots or a missing base still). Full prompts and commands: `references/art-for-layers.md`.
   - Generate the normal shot with the movers first.
   - Empty plate: an EDIT of that shot that removes the movers and their cast shadows. The composition is unchanged, so coordinates fit both.
   - Cut-out sheet: the same figures, same camera angle, one facing direction, on flat magenta, no cast shadows, wide gaps. Big figures need big sprites (sprite pixel size in `art-for-layers.md`); side-view figures need their ground contacts on one row (`layers.md`, Side-view figures).
   - Cut with sheet-to-sprites: `find-pieces.mjs --names`, `cut-sprites.mjs --boxes` without `--rim`, then `measure.mjs spill`.
   - Diagram-only lines need a clean base still instead (`box-empty`: evenly lit, centred, the change not drawn in).
   - Measure plate coordinates on a 10% grid. Never guess them from a screenshot. A sprite keeps one size along its path, so keep paths at one depth on a perspective plate.

4. **Write the fields** in `script.json`. Fields: `references/overlays.md`, `references/layers.md`. Copy a working pattern from `references/recipes.md`.
   - Overlay timing: `at` (seconds after the line's voice start) or `at_chunk` (wins over `at`, so there is no offset inside a chunk); end with `"until": "end"` or `until_chunk`.
   - Pin anything that points at the picture with `plate: true`. Keep cards (number, timer, X) frame-anchored.
   - To hold a finished diagram on the next line, repeat it there with `"grow": 0.01, "at": -0.08`: it then starts at the next scene's start, exactly where the first one ends. With `"at": 0` it blinks off for 0.08 s (the checker warns). Only `tape` and `frost` hold cleanly. `compare` fades its panel in again over 0.2 s; every other kind re-animates (arrow-flow's tip 0.6 s, dim 0.5 s, ring 0.45 s) or pops again with its sound (number, keyword, xmark, check, ring, squeeze, buckle). The repeat's first frame can still land inside its 0.01 s grow and show it part-drawn for that one frame.
   - Every number carries `claims`. Decorative digits get `static: true` and `not_facts`. Words on screen that state a fact follow the claim's wording (design rule 3).

5. **Prepare the episode page.** Each page (`video/`, every `video-<voice>/`) runs its own copy of the engine, and an old copy draws nothing for a kind it lacks.
   - Compare every page with the engine:

     ```bash
     for p in src/shorts/episodes/<id>/video*/; do
       for f in src/shorts/_engine/video/js/*.js; do cmp -s "$f" "$p/js/${f##*/}" || echo "$p/js/${f##*/} differs"; done
     done
     ```

   - Before overwriting a `scenes.js` that differs, make sure the episode has no local patch: `diff <(sed -n '/^const OVERLAY = {/,/^};/p' src/shorts/_engine/video/js/scenes.js) <(sed -n '/^const OVERLAY = {/,/^};/p' src/shorts/episodes/<id>/video/js/scenes.js)`. Lines only in the episode (`>`) should be older engine code; anything else is a local patch: port it into the engine first, or ask the user.
   - Copy into every page: `cp src/shorts/_engine/video/index.html <page>/ && cp -R src/shorts/_engine/video/js <page>/`. A newer `score.js` also changes the sound (ring, squeeze and buckle got pops), so every take that gets the copy needs a new review and export.
   - In every page's `story.config.js`: a `plates` entry for every shot image (layered or not), and the sprites manifest in `sprites` when there are layers.

6. **Check.**

   ```bash
   node <skill-dir>/scripts/motion.mjs check src/shorts/episodes/<id>
   ```

   - In `script.json`: unknown kinds and missing required fields (its `KINDS` table mirrors the engine), fractions outside 0..1, run times (`grow`, `count`, `dur`, `period`) that are not above 0, a counted `number` or `tape` text that draws NaN or 0, a timer `to` that is not a whole number or sits on a `plate: true` timer, picture-pointing kinds without `plate: true` (a warning), shot images without `art/<image>.png`, sprites missing from `art/sprites/sprites.json` or marked empty there, chunk indexes out of range, and numbers shown without `claims` (a warning; this covers keyword, label, arrow, dim and squeeze texts and buckle labels too).
   - In the storyboard, when one exists: more diagram overlays on screen at once than `--max-overlays` (default 2, the user's limit; unknown kinds are not drawn, so not counted), two "time" overlays together, a layer `t` walked in under 0.3 s (fitMotion folds a late start to nothing) or ending later than 0.3 s before the cut, timers and signal bars that leave under 0.3 s of their end state, a repeated overlay that blinks off between lines, a `plate: true` overlay on screen over two pictures, consecutive layered shots with the same plate, framing and cast, and a stale storyboard (its overlay kinds differ from the script's, kind by kind, or it is older than the script). A hand-written storyboard (scene ids that are not `<line>-<n>`, like the crosswalk motion test) is checked with the script rules instead and never called stale.
   - In every page whose `story.config.js` loads that storyboard: its `js/scenes.js` must draw every kind used, have `onFrame` when anything is `plate: true` and `layerAt` when there are layers; its `story.config.js` must list every shot image in `plates` and load the sprites manifest. Pages that load another storyboard are checked with `--storyboard` for that file.
   - Override files with `--script`, `--storyboard`, `--sprites` (repeatable). Exit 0 = no errors (warnings still print), 1 = errors or an unreadable file, 2 = usage. Fix every error before building.

7. **Build one storyboard per voice take**, for the take each page's `narration.timeline` names:

   ```bash
   # main take, page video/ (the folder is tts-ko/ or tts-ko-<voice>/, as video/story.config.js says)
   node src/shorts/_engine/build-storyboard.mjs src/shorts/episodes/<id>/script.json src/shorts/out/<id>/tts-ko/timeline.json --out src/shorts/episodes/<id>/storyboard.json
   # extra take, page video-<voice>/
   node src/shorts/_engine/build-storyboard.mjs src/shorts/episodes/<id>/script.json src/shorts/out/<id>/tts-ko-<voice>/timeline.json --out src/shorts/episodes/<id>/storyboard-<voice>.json
   ```

   - Always pass `--out`. Without it the prototype builder tries to write over the node binary. If the project path contains spaces or non-ASCII characters, the builder silently does nothing; check that the output file changed.
   - `fitMotion` pulls layer `t` ends and overlay `dur` in to 0.3 s before their scene or overlay ends, so the walker arrives and the timer reaches its number before the cut in every take.
   - Lines with layers, `tape`, `arrow-flow`, `dim`, `label` or any `plate: true` overlay get no chunk punch-ins.
   - After any script edit, rebuild every take.
   - Re-run `motion.mjs check ... --storyboard <file>` on every built file, then trace the numbers:

   ```bash
   node <shorts-research-dir>/scripts/facts.mjs trace src/shorts/episodes/<id> --storyboard src/shorts/episodes/<id>/<storyboard file>
   ```

   Trace reads only an overlay's `text` and `label`. Check a timer's `to`, a number's `sub`, `compare` item texts and `buckle` labels against `facts.json` by hand.
   - Where a plate point lands on the frame: `node <skill-dir>/scripts/motion.mjs frame <storyboard> <scene-id> <u,v> [<u,v>]...` prints its frame x, y at the scene start and end and flags the caption band, the bottom 20% and off-screen points.

8. **Review stills of every motion scene.**

   ```bash
   node <skill-dir>/scripts/motion.mjs stills src/shorts/episodes/<id>/<storyboard file>
   ```

   It prints a JSON list of times: for every scene with layers or an animated overlay (every kind with `motion` in `KINDS`, pulse-path, squeeze, ring and buckle included), 0.5 s after its start, its middle and 0.35 s before its end; plus 0.1 s into every scene that follows a layered one; de-duplicated so no capture overwrites another. Start the dev server (launch config `shorts-video`), open the page that loads that storyboard (`http://127.0.0.1:8767/src/shorts/episodes/<id>/video/` or `.../video-<voice>/`), and paste the list into `await __capture(<list>, '<voice>-motion')` in the console. PNGs land in `src/shorts/out/<id>/review/`. Open them and look for:
   - the end of each motion scene: every figure where the caption says, the timer on its final number;
   - the start of each scene after a layered one: nothing jumps back;
   - pinned overlays still on their spot after the zoom;
   - nothing in the caption band (62% height) or the bottom 20%.

   Show the stills to the user before exporting.

9. **Export and verify.** If the episode already has an export, move it first to `src/shorts/out/<id>/old/<id>-<label>.mp4` (label: the date or what changed), because `__export` writes the same name. In the page console: `await __export()`. It writes `src/shorts/out/<id>/<id>-<voice>.mp4` (the main take's `video/` page writes `<id>.mp4`; the name is `saveName` in `story.config.js`). Then probe the file, check sync and level:

   ```bash
   node <storybook-video-dir>/scripts/probe-mp4.mjs src/shorts/out/<id>/<id>-<voice>.mp4 --expect-duration <storyboard duration> --tolerance 1 --expect-size 1080x1920 --require-audio
   ```

   `await __sync('/src/shorts/out/<id>/<id>-<voice>.mp4', [<times incl. motion scenes>])` must return `ok: true`; `await __mix()` should show the voice 15 dB or more over the music at about -14 LUFS. Then shorts-thumbnail (cover) and shorts-publish (upload sheets); when the episode already had upload sheets, re-run shorts-publish so they match the new file.

10. **Add an overlay kind when needed.** Write it as a function in the `OVERLAY` object of `src/shorts/_engine/video/js/scenes.js`; draw randomness from `rng(o.seed)` re-created every frame, so every frame and every export agree; reuse the positional names `onFrame` already pins (`from`, `to`, `box`, `x`+`y`, `paths`, `r`, `gap`) or add new ones there; name a run time `dur` so `fitMotion` fits it; add the kind to the checker's `KINDS` table with a test; copy the new `js/` into the episode's pages (step 5). Full steps: `references/overlays.md`.

## Design rules (from the user, 2026-10-20)

1. **At most two diagram overlays on screen at once, never two with the same meaning** (checked). The 8.4 s test with tape, timer and signal-bar was too busy, and timer and signal-bar both said "time". Captions and walking sprites do not count.
2. **The picture never contradicts the caption.** An elder still on the road under `다 건널 시간을 줍니다` read as a mistake. A figure that does not make it belongs only on the line that is about that (the twist, crosswalk l13). Known exception: crosswalk l04's child is still mid-road at the cut (v 0.45); it passed because that caption claims nothing about everyone crossing.
3. **Every number on screen is a ledger claim.** Motion and bar heights may show a proportion, but a derived number stays hidden (compare `value` 109, printed text `+9%`). Device digits that are only illustration are `static: true` and in `not_facts`. Words on screen that state a fact (label, keyword, arrow, dim or squeeze text) say what the claim says: read the claim's caveat before writing them. The tactile-paving claim `c-two-types` notes that 정지 is not in the rule, so a label `멈춤` would overstate the law.
4. **Honest speeds.** When the line is about speed, path lengths covered in the same time are proportional to the real speeds (l13: 0.46 vs 0.65 of the plate = 0.708, for 0.709 vs 1.0 m/s).
5. **Move with the spoken number.** The walker and the timer start together and end together, so the timer shows `27초` as the walker reaches the curb, before the cut.
6. **Consecutive layered shots on one plate change the framing or the cast** (checked). Each scene restarts its walkers; with the same framing a figure that just arrived jumps back to the start.
7. **Pin what points at the picture** (`plate: true`; checked, a warning). A push-in moves the picture out from under a frame-anchored arrow or tape.
8. **No punch-in cuts on motion lines**, not even by hand. A cut restarts the walkers and moves pinned overlays; the motion carries the pace instead.
9. **Stay out of the caption band and the controls.** Cards and timer at y 0.26-0.27, signal-bar at 0.13, compare base at 0.37, a big card under the caption at 0.735. Reframe with `zoom` + `focus` when the subject sits in the band, and confirm with `motion.mjs frame`. At zoom 1 a 2:3 plate fills the frame height exactly, so plate v is frame y and `focus` alone cannot move anything up or down: zoom in as well.
10. **Measure, never guess, coordinates.** The balcony dim line sat 7% off until it was measured on a grid.
11. **Test cuts are not for publishing.** The crosswalk motion test used unverified 30m/30초.
12. **One session per episode folder.** Two sessions in crosswalk-green-time overwrote each other's configs.

## Related skills

- **sheet-to-sprites**: cuts the cut-out sheet into sprites and `sprites.json`.
- **shorts-research**: `facts.mjs trace` for every number on screen.
- **storybook-narration**: the voice takes and `timeline.json` the storyboard is built from. Extra takes are candidates until the user approves them.
- **storybook-video**: `probe-mp4.mjs` and the export details.
- **shorts-thumbnail**, **shorts-publish**: the cover and the upload sheets after export.

## Report

Tell the user, in their language: the motion beats (line, technique, caption), new art and sprites, the files changed (script, storyboards, engine copies), the review still paths, the MP4 path with probe, sync and mix results, the claims behind every number on screen and which ones trace cannot see, any new overlay kind and which episodes have it, and any design rule broken on purpose.
