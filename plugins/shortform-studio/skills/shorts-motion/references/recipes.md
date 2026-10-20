# Motion recipes

Real lines from the project, copied from `src/shorts/episodes/<id>/script.json` on 2026-10-20 (two holds are shown corrected; each says so). Each shows the line's spoken text (`say`), its caption chunks, the exact `shots` and `overlays`, and why it works. Fitted values (after `fitMotion`) are quoted where they were measured. Field reference: `overlays.md`, `layers.md`.

Plate map for every crosswalk recipe (`crosswalk-top-empty`, 1024 x 1536): road v 0.176-0.79, stripes u 0.33-0.69, walker lanes u 0.40-0.61, near sidewalk v 0.84-0.9, far side v 0.06-0.2, tape at u 0.29, sharp band v 0.28-0.74.

## crosswalk l04: busy crossing + measuring tape

Say: `그 길이를 초속 일 미터로 나누고, 출발하는 데 걸리는 사 초에서 칠 초를 더하죠.`
Captions: `길이 ÷ 초속 1m` / `출발 시간` / `4~7초를 더합니다`

```json
{
  "shots": [{ "image": "crosswalk-top-empty", "motion": "push-in", "zoom": [1, 1.05], "focus": [0.5, 0.5], "tilt": [0.28, 0.74],
    "layers": [
      { "sprite": "walker-suit", "path": [[0.44, 0.62], [0.45, 0.06]], "h": 0.075 },
      { "sprite": "walker-grey", "path": [[0.61, 0.1], [0.6, 0.8]], "h": 0.072, "rot": 180 },
      { "sprite": "walker-beige", "path": [[0.57, 0.3], [0.58, 0.95]], "h": 0.07, "rot": 180 },
      { "sprite": "walker-child", "path": [[0.48, 0.9], [0.49, 0.45]], "h": 0.055, "gait": 2.4 }
    ] }],
  "overlays": [
    { "kind": "tape", "plate": true, "from": [0.29, 0.79], "to": [0.29, 0.176], "grow": 1.2, "text": "20m", "size": 88,
      "at": 0.2, "until": "end", "claims": ["c-example-20m"] }
  ]
}
```

Why it works:
- One overlay. The tape runs along the left edge of the stripes from the bottom curb to the top curb, and `20m` counts up with it, so the viewer sees "the length" before the formula divides it.
- The tape is plate-pinned, so it stays on the curb line during the push-in. Being a `tape`, it also stops punch-in cuts on this line.
- The walkers have no `t`: they fill the whole scene and `fitMotion` leaves them alone. Down-walkers carry `rot: 180`. The child is smaller (`h: 0.055`) with quicker steps (`gait: 2.4`).
- `tilt` matches the plate's painted tilt-shift, so walkers on the sidewalks are soft like the sidewalks.

Caveat: the child ends mid-road (v 0.45), because a layer without `t` reaches its path end exactly at the cut. That is a known exception to design rule 2 ("a figure that does not make it belongs only on the twist line"), accepted only because this caption claims nothing about everyone crossing. In new work end such a path off the road (v 0.2 or less for an upward walker).

## crosswalk l05: one walker synced to a timer, tape held

Say: `그래서 이십 미터 횡단보도면, 초록불은 이십칠 초가 됩니다.`
Captions: `20m 횡단보도면` / `초록불은 27초`

```json
{
  "shots": [{ "image": "crosswalk-top-empty", "motion": "pull-out", "zoom": [1.12, 1.04], "focus": [0.5, 0.5], "tilt": [0.28, 0.74],
    "layers": [{ "sprite": "walker-navy", "path": [[0.52, 0.84], [0.52, 0.2]], "h": 0.074, "gait": 1.9, "t": [0.3, 3.6] }] }],
  "overlays": [
    { "kind": "tape", "plate": true, "from": [0.29, 0.79], "to": [0.29, 0.176], "grow": 0.01, "text": "20m", "size": 88,
      "at": -0.08, "until": "end", "claims": ["c-example-20m"] },
    { "kind": "timer", "x": 0.8, "y": 0.27, "size": 110, "dur": 3.3, "to": 27, "at": 0.3, "until": "end", "claims": ["c-example-20m"] }
  ]
}
```

Why it works:
- Two overlays, the maximum: tape (length) and timer (time). No signal-bar, which would be a second "time" cue.
- The tape repeats with `grow: 0.01, at: -0.08`, so it starts at this scene's start, exactly where l04's tape ends, already complete instead of redrawing. The episode's script.json still has `"at": 0` here: its builds start the repeat 0.08 s late, so the tape blinks off for 2-3 frames at the cut (soft-m 14.29 -> 14.37 s, professor-m 15.69 -> 15.77 s), which `motion.mjs check` reports. Use -0.08.
- Walker `t: [0.3, 3.6]` matches timer `at: 0.3` + `dur: 3.3`: the ring reaches `27초` and turns red as the walker reaches the far curb. The walk and the clock are one statement.
- Against l04: new cast (one walker, not four) and new framing (pull-out from 1.12, l04 ended at 1.05), so nothing jumps back.
- Timer frame-anchored: `plate: true` on a timer throws.

