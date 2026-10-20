# Sprite layers

Read from `src/shorts/_engine/video/js/scenes.js` (`layerAt`, `along`, `drawLayers`) and `build-storyboard.mjs` (`fitMotion`, `chunkCuts`) on 2026-10-20. Only crosswalk-green-time uses layers so far, so every number below comes from that episode. Confirm anything new with a still.

## What a layer is

A shot can carry `layers`: cut-out sprites that move along paths over the shot's plate. They are drawn after the plate and before the overlays, sorted back to front every frame. The plate must load: a shot whose `image` is missing draws no layers. Sprites come from the `sprites` manifests in `video/story.config.js`. An unknown sprite name is skipped silently by the engine; the checker reports it.

```json
{ "image": "crosswalk-top-empty", "motion": "pull-out", "zoom": [1.12, 1.04], "focus": [0.5, 0.5], "tilt": [0.28, 0.74],
  "layers": [{ "sprite": "walker-navy", "path": [[0.52, 0.84], [0.52, 0.2]], "h": 0.074, "gait": 1.9, "t": [0.3, 3.6] }] }
```

## Layer fields (`shots[].layers[]`)

| Field | Default | Unit | Meaning |
|---|---|---|---|
| `sprite` | required | | Name in `sprites.json`. |
| `path` | required | [[u, v], ...] plate fractions | Where the sprite's bottom-centre goes. Two points for a straight walk; more for a turn. |
| `t` | whole scene | [t0, t1] s from the scene start | When the path is walked. Before t0 the sprite stands at the first point, after t1 at the last. |
| `h` | 0.1 | fraction of the plate height | Sprite height. |
| `gait` | 1.8 | cycles per second | Walk rock and bob. 0 glides. |
| `ease` | linear | `"inOut"` | Easing of the progress along the path. |
| `rot` | 0 | degrees | Rotation about the anchor point. 180 for top-down walkers heading down. |
| `flip` | false | | Mirror left-right. |
| `shadow` | 0.35 | opacity | Soft cast shadow; 0 turns it off. |
| `depth` | 1 | factor | Scales the figure's position and size about the frame centre every frame: camera parallax (below). |
| `alpha` | 1 | | Opacity of sprite and shadow. |

Shot fields that matter for layered shots: `image` (the empty plate), `motion`, `zoom` [from, to], `focus` [u, v], `tilt` [v0, v1], and `tiltBlur` (default 1, read by the engine but not listed in its header comment).

## Coordinates

**Plate fractions.** u = pixel x / plate width, v = pixel y / plate height, measured on the plate PNG (see `art-for-layers.md`). They do not depend on the camera: the engine maps them through the current zoom and pan every frame, so the figure stays on the road while the camera pushes in.

**The anchor is the bottom-centre of the sprite** (`sprites.json` anchor `bottom-center`). For an upright figure that is the feet. For a top-down figure seen from above it is the rear edge of the figure. The figure covers v - h to v. With `rot: 180` it is drawn upside down about that point and covers v to v + h. Judge "has arrived" by the middle of the figure: h/2 above the anchor for an upward walker, h/2 below it for a `rot: 180` walker. Crosswalk walkers end at v 0.2 (upward, middle at about 0.164, past the top curb at 0.176) and v 0.8 (downward, middle at about 0.836, past the bottom curb at 0.79).

**h is constant along the path** (so is `depth`): a figure is never scaled by perspective. Keep paths at one depth: top-down plates, or side-on plates moving parallel to the picture. On a perspective plate (a line that recedes into the picture, pavers that shrink) keep the v range small, under about 0.05, or the figure is the wrong size at one end.

**h is relative to the plate height**, not the frame. A 1024 x 1536 (2:3) plate fills the 1920 px frame height at zoom 1, so h 0.072 is about 138 px there, and the zoom multiplies it. Crosswalk: adults 0.07-0.075, child 0.055. Match the size of the figures in the original shot with people.

