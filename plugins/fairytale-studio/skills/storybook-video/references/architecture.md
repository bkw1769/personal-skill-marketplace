# Engine architecture

## Contents

- Files
- One clock
- Frame composition
- Scene functions
- Drawing helpers
- Data the engine reads

## Files

| File | Owner | Role |
|---|---|---|
| `index.html` | engine | Canvas 1920x1080, start overlay, control bar (play, seek, narration, record, fullscreen). Fonts: Gaegu (captions), Nanum Pen Script (bubbles) from Google Fonts; falls back to system fonts after 4 s. |
| `story.config.js` | author | `storyboard`, `sprites` (one URL or a list: characters plus element kits), optional `narration: { audio, timeline }` and `mix: { music, duck, voice, master }`, and `saveName` for recordings. |
| `js/main.js` | engine | Loads config, storyboard, sprites and recorded narration; player (play/pause/seek, keyboard: Space, arrows), narration (recorded voice on the audio clock, or browser speech without it), MediaRecorder, review hooks (`?still&t=`, `__sheet`, `__mix`). |
| `js/stage.js` | engine | Scene lookup, paint-blot transitions, captions, quote, bubbles, paper grain, default animatic scene, narration lines, `bob()`. |
| `js/audio.js` | engine | `Synth` (Web Audio instruments and effects, recorded `voice` and `duck` events, mix levels), score helpers `seq/chords/arps/perc`, `autoScore()`, `cuesToEvents()`, `narrationEvents()` (voice_lines -> events), offline level tools `renderRange`, `kWeight`, `integratedLoudness`, `peakOf`, `speechToBedDb`. |
| `js/paint.js` | engine | Generic watercolor painters and pre-painted canvases (`BG.clouds/sun/moon/ships/tents/grain`). |
| `js/sprites.js` | engine | Loads sprites.json + PNGs into `S`, draws with `spr()`. |
| `js/util.js` | engine | Maths and easing, seeded random, `ink` (wobbly pen), `wash` (watercolor fill), `blob`, `ellipsePts`, `rectPts`, `handText`, palette `C`, `INK`, `PAPER`, `W`, `H`. |
| `js/scenes.js` | author | `SCENES = { <scene id>: (ctx, T, info) => {...} }` plus `sfxWord`. |
| `js/score.js` | author | Optional `buildScore(sb)` replacing the auto score. |

## One clock

While playing, time is `audioContext.currentTime - anchor`. Every frame is drawn from that `T`, and sound events are scheduled 0.4 s ahead on the same AudioContext time, so picture and sound cannot drift. Seeking rebuilds the sound session from the new `T`. Recording captures the canvas stream (30 fps request) and the synth output together.

Recorded narration rides the same clock: every caption or bubble with `voice_lines` becomes a `voice` event that plays its span of `full.wav` (found through `timeline.json`) at the item's `start`, and `duck` events lower the music bed to `mix.duck` around each line (merged across pauses under 1.6 s so the music does not pump). Seeking into the middle of a line resumes it mid-way. The narration button mutes and unmutes the recorded voice.

## Frame composition (stage.renderFrame)

1. Find the scene containing `T`.
2. During the first 0.9 s of a scene (unless its `transition` is `cut`), draw the previous scene, draw the new scene into a buffer, and reveal it through a growing paint-blot mask.
3. Bubbles, narration captions, the quote caption.
4. Paper grain multiplied over everything (ties procedural painting and sprite art together).

## Scene functions

```js
SCENES['bonk'] = (ctx, T, info) => {
  // info: { scene, index, local, length, progress, cast, storyboard }
  paper(ctx);
  sky(ctx, C.sky, '#f6efd9', 0.8, 760);
  ground(ctx, 860, C.sand);
  const hit = 2.4;                                  // seconds into the scene
  const x = info.local < hit ? lerp(-200, 900, easeIn(seg(info.local, 0, hit))) : 900 - 220 * easeOut(seg(info.local, hit, hit + 0.6));
  spr(ctx, 'soldier-short', x, 960, 300, { sq: info.local > hit && info.local < hit + 0.15 ? 0.15 : 0 });
  sfxWord(ctx, '통!', 980, 560, T, info.scene.start + hit);
};
```

- Use `T` (absolute) or `info.local` (scene time), never a frame counter, so seeking and recording give identical frames.
- Anything that should line up with a sound uses the same number as the storyboard cue (`info.scene.start + 2.4` here and a `cue` at that time).
- Keep heavy painting out of the per-frame path: paint static backgrounds once into an offscreen canvas (`makeCanvas`) at start-up, then `drawImage` it.
- `ctx` is already saved/restored around each scene; leave `globalAlpha` and transforms as you found them inside helpers.

## Drawing helpers

- Pen: `ink(ctx, points, {w, seed, amp, color, alpha, closed, double})`. Use `seed: boil(k)` for lines that should shimmer 8 times a second like hand-drawn animation.
- Paint: `wash(ctx, points, color, {alpha, seed, amp, layers, edge})`, `blob(ctx, cx, cy, rx, ry, color, opts)`.
- Shapes: `rectPts`, `ellipsePts`, `inkEllipse`.
- Text: `handText(ctx, text, x, y, {size, font, weight, color, reveal, outline})`.
- Painters (paint.js): `paper`, `sky`, `clouds`, `sun`, `moon`, `ground`, `waves`, `gull`, `house`, `cypress`, `heart`, `star`, `note`, `bulb`, `puff`, `plank`, `torch`, `nightOverlay`, `starsField`, and `BG.ships[i]`, `BG.tents[i]` canvases.
- Sprites: `spr(ctx, name, x, y, height, {rot, flip, sq, alpha, filter, pivot: 'center', boil: false, clipBottom})`. Sprites from different sheets are drawn at different scales; size each character from one standing pose per sheet (a table of target heights, as golden-axe's `scenes.js` does with `GROUPS`) so poses stay consistent.
- Timing inside a scene: read the scene's captions, bubbles and cues from the storyboard (golden-axe `line(info, k)`, `cues(info, 'hammer')`) instead of hard-coding seconds, so a re-time after re-recording the voice moves the animation with it.
- Collage pieces: `paste(ctx, name, x, y, height, {tilt, shadow, parallax, camX, alpha, flip, sway, pivot})` draws a torn-paper element sprite as if glued on the paper: a fixed hand tilt (default from the name, -1.5 to +1.5 degrees; `tilt` in degrees overrides), a soft warm drop shadow down-right scaled to the piece (`shadow: 0` turns it off; default 0.3 opacity), horizontal parallax `x - camX * parallax`, and an optional `sway` (radians of slow rocking about the base, for trees and reeds). No boil: paper pieces stay still unless they sway. Layer order and parallax values: `fairytale-art-prompts` `references/element-kits.md`.
- Motion: `seg`, `lerp`, `smooth`, `easeIn/Out/InOut`, `backOut`, `bounceOut`, `env(T, t0, t1, fadeIn, fadeOut)`, `bob(T, period, amp)`.

## Data the engine reads

From storyboard.json: `title`, `duration`, `language`, `cast[].sprites`, `scenes[]` (id, start, end, characters, music, transition), `captions[]` (`kind: quote` is drawn large in the centre), `bubbles[]` (optional `x`, `y`, `tail: [x, y]`, `size`, `kind: think`; without x/y a bubble sits above its speaker's slot), `cues[]`. Everything else is ignored, so the storyboard can carry notes freely.