Fitted for soft-m: timer `dur` 3.24, walker `t` unchanged.

## crosswalk l12: protection zone, elder and child within 36 s

Say: `그래서 같은 이십 미터도, 보호구역에선 최대 삼십육 초까지 늘어납니다.`
Captions: `같은 20m라도` / `보호구역은 최대 36초`

```json
{
  "shots": [{ "image": "crosswalk-top-empty", "motion": "push-in", "zoom": [1.02, 1.08], "focus": [0.5, 0.5], "tilt": [0.28, 0.74],
    "layers": [
      { "sprite": "walker-elder", "path": [[0.42, 0.84], [0.42, 0.2]], "h": 0.072, "gait": 1.2, "t": [0.2, 4.4] },
      { "sprite": "walker-child", "path": [[0.55, 0.86], [0.55, 0.2]], "h": 0.055, "gait": 2.2, "t": [0.4, 4.4] }
    ] }],
  "overlays": [
    { "kind": "timer", "x": 0.8, "y": 0.27, "size": 110, "dur": 4.2, "to": 36, "at": 0.2, "until": "end", "claims": ["c-example-20m"] }
  ]
}
```

Why it works:
- One overlay. Both slow walkers reach the far curb, because the caption says the time is extended for them.
- Slow steps (`gait: 1.2`) and quick small steps (`gait: 2.2`) read as two different walkers on one time budget.
- The timer runs to 36 over 4.2 s, in step with the elder.

Fitted for soft-m: elder and child `t` end 4.08, timer `dur` 3.8, all ending at 45.71 s. For professor-m: `t` end 4.33, `dur` 4.05.

## crosswalk l13: speed race, the elder stops mid-road (twist)

Say: `한 농촌 노인 연구에선, 여성 평균 걸음이 초속 영 점 칠 미터 남짓이었거든요.`
Captions: `한 농촌 노인 연구에선` / `여성 평균 초속 0.709m`

```json
{
  "shots": [{ "image": "crosswalk-top-empty", "motion": "push-in", "zoom": [1, 1.06], "focus": [0.45, 0.55], "tilt": [0.28, 0.74],
    "layers": [
      { "sprite": "walker-elder", "path": [[0.4, 0.84], [0.4, 0.38]], "h": 0.072, "gait": 1.1 },
      { "sprite": "walker-suit", "path": [[0.55, 0.84], [0.55, 0.19]], "h": 0.075 },
      { "sprite": "walker-beige", "path": [[0.6, 0.1], [0.6, 0.75]], "h": 0.07, "rot": 180 }
    ] }],
  "overlays": [
    { "kind": "number", "text": "0.709m", "static": true, "sub": "초속, 농촌 노인 여성 평균", "x": 0.5, "y": 0.26,
      "at_chunk": 1, "until": "end", "claims": ["c-elder-gait"] }
  ]
}
```

