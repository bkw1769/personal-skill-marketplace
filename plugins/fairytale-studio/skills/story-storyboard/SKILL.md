---
name: story-storyboard
description: Turn a children's story synopsis into a timed storyboard for an animated storybook video - scenes with start/end seconds, on-screen narration captions, speech bubbles, character lists, music mood per scene and sound-effect cue times - saved as storyboard.json plus a readable Markdown table, checked by a bundled validator (scene gaps/overlaps, caption reading speed, episode and scene length for the 3-5 / 6-8 / 9-10 audience band, unknown speakers), with research-based age profiles. Use this whenever the user asks to 스토리보드 짜줘, 장면 나눠줘, 3분 구성으로 나눠줘, 자막이랑 대사 타이밍 잡아줘, 시놉시스를 영상 대본으로, plan scenes or a shot list for a fairy tale / 동화 / storybook animation, or wants timing for captions, dialogue and sound effects before building the video, even if they never say "storyboard".
---

# Story to storyboard

The storyboard is the single timeline that the picture, captions, bubbles, music and sound effects all read. Getting it into data (not into scene code) is the point: the video template, TTS and subtitle tools can then consume the same file, and edits happen in one place.

## Inputs to pin down

Ask only for what is missing and cannot be inferred:

- Synopsis (any form; often a few timed beats like "0:00-0:40 ...").
- Audience band: `3-5` (유아), `6-8` (초등 저학년, default) or `9-10` (optional). It decides length, narration speed, sentence length, cast size, scene length, questions, captions and how scary the villain may be; read `references/audience-profiles.md` before writing. One story can be made as a gentle 3-5 version and a full 6-8 version from the same art.
- Target length: inside the band's single-story range (3-5: 3-7 min, aim 4-6; 6-8: 6-12 min, aim 7-10; 9-10: 10-18 min or a 2-4 part series).
- Language of on-screen text (default Korean).
- Art style / era, and which character sprites exist (a sprites.json from the `sheet-to-sprites` skill, or the cast sheet) so scenes only use drawable characters.

## Workflow

1. **Stay faithful, fact-check, then adapt the telling.** Keep the source tale's plot, characters, roles and ending as commonly told; never replace, add or remove a character or event on your own, even for a younger band. Changes beyond presentation (wording, pacing, comic staging, harm kept off screen) are proposals: show original vs proposed with the reason and wait for the user, and list them in the synopsis's "Changes from the original" table. Check names, places and relations against the source and record fixes in `notes.fact_checks`; record approved adaptations in `notes.adaptations`. See `references/writing-rules.md` (Faithful to the source tale).
2. **Split into scenes.** One scene = one picture: one location or one clear action, timed by the audience band (3-5: 8-20 s, one narration sentence per picture; 6-8: 5-15 s; never cut mid-sentence). A 5-minute 3-5 story has about 5-7 story beats and 20-30 scenes. Scenes must tile the timeline exactly: first starts at 0, each starts where the previous ended, last ends at `duration`. Give each an `id`, Korean `title`, `location`, one-line `action`, `characters`, `music` (mood, tempo, key, instruments) and `transition`.
3. **Write captions and bubbles.** Captions carry the narration (≤ 2 lines, short sentences, read-aloud rhythm, 의성어·의태어, a refrain). Bubbles are what a character says or thinks, attached to a cast `speaker`. Time each so it stays on screen at least `characters / band speed` seconds (Korean: about 4 syllables/s for 3-5, 5 for 6-8, 5.5 for 9-10; English: about 110-120, 135 and 150 words per minute), leave the band's pauses between sentences, and add the band's questions with silence after them.
4. **Place sound cues** at the moments of visible action (`t`, `sound`, `args`). Put repeated actions (hammer blows, pulls, bonks) on one shared list of times so the animation and the sound use the same numbers. Sound names are whatever the target player knows; for the storybook-video template they are its synth or sample names.
5. **Validate and render:**

   ```bash
   node <skill-dir>/scripts/storyboard.mjs validate storyboard.json
   ```

   ```bash
   node <skill-dir>/scripts/storyboard.mjs render storyboard.json --out storyboard.md
   ```

   Errors (gaps, overlaps, out-of-range times, unknown speakers or characters) must be fixed. Warnings (reading speed, more than two lines, episode length or scene length outside the audience band) should be fixed unless the user accepts them; say which ones remain. `--audience 3-5` checks the same storyboard against another band, for example when making a gentle version.
6. **Review with the user** using storyboard.md: scene list, words on screen, music and cue counts per scene. Change the JSON, re-run validate, re-render.
7. **Re-time to the recorded voice** once narration exists (voice first, picture follows). Keep the estimated storyboard as `storyboard.estimate.json` and always re-time from it, so re-recording a line and re-running gives the same result:

   ```bash
   node <skill-dir>/scripts/storyboard.mjs retime storyboard.estimate.json --timeline <tts out>/timeline.json --out storyboard.json
   ```

   Recorded lines are matched to captions and bubbles by their text (letters and digits only, so punctuation edits made for TTS still match; split and merged lines are handled). Each scene keeps its lead-in and the pause after every line (question pauses survive), lasts as long as its speech plus a tail but never less than the band's minimum scene, and cues and unspoken bubbles move with the line before them. Spoken items get `voice_lines` (the recorded line ids) for the video's audio track. Validate afterwards: reading-speed warnings now mean the voice itself is faster than the band (golden-axe: the narrator spoke 150-200 wpm against 120 for 3-5) - slow the voice or add pauses, not the captions.

8. **Subtitles for upload** after the final re-time: captions and bubbles in time order as a SubRip file for YouTube (overlapping lines end just before the next one starts; `--speakers yes` puts the cast name before dialogue):

   ```bash
   node <skill-dir>/scripts/storyboard.mjs srt storyboard.json --out <video>.srt
   ```

## Files

- Data format with every field: `references/storyboard-format.md`.
- Age bands and their numbers (length, speed, pauses, sentences, cast, scenes, questions, captions, fear, voices, sound), with evidence grades: `references/audience-profiles.md`.
- Writing and timing rules learned from the first video: `references/writing-rules.md`.
- Full worked example (19 scenes, 21 captions, 7 bubbles, 317 cues): `references/example-troy-storyboard.json`. Made before the age research: against the 6-8 band it raises 9 warnings (3 minutes is short, 8 captions read faster than 5 syllables/s), which shows what the band rules change.

Save the storyboard next to the story's other inputs (for example `<project>/stories/<story-id>/storyboard.json` and `storyboard.md`, where `<project>` is `src/<project>` in a multi-project workspace or `.` in a single-project repo). Reply to the user in their language with the scene table summary and any remaining warnings.
