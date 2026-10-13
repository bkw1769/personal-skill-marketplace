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
| FAIL `runaway` | Generation hit the token cap: twice the expected length of the text, at 12.5 codec tokens per second | The model never stopped: noise, babble or minutes of garbage. Usually a bad reference transcript or a very short or odd text. |
| WARN `long pause` | Gap over 1.5 s inside the line | Possibly a skipped phrase or a stall. Listen. |
| WARN `leading silence` | Speech starts after 1.0 s | Odd start. Listen; trimming in `join` removes it anyway. |

- **How pace is measured.** Pace counts text units (Hangul syllables or English words) over the voiced span, from the first to the last speech frame.
- **Typical values.** Calm storytelling measured 5.2-6.4 syllables/s (ko) and 3.2-3.6 words/s (en) on frozen narrator voices.
- **Use the measured pace.** It is reported per line in the batch log and as `pace` in `manifest.json`, and it tells you whether a voice reads too fast for small children. If it does, design a slower voice; the clone has no speed control.

## What batch does on a failure

1. It retakes with seed + 1000, then seed + 2000 (`--retakes 2`).
2. If every attempt fails, it keeps the last one with `status: "failed"` and lists the failures in `manifest.json`. The command exits 1 and names the failed ids.
3. `attempts` in the manifest shows every seed that was tried and why it failed.

## Fix ladder for a failed or bad line

Try these in order, cheapest first:

1. **Rewrite the text.**
   - Most persistent failures come from the text: a long line, digits, English inside Korean, a missing final period, quotes or brackets in odd places.
   - Fix the text in `lines.jsonl`, or in the source script followed by re-converting.
   - Rerun `batch`; only lines whose text changed regenerate.
2. **Split the line.** Two short sentences are safer than one long one. Give the parts new ids (`ko-014a`, `ko-014b`) and a short `pause_after` (0.2-0.35 s) between them.
3. **Retake with another seed range:** `tts/bin/tts batch <lines> --out-dir <dir> --only ko-014 --seed 7`.
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