Why it works:
- The only line where being left on the road is the point (l04's child also ends mid-road, the known exception above), and the caption is about exactly that.
- Honest speeds: no `t`, so all walkers share the whole scene. The elder covers 0.46 of the plate, the others 0.65: 0.46 / 0.65 = 0.708, matching 0.709 vs 1.0 m/s. The ratio holds in every voice take. The ratio itself is never printed.
- The number is `static`, so it never counts through wrong values, and it carries its claim.
- Against l12: zoom 1.08 -> 1.0, focus moved to [0.45, 0.55], new co-walkers.

## crosswalk l08: plate-pinned illustrative digit on a device

Say: `남은 초를 세는 숫자도, 깜빡이기 시작할 때부터 나옵니다.`
Captions: `남은 초를 세는 숫자도` / `깜빡일 때부터 나옵니다`

```json
{
  "shots": [{ "image": "countdown", "motion": "push-in", "focus": [0.6, 0.45] }],
  "overlays": [
    { "kind": "number", "text": "9", "static": true, "plate": true, "x": 0.552, "y": 0.435, "size": 300, "color": "#ffffff",
      "at_chunk": 1, "until": "end", "not_facts": ["9"] }
  ]
}
```

Why it works:
- The art prompts forbid digits (displays are blank), so the panel gets its digit from code, exactly where and when the caption mentions it.
- Pinned to the panel's plate position, so it stays on the panel during the push-in.
- White like an LED, not the yellow accent of fact numbers, and static.
- `9` is not a fact, so it goes in `not_facts` and trace passes.

## crosswalk l06: signal bar used alone

Say: `그런데 그중 십오 초는 깜빡이는 시간입니다.`
Captions: `그런데 그중 15초는` / `깜빡이는 시간입니다`

```json
{
  "shots": [{ "image": "signal-close", "motion": "push-in", "focus": [0.45, 0.4] }],
  "overlays": [{ "kind": "signal-bar", "x": 0.5, "y": 0.13, "w": 0.72, "dur": 3.2, "blink": 1.8, "at": 0.3, "until": "end" }]
}
```

The bar drains, blinks, then empties while the lamp turns red. It prints no number, so it needs no claim, and it appears only on a line without a timer. Caveat: `fitMotion` cut `dur` to 1.9 s (soft-m) and 2.2 s (professor-m) but left `blink` at 1.8, so on soft-m the bar blinks almost from the start. Keep `blink` under half of the expected `dur`.

## water-meter l03: frost spreading over a clean base still

Say: `계량기 안의 물이 고여 있으면, 얼기 시작합니다.`
Captions: `계량기 안에 물이 고여 있으면` / `얼기 시작하고`

```json
{
  "shots": [{ "image": "box-empty", "motion": "push-in", "zoom": [1, 1.06], "focus": [0.57, 0.5] }],
  "overlays": [
    { "kind": "frost", "plate": true, "box": [0.29, 0.24, 0.59, 0.43], "from": [0.576, 0.498], "grow": 2.4, "at": 0.4, "until": "end" }
  ]
}
```

Why it works:
- `box-empty` is a base still made for diagrams: the open meter box, evenly lit, centred, with no frost. Code draws the change, so the viewer watches the water freeze.
- The frost is clipped to the box opening and grows from the meter centre. It is seeded, so every frame and every re-export agree.
- No numbers, so no claims.

## water-meter l04: frost held + compare bars, the derived value hidden

Say: `물은 얼음이 되면서 부피가 약 구 퍼센트 늘어납니다.`
Captions: `물이 얼음이 되면` / `부피가 약 9% 늘어납니다`

```json
{
  "shots": [{ "image": "box-empty", "motion": "pull-out", "zoom": [1.1, 1.02], "focus": [0.57, 0.5] }],
  "overlays": [
    { "kind": "frost", "plate": true, "box": [0.29, 0.24, 0.59, 0.43], "from": [0.576, 0.498], "grow": 0.01, "at": -0.08, "until": "end" },
    { "kind": "compare", "x": 0.5, "y": 0.37, "h": 0.16, "min": 80, "bw": 0.2,
      "items": [{ "label": "물", "value": 100 }, { "label": "얼음", "value": 109, "text": "+9%" }],
      "at_chunk": 1, "until": "end", "claims": ["c-water-expands-9pct"] }
  ]
}
```

Why it works:
- Two overlays: the held frost (`grow: 0.01, at: -0.08`, starting at this scene's start) and the bars. The episode's script.json still has `"at": 0`, so its build blinks the frost off from 13.49 to 13.57 s (`motion.mjs check` warns). Frost is grow-driven, so a repeat that starts on time shows it fully frozen with no redraw.
- The bar heights come from `value`, but only `text` is printed: the viewer sees `+9%`, never `109`, which is arithmetic, not a claim.
- `min: 80` sets the zero height, so the difference is visibly exaggerated (20 : 29). Acceptable only because no axis or values are drawn and the text states the real change.
- The camera pulls out against l03's push-in on the same base still, so the repeated picture still moves differently.
- Trace does not read `items[].text`; the claim sits on the overlay and was checked by hand.

## water-meter l10: flow arrow pinned through the pipe

Say: `물이 계속 흐르면, 계량기 안에 고여 있지 않으니까요.`
Captions: `물이 계속 흐르면` / `계량기 안에 고이지 않습니다`

```json
{
  "shots": [{ "image": "box-empty", "motion": "push-in", "zoom": [1.02, 1.08], "focus": [0.57, 0.5] }],
  "overlays": [
    { "kind": "arrow-flow", "plate": true, "from": [0.27, 0.47], "to": [0.88, 0.47], "color": "#7cc8ff", "width": 22, "at": 0.2, "until": "end" }
  ]
}
```

Why it works: the same base still, used a third time with a different diagram. The arrow draws on over 0.6 s and its dashes keep moving, which reads as water flowing. It is pinned along the pipe line, which also blocks punch-in cuts. The icy blue matches the episode's single accent.

## crosswalk motion test: first draft and what the user changed

A hand-written storyboard (no TTS) to try one motion scene: `src/shorts/episodes/crosswalk-green-time/motion-test.storyboard.json`, exported as `src/shorts/out/crosswalk-green-time/motion-test.mp4` (8.4 s, probe ok).

**First draft** (not kept as a separate file; reconstructed from the session notes): the same walkers plus a slow elder still on the crossing at the end, with three diagram overlays: tape, timer and signal-bar.

**What the user changed:**
- Too busy: tape + timer + signal-bar pulled the eye off the caption, and timer and signal-bar said the same thing. The signal-bar was dropped. This became the two-overlay rule.
- The elder still on the road under `다 건널 시간을 줍니다` read as a mistake. The elder was removed and saved for the twist line (l13). This became the "picture never contradicts the caption" rule.

**Approved version** (storyboard form, so `start`/`end` instead of `at`/`until`):

```json
{
  "schema": "storyboard/1", "profile": "shorts", "duration": 8.4, "frame": { "width": 1080, "height": 1920 }, "music": { "tempo": 96 },
  "scenes": [{ "id": "s01", "start": 0, "end": 8.4, "image": "crosswalk-top-empty", "motion": "push-in", "zoom": [1, 1.08], "focus": [0.5, 0.5], "tilt": [0.28, 0.74],
    "layers": [
      { "sprite": "walker-suit", "path": [[0.44, 0.52], [0.45, 0.06]], "t": [0, 3.6], "h": 0.075 },
      { "sprite": "walker-grey", "path": [[0.61, 0.12], [0.6, 0.92]], "t": [0, 5.2], "h": 0.072, "rot": 180 },
      { "sprite": "walker-beige", "path": [[0.57, 0.3], [0.58, 0.95]], "t": [0, 4.2], "h": 0.07, "rot": 180 },
      { "sprite": "walker-navy", "path": [[0.52, 0.86], [0.52, 0.2]], "t": [2.2, 7.6], "h": 0.074, "gait": 1.9 }
    ] }],
  "captions": [
    { "start": 0.3, "end": 2.2, "text": "건너는 길이를 재고" },
    { "start": 2.2, "end": 5, "text": "1초에 1m 걷는 사람이" },
    { "start": 5, "end": 8.4, "text": "다 건널 시간을 줍니다" }
  ],
  "overlays": [
    { "start": 0.6, "end": 8.4, "kind": "tape", "plate": true, "from": [0.29, 0.79], "to": [0.29, 0.176], "grow": 1.4, "text": "30m", "textDx": 0, "size": 88 },
    { "start": 2.2, "end": 8.4, "kind": "timer", "x": 0.82, "y": 0.27, "size": 110, "dur": 5.4, "to": 30 }
  ]
}
```

Under `다 건널 시간을 줍니다` (5.0-8.4 s) every walker has finished or left the road; the navy walker arrives at 7.6 s. The 30m / 30초 numbers were unverified (the ledger was empty), so this file is never for publishing; the episode uses 20m / 27초 from `c-example-20m`.

To replay it: `video-motion-test/story.config.js` now points at `../storyboard.json`, `tts-ko/` and the main episode's `saveName` (left over from two sessions sharing the folder). Set `storyboard` to `'../motion-test.storyboard.json'` and give it its own `saveName` before exporting, or the export overwrites the episode MP4. `motion.mjs check src/shorts/episodes/crosswalk-green-time --storyboard src/shorts/episodes/crosswalk-green-time/motion-test.storyboard.json` checks it as a hand-written storyboard (scene `s01` is no script line): it is never called stale, its scenes and overlays get the script rules, and it reports the unverified `30m` and `30초` as numbers without claims.

## Other recipes (pruney-fingers, onion-tears)

Short forms; see each episode's `script.json` for the full lines.

- **Slowing pulses + number** (pruney l05, caption about blood flow dropping 27.6%): `number` `27.6% ↓` with `sub` at y 0.26, plus `pulse-path` with `plate: true`, `period: 0.9`, `count: 3`, `slow: 0.3`, so the flow visibly slows while the number states the drop.
- **Squeeze** (pruney l07, `신경이 손끝 혈관을 조이면`): `{"kind": "squeeze", "plate": true, "x": 0.71, "y": 0.45, "gap": 0.075, "angle": 90, "size": 170, "at_chunk": 1, "until": "end"}`.
- **Cross-section card under the caption** (pruney l08): `buckle` at y 0.735, `dur: 2.6`, labels `피부` / `속살`.
- **Ring on the shot it marks** (pruney l13): two shots, the second `from_chunk: 1`; the ring has `plate: true` and `at_chunk: 1`, so it starts with the shot whose plate it is pinned to.
- **Myth X** (water-meter l13, `오히려 같이 얼어 버립니다`): `xmark` at y 0.22, `size: 200`, `at_chunk: 1`, frame-anchored because it judges a statement.
