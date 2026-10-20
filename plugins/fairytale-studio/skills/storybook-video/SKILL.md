---
name: storybook-video
description: Build a hand-drawn watercolor storybook video (Canvas 2D + Web Audio, 1920x1080) from a timed storyboard.json, transparent character sprites and torn-paper background element kits - player page with captions, speech bubbles, paint-blot transitions, synthesized music and sound effects on one clock, recorded TTS narration (or browser narration) with automatic music ducking and an offline level check (voice over music, LUFS), frame-by-frame MP4 export (WebCodecs, independent of machine load) or real-time recording with a pre-recording check, review stills saved for approval before recording - then verify the file (duration, frame size, fps, audio) with a bundled MP4 probe and picture-against-sound sync with a frame matcher. Use this whenever the user wants to 동화 영상 만들어줘, 이 동화 애니메이션으로, JS로 영상 만들어줘, 장면 하나 추가해줘, 효과음/배경음악 넣어줘, 영상 저장/녹화, 영상 제대로 저장됐는지 확인해줘, or turn a storyboard and character art into an animated storybook, even if they do not mention canvas or JavaScript.
---

# Storybook video

A browser page that draws every frame from the storyboard and plays synthesized sound on the same clock, so picture, captions and sound never drift. The engine is generic; each story only writes scene drawings (and optionally a score). Inputs come from two sibling skills: `story-storyboard` (storyboard.json) and `sheet-to-sprites` (sprites.json + PNGs).

## 1. Scaffold

**Project layout.** `<project>` below is the project folder: `src/<project>` in a multi-project workspace (one folder per product under `src/`, with the shared `assets/`, `tts/` and `scripts/` at the workspace root), or `.` in a single-project repo. Project-only files (stories, story characters, outputs in `<project>/out/`) live under `<project>/`; shared voices, music, instruments and era art stay in the root `assets/`.

```bash
node <skill-dir>/scripts/new-story.mjs <project>/stories/<story>/video --storyboard <project>/stories/<story>/storyboard.json --sprites <characters>/sprites.json --sprites <kits>/sprites.json --narration <project>/out/tts/<story>-<lang>
```

This copies the template, writes `story.config.js` with relative URLs, and warns about cast members with no sprite. `--sprites` repeats (character poses plus background element kits; all names land in one sprite table). `--narration` points at the storybook-narration output folder (`full.wav` + `timeline.json`); the storyboard must have been re-timed to it (story-storyboard `retime`, which writes `voice_lines`), and the page then plays the recorded voice instead of browser speech, with the music ducked under every line. Engine files (`index.html`, `js/{main,stage,audio,paint,sprites,util}.js`) can later be refreshed with `--update-engine`; author files (`story.config.js`, `js/scenes.js`, `js/score.js`) are never overwritten.

## 2. Serve and look

```bash
node <skill-dir>/scripts/serve.mjs --serve src,stories,assets,out --home /<project>/stories/<story>/video/ --save-dir <project>/out/<story>-video
```

The page must come over HTTP (sprites are images, the storyboard is fetched), and the page, storyboard and sprites must all be under the served root. The server binds 127.0.0.1, supports HTTP Range (needed to review the recorded video) and accepts recordings on `POST /save`. If the project already has its own dev server with these properties, use that.

Open the page. With no scene code yet it plays an animatic: mood-coloured sky, the scene's characters walking in, captions, bubbles, transitions, an auto score from each scene's `music` block, and the storyboard's sound cues. Watch it once before drawing anything; timing problems are cheaper to fix in the storyboard.

Review without playing: `?still&t=<seconds>` shows one frame; in the console `__sheet([3, 12, 25, ...], 4)` draws a contact sheet of many times at once. Use these (or a screenshot of them) to check every scene.

## 3. Draw the scenes

Write one function per scene id in `js/scenes.js` (signature and helpers in `references/architecture.md`). Work scene by scene, checking each with `?still&t=`:

1. Background back to front. Default for stories with element kits (torn-paper collage, mandatory in `fairytale-art-prompts`): the scene's background `plate(ctx, name, {camX})` (the painted far distance for that place and time of day), then paste the cut pieces layer by layer with `paste(ctx, name, x, y, height, {tilt, shadow, parallax, camX})` — `sky` → `mid` → `near`, characters, then `front` and `fx` pieces. Procedural painters (`clouds`, `ground`, `house`) are only for stories without kits.
   - **Scene light:** give every sunset, night or misty scene `"light": "sunset" | "night" | "mist"` in storyboard.json (or call `setTint()` in the scene). stage.js applies it to every `paste()` and `spr()` of that scene; plates are already painted for their time and are never tinted. Without it daylight figures on an orange or indigo plate look stuck on (golden-axe v2 review).
   - **Long pieces and state changes:** `js/collage.js` has `pasteRun(name, cx, base, h, {opening, leaves})` for walls, fences and banks that must run past both frame edges (soft joins) and for open gates built from an empty gateway plus two door leaves, and `stateAt(T, [[t, state], ...])` for pieces that change during a scene (whole tree, notched tree, firewood pile). Use them from a baked layout list (a function entry draws itself).
   - **Draw order at water:** anything standing on the bank (a tree, a person) is pasted after the pond piece, or the pond's rim covers its foot (golden-axe review).
   - **Water contact:** a figure over water (a spirit on a cloud, a frog, an axe landing) gets `waterRise(ctx, x, surfaceY, width, T, {front: false})` before it and `{front: true, t0}` after it, so it sits in the water instead of floating in front of it.
