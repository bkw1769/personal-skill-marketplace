#!/usr/bin/env bash
# Unit tests with the 100% coverage gate (no model or GPU needed).
set -euo pipefail
source "$(dirname "$0")/env.sh"
cd "$UV_PROJECT"
exec uv run --frozen --quiet pytest "$@"