**What is on screen.** A 2:3 plate in a 9:16 frame is cropped at the sides: at zoom 1 with focus 0.5 only u 0.078 to 0.922 is visible. A higher zoom shows less. A path that starts outside the visible window makes a figure walk in from off-frame; that is the only way to make one enter, because a layer is visible for its whole scene.

**Path length is measured in plate-fraction units.** One v unit is 1536 px but one u unit is 1024 px on a 2:3 plate. Straight vertical paths compare directly. A path that mixes directions changes its pixel speed from segment to segment, so compare pixel lengths (u x width, v x height) when speed matters.

## Gait, rotation, shadow, depth, blur

- **gait.** Each unit is one full side-to-side rock (0.05 rad) with two bobs (2.5% of the height), so gait is about strides per second. The engine header calls it "steps per second". Used values: elder 1.1-1.2, default 1.8, navy walker 1.9, child 2.2-2.4. The phase freezes when the figure stops, so it stops mid-stride instead of marching on the spot. Use 0 for things that glide (a cart, a car).
- **rot.** A top-down cut-out sheet draws every figure walking UP. A figure walking down the plate needs `rot: 180`. Sideways top-down walkers would need 90 or -90; that has not been tried yet, so check a still. Side-view figures use `flip`, never `rot` (below).
- **flip.** Mirrors the sprite. Useful for side-view figures walking left vs right.
- **shadow.** A soft ellipse falls down-right of the anchor point, because the plates are lit from the upper left. It does not bob and does not turn with `rot` or `flip`. This is why the cut-out sheet must have no cast shadows: a baked shadow would double it. With `rot: 180` the anchor is at the top of the drawn figure, so the shadow sits near the figure's rear end; it looked fine on the crosswalk, but check a still on a new plate.
- **depth.** Every frame, the figure's offset from the frame centre and its size are multiplied by `depth`. That is camera parallax: under a pan or zoom the figure moves `depth` times as fast as the plate, as the engine's header comment says. At `depth` other than 1 it also no longer sits on its (u, v) spot unless that spot is at the frame centre, and it is drawn `depth` times as big. 1 keeps the figure locked to the plate; above 1 it floats in front. Leave it at 1 on a diorama plate.
- **tilt.** `tilt: [v0, v1]` is the band the plate keeps sharp (its tilt-shift is painted in). A figure whose anchor is outside the band blurs 3 px per 0.1 of v, up to 8 px, times `tiltBlur`. Without `tilt` no layer blurs. Copy the plate's own band (crosswalk `[0.28, 0.74]`), so figures on the sidewalks are as soft as the painted sidewalks: on the grid, read the rows where the painted texture is still sharp (`art-for-layers.md`). Whether the blur radius is scaled correctly for down-scaled sprites has not been verified; look at a still.
- **Draw order.** By anchor v, ascending: lower on the plate is nearer and drawn later.
- **No tint.** Scene `light` does not affect shorts plates or layers. Sprites keep the colours of the sheet.

## Side-view figures

Not used in an episode yet (a side-on figure with a cane was planned for tactile-paving). What the engine does with one:
- **The anchor is the bottom-centre of the sprite's box, not the feet.** Once a prop sticks out (a cane tip ahead of the feet, a bag, wheels), the box centre sits somewhere between the contacts, not under the body. The shadow (down-right of the anchor) and the gait rock (a rotation about the anchor) pivot there, so check a still.
- **Draw the sheet facing RIGHT**, and use `flip: true` for figures walking left. No `rot`.
- **Every ground contact ends on one row** of the sheet (soles, cane tip, wheels), so the box bottom is the ground line. A figure whose cane tip ends higher than its feet floats or sinks.
- **Place it from the original still.** Measure the figure's box in the shot with people: its bottom-centre is the path's first point (u, v), its height is `h`. Do not place it by the feet.
- **Move it parallel to the picture** (a path along one plate row), because `h` does not change along the path.

## Timing

