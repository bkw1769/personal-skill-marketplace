"""Model-free checks on one generated line: clipping, cut-off, pace, silences, fillers.

These catch the usual Qwen3-TTS failures (skipped words, rambling, truncated
endings, an added "예" or "음" before or after the line) cheaply. They do not
replace listening or an ASR round trip.

:func:`voice_profile` and :func:`drift_of` compare a line with the other lines of
the same voice: a clone sometimes reads one line lower, darker and slower than
the rest (a casual "~죠" ending, a short line), which the per-line checks pass.
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
# A filler ("예", "음", "으흥") is a short burst cut off from the line by a pause.
FILLER_GAP_SECONDS = 0.25  # pauses at least this long split the line into sound segments
FILLER_MIN_SECONDS = 0.1  # shorter bursts are breaths or clicks, not words
FILLER_MAX_SECONDS = 0.7  # an edge segment shorter than this may be a filler
PHRASE_BREAK = re.compile(r"[,.?!;:…·]+")
# Voice drift: a line whose pitch AND brightness both sit more than DRIFT_RATIO
# from the medians of its voice, in the same direction, sounds like another take
# of the voice (hallway-hydrant l05 2026-10-21: pitch -17%, brightness -22%).
DRIFT_RATIO = 0.15
DRIFT_MIN_LINES = 5  # fewer lines of a voice give no reliable median
PITCH_RANGE = (70.0, 400.0)  # Hz searched for the speaking pitch
PITCH_FRAME_SECONDS = 0.04
PITCH_HOP_SECONDS = 0.01
PITCH_LOUD_RATIO = 0.3  # frames above 30% of the loudest frame's RMS are measured
PITCH_CLARITY = 0.5  # autocorrelation peak / energy needed to count a frame as pitched


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


def phrase_units(text: str, language: str) -> list[int]:
    """Pace units of each phrase, splitting the text at punctuation.

    Args:
        text: Line text.
        language: ``ko`` or ``en``.

    Returns:
        Units per phrase, phrases without units left out.
    """
    counts = (text_units(part, language) for part in PHRASE_BREAK.split(text))
    return [count for count in counts if count]


def edge_word_units(text: str, language: str) -> tuple[int, int]:
    """Pace units of the first and the last word that have any.

    Args:
        text: Line text.
        language: ``ko`` or ``en``.

    Returns:
        ``(first, last)`` units; ``(0, 0)`` when no word has units.
    """
    counts = [count for count in (text_units(word, language) for word in text.split()) if count]
    return (counts[0], counts[-1]) if counts else (0, 0)


def segments(voiced: np.ndarray) -> list[tuple[int, int]]:
    """Group voiced frame indices into runs split by pauses of FILLER_GAP_SECONDS or more.

    Args:
        voiced: Sorted indices of voiced frames (at least one).

    Returns:
        ``(first, last)`` frame index of each run.
    """
    split = max(1, int(round(FILLER_GAP_SECONDS / FRAME_SECONDS)))
    runs: list[tuple[int, int]] = []
    start = previous = int(voiced[0])
    for index in voiced[1:]:
        index = int(index)
        if index - previous > split:
            runs.append((start, previous))
            start = index
        previous = index
    runs.append((start, previous))
    return runs


def filler_failures(voiced: np.ndarray, text: str, language: str) -> list[str]:
    """Find a short sound before or after the line that its text cannot account for.

    The line splits into more sound segments than the text has phrases, and the
    first or last segment (0.1-0.7 s) is too short even for the first or last
    word of the text at the fastest allowed pace: an added filler, not a word.
    A natural pause after a short opening word ("그런데, ...") is long enough
    for that word and passes.

    Args:
        voiced: Sorted indices of voiced frames (at least one).
        text: The text that was spoken.
        language: ``ko`` or ``en``.

    Returns:
        Failure messages (empty when none).
    """
    runs = segments(voiced)
    if len(runs) <= max(1, len(phrase_units(text, language))):
        return []
    fastest = PACE_LIMITS[language][1]
    first_word, last_word = edge_word_units(text, language)
    found = []
    for where, (first, last), units in (("before", runs[0], first_word), ("after", runs[-1], last_word)):
        seconds = (last - first + 1) * FRAME_SECONDS
        if FILLER_MIN_SECONDS <= seconds < FILLER_MAX_SECONDS and seconds < units / fastest:
            found.append(f"filler: a {seconds:.2f}s sound {where} the line that the text does not have (예, 음); "
                         "set \"fillers\": true on the line if it is wanted")
    return found


def check(audio: np.ndarray, sample_rate: int, text: str, language: str, *, allow_fillers: bool = False) -> Report:
    """Check one generated line against its text.

    Args:
        audio: Mono samples in [-1, 1].
        sample_rate: Sample rate in Hz.
        text: The text that was spoken.
        language: ``ko`` or ``en``.
        allow_fillers: Skip the filler check (the line is meant to have one).

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
    if not allow_fillers:
        report.failures.extend(filler_failures(voiced, text, language))
    gaps = np.diff(voiced) * FRAME_SECONDS
    if gaps.size and gaps.max() > MAX_GAP_SECONDS:
        report.warnings.append(f"long pause {gaps.max():.1f}s inside the line; check for a skipped phrase")
    if first * FRAME_SECONDS > MAX_LEAD_SECONDS:
        report.warnings.append(f"leading silence {first * FRAME_SECONDS:.1f}s")
    return report


