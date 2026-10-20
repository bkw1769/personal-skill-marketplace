# The portrait shorts engine

Read from `src/shorts/_engine/` in the 00_fairytale project on 2026-10-20. The engine is a browser prototype (Canvas 2D + Web Audio, 1080 x 1920) and `build-storyboard.mjs` is an untested prototype; both are exempt from the test gate until extracted into `scripts/`. Behaviour below is read from code, not from tests.

## Where things live

| Path | What |
|---|---|
| `src/shorts/_engine/video/index.html`, `video/js/*.js` | The player page and engine (`main.js`, `stage.js`, `scenes.js`, `sprites.js`, `score.js`, `audio.js`, `util.js`, `mp4mux.js`, ...). |
| `src/shorts/_engine/video/story.config.js`, `demo-storyboard.json` | The engine's own demo page config. |
| `src/shorts/_engine/build-storyboard.mjs` | script.json + voice timeline -> storyboard.json. |
| `src/shorts/episodes/<id>/script.json` | The script: lines, chunks, shots, overlays. |
| `src/shorts/episodes/<id>/storyboard.json`, `storyboard-<voice>.json` | Built storyboards, one per voice take. |
| `src/shorts/episodes/<id>/video/`, `video-<voice>/` | The episode's page: a copy of the engine page plus its own `story.config.js`. |
| `src/shorts/out/<id>/` | Outputs (gitignored): MP4, `review/` stills, `old/` archived exports, voice takes in `tts-ko/` or `tts-ko-<voice>/`. |

## Engine copies per episode

Each episode page is a manual copy of `src/shorts/_engine/video/index.html` and `js/` into `src/shorts/episodes/<id>/video/`, plus the episode's own `video/story.config.js`. Copies are snapshots: an engine fix does not reach old episodes, and an old copy skips unknown kinds silently (the overlay just does not appear).

For a new episode, or before using a newer kind in an old one:

```bash
mkdir -p src/shorts/episodes/<id>/video
cp src/shorts/_engine/video/index.html src/shorts/episodes/<id>/video/
cp -R src/shorts/_engine/video/js src/shorts/episodes/<id>/video/
```

Then write `video/story.config.js`, and repeat the copy for each `video-<voice>/`. Old episodes keep their copy unless they get new motion.

Which copies are stale changes with every engine edit, so measure it instead of trusting a list:

```bash
for p in src/shorts/episodes/*/video*/; do
  for f in src/shorts/_engine/video/js/*.js; do cmp -s "$f" "$p/js/${f##*/}" || echo "$p/js/${f##*/} differs"; done
done
```

Before overwriting a copy that differs, diff its `OVERLAY` block against the engine's (SKILL.md step 5) to make sure it holds no local patch. `motion.mjs check` reports, for every page that loads the checked storyboard, a used kind missing from its `OVERLAY` table, `plate: true` without `onFrame`, layers without `layerAt`, a shot image missing from `plates` and a sprites manifest the page does not load. A copy can have `onFrame` but pin fewer fields (older copies do not pin `box`, `paths`, `r`, `gap`); the kinds that use those fields were added at the same time, so the kind check catches it in practice.

## story.config.js

URLs resolve against the page, so `'../storyboard.json'` is `episodes/<id>/storyboard.json`. Absolute server paths (`/src/shorts/out/...`, `/assets/...`) also work.

| Key | Required | Meaning |
|---|---|---|
| `storyboard` | yes | URL of the storyboard (`'../storyboard-<voice>.json'` for a voice take). |
| `sprites` | yes | Array of `sprites.json` URLs, or `[]`. Left undefined, the page fails to load. A duplicate sprite name: the later manifest wins, with a console warning. |
| `plates` | no | `{ name: url }`. Every shot `image` must be one of these names; a missing one draws "missing image: <name>" and no layers. |
| `narration` | no | `{ audio: full.wav URL, timeline: timeline.json URL }`. The recorded voice plays per caption; browser TTS is off. |
| `mix` | no | `{ music, duck, voice, master }` over the defaults `{1, 0.3, 1, 0.85}`. Episodes use voice 1.3, master 1.0. |
| `saveName` | no | Output name under the save dir, default `'story'`. Use `'<id>/<id>'` or `'<id>/<id>-<voice>'`: the folder part also places `review/`. |

Crosswalk example:

```js
export default {
  storyboard: '../storyboard-professor-m.json',
  sprites: ['../art/sprites/sprites.json'],
  plates: { 'crosswalk-top-empty': '../art/crosswalk-top-empty.png', /* ... 13 more */ },
  narration: { audio: '/src/shorts/out/crosswalk-green-time/tts-ko-professor-m/full.wav',
               timeline: '/src/shorts/out/crosswalk-green-time/tts-ko-professor-m/timeline.json' },
  mix: { music: 1, duck: 0.3, voice: 1.3, master: 1.0 },
  saveName: 'crosswalk-green-time/crosswalk-green-time-professor-m',
};
```

## Frame order

