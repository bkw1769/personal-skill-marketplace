"""Pinned models, supported languages and project paths."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class ModelSpec:
    """A Hugging Face model pinned to one revision."""

    key: str
    repo: str
    revision: str
    license: str


# Revisions are pinned so every machine synthesizes with identical weights.
# Change them only together with a listening comparison (see docs/DECISIONS.md).
MODELS: dict[str, ModelSpec] = {
    "design": ModelSpec(
        key="design",
        repo="mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-8bit",
        revision="f90d617701d9f7f4ca499291e0b57f2b3c2fd2ee",
        license="apache-2.0",
    ),
    "clone": ModelSpec(
        key="clone",
        repo="mlx-community/Qwen3-TTS-12Hz-1.7B-Base-8bit",
        revision="e7dd0585652209fa0d7783659aad4e8a324de11c",
        license="apache-2.0",
    ),
}

# Only these model licenses may produce published audio (see assets/catalog/sources.json).
COMMERCIAL_LICENSES = frozenset({"apache-2.0", "mit"})

# Channel language code -> language name understood by Qwen3-TTS.
LANGUAGES: dict[str, str] = {"ko": "korean", "en": "english"}


def language_name(code: str) -> str:
    """Return the Qwen3-TTS language name for a channel language code.

    Args:
        code: ``ko`` or ``en``.

    Returns:
        The model's language name.

    Raises:
        ValueError: If the code is not supported.
    """
    try:
        return LANGUAGES[code]
    except KeyError:
        supported = ", ".join(sorted(LANGUAGES))
        raise ValueError(f"unsupported language '{code}' (use one of: {supported})") from None


def project_root() -> Path:
    """Return the repository root.

    Uses ``FAIRYTALE_ROOT`` (set by ``tts/bin/env.sh``) and falls back to the
    location of this file, so the drive can be mounted at any path.
    """
    env = os.environ.get("FAIRYTALE_ROOT")
    if env:
        return Path(env).resolve()
    return Path(__file__).resolve().parents[3]


def voices_dir() -> Path:
    """Return ``<root>/assets/audio/voices``: frozen voices live in the asset catalog."""
    return project_root() / "assets" / "audio" / "voices"


def default_out_dir() -> Path:
    """Return ``<root>/out/tts``, the folder for generated speech."""
    return project_root() / "out" / "tts"
