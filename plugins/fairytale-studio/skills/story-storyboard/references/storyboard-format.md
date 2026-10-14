# storyboard.json (schema `storyboard/1`)

All times are seconds from the start of the video (numbers, decimals allowed).

```json
{
  "schema": "storyboard/1",
  "title": "트로이의 거대한 목마",
  "language": "ko",
  "audience": "6-8",
  "audience_age": "6-10",
  "duration": 180.5,
  "frame": { "width": 1920, "height": 1080 },
  "style": "watercolor-ink",
  "era": "ancient-greece",
  "synopsis": [ { "start": 0, "end": 40, "text": "..." } ],
  "cast": [
    { "id": "girl", "name": "소녀", "notes": "8살, 산호색 옷", "sprites": ["girl", "girl-front", "head-curious"] }
  ],
  "scenes": [
    {
      "id": "title", "start": 0, "end": 7,
      "title": "제목", "location": "종이 위", "action": "손글씨 제목이 그려지고 목마가 굴러 들어온다",
      "characters": ["wooden-horse"],
      "music": { "mood": "playful", "tempo": 112, "key": "C major", "instruments": ["marimba", "pad"] },
      "transition": "blot"
    }
  ],
  "captions": [ { "start": 8.0, "end": 18.8, "text": "아주 먼 옛날...\n두 번째 줄", "kind": "narration" } ],
  "bubbles": [ { "start": 62.4, "end": 66.6, "speaker": "greek-soldier", "text": "이 전쟁은 끝나지 않는 걸까?", "kind": "think", "narrate": true } ],
  "cues": [ { "t": 47.4, "sound": "boing", "args": [0.34] } ],
  "notes": { "fact_checks": ["..."], "adaptations": ["..."], "timing": ["..."] }
}
```

| Field | Required | Meaning |
|---|---|---|
| `schema`, `title`, `duration` | yes | Format tag, story title, total length in seconds. |
| `audience` | recommended | Age band `3-5`, `6-8` or `9-10`; sets the validator's reading speed, episode length and scene length (see `audience-profiles.md`). Without it the lower bound of `audience_age` decides; default `6-8`. |
| `language` | recommended | `ko` (default) or `en`; `en...` switches the reading-speed check from syllables per second to words per minute. |
| `audience_age`, `frame`, `style`, `era` | no | Context for the video template and the art/asset skills (`style`/`era` match the fairytale-art-prompts module names). |
| `synopsis` | no | The input beats, kept for traceability. |
| `cast[].id` | recommended | Kebab-case id used by `scenes[].characters` and `bubbles[].speaker`. When `cast` is present, unknown ids are errors. `sprites` lists sprite names from sprites.json that show this character. |
| `scenes[]` | yes | Must tile `0..duration` with no gaps or overlaps (tolerance 0.05 s). `transition`: `cut` or `blot` (paint-bleed wipe) or a template-specific name. `music.mood` uses the asset taxonomy moods when possible (playful, calm, warm, tense, sad, mysterious, sleepy, festive, wonder). Optional `light`: `sunset`, `night` or `mist` for scenes whose background plate is not daylight; the storybook-video template tints every pasted piece and character in that scene to match. |
| `captions[]` | no | Narration text at the bottom of the frame. In time order, not overlapping. `kind`: `narration` (default) or `quote` (big centred lesson line). `\n` = line break; at most 2 lines. |
| `bubbles[]` | no | Speech or thought bubble. `kind`: `say` or `think`. `narrate: false` keeps it out of TTS (e.g. "쉿!", "..."). Screen position is decided by the scene code, not here. |
| `cues[]` | no | Sound events: `t` seconds, `sound` name, optional `args` passed to the player (volume, pitch, duration...). Order does not matter. |
| `notes` | no | Lists of strings, rendered at the end of storyboard.md. |

Validator rules (`scripts/storyboard.mjs validate`):

- Errors: wrong schema, missing title/duration, no scenes, missing or duplicate scene ids, start ≥ end, times outside the video, scene gaps or overlaps, first scene not at 0, last scene not at `duration`, overlapping captions, empty text, bubble without speaker, unknown speaker/character, cue time out of range, cue without sound.
- Warnings: text that needs more than `chars / max-cps` seconds (Korean; band default 4 / 5 / 5.5 characters per second, whitespace not counted; `--max-cps` overrides) or `words / max-wpm` minutes (English; band default 120 / 135 / 150 words per minute; `--max-wpm` overrides), more than two lines, episode duration outside the band's single-story range (3-5: 3-7 min, 6-8: 6-12 min, 9-10: 10-18 min), scenes shorter than the band minimum (8 / 5 / 4 s, last scene exempt).

## Fields added by `retime`

- `captions[].voice_lines`, `bubbles[].voice_lines`: ids of the recorded lines (from the narration `timeline.json`) that speak this item, in order. The video plays those clips at the item's `start`.
- Scene `start`/`end`, item times, cue `t` and `duration` are rewritten; everything else is kept. Keep the pre-voice version as `storyboard.estimate.json`.