Each frame: shot plate -> layers -> overlays (storyboard array order) -> bubbles -> captions -> grain. Captions are white, weight 900, 84 px shrunk to fit 84% of the width, centred at 62% of the height (`CAPTION_Y`), and switch on and off instantly. That band is why overlays sit at y 0.26-0.27 or under it at 0.735.

## Camera (`shot()`)

| motion | zoom [from, to] | pan |
|---|---|---|
| `push-in` | [1.0, 1.14] | none |
| `pull-out` | [1.16, 1.0] | none |
| `pan-left` / `pan-right` | [1.12, 1.12] | Offset from +4% to -4% of the width (8% travel). `pan-left`: the picture slides left; `pan-right`: it slides right (content moves left to right). |
| `pan-up` / `pan-down` | [1.1, 1.1] | Offset from +3.5% to -3.5% of the height (7% travel). `pan-up`: the picture slides up; `pan-down`: down. |
| `still` (and any unknown name) | [1.03, 1.05] | none |

- The plate is cover-fitted, then zoomed; the move eases in and out over the scene, and every scene (including a punch-in) restarts its move.
- `zoom` replaces only the zoom; the motion's pan still applies.
- `focus` [u, v] is a **plate** fraction placed at the frame centre (the engine's header comment says "in the frame", which is wrong). The picture is clamped to the frame, so a focus near an edge cannot be centred, and a 9:16 plate at zoom 1 cannot pan sideways.
- A 2:3 plate (1024 x 1536) at zoom 1 shows u 0.078-0.922, and it fills the frame height exactly, so the vertical clamp pins it: plate v is frame y, and `focus` alone cannot move anything up or down. Zoom in to reframe vertically.
- Plate fraction to frame: the mapping `plate: true` overlays and layers use. For a 1024 x 1536 plate, with z the zoom and (px, py) the pan offset, both eased (`easeInOut`) from their start to their end value over the scene, and clamp(value, low, high):

  ```text
  s = 1.25 * z                                    (k: cover-fit 1920/1536 = 1.25, times the zoom)
  x = clamp(540 - fu * 1024 * s + px * 1080, 1080 - 1024 * s, 0)
  y = clamp(960 - fv * 1536 * s + py * 1920, 1920 - 1536 * s, 0)
  frame = ((x + u * 1024 * s) / 1080, (y + v * 1536 * s) / 1920)
  ```

  Other plate sizes use k = max(1080 / width, 1920 / height) * z. `motion.mjs frame <storyboard> <scene-id> <u,v> [<u,v>]...` computes this for a built scene (plate size read from `art/<image>.png` next to the storyboard) at the scene start and end, and flags the caption band (frame y 0.60-0.645), the bottom 20% and off-screen points.

## build-storyboard.mjs

```bash
# main take (page video/; the take folder is whatever video/story.config.js narration.timeline names)
node src/shorts/_engine/build-storyboard.mjs src/shorts/episodes/<id>/script.json src/shorts/out/<id>/tts-ko/timeline.json --out src/shorts/episodes/<id>/storyboard.json [--audio <full.wav>]
# extra take (page video-<voice>/)
node src/shorts/_engine/build-storyboard.mjs src/shorts/episodes/<id>/script.json src/shorts/out/<id>/tts-ko-<voice>/timeline.json --out src/shorts/episodes/<id>/storyboard-<voice>.json [--audio <full.wav>]
```

- **Always pass `--out`.** Without it the output path becomes the node executable and the builder tries to overwrite it.
- `--audio` defaults to `full.wav` beside the timeline; captions then snap to where speech resumes. Without it the builder warns and captions are not snapped.
- The entry check compares the builder's own URL with `file://` + its path, so if the project path (the builder's own location) contains spaces or non-ASCII characters, the check fails and the builder silently does nothing. The script.json and timeline paths may contain them. Check that the output file changed.

**Timing.** A line's voice ids are its `id`, or `id` plus one letter (`l09a`). The story clock is the narration clock + 0.15 s. A line's scene runs from 0.08 s before its voice to 0.08 s before the next line's voice; the first scene starts at 0; the last ends 1.6 s after the last word. Caption chunks share the line's time by spoken length and snap to voice onsets.

**Shots -> scenes.** Shot 0 starts with the line. Shot k > 0 starts 0.05 s before chunk `from_chunk` (required for k > 0; missing gives `null`). Every other shot field is copied (`image`, `motion`, `zoom`, `focus`, `layers`, `tilt`, `tiltBlur`, `transition`). A line with no shots gets no scene: during its time the page shows the next shot early, frozen on its first frame (after the last shot, the last shot frozen on its last frame).

| Shot field | Meaning |
|---|---|
| `transition: "blot"` | A 0.9 s paint-bleed into this scene: the previous scene keeps drawing (its camera and layers frozen at their end points) while this one bleeds in through ink-blot masks. Overlays are drawn in both pictures during the bleed, so a `plate: true` overlay on screen then appears through both cameras. Without it, scenes cut. |

