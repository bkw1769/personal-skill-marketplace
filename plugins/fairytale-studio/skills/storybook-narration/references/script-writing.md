# Writing text the model reads well

Qwen3-TTS has no text normalizer: it reads exactly what it is given, and it was trained mostly on clean prose. Most bad lines come from the text, so write for the ear.

## Split for the model

- **One sentence per line.** This is what `narration-lines.mjs` produces. Reliability drops on long inputs: words get skipped, repeated, or the pace speeds up.
  - Keep a line under about 100 Korean characters or about 220 English characters (about 20-25 s).
  - Split long sentences at a natural clause.
- **Avoid very short lines.** Lines under about 1.5 s ("응?", "Hi.") can loop or ramble. The converter merges a short sentence with its neighbour of the same speaker. For a short line on its own, lengthen it: "응? 뭐라고?" instead of "응?".
- **Keep speakers apart.** A narrator's "여우가 말했어요" and the fox's words are separate lines with separate voices.

## Numbers

Spell every number the way it is read. Digits are the most common misreading, and they get read in the reference's language.

| Write this | Not this |
|---|---|
| 사슴 세 마리, 열두 시, 다섯 살 (native Korean for counting things, hours, age) | 사슴 3마리, 12시, 5살 |
| 삼 년, 이천이십육 년, 십 분, 백 원 (Sino-Korean for years, minutes, money, dates) | 3년, 2026년, 10분, 100원 |
| three little pigs, the year twenty twenty-six | 3 little pigs, 2026 |

## Other languages, symbols and formatting

- **English inside Korean:** write it in Hangul. Use 오케이, 티라노사우루스, 엔지 (NG). In English lines, Korean names are romanized ("Heungbu and Nolbu").
- **Abbreviations:** spell them out. Use 텔레비전, 미스터, Doctor (not "Dr.").
- **Symbols:** use words. ~, %, &, /, :, +, = become 에서, 퍼센트, 그리고, and so on, or are removed.
- **Emoji, markdown, stage directions in brackets, speaker labels such as "나레이션:":** remove them. They are either read aloud or confuse the model.
- **Quotation marks:** remove them. The converter strips them, and lint warns. The dialogue already has its own voice, and lines that start with quotes can make the model switch to a different voice.

## Punctuation and pauses

- **End every line with `.`, `?` or `!`.** A missing end mark is a common cause of the truncated last word in Korean (Qwen3-TTS issue #55).
- **Commas** give short in-line breaths. Use them where a storyteller would pause.
- **Ellipsis:** use one "…" for hesitation, rarely. Long runs of dots ("....") cause odd pauses or noise.
- **Exclamation and question marks** shape the delivery. Keep one, never "?!" or "!!!".
- **Pauses between lines** come from `pause_after`, not from punctuation. `join` inserts them after trimming each line. Converter defaults are for children's stories:

| After | Default `pause_after` | Range to try |
|---|---|---|
| Sentence within a paragraph | 0.6 s | 0.5-0.8 |
| Speaker change (narrator to dialogue and back) | 0.6 s | 0.5-0.7 |
| Paragraph end | 1.1 s | 1.0-1.3 |
| Scene change (set by hand) | 2.0 s | 1.5-2.5 |

  Use the longer end for younger children. Edit `pause_after` in `lines.jsonl` and run `tts/bin/tts join` to rebuild without regenerating audio.

## Rhythm for children

- **Sentence length.** Short sentences and simple words. A 6-10 year-old follows a sentence of about 10-20 Korean syllables comfortably.
- **Repetition and sound words** (쿵쿵, 살금살금, 데굴데굴) read well and make stories fun. Write them in Hangul with spaces where the beat is.
- **Emotion in the words.** The clone reads emotion from wording and punctuation ("와, 정말 신난다!" vs "신났다."). Strong emotional states need a variant voice (see `voice-design.md`).

## Pronunciation fixes

When a word keeps coming out wrong, respell it as it sounds:
- Korean: put a space where a syllable boundary is mis-read, and use phonetic spelling for tricky liaison, for example a name that must not be linked to the next word.
- English: replace a hard proper noun with a simpler spelling of its sound, or use a different word.

Keep the original spelling in the subtitles. The storyboard captions stay correct even when the TTS text is respelled.

## Before and after

```text
before  [narrator] "나무꾼님!" 사슴이 외쳤어요... 3마리의 사냥꾼이 쫓아오고 있었거든요~
after   [deer] 나무꾼님, 저 좀 숨겨 주세요!
        [narrator] 사슴이 다급하게 외쳤어요. 사냥꾼 세 명이 쫓아오고 있었거든요.
```

```text
before  [narrator] At 7:30 the 3 pigs (and their mom) went to the market... FYI it was far!!
after   [narrator] At half past seven, the three little pigs and their mother set off for the market. It was a long, long way!
```