- **t counts from the scene start.** The scene starts 0.08 s before the line's voice (0 for the first line). Overlay `at` counts from the voice start. The 0.08 s difference is invisible: give a walker and a timer the same start number (walker `t: [0.3, 3.6]`, timer `at: 0.3`).
- **No t means the whole scene.** The figure then arrives exactly at the cut, and a faster voice makes it walk faster. Several layers without `t` in one scene keep their speed ratios in every take, which is what the l13 speed race relies on.
- **ease.** Linear for walkers: a constant speed reads as honest. `inOut` for things that start and stop (a door, a cart).
- **fitMotion, per take.** After building, each layer with `t` gets `t1 = min(t1, scene length - 0.3)` and `t0 = min(t0, t1)`. So the walk always finishes 0.3 s before the cut. Crosswalk l12 elder `[0.2, 4.4]` became `[0.2, 4.08]` for soft-m and `[0.2, 4.33]` for professor-m. Rebuild every take after a script edit.
- **Sync with a timer.** Set the walker's `t1` = timer `at + dur`. When the take is short, both are pulled in to 0.3 s before the end, so they still land together (l12 soft-m: both end at 45.71 s).
- **Every scene restarts its layers.** A shot change (`from_chunk`) starts a new scene and puts every figure back at its first point. The builder never punch-cuts a line whose shots have layers, and you should not add a cut by hand. Two consecutive layered shots on the same plate must change the framing or the cast (crosswalk l04 -> l05: four walkers at zoom 1.05 become one walker at zoom 1.12).

## Honest speeds

When the caption is about speed, the motion is the evidence. Path length divided by walking time must be proportional to the real speed.

1. Pick the reference walker's path, for example 0.84 -> 0.19 (length 0.65) over the scene.
2. Scale the other path by the speed ratio: 0.65 x 0.709 / 1.0 = 0.461, so the elder walks 0.84 -> 0.38.
3. Give both the same `t`, or none, so `fitMotion` keeps the ratio in every take.
4. Do not print the ratio. Only numbers from the ledger are written on screen (here `0.709m`, claim `c-elder-gait`).

When the caption is not about speed, keep speeds plausible and the cast consistent with the caption: under `다 건널 시간을 줍니다` nobody may still be on the road when the shot ends.

## Worked examples on crosswalk-top-empty

Plate map, measured on a 10% grid of the 1024 x 1536 plate: road from v 0.176 (top curb) to 0.79 (bottom curb), stripes u 0.33-0.69, walker lanes u 0.40-0.61, near sidewalk v 0.84-0.9, far side v 0.06-0.2, tape line at u 0.29, sharp band v 0.28-0.74. Exact JSON for each line is in `recipes.md`.

- **l04, busy crossing.** Four walkers without `t`: suit up (0.62 -> 0.06), grey and beige down with `rot: 180`, child up with `gait: 2.4` and `h: 0.055`. They fill the scene and set the place. The child ends mid-road (v 0.45 on a road that spans v 0.176-0.79), because a layer with no `t` reaches its path end exactly at the cut. That is a known exception to design rule 2, accepted only because this caption claims nothing about everyone crossing. To remove it, end the child's path at v 0.2 or less and rebuild.
- **l05, one walker on the clock.** The navy walker `t: [0.3, 3.6]` with the timer `at: 0.3, dur: 3.3, to: 27`: the ring reaches 27초 and turns red as he reaches the far curb. New cast and new framing against l04.
- **l12, protection zone.** Elder (`gait: 1.2`, `t: [0.2, 4.4]`) and child (`gait: 2.2`, `t: [0.4, 4.4]`) both reach the far curb within the timer's 36초. The caption says the time is extended for them, so they must make it.
- **l13, the twist.** Elder 0.84 -> 0.38 vs suit 0.84 -> 0.19 and beige 0.1 -> 0.75 over the same scene, no `t`. The elder stops mid-road while the others arrive. This is the only line where being left on the road is the point (l04's child also ends mid-road, the known exception above), and the caption is about exactly that. Against l12: zoom 1.08 -> 1.0, focus [0.45, 0.55], new co-walkers.
- **Motion test (hand-written storyboard).** Four walkers with explicit `t` inside an 8.4 s scene; the navy walker arrives at 7.6 s, before the last caption ends at 8.4 s.