**Overlays.** `start` = chunk start of `at_chunk`, else voice start + `at` (default 0). `end` = chunk start of `until_chunk`, else the end of the line's scene. `until` is read and ignored, so an overlay can never outlive its line: repeat it on the next line with `"grow": 0.01, "at": -0.08` to hold it (`at` may be negative; -0.08 is the next scene's start, which rounds to the same value as the first overlay's end). With `at: 0` the repeat starts 0.08 s after the first one ends and blinks. Only `tape` and `frost` hold cleanly (`overlays.md`, Holding an overlay). An out-of-range `at_chunk` writes a null start, which the engine draws from 0 s. Every other field is copied as written.

**Chunk cuts** (script `cuts: "chunk"`). Inside a shot, at each chunk boundary with at least 1.3 s on both sides, the builder alternates a punch-in (`push-in`, zoom [1.32, 1.4], same focus) and a return to the shot. It skips the whole line when any overlay is `tape`, `arrow-flow`, `dim` or `label` (ANCHORED), or has `plate: true`, or any shot has a `layers` field (even an empty list). Other frame overlays stay put while the picture punches in under them.

**fitMotion** (after all lines, per take). Each layer with `t` gets its end pulled in to 0.3 s before its scene ends. Each overlay with `dur` gets `dur = max(0.2, min(dur, overlay length - 0.3))`. `grow`, `count`, `blink` and `period` are not adjusted.

**Output.** `storyboard/1`, profile `shorts`, 1080 x 1920, with `scenes`, `captions`, `overlays` and `music` (`script.music` or tempo 92). Times are rounded to 0.01 s.

## Per-voice storyboards

Each narrator take of the same script gets its own build, because line lengths differ and `fitMotion` fits the motion to each:
- main take: `storyboard.json` + `video/` (its voice may be `tts-ko/` or `tts-ko-<voice>/`: crosswalk's main page reads `tts-ko-soft-m/`);
- other takes: `storyboard-<voice>.json` + `video-<voice>/` (a copy of `video/` whose `story.config.js` points at that storyboard, `tts-ko-<voice>/` and `saveName '<id>/<id>-<voice>'`).

After any script edit, rebuild the TTS and the storyboard of every take; an old storyboard keeps its old timing. Extra takes are candidates until the user approves the voice.

## Dev server and review hooks

Launch config `shorts-video` (`.claude/launch.json`):

```bash
node scripts/dev-server/serve.mjs --port 8767 --serve src,assets --save-dir src/shorts/out --home /src/shorts/_engine/video/
```

Page: `http://127.0.0.1:8767/src/shorts/episodes/<id>/video/` (or `video-<voice>/`). The tab title becomes `ready` when loaded and `saved <name>` after a save.

| Hook | What it does |
|---|---|
| `?t=<s>` | Start at time s. |
| `?still&t=<s>` | One paused frame for review; the controls are not wired. |
| `__seek(t)` | Jump and render. |
| `await __capture([t, ...], prefix)` | Renders each time and saves `src/shorts/out/<folder of saveName>/review/<prefix>-<m>m<s>_<tenths>s.png`. Use an ASCII prefix (a Korean one becomes `review`) that includes the voice, since all takes share `review/`. Times within the same 0.1 s overwrite each other. |
| `__sheet([t, ...], cols = 3)` | Draws a contact sheet on the page canvas and freezes it (`__frozen = false` or reload to resume). Nothing is saved; more than 9 tiles at 3 columns get squashed. |
| `await __export()` | Frame-by-frame WebCodecs export, 30 fps, H.264 + AAC, saved as `saveName + '.mp4'`. Independent of machine load. |
| `await __mix(t0, t1)` | Offline level check: LUFS, peak, voice over music. Aim for 15 dB+ and about -14 LUFS. |
| `await __sync(url, [t, ...])` | Matches the exported video against rendered frames; `ok: true` means the worst offset is 0.1 s or less. |
| `await __record()` | Real-time recording with a preflight; use `__export` instead. |

Verify the file with storybook-video's probe:

```bash
node <storybook-video-dir>/scripts/probe-mp4.mjs src/shorts/out/<id>/<id>.mp4 --expect-duration <storyboard duration> --tolerance 1 --expect-size 1080x1920 --require-audio
```

## Known gaps (as read on 2026-10-20)

- `drawOverlays` has no try/catch: one malformed overlay stops rendering and any running export (`frost` with `grow: 0` and `pulse-path` with `period: 0` throw; the checker rejects both).
- `plate: true` on a `timer` with a `to` throws (its numeric `to` is read as a point).
- The `timer` without `dur` never reaches `to`; `signal-bar` without `dur` never empties.
- `buckle`'s fold can outlast a clamped `dur` by 0.1 s, and its pull arrows sit under the skin's crests, not its troughs as the code comment says.
- A held overlay (`at: 0` on the next line) blinks off for 0.08 s; hold with `at: -0.08` (the builder has no option to start at the scene start).
- The `gait` header comment says "steps per second"; the code draws two bobs per unit.
- Whether the tilt blur is scaled correctly for down-scaled sprites is unverified.
