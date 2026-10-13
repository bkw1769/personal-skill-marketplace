"""Model-free checks on one generated line: clipping, cut-off, pace, silences.

These catch the usual Qwen3-TTS failures (skipped words, rambling, truncated
endings) cheaply. They do not replace listening or an ASR round trip.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

import numpy as np

FRAME_SECONDS = 0.02
VOICED_RATIO = 0.05  # frame RMS above 5% of the loudest frame counts as speech
HANGUL = re.compile(r"[가-힣]")
WORD = re.compile(r"[A-Za-z0-9']+")

# Units per voiced second. Korean counts Hangul syllables, English counts words.
# Calm storytelling sits near 4-5.5 syllables/s or 2-3 words/s.
PACE_LIMITS: dict[str, tuple[float, float]] = {"ko": (2.5, 8.5), "en": (1.3, 4.2)}
MAX_GAP_SECONDS = 1.5
MAX_LEAD_SECONDS = 1.0
CLIP_LEVEL = 0.99
CUTOFF_RATIO = 0.1


@dataclass
class Report:
    """Result of :func:`check`. ``ok`` is False when any failure was found."""

    seconds: float
    voiced_seconds: float
    pace: float
    peak: float
    rms_dbfs: float
    failures: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        """True when no failure was recorded."""
        return not self.failures


def text_units(text: str, language: str) -> int:
    """Count pace units: Hangul syllables for ``ko``, words for ``en``.

    Args:
        text: Line text.
        language: ``ko`` or ``en``.

    Returns:
        Number of units.
    """
    pattern = HANGUL if language == "ko" else WORD
    return len(pattern.findall(text))


def frame_rms(audio: np.ndarray, sample_rate: int) -> np.ndarray:
    """Return RMS per 20 ms frame (last partial frame dropped)."""
    size = max(1, int(sample_rate * FRAME_SECONDS))
    count = len(audio) // size
    if count == 0:
        return np.zeros(0)
    frames = audio[: count * size].reshape(count, size).astype(np.float64)
    return np.sqrt(np.mean(frames**2, axis=1))


def check(audio: np.ndarray, sample_rate: int, text: str, language: str) -> Report:
    """Check one generated line against its text.

    Args:
        audio: Mono samples in [-1, 1].
        sample_rate: Sample rate in Hz.
        text: The text that was spoken.
        language: ``ko`` or ``en``.

    Returns:
        Measurements plus failures (retake) and warnings (listen).
    """
    seconds = len(audio) / sample_rate
    peak = float(np.max(np.abs(audio))) if len(audio) else 0.0
    rms = float(np.sqrt(np.mean(audio.astype(np.float64) ** 2))) if len(audio) else 0.0
    rms_dbfs = 20 * np.log10(rms) if rms > 0 else -120.0
    energy = frame_rms(audio, sample_rate)
    report = Report(seconds=seconds, voiced_seconds=0.0, pace=0.0, peak=peak, rms_dbfs=float(rms_dbfs))
    if not energy.size or energy.max() <= 0:
        report.failures.append("silent: no speech found")
        return report
    voiced = np.flatnonzero(energy > energy.max() * VOICED_RATIO)

    first, last = int(voiced[0]), int(voiced[-1])
    report.voiced_seconds = (last - first + 1) * FRAME_SECONDS
    units = text_units(text, language)
    report.pace = units / report.voiced_seconds
    low, high = PACE_LIMITS[language]
    unit_name = "syllables" if language == "ko" else "words"
    if units and report.pace < low:
        report.failures.append(f"too slow: {report.pace:.1f} {unit_name}/s (< {low}); rambling or repeated words")
    if units and report.pace > high:
        report.failures.append(f"too fast: {report.pace:.1f} {unit_name}/s (> {high}); skipped words")
    if peak >= CLIP_LEVEL:
        report.failures.append(f"clipping: peak {peak:.3f}")
    if energy[-1] > energy.max() * CUTOFF_RATIO:
        report.failures.append("cut-off: audio ends while still speaking")
    gaps = np.diff(voiced) * FRAME_SECONDS
    if gaps.size and gaps.max() > MAX_GAP_SECONDS:
        report.warnings.append(f"long pause {gaps.max():.1f}s inside the line; check for a skipped phrase")
    if first * FRAME_SECONDS > MAX_LEAD_SECONDS:
        report.warnings.append(f"leading silence {first * FRAME_SECONDS:.1f}s")
    return report


def token_cap(text: str, language: str) -> int:
    """Codec-token budget for one line: twice the expected length plus slack.

    Expected length uses a slow storytelling pace (4.5 syllables/s, 2.4
    words/s); 12.5 tokens are one second. A line that reaches the cap is a
    runaway generation, not a long line.

    Args:
        text: Line text.
        language: ``ko`` or ``en``.

    Returns:
        Token cap between 100 and 1500.
    """
    rate = 4.5 if language == "ko" else 2.4
    expected = text_units(text, language) / rate
    return int(min(1500, max(100, 12.5 * expected * 2 + 25)))


def trim(audio: np.ndarray, sample_rate: int, lead: float = 0.05, tail: float = 0.05) -> np.ndarray:
    """Cut leading and trailing silence, keeping short pads.

    Args:
        audio: Mono samples.
        sample_rate: Sample rate in Hz.
        lead: Silence kept before speech, in seconds.
        tail: Silence kept after speech, in seconds.

    Returns:
        Trimmed samples (unchanged when no speech is found).
    """
    energy = frame_rms(audio, sample_rate)
    if not energy.size or energy.max() <= 0:
        return audio
    voiced = np.flatnonzero(energy > energy.max() * VOICED_RATIO)
    size = int(sample_rate * FRAME_SECONDS)
    start = max(0, int(voiced[0]) * size - int(sample_rate * lead))
    end = min(len(audio), (int(voiced[-1]) + 1) * size + int(sample_rate * tail))
    return audio[start:end]


def match_level(audio: np.ndarray, target_dbfs: float = -20.0, ceiling: float = 0.89) -> np.ndarray:
    """Scale a line to a target RMS level without exceeding a peak ceiling.

    Args:
        audio: Mono samples.
        target_dbfs: Target RMS in dBFS.
        ceiling: Maximum absolute sample value after scaling (0.89 is about -1 dBFS).

    Returns:
        Scaled samples as float32.
    """
    rms = float(np.sqrt(np.mean(audio.astype(np.float64) ** 2))) if len(audio) else 0.0
    if rms <= 0:
        return audio.astype(np.float32)
    gain = 10 ** (target_dbfs / 20) / rms
    peak = float(np.max(np.abs(audio)))
    gain = min(gain, ceiling / peak)
    return (audio * gain).astype(np.float32)
