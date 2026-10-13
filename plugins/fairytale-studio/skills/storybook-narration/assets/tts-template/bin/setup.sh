#!/usr/bin/env bash
# One-time (per machine) setup. Safe to re-run: everything lands on the drive,
# including a copy of uv, so a second Apple Silicon Mac needs no installs.
set -euo pipefail
source "$(dirname "$0")/env.sh"
if [[ "$(uname -s)/$(uname -m)" != "Darwin/arm64" ]]; then
  echo "error: MLX needs an Apple Silicon Mac (found $(uname -s)/$(uname -m))" >&2
  exit 1
fi
command -v uv >/dev/null || { echo "error: uv not found (expected $FAIRYTALE_PORTABLE/bin/uv, or brew install uv)" >&2; exit 1; }
if [[ ! -x "$FAIRYTALE_PORTABLE/bin/uv" ]]; then
  # Keep a copy of uv on the drive so the next machine needs no install.
  mkdir -p "$FAIRYTALE_PORTABLE/bin"
  cp "$(command -v uv)" "$FAIRYTALE_PORTABLE/bin/uv"
fi
uv python install 3.12
uv sync --frozen
uv run --frozen --quiet fairytale-tts pull
uv run --frozen --quiet fairytale-tts doctor