2. Characters with `spr(ctx, name, x, y, height, {rot, flip, sq})`, feet on the ground line; motion from `T` so seeking works. Never `flip` a sprite in clothes with a fixed closing (hanbok, wrapped robes: mirroring turns the living's closing into burial clothes); use the `-left` poses from the cut-out sheet.
3. Effects: `sfxWord` ("쾅!"), stars, hearts, bulbs, puffs, night overlay.

`references/animation-patterns.md` lists the motion recipes, the audience rules (move only what the narration names, scene length, questions, captions, fear by age) and the bugs already hit once (characters visible before their entrance, props larger than buildings, off-screen crowds). Check the storyboard's `audience` band first; a 3-5 version moves less, holds pictures longer and never shows a transformation.

## 4. Sound

Start with the auto score; replace it scene by scene in `js/score.js` when the story deserves real music. Keep music at least 15 dB under narration and instrumental only, and master to −14 LUFS (levels table in `references/sound-design.md`). With recorded narration, measure instead of guessing: `await __mix()` in the page console renders the whole sound offline and returns `voiceOverMusicDb` (voice energy over the ducked music while someone speaks), `lufs` and `peak`; tune `mix: { music, duck, voice, master }` in story.config.js until the voice is 15 dB+ over the music, about −14 LUFS and the peak under 0.89 (−1 dB). Golden-axe ended at `{ music: 0.45, duck: 0.4, voice: 1, master: 1.35 }` with bass and drums turned down in score.js: voice 19-22 dB over the music in every 30 s window, about −14 LUFS, peak 0.77. The master chain ends in a peak limiter, so `master` sets loudness without clipping. A full 4-minute render takes longer than a console call allows; start it with `.then()` and read the result afterwards. Cue sound effects in the storyboard (`cues`) so the timing lives in one place. Names, arguments and mood recipes: `references/sound-design.md`. Any name the synth does not know is listed in the console as silent.

## 5. Review stills, then record, then verify

**Stills first.** After any change, save stills of only the changed moments and get them approved before making a video (a full recording takes the length of the story and can fail under load):

```js
await __capture([13.5, 138, 150], 'review-gate')   // -> <save dir>/review-gate-0m13_5s.png ...
```

Send those files (named by time) and wait for an OK.

**Make the video.** Two buttons, both saving `<saveName>.mp4` into the save folder. `saveName` may hold folders (`<id>/<id>` saves to `<save dir>/<id>/<id>.mp4`; up to three, created on save), which keeps each video's takes, review stills and upload files in one folder:

- **정밀 저장** (`await __export()`): frame-by-frame. Every frame is drawn from its exact time and encoded with WebCodecs, the sound is rendered offline from the same events, and both are written into one MP4 (`js/mp4mux.js`). It does not depend on machine load or on the page being visible, picture and sound cannot drift, and it runs faster than real time (12 s of golden-axe in 5 s at load 40). Use it by default.
- **영상 저장** (real time, MediaRecorder): plays from 0 and records. Before starting it checks the machine (`/__load` on the dev server), that the audio actually started and that the audio clock runs at real speed, and refuses with the reason on the overlay when one fails (`__preflight` keeps the result; `__record(true)` forces it). Each of these spoiled a golden-axe take: a scripted click while the page was visible left the audio suspended; at load 25 the take ran at half speed; at load about 20 it passed the probe but ended 1 s out of sync. Press it with a real click.

Then verify:

```bash
node <skill-dir>/scripts/probe-mp4.mjs <save dir>/<saveName>.mp4 --expect-duration <storyboard duration> --tolerance 1 --expect-size 1920x1080 --require-audio
```

The probe cannot see drift. Always check picture against sound in the saved file:

```js
await __sync('/<save dir>/<saveName>.mp4', [5, 60, 120, 200, 235])   // ok: true, worst offset 0
```

It matches each frame of the video against frames drawn at nearby story times; the best offset must stay at 0 (±0.1 s) to the end. Also check frame rate and that audio is not silent; the full checklist is `references/output-verify.md`. You cannot hear the result, so ask the user to listen to it before calling it done.

## Report

Reply in the user's language: page URL and run command, which scenes have custom drawing and which still use the animatic, the probe result (duration, size, fps, audio), and anything the user should look at or listen to.