def voice_profile(audio: np.ndarray, sample_rate: int) -> dict[str, float] | None:
    """Measure how a line sounds: median speaking pitch and spectral centroid.

    Pitch is the autocorrelation peak of each loud 40 ms frame within
    ``PITCH_RANGE``; frames without a clear peak (noise, breaths) are skipped.
    The centroid (brightness) is taken over the whole line.

    Args:
        audio: Mono samples.
        sample_rate: Sample rate in Hz.

    Returns:
        ``{"f0": Hz, "centroid": Hz}``, or None for silence, audio shorter than
        one frame, or audio without a pitched frame.
    """
    x = audio.astype(np.float64)
    size = int(sample_rate * PITCH_FRAME_SECONDS)
    if len(x) < size or np.max(np.abs(x)) <= 0:
        return None
    hop = int(sample_rate * PITCH_HOP_SECONDS)
    frames = np.stack([x[start:start + size] for start in range(0, len(x) - size + 1, hop)])
    rms = np.sqrt(np.mean(frames**2, axis=1))
    loud = frames[rms >= rms.max() * PITCH_LOUD_RATIO]
    loud = loud - loud.mean(axis=1, keepdims=True)
    power = np.abs(np.fft.rfft(loud, n=2 * size, axis=1)) ** 2
    corr = np.fft.irfft(power, axis=1)[:, :size]
    low, high = int(sample_rate / PITCH_RANGE[1]), int(sample_rate / PITCH_RANGE[0])
    lags = low + np.argmax(corr[:, low:high], axis=1)
    clarity = corr[np.arange(len(corr)), lags] / np.maximum(corr[:, 0], 1e-12)
    pitched = lags[clarity > PITCH_CLARITY]
    if not pitched.size:
        return None
    magnitude = np.abs(np.fft.rfft(x * np.hanning(len(x))))
    freqs = np.fft.rfftfreq(len(x), 1 / sample_rate)
    return {
        "f0": round(float(np.median(sample_rate / pitched)), 1),
        "centroid": round(float((magnitude * freqs).sum() / magnitude.sum()), 1),
    }


def drift_medians(profiles: list[dict[str, float]]) -> dict[str, float] | None:
    """Median pitch and brightness of one voice's lines.

    Args:
        profiles: :func:`voice_profile` results of the lines of one voice.

    Returns:
        ``{"f0", "centroid"}`` medians, or None with fewer than ``DRIFT_MIN_LINES``.
    """
    if len(profiles) < DRIFT_MIN_LINES:
        return None
    return {key: float(np.median([p[key] for p in profiles])) for key in ("f0", "centroid")}


def drift_of(profile: dict[str, float], medians: dict[str, float]) -> tuple[float, float] | None:
    """How far a line's pitch and brightness sit from its voice's medians, if it drifts.

    Args:
        profile: The line's :func:`voice_profile`.
        medians: :func:`drift_medians` of its voice.

    Returns:
        ``(pitch, brightness)`` as fractions (-0.17 = 17% lower) when both are
        beyond ``DRIFT_RATIO`` in the same direction, else None.
    """
    pitch = profile["f0"] / medians["f0"] - 1
    bright = profile["centroid"] / medians["centroid"] - 1
    if abs(pitch) > DRIFT_RATIO and abs(bright) > DRIFT_RATIO and (pitch > 0) == (bright > 0):
        return pitch, bright
    return None


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
