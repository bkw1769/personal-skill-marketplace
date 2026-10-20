# Overlay kinds

Read from `src/shorts/_engine/video/js/scenes.js` and `build-storyboard.mjs` on 2026-10-20. Episode pages run their own older copies of the engine, so a kind listed here may be missing in an episode (see `engine.md`). Nothing here is test-gated: the engine is a browser prototype, so confirm anything unusual with a still.

## Common rules

**Units.** The frame is 1080 x 1920. Positions (`x`, `y`, `from`, `to`, `box`, `paths`) are fractions of the frame, x times 1080 and y times 1920, unless the overlay has `plate: true`. Sizes (`size`, `width`, `h` in signal-bar) are pixels on that frame. `ACCENT` is `#ffd23f`.

**Script fields (script.json).** The builder turns these into `start` and `end` on the story clock:

| Field | Meaning |
|---|---|
| `kind` | One of the kinds below. The engine skips an unknown kind silently; the checker reports it. |
| `at` | Seconds after the line's voice start. The scene itself starts 0.08 s earlier (0 for the first line, whose voice starts at least 0.15 s in). Default 0; may be negative (`-0.08` is the scene start). |
| `at_chunk` | Start at caption chunk n (0-based). Wins over `at`, so there is no offset inside a chunk: to start later than a chunk, use `at` and check it in every take, because chunk times differ per take. |
| `until` | Write `"end"`. The value is ignored: every overlay ends at the end of its line unless `until_chunk` is set. |
| `until_chunk` | End at the start of caption chunk n. |
| `plate` | `true`: positions are plate fractions and follow the camera (below). |
| `claims` | Claim ids from `research/facts.json` for every number the overlay shows. |
| `not_facts` | Digits shown that are not facts (`["9"]` on the countdown panel). Keep it short. |

