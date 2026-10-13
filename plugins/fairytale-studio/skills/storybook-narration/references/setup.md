# Setup, portability and troubleshooting

## What the tool is

`tts/` is a small Python 3.12 project managed by uv. It wraps mlx-audio, which runs Qwen3-TTS on Apple Silicon through MLX. Two models are pinned to exact Hugging Face revisions in `tts/src/fairytale_tts/config.py`:

| Key | Repo | Use | Size |
|---|---|---|---|
| `design` | `mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-8bit` | Create a voice from a text description | about 3.1 GB |
| `clone` | `mlx-community/Qwen3-TTS-12Hz-1.7B-Base-8bit` | Speak any line in a frozen voice (reference clip + transcript) | about 3.1 GB |

Both repos, the upstream `Qwen/Qwen3-TTS-12Hz-1.7B-*` models and the speech tokenizer are labeled `apache-2.0` on Hugging Face (checked 2026-10-07). Change a revision only together with a listening comparison, because a different revision changes every voice.

Why 1.7B in 8-bit:
- Third-party measurements show 0.6B losing much accuracy when quantized: WER 9.7-15.6%, against about 3.5% for 1.7B.
- 8-bit keeps 1.7B close to bf16 at about two thirds of the size.
- bf16 (`...-bf16`, about 4.5 GB each) is an option on machines with 24 GB or more.

## Portable layout (external drive)

Everything lives inside the project, so the drive can move between Macs:

| Path | Contents |
|---|---|
| `.portable/bin/uv` | A copy of uv. `setup.sh` copies the one on PATH the first time. |
| `.portable/python/` | uv-managed CPython 3.12. |
| `.portable/uv-cache/` | Wheel cache, so rebuilding the venv works offline. |
| `.portable/hf/` | Hugging Face cache with the model weights (`HF_HOME`). |
| `tts/.venv/` | The virtual environment. |

`tts/bin/env.sh` is sourced by every script. It derives all of the paths above from its own location, so nothing is hard-coded to a mount point. The wrappers do not change directory, which means relative `--out`/`--file` paths resolve from where the user runs the command.

On a second Mac, plug in the drive and run `tts/bin/setup.sh`. It needs no Homebrew or other installs.
- The venv stores absolute paths. If the drive mounts at a different path (for example a renamed volume), uv rebuilds the venv from the drive cache automatically.
- If the other machine is not Apple Silicon, MLX cannot run. That machine would need a separate PyTorch path, which this template does not include.

## Commands

| Command | Purpose |
|---|---|
| `tts/bin/setup.sh` | Install or repair (Python, venv, models), then run `doctor`. |
| `tts/bin/tts doctor` | Machine, paths, cached models. Exit 1 if a model is missing. |
| `tts/bin/tts pull` | Download the pinned models. |
| `tts/bin/tts design --voice ID --lang ko\|en --instruct "<English>" --text "..." --category C --gender G --age A [--character c] [--story s] [--mood m] [--takes 4] [--seed 1]` | Candidate takes into `assets/audio/voices/ID/candidates/`. |
| `tts/bin/tts variant --from ID --voice NEW --text "..." [--note "..."] [--takes 4]` | Clone emotional takes from an approved voice into `assets/audio/voices/NEW/candidates/`. |
| `tts/bin/tts pick --voice ID --take N` | Freeze a take as `ref.wav` (silences trimmed) + `voice.json`, and register it in the asset catalog as `candidate`. |
| `tts/bin/tts approve --voice ID` | Mark approved after the user listened. Reverts if the catalog validator refuses. |
| `tts/bin/tts voices` | List frozen voices with catalog status. |
| `tts/bin/tts speak --voice ID --text "..." \| --file F [--out W] [--seed N]` | One-off line in a frozen voice. |
| `tts/bin/tts batch LINES --out-dir D [--only a,b] [--seed N] [--retakes 2] [--force] [--no-join]` | Whole script with QA and retakes. |
| `tts/bin/tts join LINES --out-dir D` | Rebuild `full.wav` + `timeline.json`. |
| `tts/bin/tts check WAV --text "..." --lang ko\|en` | QA any file. |
| `tts/bin/test.sh` | Unit tests (no model needed), 100% coverage gate. |

## Measured on M4 Pro / 24 GB (2026-10-08)

| Step | Speed (compute seconds per audio second) | Peak memory |
|---|---|---|
| Design | 0.32-0.55 | about 7.6 GB |
| Clone | 0.46-0.65 | 7.6-8.6 GB |

- Loading a model takes about 30 s, the first time in each process.
- A 5-line batch took 19 s including the load.
- A 16 GB Mac works too: an earlier VoiceDesign run peaked at 8.1 GB. Close other memory-heavy apps first.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `model ...: missing` in doctor | Run `tts/bin/setup.sh` (needs internet once). |
| `voice 'x' is not frozen` | Run `design` then `pick` for that id. Ids are lowercase kebab-case. Voices live in `assets/audio/voices/`. |
| `approve` says the catalog refused it | Read the validator message. Usual causes: a blocked or non-commercial source, missing provenance, a missing consent file, or a mood value that is not in `taxonomy.json`. |
| Output landed in an unexpected folder | Relative paths resolve from your current directory; pass an absolute `--out-dir`. |
| A transformers warning: `model of type qwen3_tts to instantiate a model of type` | Harmless. It is printed on every load. |
| Very slow or swapping | Not enough free memory. Close apps, or use one model process at a time (do not run two batches in parallel). |
| Same seed sounds slightly different on another machine | Seeds are reproducible only on the same software stack. Keep approved WAVs, do not regenerate them. |
