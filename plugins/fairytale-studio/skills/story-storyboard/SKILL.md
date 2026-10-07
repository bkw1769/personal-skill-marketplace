---
name: story-storyboard
description: Turn a children's story synopsis into a timed storyboard for an animated storybook video - scenes with start/end seconds, on-screen narration captions, speech bubbles, character lists, music mood per scene and sound-effect cue times - saved as storyboard.json plus a readable Markdown table, checked by a bundled validator (scene gaps/overlaps, caption reading speed, unknown speakers). Use this whenever the user asks to 스토리보드 짜줘, 장면 나눠줘, 3분 구성으로 나눠줘, 자막이랑 대사 타이밍 잡아줘, 시놉시스를 영상 대본으로, plan scenes or a shot list for a fairy tale / 동화 / storybook animation, or wants timing for captions, dialogue and sound effects before building the video, even if they never say "storyboard".
---

# Story to storyboard

The storyboard is the single timeline that the picture, captions, bubbles, music and sound effects all read. Getting it into data (not into scene code) is the point: the video template, TTS and subtitle tools can then consume the same file, and edits happen in one place.

## Inputs to pin down

Ask only for what is missing and cannot be inferred:

- Synopsis (any form; often a few timed beats like "0:00-0:40 ...").
- Target length (default 3 minutes) and audience age (default 6-10).
- Language of on-screen text (default Korean).
- Art style / era, and which character sprites exist (a sprites.json from the `sheet-to-sprites` skill, or the cast sheet) so scenes only use drawable characters.

## Workflow

1. **Fact-check and adapt first.** Check names, places and relations in the synopsis against the source tale and fix errors before timing anything; record each fix in `notes.fact_checks`. Rewrite for the audience: violence, death and romance become non-graphic beats (a gate opening and torches coming in instead of a battle). Record these in `notes.adaptations`. See `references/writing-rules.md`.
2. **Split into scenes.** One scene = one location or one clear action, usually 5-15 s; use 12-20 scenes for 3 minutes. Scenes must tile the timeline exactly: first starts at 0, each starts where the previous ended, last ends at `duration`. Give each an `id`, Korean `title`, `location`, one-line `action`, `characters`, `music` (mood, tempo, key, instruments) and `transition`.
3. **Write captions and bubbles.** Captions carry the narration (≤ 2 lines, short sentences, read-aloud rhythm). Bubbles are what a character says or thinks, attached to a cast `speaker`. Time each so it stays on screen at least `characters / 7` seconds (Korean, ages 6-10), and leave a little air between consecutive captions.
4. **Place sound cues** at the moments of visible action (`t`, `sound`, `args`). Put repeated actions (hammer blows, pulls, bonks) on one shared list of times so the animation and the sound use the same numbers. Sound names are whatever the target player knows; for the storybook-video template they are its synth or sample names.
5. **Validate and render:**

   ```bash
   node <skill-dir>/scripts/storyboard.mjs validate storyboard.json
   ```

   ```bash
   node <skill-dir>/scripts/storyboard.mjs render storyboard.json --out storyboard.md
   ```

   Errors (gaps, overlaps, out-of-range times, unknown speakers or characters) must be fixed. Warnings (reading speed, more than two lines) should be fixed unless the user accepts them; say which ones remain.
6. **Review with the user** using storyboard.md: scene list, words on screen, music and cue counts per scene. Change the JSON, re-run validate, re-render.

## Files

- Data format with every field: `references/storyboard-format.md`.
- Writing and timing rules learned from the first video: `references/writing-rules.md`.
- Full worked example (19 scenes, 21 captions, 7 bubbles, 317 cues; one reading-speed warning left in on purpose): `references/example-troy-storyboard.json`.

Save the storyboard next to the story's other inputs (for example `stories/<story-id>/storyboard.json` and `storyboard.md`). Reply to the user in their language with the scene table summary and any remaining warnings.
