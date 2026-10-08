---
name: storybook-video
description: Build a hand-drawn watercolor storybook video (Canvas 2D + Web Audio, 1920x1080) from a timed storyboard.json, transparent character sprites and torn-paper background element kits - player page with captions, speech bubbles, paint-blot transitions, synthesized music and sound effects on one clock, recorded TTS narration (or browser narration) with automatic music ducking and an offline level check (voice over music, LUFS), real-time MP4/WebM recording - then verify the recorded file (duration, frame size, fps, audio) with a bundled MP4 probe. Use this whenever the user wants to 동화 영상 만들어줘, 이 동화 애니메이션으로, JS로 영상 만들어줘, 장면 하나 추가해줘, 효과음/배경음악 넣어줘, 영상 저장/녹화, 영상 제대로 저장됐는지 확인해줘, or turn a storyboard and character art into an animated storybook, even if they do not mention canvas or JavaScript.
---

# Storybook video

A browser page that draws every frame from the storyboard and plays synthesized sound on the same clock, so picture, captions and sound never drift. The engine is generic; each story only writes scene drawings (and optionally a score). Inputs come from two sibling skills: `story-storyboard` (storyboard.json) and `sheet-to-sprites` (sprites.json + PNGs).

## 1. Scaffold

```bash
node <skill-dir>/scripts/new-story.mjs stories/<story>/video --storyboard stories/<story>/storyboard.json --sprites <characters>/sprites.json --sprites <kits>/sprites.json --narration out/tts/<story>-<lang>
```

This copies the template, writes `story.config.js` with relative URLs, and warns about cast members with no sprite. `--sprites` repeats (character poses plus background element kits; all names land in one sprite table). `--narration` points at the storybook-narration output folder (`full.wav` + `timeline.json`); the storyboard must have been re-timed to it (story-storyboard `retime`, which writes `voice_lines`), and the page then plays the recorded voice instead of browser speech, with the music ducked under every line. Engine files (`index.html`, `js/{main,stage,audio,paint,sprites,util}.js`) can later be refreshed with `--update-engine`; author files (`story.config.js`, `js/scenes.js`, `js/score.js`) are never overwritten.

## 2. Serve and look

```bash
node <skill-dir>/scripts/serve.mjs --serve stories,assets,out --home /stories/<story>/video/ --save-dir out
```

The page must come over HTTP (sprites are images, the storyboard is fetched), and the page, storyboard and sprites must all be under the served root. The server binds 127.0.0.1, supports HTTP Range (needed to review the recorded video) and accepts recordings on `POST /save`. If the project already has its own dev server with these properties, use that.

Open the page. With no scene code yet it plays an animatic: mood-coloured sky, the scene's characters walking in, captions, bubbles, transitions, an auto score from each scene's `music` block, and the storyboard's sound cues. Watch it once before drawing anything; timing problems are cheaper to fix in the storyboard.

Review without playing: `?still&t=<seconds>` shows one frame; in the console `__sheet([3, 12, 25, ...], 4)` draws a contact sheet of many times at once. Use these (or a screenshot of them) to check every scene.

## 3. Draw the scenes

Write one function per scene id in `js/scenes.js` (signature and helpers in `references/architecture.md`). Work scene by scene, checking each with `?still&t=`:

1. Background back to front. Default for stories with element kits (torn-paper collage, mandatory in `fairytale-art-prompts`): `paper` as the drawing-paper ground, a pale `sky` wash, then paste the cut pieces layer by layer with `paste(ctx, name, x, y, height, {tilt, shadow, parallax, camX})` — `sky` → `far` → `mid` → `near`, characters, then `front` and `fx` pieces. Procedural painters (`clouds`, `ground`, `house`) are only for stories without kits.
2. Characters with `spr(ctx, name, x, y, height, {rot, flip, sq})`, feet on the ground line; motion from `T` so seeking works.
3. Effects: `sfxWord` ("쾅!"), stars, hearts, bulbs, puffs, night overlay.

`references/animation-patterns.md` lists the motion recipes, the audience rules (move only what the narration names, scene length, questions, captions, fear by age) and the bugs already hit once (characters visible before their entrance, props larger than buildings, off-screen crowds). Check the storyboard's `audience` band first; a 3-5 version moves less, holds pictures longer and never shows a transformation.

## 4. Sound

Start with the auto score; replace it scene by scene in `js/score.js` when the story deserves real music. Keep music at least 15 dB under narration and instrumental only, and master to −14 LUFS (levels table in `references/sound-design.md`). With recorded narration, measure instead of guessing: `await __mix()` in the page console renders the whole sound offline and returns `voiceOverMusicDb` (voice energy over the ducked music while someone speaks), `lufs` and `peak`; tune `mix: { music, duck, voice, master }` in story.config.js until the voice is 15 dB+ over the music, about −14 LUFS and the peak under 0.89 (−1 dB). Golden-axe ended at `{ music: 0.45, duck: 0.4, voice: 1, master: 1.35 }` with bass and drums turned down in score.js: voice 19-22 dB over the music in every 30 s window, about −14 LUFS, peak 0.77. The master chain ends in a peak limiter, so `master` sets loudness without clipping. A full 4-minute render takes longer than a console call allows; start it with `.then()` and read the result afterwards. Cue sound effects in the storyboard (`cues`) so the timing lives in one place. Names, arguments and mood recipes: `references/sound-design.md`. Any name the synth does not know is listed in the console as silent.

## 5. Record and verify

Click "영상 파일로 저장": the page plays from 0 in real time and the server stores `<saveName>.mp4` (Chrome) or `.webm` in the save folder. Then:

```bash
node <skill-dir>/scripts/probe-mp4.mjs out/<saveName>.mp4 --expect-duration <storyboard duration> --tolerance 1 --expect-size 1920x1080 --require-audio
```

Also check frame rate (heavy scenes drop frames during real-time capture) and that audio is not silent; the full checklist is `references/output-verify.md`. You cannot hear the result, so ask the user to listen to it before calling it done.

## Report

Reply in the user's language: page URL and run command, which scenes have custom drawing and which still use the animatic, the probe result (duration, size, fps, audio), and anything the user should look at or listen to.
