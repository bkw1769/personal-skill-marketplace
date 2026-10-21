# tts

Local Korean and English speech for the fairytale channels with Qwen3-TTS 1.7B (Apache-2.0) on MLX. A character voice is designed once from a text description, one take is frozen as `ref.wav`, and every later line is cloned from it so the voice stays the same across lines, stories and machines.

Everything runs from the external drive: the uv binary, Python 3.12, the virtual environment and the model weights live under `<repo>/.portable/` and `tts/.venv/`. Any Apple Silicon Mac that mounts the drive can run it without installing anything.

## Requirements

- Apple Silicon Mac (MLX). Measured on M4 Pro / 24 GB: peak memory about 7.5-8.6 GB.
- About 7 GB free on the drive for the two models.

## Setup (once per machine, safe to re-run)

```bash
tts/bin/setup.sh
```

It installs Python into `.portable/python`, syncs `tts/.venv` from `uv.lock`, downloads the pinned models into `.portable/hf`, then runs `doctor`.

## Use

Voices live in the asset catalog at `assets/audio/voices/<id>/` so they can be reused across stories. Design a voice (writes `candidates/take-N.wav` there), listen, freeze one take, approve it after the user has listened, then speak. Write `--instruct` in English (the model's voice design is documented for English/Chinese); the sample `--text` is in the channel language, 2-3 sentences, 8-15 s. `pick` trims the reference to 0.15 s lead / 0.4 s tail silence and warns on cut-off or odd length.

```bash
tts/bin/tts design --voice narrator-ko --lang ko --takes 4 --instruct "Warm, gentle female storyteller in her early 30s, medium-low pitch, soft and clear articulation, slow relaxed pace, kind and reassuring tone, suited for bedtime fairy-tale narration." --text "옛날 옛적, 깊은 산속 작은 마을에 마음씨 착한 나무꾼이 살고 있었어요. 나무꾼은 날마다 숲에 가서 나무를 했답니다." --category narrator --gender female --age young-adult --character narrator --mood calm
```

```bash
tts/bin/tts pick --voice narrator-ko --take 2
```

```bash
tts/bin/tts approve --voice narrator-ko
```

```bash
tts/bin/tts speak --voice narrator-ko --file stories/sample/ko.txt --out out/tts/sample-ko.wav
```

Whole script, line by line, with automatic QA and retakes, then joined with pauses:

```bash
tts/bin/tts batch out/tts/story/lines.jsonl --out-dir out/tts/story
```

`lines.jsonl` has one `{"id", "voice", "text", "pause_after", "speaker", "fillers"}` object per line (`pause_after`, `speaker` and `fillers` optional; `"fillers": true` keeps a filler such as "음" that the text asks for). The output folder gets `<id>.wav`, `manifest.json` (seed, pace, QA result, attempts per line), `full.wav` and `timeline.json` (real start/end and speaker of each line). Unchanged lines are skipped on re-runs, with the seed they were recorded with (a take picked with `--only id --seed 7` stays); `--only id1,id2` regenerates chosen lines; a line failing QA is retried with seed + 1000 up to `--retakes` times (default 2); a new line whose pitch and brightness both sit more than 15% from the other lines of its voice (`voice drift`) is retaken up to `--drift-retakes` times (default 3, 0 only warns) and the closest take is kept. `tts/bin/tts check <wav> --text ... --lang ko` runs the same QA on any file, and `tts/bin/tts join` rebuilds `full.wav` after edits.

QA (model-free, `qa.py`): fails on silence, clipping, a cut-off ending, a runaway generation (token cap), a filler the text does not have ("예" or "음" cut off before or after the line by a pause; skipped with `"fillers": true` or `check --allow-fillers`), or a pace outside 2.5-8.5 Hangul syllables/s (Korean) or 1.3-4.2 words/s (English); warns on pauses over 1.5 s inside a line and leading silence over 1 s. After a batch, `voice_profile` (median pitch, spectral centroid) per line and `drift_of` against the voice's medians flag a line that sounds like another take of the voice. It does not replace listening.

Emotion variant of a frozen voice (the clone model ignores instructions but copies the reference's delivery), then `pick` as usual:

```bash
tts/bin/tts variant --from fox-ko --voice fox-ko-scared --note "scared" --text "으, 으악! 저기 뭐가 움직였어! 나, 나는 하나도 안 무서워."
```

`pick` writes `manifest.json` (status `candidate`, labels, provenance) and rebuilds the catalog index with `scripts/assets/cli.mjs` when it exists. `approve` sets `approved` and reverts if the catalog validator refuses (blocked or non-commercial source, missing provenance, missing consent record). `batch` warns when a voice is not approved. Legal guards in the tool: `design` refuses descriptions that point at a real person ("sounds like", "in the style of", a name); `variant` needs an approved master; models load only with an Apache-2.0/MIT license.

Other commands: `tts/bin/tts voices` (list frozen voices with catalog status), `tts/bin/tts doctor` (machine, paths, cached models), `tts/bin/tts pull` (download pinned models).

- `--lang` is `ko` or `en`; one voice per language (for example `narrator-ko`, `narrator-en`).
- In `speak`, each line of the text is generated separately (mlx-audio's clone path ignores line breaks) and joined into one 24 kHz WAV.
- Sampling uses the checkpoint defaults (temperature 0.9, top_k 50, top_p 1.0, repetition penalty 1.05; mlx-audio raises it to 1.5 when cloning). `batch` caps tokens at twice the expected length and fails a line that hits the cap.
- Do not use the CustomVoice preset speakers (e.g. Sohee) for published audio; their speaker rights are unconfirmed.

## Test

```bash
tts/bin/test.sh
```

Unit tests replace mlx, mlx-audio and huggingface_hub with fakes, so they need no model or GPU. Coverage gate: 100% lines and branches.

## Layout

| Path | Purpose |
|---|---|
| `bin/env.sh` | Sourced by every script: points uv, Python and `HF_HOME` at the drive, derived from its own location. |
| `bin/setup.sh`, `bin/tts`, `bin/test.sh` | Setup, CLI wrapper, test runner. |
| `src/fairytale_tts/config.py` | Pinned model repos and revisions, language codes, paths. |
| `src/fairytale_tts/engine.py` | mlx-audio wrapper: fetch, load, synthesize, write WAV. |
| `src/fairytale_tts/voices.py` | Design takes, freeze, load and list frozen voices. |
| `src/fairytale_tts/catalog.py` | Asset-catalog manifest per voice (labels, provenance, status), approve, index rebuild. |
| `src/fairytale_tts/batch.py` | JSON Lines script -> per-line WAV with QA and retakes, manifest, join into `full.wav` + `timeline.json`. |
| `src/fairytale_tts/qa.py` | Model-free checks (pace, cut-off, clipping, silences, fillers), voice drift across lines (pitch, brightness), trim and level matching. |
| `src/fairytale_tts/cli.py` | `fairytale-tts` commands. |
| `../assets/audio/voices/<id>/` | Frozen voice: `ref.wav` + `voice.json` + `manifest.json` (tracked); `candidates/` (ignored drafts). |
