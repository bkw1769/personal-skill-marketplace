# QA and retakes

`tts/bin/tts batch` checks every line right after it is generated. The checks need no extra model, so they are instant. They catch the common Qwen3-TTS failures, but they cannot hear a wrong word or a wrong stress: a person still listens before anything is published.

## What is checked

| Result | Rule | What it usually means |
|---|---|---|
| FAIL `silent` | No frame above 5% of the loudest one | Generation produced nothing usable. |
| FAIL `too fast` | Pace above 8.5 Hangul syllables/s (ko) or 4.2 words/s (en) | Words or a whole clause were skipped. |
| FAIL `too slow` | Pace below 2.5 syllables/s (ko) or 1.3 words/s (en) | Rambling, repeated words, long hum, or extra invented speech. |
| FAIL `cut-off` | Last 20 ms frame still above 10% of the peak | The line stops mid-word. This is the known truncated-last-word issue (QwenLM/Qwen3-TTS #55). |
| FAIL `clipping` | Peak at or above 0.99 | Distortion. |
| FAIL `filler` | The line splits (at pauses of 0.25 s or more) into more sound segments than the text has phrases (split at `, . ? ! ; : … ·`), and the first or last segment is 0.1-0.7 s long and too short for the first or last word even at 8.5 syllables/s (4.2 words/s) | The model added "예", "음" or "으흥" before or after the line. Breaths and clicks under 0.1 s pass, and so does a natural pause after a short opening word ("그런데, ..."). Allow it on purpose with `"fillers": true` on the line (below). |
| FAIL `runaway` | Generation hit the token cap: twice the expected length of the text, at 12.5 codec tokens per second | The model never stopped: noise, babble or minutes of garbage. Usually a bad reference transcript or a very short or odd text. |
| WARN `voice drift` (after the batch) | The line's speaking pitch AND brightness (spectral centroid) both sit more than 15% from the medians of the other lines of the same voice, in the same direction (needs 5 or more lines of that voice) | The clone read this line as another take of the voice: lower, darker and usually slower (or the reverse). Typical causes: a casual ending such as "~죠" among formal lines, a very short line. The per-line checks pass it, but listeners hear it. |
| WARN `long pause` | Gap over 1.5 s inside the line | Possibly a skipped phrase or a stall. Listen. |
| WARN `leading silence` | Speech starts after 1.0 s | Odd start. Listen; trimming in `join` removes it anyway. |

- **How pace is measured.** Pace counts text units (Hangul syllables or English words) over the voiced span, from the first to the last speech frame.
- **Typical values.** Calm storytelling measured 5.2-6.4 syllables/s (ko) and 3.2-3.6 words/s (en) on frozen narrator voices.
- **Use the measured pace.** It is reported per line in the batch log and as `pace` in `manifest.json`, and it tells you whether a voice reads too fast for small children. If it does, design a slower voice; the clone has no speed control.

- **Fillers are opt-in** (user, 2026-10-21). A filler the script did not ask for read as a mistake in a published short ("예", "으흥" after the line), and the other checks could not see it because the pace stayed normal. To keep one on purpose, write it in the text ("음, 그랬답니다.") and set `"fillers": true` on that line in `lines.jsonl`; `tts/bin/tts check` takes `--allow-fillers` for the same. Every other line is retaken until it has none.

## What batch does on a failure

1. It retakes with seed + 1000, then seed + 2000 (`--retakes 2`).
2. If every attempt fails, it keeps the last one with `status: "failed"` and lists the failures in `manifest.json`. The command exits 1 and names the failed ids.
3. `attempts` in the manifest shows every seed that was tried and why it failed.

## What batch does on voice drift

After every line is generated, `batch` measures each line's pitch and brightness (stored as `profile` in `manifest.json`) and compares it with the other lines of its voice, using medians taken before any retake.

1. A line generated in this run that drifts is retaken with new seeds (the next seed steps after its last attempt), up to `--drift-retakes` times (default 3; 0 only warns). Each retake must pass QA; the take closest to the voice is kept, and it stops at the first take that no longer drifts.
2. A line that still drifts, and a cached line that drifts, gets a `voice drift` warning in the manifest and the log, with the pitch and brightness deviations.
3. Fix it with the ladder below. Rewriting a casual ending to the narrator's register usually works better than more seeds (hallway-hydrant l05: "~거리죠" stayed slow on every seed, "~거리입니다" matched).

Measured on 15 shorts narrations (2026-10-21), the rule flagged 5 lines in 4 folders, including the hallway-hydrant l05 take the user heard as off and the crosswalk l03 take the user had re-picked.

## Fix ladder for a failed or bad line

Try these in order, cheapest first:

1. **Rewrite the text.**
   - Most persistent failures come from the text: a long line, digits, English inside Korean, a missing final period, quotes or brackets in odd places.
   - Fix the text in `lines.jsonl`, or in the source script followed by re-converting.
   - Rerun `batch`; only lines whose text changed regenerate.
2. **Split the line.** Two short sentences are safer than one long one. Give the parts new ids (`ko-014a`, `ko-014b`) and a short `pause_after` (0.2-0.35 s) between them.
3. **Retake with another seed range:** `tts/bin/tts batch <lines> --out-dir <dir> --only ko-014 --seed 7`. The manifest records the base seed (`base_seed`), so the picked take survives later plain runs; no hand-kept seed list is needed. A line that failed QA is left out of the voice-drift medians and gets no drift retake (its retakes belong to the QA ladder).
4. **If one voice fails often across many lines**, its reference clip is the problem. Typical causes are a clip that is too short, ends abruptly, or carries a strong emotion. Re-design the voice with a calmer, 8-15 s sample line, `pick` again, and regenerate that voice's lines. Changing `ref.wav` changes the cache key, so they regenerate automatically.
5. **If the model keeps mispronouncing a word**, respell it the way it is pronounced:
   - Korean: write the sound in Hangul with spaces where the pause belongs.
   - English: use a simpler synonym.

## Listening pass (human)

Have the user listen to `full.wav`, ideally in two passes:

1. **Story pass.** Listen at normal speed for:
   - wrong words
   - wrong character voice
   - unnatural emphasis
   - pauses that feel too long or too short (edit `pause_after` and run `join`)
2. **Spot pass.** Open the line WAVs that had warnings, plus the first line of each new voice.

When the user names a line, for example "the 3rd sentence of the fox", find its id in `timeline.json` (it lists the text and times) and apply the fix ladder.

## Optional: ASR round trip

For long stories or regular production, transcribing each line back and comparing it with the script catches mispronunciations the pace check cannot. Character error rate (CER) under about 5% is a reasonable starting gate for Korean, to be tuned by listening. Options:
- mlx-audio includes Whisper large-v3-turbo and Qwen3-ASR (Korean). The model is an extra download of about 1.5 GB; ask before downloading.
- Compare after removing punctuation and spaces.
- A mismatch that is only a number written differently is not an error.

This is not built into the template yet. Add it as a `check-asr` command if the user wants it.

## Loudness

- **What `join` does:** it trims each line and levels it to -20 dBFS RMS with a -1 dBFS peak ceiling, so lines match each other.
- **What it does not do:** it is not a broadcast loudness target.
- **For YouTube:** after mixing music and effects in the video step, aim for about -14 to -16 LUFS integrated, and keep narration clearly above the music, about 10-15 dB louder. These are general practice values; adjust by ear.
