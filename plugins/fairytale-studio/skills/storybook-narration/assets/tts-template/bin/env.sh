# Source this file (do not execute) to point uv, Python and Hugging Face at the
# external drive, so the same checkout works on any Apple Silicon Mac it is
# plugged into. Paths are derived from this file's location, not hard-coded.
_ft_tts_dir="$(cd "$(dirname "${BASH_SOURCE[0]:-${(%):-%x}}")/.." && pwd)"
export FAIRYTALE_ROOT="$(cd "$_ft_tts_dir/.." && pwd)"
export FAIRYTALE_PORTABLE="$FAIRYTALE_ROOT/.portable"
export UV_PYTHON_INSTALL_DIR="$FAIRYTALE_PORTABLE/python"
export UV_CACHE_DIR="$FAIRYTALE_PORTABLE/uv-cache"
export UV_PROJECT_ENVIRONMENT="$_ft_tts_dir/.venv"
export UV_PROJECT="$_ft_tts_dir"
export UV_PYTHON_PREFERENCE="only-managed"
export HF_HOME="$FAIRYTALE_PORTABLE/hf"
export HF_HUB_DISABLE_TELEMETRY=1
# A copy of uv lives on the drive so a second Mac needs no install at all.
case ":$PATH:" in *":$FAIRYTALE_PORTABLE/bin:"*) ;; *) export PATH="$FAIRYTALE_PORTABLE/bin:$PATH" ;; esac
unset _ft_tts_dir