Every other field is copied to the storyboard as written. An out-of-range `at_chunk` or `until_chunk` becomes `null`: a null end means the overlay never shows, and a null start shows it from the start of the video until its end (a timer's `dur` also becomes null, so it runs that whole span). `motion.mjs check` catches both, in the script and in the storyboard; run it before opening the page.

**Drawing.** An overlay is drawn while `start <= T < end`. Overlays draw in array order (lines in order, then each line's overlays in order) after the plate and the layers, and before captions. A kind that throws (for example `arrow-flow` without `to`) is not caught: it stops the render loop and any running export. Run the checker before opening the page.

**Sound.** `score.js` adds a pop on `number`, `check`, `keyword` (620 Hz) and `xmark` (260 Hz), and a softer pop on `ring`, `squeeze` and `buckle`. The other kinds are silent.

**Chunk cuts.** The builder makes punch-ins only when script.json has `"cuts": "chunk"`. Then, inside each shot, it cuts at a chunk boundary only when at least 1.3 s of the shot lies on both sides, alternating a punch-in and a return. It makes no cut on a line with an ANCHORED overlay (`tape`, `arrow-flow`, `dim`, `label`), with any `plate: true` overlay, or with a shot that has a `layers` field (even an empty one). Other frame overlays stay put while a punch-in zooms the picture under them.

**Time.** `dur` (timer, signal-bar, squeeze, buckle) is clamped by `fitMotion` to at most the overlay length minus 0.3 s, never below 0.2 s. `grow`, `count`, `blink` and `period` are never clamped, so keep them short of the line. `grow`, `count`, `dur` and `period` must be above 0 (checked): the engine divides by them, 0 draws NaN, and `frost` (grow) and `pulse-path` (period) throw.

**Holding an overlay on the next line.** An overlay always ends with its line, so to keep a finished diagram on screen, repeat it on the next line with `"grow": 0.01, "at": -0.08`. That starts it at the next scene's start, which is exactly where the first one ends. With `"at": 0` it starts 0.08 s later and blinks off for 2-3 frames at every such cut (`motion.mjs check` warns when the same kind, place and text end and restart less than 0.1 s apart). Only grow-driven kinds hold cleanly: `tape` and `frost`. `compare` fades its panel in again over 0.2 s. Every other kind re-runs what `grow` does not control (arrow-flow's 0.6 s tip, dim's 0.5 s, ring's 0.45 s draw-on, label's 0.2 s fade) or pops in again, and `score.js` plays its pop again (number, keyword, xmark, check, ring, squeeze, buckle). The repeat's first frame can still land inside its 0.01 s grow and show it part-drawn for that one frame.

## plate: true

With `plate: true`, positions are fractions of the plate image (u across, v down), measured on the PNG. Every frame, `onFrame` maps them through the current camera: frame x = (cam.x + u * plate width * k) / 1080, where k = cover-fit scale x zoom (1.25 x zoom for a 1024 x 1536 plate), and the same for y. The overlay then rides the push-in or pan and stays on its spot. `motion.mjs frame <storyboard> <scene-id> <u,v>...` prints where a point lands at the scene start and end (the full mapping is in `engine.md`, Camera).

Converted: `from`, `to`, `box` (both corners), `x` and `y` (only when both are given), every point of `paths`, and `r` and `gap` (as fractions of the plate width, only when given).

Never converted: pixel sizes (`size`, `width`, `textSize`), `w`, `h`, `bw`, `textDx`, `textDy`. These stay in frame units and do not grow with the zoom.

Use it for anything that points at the picture: the tape along the crossing, frost on the meter box, an arrow through a pipe, a digit on a device, rings, pulse paths, squeeze arrows. Leave frame-anchored the cards that point at nothing: number callouts, the timer, the signal bar, X and check over a statement. `motion.mjs check` warns about a frame-anchored `label`, `arrow-flow`, `dim`, `tape`, `ring`, `pulse-path`, `squeeze` or `frost` (the `pin` kinds in its `KINDS` table), and reports an error when the episode page's engine copy has no `onFrame` to pin with.

Caveats:
- Never put `plate: true` on a `timer` with a `to`: `onFrame` reads `to` as a point, throws, and the frame fails (checked, an error). Without `to` it works, but a timer is a card and stays frame-anchored (a warning).
- A plate overlay that spans a shot change jumps to the same plate fraction on the next picture. Start it on its own shot (`at_chunk` equal to that shot's `from_chunk`) or keep one shot for the line. The end side leaks too: a shot starts 0.05 s before its `from_chunk`, so an overlay that ends with `until_chunk` at the next shot's `from_chunk` is drawn on the next picture for 0.05 s (1-2 frames), and no script field ends it earlier. `motion.mjs check` warns when a `plate: true` overlay is on screen over two pictures.
- If the plate is missing (`image` not in the page's `plates`), the scene draws "missing image", no layers, and plate fractions are used as frame fractions. `motion.mjs check` reads `plates` in every page's `story.config.js`.
- With `keyword`, only `y` matters and it is converted only when `x` is also given.

## keyword

The big topic word on the first shot (`초록불`, `동파`). One per video.

| Field | Default | Unit | Meaning |
|---|---|---|---|
| `text` | required | | One line. No wrapping, no shrink to fit. |
| `y` | 0.17 | frame fraction | Text centre. `x` is not read: always centred. |
| `size` | 170 | px | Weight 900, black outline. |
| `color` | ACCENT | | |

```json
{ "kind": "keyword", "text": "초록불?", "at": 0, "until": "end" }
```

Scales in over 0.25 s with an overshoot and vanishes at the end. Keep it to 2-4 syllables: 170 px glyphs overflow a 1080 px frame at about 6 characters.

## number

A number callout that counts up to its value (`27.6% ↓`, `0.709m`), with an optional second line.

| Field | Default | Unit | Meaning |
|---|---|---|---|
| `text` | required | | Prefix + number + rest, e.g. `영하 10도`. |
| `x`, `y` | 0.5, 0.3 | frame fraction | Text centre. Use y 0.26 to stay above the captions. |
| `size` | 150 | px | Weight 900. |
| `color` | ACCENT | | White (`#ffffff`) for device digits. |
| `count` | 0.7 | s | Count-up time. |
| `static` | false | | `true`: never counts. |
| `sub` | none | | Second line, white, 0.36 x size, 0.78 x size below. Never counts. |

```json
{ "kind": "number", "text": "0.709m", "static": true, "sub": "초속, 농촌 노인 여성 평균",
  "x": 0.5, "y": 0.26, "at_chunk": 1, "until": "end", "claims": ["c-elder-gait"] }
```

Counting is the default, and a count passes through wrong numbers. Use `static: true` for values that read wrong mid-count (`0.709m`, temperatures, device digits). Only the first number group counts (`4~7초` counts the 4). A year does not count when `년` follows the number (spaces allowed: `1995 년` too). The counted group is the first run of digits, `.` and `,`, so punctuation touching the number is read as part of it:
- A dotted value (`2024.10.20`, `1.2.3`) shows `NaN` for the whole overlay, not only while counting; use `static: true`.
- `27.` loses its period (shows `27`).
- A text with no digits but a `.` or `,` is corrupted: `정말.` shows `정말NaN`, `그런데, 왜` shows `그런데0 왜`. Never put `.` or `,` in a counting text without digits.

`motion.mjs check` reports the NaN and `0` cases. `count: 0` shows `NaN` on its first frame (rejected by the checker); use `static`. A `\n` after the number stops the count (one before it does not) and is never a line break. Trace does not read `sub`.

## label

A dark pill with text, optionally with a white pointer line to a spot.

| Field | Default | Unit | Meaning |
|---|---|---|---|
| `x`, `y` | required | frame fraction | Pill centre. No defaults: missing means nothing is drawn. |
| `text` | required | | |
| `size` | 54 | px | Weight 800. |
| `bg` | `rgba(17,17,17,0.82)` | | Pill fill. |
| `color` | `#fff` | | Text only. The pointer is always white. |
| `to` | none | [x, y] frame fraction | Pointer end, with a 12 px dot. |

```json
{ "kind": "label", "plate": true, "text": "효소", "x": 0.3, "y": 0.14, "to": [0.52, 0.33], "size": 62,
  "bg": "rgba(226,85,63,0.92)", "at": 0.5, "until": "end" }
```

Fades in over 0.2 s. With `plate: true` both the pill and the pointer end follow the camera. ANCHORED: the line is never punch-cut, even without `to`.

## arrow-flow

A dashed arrow that draws on from `from` to `to` and keeps flowing (water, air, force).

| Field | Default | Unit | Meaning |
|---|---|---|---|
| `from`, `to` | required | [x, y] | Tail and tip. |
| `width` | 16 | px | Shaft stroke; the head is 3.2 x width. |
| `color` | `#4fd1ff` | | Shaft and head. |
| `text` | none | | At the middle of the full arrow, 70 px up. |
| `textDx`, `textDy` | 0 | frame fraction | Text offset. |
| `size` | 58 | px | Text size, not the arrow size. |

```json
{ "kind": "arrow-flow", "plate": true, "from": [0.27, 0.47], "to": [0.88, 0.47],
  "color": "#7cc8ff", "width": 22, "at": 0.2, "until": "end" }
```

The tip grows over a fixed 0.6 s (`grow` is not read). The dashes march toward the tip at 90 px/s for the whole overlay, which reads as flow. The text appears at once, before the tip reaches it. ANCHORED.

## dim

A dimension line with end ticks and a static measurement.

| Field | Default | Unit | Meaning |
|---|---|---|---|
| `from`, `to` | required | [x, y] | Ends. |
| `color` | ACCENT | | Line, ticks and text. Line width fixed at 7 px. |
| `text` | none | | Never counts. Shows once the line is 60% grown. |
| `textDx`, `textDy` | 0, -0.035 | frame fraction | Text offset from the middle. `textDy` is vertical, not perpendicular to the line. |
| `size` | 72 | px | Text size. |

```json
{ "kind": "dim", "from": [0.455, 0.285], "to": [0.655, 0.285], "text": "60cm 이상", "textDy": -0.05,
  "at": 0.2, "until_chunk": 1, "claims": ["c-hatch-dimensions"] }
```

(balcony-escape-wall l09, an older engine copy without plate pinning; use `plate: true` in new work.) The line grows out from the middle over 0.5 s; the ticks are there from the first frame. Use `dim` for a static size, `tape` when the length itself is the news. ANCHORED.

## tape

A measuring tape that runs from `from` to `to` while its number counts up with it.

| Field | Default | Unit | Meaning |
|---|---|---|---|
| `from`, `to` | required | [x, y] | Start and end. |
| `grow` | 1.2 | s | Run time. `0.01` shows it finished (a hold on the next line, with `"at": -0.08`). |
| `color` | ACCENT | | Line, ticks and text. |
| `ticks` | 10 | count | Inner ticks appear as the tip passes them. |
| `text` | none | | The number counts with the tape. |
| `textAt` | middle | | Default: the middle of the part drawn so far, so while the tape grows the counting number slides along at half the tip's speed. `"end"` rides the tip. |
| `textDx`, `textDy` | 0, 0 | frame fraction | Text offset. With no offset the text sits on the line. |
| `size` | 96 | px | Text size. |

```json
{ "kind": "tape", "plate": true, "from": [0.29, 0.79], "to": [0.29, 0.176], "grow": 1.2,
  "text": "20m", "size": 88, "at": 0.2, "until": "end", "claims": ["c-example-20m"] }
```

There is no `static` and no comma support: `1,200m` counts only the `1`. A `.` touching the number joins it (`길이.` shows `길이NaN`; checked). `grow: 0` shows `NaN` on its first frame (rejected by the checker); use 0.01. A long `grow` is not shortened by `fitMotion` and can be cut off. ANCHORED.

## timer

A stopwatch ring that fills while the seconds count from 0 to `to`.

| Field | Default | Unit | Meaning |
|---|---|---|---|
| `x`, `y` | 0.8, 0.2 | frame fraction | Centre. Use y 0.27. |
| `size` | 120 | px | Radius. |
| `dur` | overlay length | s | Count time. Always set it. |
| `to` | 10 | | Final value. A whole number: the count is floored, so `4.5` shows `4` (checked). |
| `unit` | `초` | | `""` allowed. |
| `color` | `#34e07a` | | Running arc. It turns `#ff6b5a` when done. |

```json
{ "kind": "timer", "x": 0.8, "y": 0.27, "size": 110, "dur": 3.3, "to": 27,
  "at": 0.3, "until": "end", "claims": ["c-example-20m"] }
```

The value is floored, so `to` shows only when the count is complete. Without an explicit `dur` the count never completes (the overlay ends first) and the timer never reaches `to`: it stops one or more short (a `to` of 100 over 1 s ends on 96). Time is compressed on purpose (27 s counted in about 3.3 s). Never `plate: true`. Trace does not read `to`: check it by hand.

## signal-bar

A pedestrian-signal pill: a green walk bar that drains (never shorter than a round pill of width `h`), blinks for its last `blink` seconds, then the bar empties and the lamp turns red.

| Field | Default | Unit | Meaning |
|---|---|---|---|
| `x`, `y` | 0.5, 0.12 | frame fraction | Bar centre. The lamp hangs to the left of the bar. |
| `w` | 0.7 | frame width fraction | Bar length. |
| `h` | 64 | px | Bar height (pixels, unlike `w`). |
| `dur` | overlay length | s | Drain time. Set it, or the bar never empties and the lamp never turns red. |
| `blink` | 1.2 | s | Blinking time before empty (0.25 s on, 0.25 s off). |
| `color` | `#34e07a` | | Bar fill only; lamp colours are fixed. |

```json
{ "kind": "signal-bar", "x": 0.5, "y": 0.13, "w": 0.72, "dur": 3.2, "blink": 1.8, "at": 0.3, "until": "end" }
```

Use it only on a line with no timer: both mean "time". `fitMotion` shortens `dur` but not `blink`, so on a fast take the bar can blink almost the whole time (crosswalk l06: dur 1.9, blink 1.8). Keep `blink` under half of `dur`.

## xmark and check

A red X over a myth, a green check over the right answer.

| Field | Default | Unit | Meaning |
|---|---|---|---|
| `x`, `y` | 0.5, 0.4 | frame fraction | Centre. |
| `size` | 260 | px | Side length. |

```json
{ "kind": "xmark", "x": 0.5, "y": 0.22, "size": 200, "at_chunk": 1, "until": "end" }
{ "kind": "check", "plate": true, "x": 0.74, "y": 0.44, "size": 170, "at_chunk": 1, "until": "end" }
```

Pops in over 0.25 s. Colours are fixed (`#ff3b30`, `#34c759`); `color` is not read. Frame-anchored is right when the mark judges a statement (water-meter l13); pin it when it marks a thing in the picture (onion-tears l09).

## pulse-path

Glowing pulses running along one or more polylines (nerve signal, current, blood flow).

| Field | Default | Unit | Meaning |
|---|---|---|---|
| `paths` | required | [[[x, y], ...], ...] | One or more polylines. No empty path. |
| `size` | 16 | px | Core radius 0.5 x size, glow 2.2 x size. |
| `color` | ACCENT | | Glow and trace. |
| `period` | 1.4 | s | Time for one run along a path. Above 0: `period: 0` throws every frame (checked). |
| `count` | 2 | | Pulses per path (here a count, in `number` seconds). |
| `slow` | 1 | factor | Speed reached after `slowDur` (0.3 = slows to 30%; 0 = the pulses slow to a stop and freeze). |
| `slowDur` | overlay length | s | |

```json
{ "kind": "pulse-path", "plate": true, "period": 0.9, "count": 3, "size": 20, "color": "#fff1c4", "slow": 0.3,
  "paths": [[[0.08, 0.455], [0.35, 0.445], [0.62, 0.445], [0.88, 0.435]]], "at": 0, "until": "end" }
```

Pulses run from the first point of each path to its last; list the points in the direction of the flow. Not ANCHORED: always use `plate: true` over picture features, which also stops punch-ins. Measure every point on the grid.

## squeeze

Two arrows pinching a spot, closing and then beating (constriction, pressure).

| Field | Default | Unit | Meaning |
|---|---|---|---|
| `x`, `y` | required | frame fraction | Pinch centre. |
| `angle` | 90 | degrees | Arrow axis: 90 from above and below, 0 from the sides. |
| `gap` | 0.06 | frame width fraction | Centre to tip; with `plate: true` a given `gap` is a plate-width fraction. |
| `close` | 0.45 | fraction | Share of the gap closed. |
| `dur` | 0.8 | s | Closing time, starting 0.25 s in. |
| `period` | 0.9 | s | Beat after closing. |
| `size` | 110 | px | Arrow length. |
| `color` | `#ff6b5a` | | |
| `text`, `textDx`, `textDy`, `textSize` | none, 0, -0.12, 64 | | Optional label above. |

```json
{ "kind": "squeeze", "plate": true, "x": 0.71, "y": 0.45, "gap": 0.075, "angle": 90, "size": 170, "at_chunk": 1, "until": "end" }
```

The beat phase counts from `start`, so the gap can jump slightly when the close finishes.

## ring

A circle drawn on around a spot, then breathing.

| Field | Default | Unit | Meaning |
|---|---|---|---|
| `x`, `y` | required | frame fraction | Centre. |
| `r` | 0.12 | frame width fraction | Radius; with `plate: true` a given `r` is a plate-width fraction. |
| `color` | `#ff3b30` | | |
| `width` | 14 | px | Stroke. |

```json
{ "kind": "ring", "plate": true, "x": 0.445, "y": 0.29, "r": 0.13, "at_chunk": 1, "until": "end" }
```

Draws on over 0.45 s. Always a circle, never an ellipse.

## buckle

A cross-section card: flesh shrinks and the skin folds into waves while pull arrows grow. Big, so it goes under the caption.

| Field | Default | Unit | Meaning |
|---|---|---|---|
| `x`, `y` | 0.5, 0.42 | frame fraction | Card centre. Use y 0.735 (under the caption band). |
| `w`, `h` | 0.76, 0.17 | frame width / height fraction | Card size. Not pinned by `plate: true`. |
| `dur` | 1.8 | s | Fold time, starting 0.4 s in. |
| `waves` | 5 | count | Number of folds (full waves); draws `waves - 1` pull arrows. |
| `skin`, `flesh` | none | | Labels (top left, bottom right). Not traced. |
| `bg`, `skinColor`, `fleshColor`, `color`, `labelColor` | `#f4ead8`, `#fbd3bd`, `#f2a98a`, `#e2553f`, `#1d2b4a` | | Card, layers, arrows, labels. |

```json
{ "kind": "buckle", "x": 0.5, "y": 0.735, "w": 0.76, "h": 0.14, "dur": 2.6, "skin": "피부", "flesh": "속살", "at": 0.2, "until": "end" }
```

If `fitMotion` clamps `dur`, the fold still starts 0.4 s in and ends 0.1 s after the overlay, so it never completes. Leave at least `dur + 0.7` s of line.

The arrows sit under the skin's crests (its highest points on screen), the opposite of the engine comment ("troughs (pulled down) at them"), so the card may not read as skin tied down at those points. Check a still before relying on that reading, or fix the sign in the engine.

## frost

Ice spreading over a box: branching frost veins plus a pale icy veil, growing from a point.

| Field | Default | Unit | Meaning |
|---|---|---|---|
| `box` | required | [x, y, w, h] | Clip rectangle (top-left corner, width, height). |
| `from` | box centre | [x, y] | Crystal origin. |
| `grow` | 2 | s | Growth time. `0.01` shows it fully frozen (a hold on the next line, with `"at": -0.08`). `grow: 0` throws on its first frame and stops the render loop and any export; the checker rejects it. |
| `seed` | 7 | | Pattern seed. Change it for a different pattern. |
| `arms` | 26 | count | Number of veins. |

```json
{ "kind": "frost", "plate": true, "box": [0.29, 0.24, 0.59, 0.43], "from": [0.576, 0.498], "grow": 2.4, "at": 0.4, "until": "end" }
```

The pattern is seeded and re-drawn from the same seed every frame; it grows by scaling, so no branch pops in. The box edge is a hard rectangle: fit the box to a real edge in the picture (the meter box opening). No colour option. Use over a clean base still with no ice painted in. Not ANCHORED: use `plate: true`.

## compare

Bars growing side by side for a before/after amount, with labels under them and a printed text over them.

| Field | Default | Unit | Meaning |
|---|---|---|---|
| `items` | required | [{label, value, text?, color?}] | One bar each. `value` sets the height and is never printed; `text` is printed. |
| `x` | 0.5 | frame fraction | Group centre. |
| `y` | 0.42 | frame fraction | Baseline (bar bottoms), not the centre. Use 0.37. |
| `h` | 0.2 | frame height fraction | Tallest bar. |
| `bw` | 0.16 | frame width fraction | Bar width. |
| `gap` | 0.08 | frame width fraction | Between bars. |
| `min` | 0 | value | Value drawn at zero height. |
| `grow` | 0.9 | s | Growth time. |

Bar colours default to `#4fa8ff` (first) and `#bfe3ff` (others).

```json
{ "kind": "compare", "x": 0.5, "y": 0.37, "h": 0.16, "bw": 0.2, "min": 80,
  "items": [{ "label": "물", "value": 100 }, { "label": "얼음", "value": 109, "text": "+9%" }],
  "at_chunk": 1, "until": "end", "claims": ["c-water-expands-9pct"] }
```

The texts appear once the bars are 85% grown. Bars are scaled so the largest value is full height. `min` exaggerates the difference (min 80 draws 100 vs 109 as 20 : 29); use it only when no axis or values are drawn and the text states the real change. Use `min: 0` when heights must read exactly. `min` must be below every value; `min` equal to the largest value divides by zero (the checker rejects both). Equal values draw equal bars. The panel fades in over a fixed 0.2 s, so a repeat with `grow: 0.01` still fades in. Trace does not read `items[].text`: put the claim on the overlay and check it by hand.

## reveal

A second still of the same composition fades in over the shot under the same camera, spreading as a soft disc from a point until it covers the frame. Use it for a change of state that should look like the picture itself changing (freezing, rusting, lights coming on) rather than lines drawn on top. Added 2026-10-21 for the water meter: the user found the frost veins over the meter odd and asked for a frozen picture instead.

| Field | Default | Unit | Meaning |
|---|---|---|---|
| `image` | required | plate name | The second still. It must be an EDIT of the shot's plate (same framing and size) or the two will not line up. The page's `plates` must list it (the checker reports a missing one). |
| `from` | frame centre | [x, y] | Where the change starts. With `plate: true` it is a plate point (the meter centre). |
| `grow` | 1.6 | s | Time until the disc covers the whole frame (ease in-out). |
| `feather` | 0.25 | frame width fraction | Width of the soft edge. 0.3 reads as spreading, not as a hard circle. |

```json
{ "kind": "reveal", "image": "box-frozen", "plate": true, "from": [0.576, 0.498], "grow": 1.8, "feather": 0.3, "at_chunk": 1, "until": "end" }
```

Make the second still with `references/art-for-layers.md` section 2 (an EDIT that names every fixed element and changes only the state). To keep the changed state on the next line, make that line's shot the second still itself (water meter l04 uses `box-frozen` as its shot), not a repeated reveal. Pin it (`plate: true`) so `from` stays on its spot; the second still always follows the shot's camera.

## stages

A ladder card for graded levels (forecast stages, warning levels): one row per level with a name pill whose colour deepens with the level and the condition beside it. Rows slide in one after another. Added 2026-10-21 for Seoul's 4-stage freeze forecast.

| Field | Default | Unit | Meaning |
|---|---|---|---|
| `rows` | required | [{name, text, color?}] | 2 or more levels, mildest first. Default pill colours: `#bfe3ff`, `#7cc0ff`, `#3d8bff`, `#1f4fd8` (the 5th and later reuse the last). |
| `title` | none | text | Small heading above the rows (what the levels are measured by). |
| `x` | 0.5 | frame fraction | Card centre. |
| `y` | 0.2 | frame fraction | Top of the rows area. With a title and 4 rows the card ends near y 0.57, above the caption band. |
| `w` | 0.84 | frame width fraction | Row width. |
| `rh` / `gap` | 128 / 22 | px | Row height and gap. |
| `step` | 0.35 | s | Delay between rows. |
| `size` | 50 | px | Condition text size. |

```json
{ "kind": "stages", "title": "일 최저기온 기준", "x": 0.5, "y": 0.2,
  "rows": [{ "name": "관심", "text": "영하 5도 위" }, { "name": "주의", "text": "영하 5~10도" },
           { "name": "경계", "text": "영하 10~15도, 2일 이상" }, { "name": "심각", "text": "영하 15도 아래, 2일 이상" }],
  "at": 0.2, "until": "end", "claims": ["c-forecast-stages"] }
```

Frame-anchored card (no `plate`). Trace does not read `rows`: put the claim on the overlay and check every row against the claim's text and caveat by hand (the water meter's 관심 boundary is written 초과 in 2023-24 and 이상 in 2025, so the row says 영하 5도 위).

## stamp

A small rounded badge in the top-left corner that marks an imagined picture: the doubt "fixed" and the extreme shot of the four-step story (shorts-research `references/story-structure.md`, design rule 14). Added 2026-10-21.

| Field | Default | Unit | Meaning |
|---|---|---|---|
| `text` | 상상 장면 | text | Badge text. Keep it short and never a number. |
| `x`, `y` | 0.05, 0.085 | frame fraction | Top-left corner of the badge. |
| `size` | 44 | px | Text size. |
| `color` | dark 72% | CSS colour | Badge fill; the outline is the channel yellow. |

```json
{ "kind": "stamp", "at": 0, "until": "end" }
```

Frame-anchored, fades in over 0.2 s. Put it on every line marked `"imagined": true`, covering the whole line; the checker reports an imagined line without one and warns when it starts late or ends early. It is not a diagram: like `dim_bg` it does not count toward `--max-overlays`, so an imagined line can still carry two diagrams.


Lays a 45% black veil over the whole frame (plate and layers, not captions), leaving the picture at 55% brightness, fading in over 0.2 s, so a card reads.

```json
{ "kind": "dim_bg", "at": 0, "until": "end" }
```

No fields. It must come before the overlays it should sit under, because overlays draw in array order.

## Adding a new overlay kind

Most topics need one picture the menu cannot draw (frost and compare were added for the water meter). Add it to the engine, never only to an episode copy, so the next episode inherits it.

1. **Write the draw function.** Add `kindName(ctx, o, T) { ... }` to the `OVERLAY` object in `src/shorts/_engine/video/js/scenes.js` (quote names with a dash: `'signal-bar'(ctx, o, T)`). Add the kind to the list in the file's header comment, with a one-line comment above the function that names its fields and defaults.
   - Positions arrive as frame fractions: multiply by `W` and `H` (1080, 1920 from `util.js`).
   - Time is the story clock `T`. Drive the animation with `seg(T, o.start, o.start + o.grow)` and the easings in `util.js` (`easeOut`, `easeInOut`, `backOut`). Use `?? default` for numbers that may be 0 and `|| default` only where 0 is meaningless.
   - Set `ctx` state freely: `drawOverlays` wraps each call in `save()` / `restore()`. Use `ctx.globalAlpha *= ...` rather than `=`, so a parent fade still applies.
   - Validate nothing at draw time; the checker does that. A throw stops the render loop.
2. **Make randomness seeded.** Call `const r = rng(o.seed ?? 7)` inside the function, every frame, and draw all random values from `r()` in the same order. The same sequence then repeats every frame, so the picture does not flicker, and every export and every voice take look the same. Never use `Math.random()`. Grow by scaling with progress (frost's `reach * a`), not by adding random parts over time.
3. **Make it pinnable.** `onFrame` in the same file converts `from`, `to`, `box`, `x` + `y`, `paths`, `r` and `gap` for `plate: true`. Reuse those names for positions. If the kind needs a new positional field (for example `points`), add its mapping to `onFrame`; for a size that should follow the zoom, add its key to the `['r', 'gap']` list as a plate-width fraction. Do not use `to` for a non-point value.
4. **Fit the timing.** Name a run time `dur` if it should end before the cut on a fast take: `fitMotion` clamps every overlay's `dur`. Other names (`grow`) are not clamped.
5. **Chunk cuts.** If the kind marks a spot in the picture, either document that it needs `plate: true`, or add it to `ANCHORED` in `src/shorts/_engine/build-storyboard.mjs` so its line is never punch-cut.
6. **Sound (optional).** Add the kind to one of the pop lists in `src/shorts/_engine/video/js/score.js`.
7. **Checker.** Add the kind to the `KINDS` table in `<skill-dir>/scripts/motion.mjs`: `required` (fields besides start/end), `coords` (scalar x/y fractions), `points` ([x, y] fields), `boxes`, `paths`, `shows` (every text field the function draws), and the flags `numbers` (may show numbers that need claims; set it whenever `shows` is not empty or the kind prints a number from another field), `time` (means "time", so it may not share the screen with another time kind), `motion` (animates beyond a pop-in, so `stills` lists its scenes) and `pin` (points at the picture, so a frame-anchored one is warned about). If it divides by a new run-time field, add the field to `TIMED`. Add a case to `tests/shorts-motion.test.mjs` in the marketplace repo; the suite gates 100% line and branch coverage of `scripts/`, and the test must really exercise the new entry. If the project keeps a copy of this skill in `.claude/skills/shorts-motion/`, update it too. Add a section to this file.
8. **Ship it to the episode.** Copy `src/shorts/_engine/video/js/` into `src/shorts/episodes/<id>/video/` and every `video-<voice>/` of that episode (SKILL.md step 5). Older episodes keep their copies; `motion.mjs check` reports a page whose copy lacks a kind it uses.
9. **Review.** Capture the start, the middle and the end of the overlay, plus the same time twice to confirm the frame is identical. Record the new kind in the project's `docs/MEMORY.md` and `docs/DECISIONS.md`.
10. **Numbers.** If the kind prints a number from a field other than `text` or `label`, trace will not see it. Put `claims` on the overlay and check it by hand, or print it through `text`.
