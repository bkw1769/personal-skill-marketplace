"""Thin wrapper over mlx-audio's Qwen3-TTS: fetch, load, synthesize, write.

Heavy imports (mlx, mlx_audio, huggingface_hub) happen inside functions so the
CLI starts fast and unit tests can replace them.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

from .config import COMMERCIAL_LICENSES, ModelSpec


@dataclass(frozen=True)
class Speech:
    """Generated audio plus the measurements worth recording."""

    audio: np.ndarray
    sample_rate: int
    seconds: float
    elapsed: float
    peak_memory_gb: float
    capped: bool = False


def fetch(spec: ModelSpec, offline: bool = True) -> Path:
    """Return the local snapshot of a pinned model, downloading it if allowed.

    Args:
        spec: Pinned model.
        offline: When True, only use files already in ``HF_HOME``.

    Returns:
        Snapshot folder.
    """
    from huggingface_hub import snapshot_download

    return Path(snapshot_download(spec.repo, revision=spec.revision, local_files_only=offline))


def load(spec: ModelSpec) -> Any:
    """Load a pinned model from the local cache (never downloads).

    Args:
        spec: Pinned model.

    Returns:
        The mlx-audio model object.

    Raises:
        ValueError: If the model's license is not cleared for commercial use.
    """
    if spec.license not in COMMERCIAL_LICENSES:
        raise ValueError(f"{spec.repo} is licensed {spec.license}; only {sorted(COMMERCIAL_LICENSES)} may be used")
    from mlx_audio.tts.utils import load_model

    return load_model(fetch(spec, offline=True))


def synthesize(
    model: Any,
    text: str,
    *,
    language: str,
    seed: int,
    instruct: str | None = None,
    ref_audio: Path | None = None,
    ref_text: str | None = None,
    temperature: float = 0.9,
    max_tokens: int = 4096,
) -> Speech:
    """Synthesize one line. Newlines inside ``text`` become separate segments.

    Segments are split here rather than by mlx-audio because its clone (ICL)
    path ignores ``split_pattern`` and would send the whole text at once.
    Sampling values are the checkpoint's ``generation_config.json`` defaults,
    passed explicitly so other callers' defaults never leak in.

    Args:
        model: Model from :func:`load`.
        text: Line to speak.
        language: Qwen3-TTS language name (``korean`` or ``english``).
        seed: Random seed; reproducible only on the same software stack.
        instruct: Voice description (design model only).
        ref_audio: Frozen reference clip (clone model only).
        ref_text: Transcript of ``ref_audio``.
        temperature: Sampling temperature.
        max_tokens: Codec-token cap per segment (12.5 tokens = 1 s). Reaching it
            sets ``capped`` because the model did not stop on its own.

    Returns:
        Concatenated audio and timing.

    Raises:
        RuntimeError: If the model returned no audio.
    """
    import mlx.core as mx

    mx.random.seed(seed)
    kwargs: dict[str, Any] = {
        "lang_code": language,
        "temperature": temperature,
        "top_k": 50,
        "top_p": 1.0,
        "repetition_penalty": 1.05,
        "max_tokens": max_tokens,
    }
    if instruct is not None:
        kwargs["instruct"] = instruct
    if ref_audio is not None:
        kwargs["ref_audio"] = str(ref_audio)
        kwargs["ref_text"] = ref_text
    start = time.perf_counter()
    parts = []
    sample_rate = 0
    peak = 0.0
    capped = False
    for segment in [part.strip() for part in text.split("\n") if part.strip()]:
        for result in model.generate(text=segment, **kwargs):
            parts.append(np.asarray(result.audio, dtype=np.float32))
            sample_rate = result.sample_rate
            peak = max(peak, float(result.peak_memory_usage))
            capped = capped or int(result.token_count) >= max_tokens
    elapsed = time.perf_counter() - start
    if not parts:
        raise RuntimeError("model returned no audio")
    audio = np.concatenate(parts)
    return Speech(
        audio=audio,
        sample_rate=sample_rate,
        seconds=len(audio) / sample_rate,
        elapsed=elapsed,
        peak_memory_gb=peak,
        capped=capped,
    )


def write_wav(path: Path, speech: Speech) -> Path:
    """Write speech as a WAV file, creating parent folders.

    Args:
        path: Destination ``.wav`` path.
        speech: Audio to write.

    Returns:
        The written path.
    """
    from mlx_audio.audio_io import write

    path.parent.mkdir(parents=True, exist_ok=True)
    write(str(path), speech.audio, speech.sample_rate, format="wav")
    return path


def read_wav(path: Path) -> tuple[np.ndarray, int]:
    """Read a WAV file as mono float32.

    Args:
        path: ``.wav`` file.

    Returns:
        Samples and sample rate.
    """
    from mlx_audio.audio_io import read

    audio, sample_rate = read(str(path), dtype="float32")
    if audio.ndim > 1:
        audio = audio.mean(axis=1)
    return audio.astype(np.float32), int(sample_rate)
