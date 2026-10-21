"""Generate a whole script line by line, retake failures, and join with pauses.

Input is JSON Lines, one object per spoken line::

    {"id": "s01-001", "voice": "narrator-ko", "text": "옛날 옛적에...", "pause_after": 0.6, "speaker": "narrator"}

``fillers: true`` allows a filler sound ("음", "예") on that line; by default QA
retakes a line that has one.

After generating, every line's pitch and brightness are compared with the other
lines of its voice (:func:`qa.drift_of`). A line generated in this run that
drifts is retaken with new seeds and the take closest to the voice is kept; a
line that still drifts (or a cached one) gets a ``voice drift`` warning.

A line is skipped when its text, voice, reference and model are unchanged. The
seed it was recorded with is kept: a take picked with ``--only <id> --seed N``
survives later plain runs (the default seed is only used for lines that need
generating anyway); ``--force`` regenerates everything.

Output folder: ``<id>.wav`` per line, ``manifest.json`` (what produced each file
and its QA result), and after joining ``full.wav`` + ``timeline.json`` with the
real start/end of every line for subtitles and video timing.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

import numpy as np

from . import engine, qa, voices
from .config import MODELS, language_name

SCHEMA = "fairytale-tts-batch/1"
LINE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]*$")
DEFAULT_PAUSE = 0.6
RETAKE_SEED_STEP = 1000
DRIFT_WARNING = "voice drift"


@dataclass(frozen=True)
class Line:
    """One spoken line of a script."""

    id: str
    voice: str
    text: str
    pause_after: float = DEFAULT_PAUSE
    speaker: str = ""
    fillers: bool = False


def read_lines(path: Path) -> list[Line]:
    """Parse and validate a JSON Lines script.

    Args:
        path: ``.jsonl`` file; blank lines are ignored.

    Returns:
        Lines in file order.

    Raises:
        ValueError: On bad JSON, missing fields, bad or duplicate ids, empty text.
    """
    lines: list[Line] = []
    seen: set[str] = set()
    for number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not raw.strip():
            continue
        try:
            item = json.loads(raw)
        except json.JSONDecodeError as error:
            raise ValueError(f"{path.name}:{number}: invalid JSON ({error.msg})") from None
        missing = [key for key in ("id", "voice", "text") if key not in item]
        if missing:
            raise ValueError(f"{path.name}:{number}: missing {', '.join(missing)}")
        line = Line(
            id=str(item["id"]),
            voice=str(item["voice"]),
            text=str(item["text"]).strip(),
            pause_after=float(item.get("pause_after", DEFAULT_PAUSE)),
            speaker=str(item.get("speaker", "")),
            fillers=item.get("fillers", False) is True,
        )
        if not LINE_ID.match(line.id):
            raise ValueError(f"{path.name}:{number}: invalid id '{line.id}'")
        if line.id in seen:
            raise ValueError(f"{path.name}:{number}: duplicate id '{line.id}'")
        if not line.text:
            raise ValueError(f"{path.name}:{number}: empty text for '{line.id}'")
        seen.add(line.id)
        lines.append(line)
    return lines


def line_key(line: Line, voice: voices.Voice, ref_audio: Path, seed: int) -> str:
    """Hash everything that changes the audio of a line.

    Args:
        line: Script line.
        voice: Frozen voice used for it.
        ref_audio: The voice's reference clip.
        seed: Base seed.

    Returns:
        Hex SHA-256 used to skip unchanged lines.
    """
    spec = MODELS["clone"]
    digest = hashlib.sha256()
    for part in (line.text, json.dumps(voice.__dict__, sort_keys=True), spec.repo, spec.revision, str(seed)):
        digest.update(part.encode("utf-8"))
        digest.update(b"\0")
    digest.update(ref_audio.read_bytes())
    return digest.hexdigest()


def load_manifest(out_dir: Path) -> dict[str, Any]:
    """Load ``manifest.json`` or return an empty one."""
    path = out_dir / "manifest.json"
    if path.is_file():
        return json.loads(path.read_text(encoding="utf-8"))
    return {"schema": SCHEMA, "lines": {}}


def save_manifest(out_dir: Path, manifest: dict[str, Any]) -> Path:
    """Write ``manifest.json`` and return its path."""
    path = out_dir / "manifest.json"
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


def generate(
    lines: list[Line],
    out_dir: Path,
    voices_root: Path,
    *,
    seed: int = 1,
    retakes: int = 2,
    drift_retakes: int = 3,
    only: set[str] | None = None,
    force: bool = False,
    log: Callable[[str], None] = print,
) -> dict[str, Any]:
    """Generate every changed line, retaking QA failures and voice drift with new seeds.

    Args:
        lines: Script lines.
        out_dir: Output folder.
        voices_root: Folder of frozen voices.
        seed: Base seed; retake ``n`` uses ``seed + n * 1000``.
        retakes: Extra attempts after a failed check.
        drift_retakes: Extra attempts for a new line whose voice drifts from the others.
        only: When given, regenerate just these ids (implies force for them).
        force: Regenerate even when the cached key matches.
        log: Progress output.

    Returns:
        The updated manifest (also written to disk).

    Raises:
        ValueError: If ``only`` names an id that is not in the script.
    """
    if only:
        unknown = sorted(only - {line.id for line in lines})
        if unknown:
            raise ValueError(f"unknown line ids: {', '.join(unknown)}")
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest = load_manifest(out_dir)
    spec = MODELS["clone"]
    manifest["model"] = {"repo": spec.repo, "revision": spec.revision}
    loaded: dict[str, tuple[voices.Voice, Path]] = {}
    model = None
    fresh: set[str] = set()

    def get_model() -> Any:
        nonlocal model
        if model is None:
            model = engine.load(spec)
        return model

    for line in lines:
        if line.voice not in loaded:
            loaded[line.voice] = voices.load(voices_root, line.voice)
        voice, ref = loaded[line.voice]
        key = line_key(line, voice, ref, seed)
        wav = out_dir / f"{line.id}.wav"
        cached = manifest["lines"].get(line.id, {})
        wanted = only is None or line.id in only
        if not wanted or (not force and only is None and wav.is_file() and _unchanged(cached, line, voice, ref, key)):
            continue
        entry = _generate_line(get_model(), line, voice, ref, wav, seed, retakes, log)
        entry["key"] = key
        entry["base_seed"] = seed
        manifest["lines"][line.id] = entry
        fresh.add(line.id)
        save_manifest(out_dir, manifest)
    _fix_drift(get_model, lines, out_dir, manifest, loaded, fresh, drift_retakes, log)
    manifest["order"] = [line.id for line in lines]
    save_manifest(out_dir, manifest)
    return manifest


def _unchanged(cached: dict[str, Any], line: Line, voice: voices.Voice, ref: Path, key: str) -> bool:
    """Whether a cached take still matches the line, with this run's seed or the seed it was recorded with.

    The recorded base seed is ``base_seed``; entries written before it existed
    use their first attempt's seed, which is the base seed of the run that made them.
    """
    if cached.get("key") == key:
        return True
    attempts = cached.get("attempts") or [{}]
    base = cached.get("base_seed", attempts[0].get("seed"))
    return isinstance(base, int) and cached.get("key") == line_key(line, voice, ref, base)


def _profiles(lines: list[Line], out_dir: Path, manifest: dict[str, Any]) -> dict[str, list[str]]:
    """Measure every passing line once (cached in its entry) and group ids by voice.

    A line that failed QA (cut off, runaway) is left out: it would skew the
    voice medians, and its retakes belong to the QA ladder, not to drift.
    """
    groups: dict[str, list[str]] = {}
    for line in lines:
        entry = manifest["lines"].get(line.id)
        wav = out_dir / f"{line.id}.wav"
        if entry is None or not wav.is_file() or entry.get("status") != "ok":
            continue
        if "profile" not in entry:
            audio, rate = engine.read_wav(wav)
            entry["profile"] = qa.voice_profile(audio, rate)
        if entry["profile"]:
            groups.setdefault(line.voice, []).append(line.id)
    return groups


def _fix_drift(
    get_model: Callable[[], Any],
    lines: list[Line],
    out_dir: Path,
    manifest: dict[str, Any],
    loaded: dict[str, tuple[voices.Voice, Path]],
    fresh: set[str],
    drift_retakes: int,
    log: Callable[[str], None],
) -> None:
    """Retake new lines that drift from their voice, then warn about every line that still does.

    The medians are taken before any retake, so a retake is judged against the
    same target. A retake must pass QA; the take with the smallest larger
    deviation (pitch or brightness) is kept.
    """
    by_id = {line.id: line for line in lines}
    for members in _profiles(lines, out_dir, manifest).values():
        medians = qa.drift_medians([manifest["lines"][i]["profile"] for i in members])
        for line_id in members:
            entry = manifest["lines"][line_id]
            entry["warnings"] = [w for w in entry.get("warnings", []) if not w.startswith(DRIFT_WARNING)]
            found = medians and qa.drift_of(entry["profile"], medians)
            if found and line_id in fresh and drift_retakes:
                found = _retake_drift(get_model(), by_id[line_id], loaded, out_dir / f"{line_id}.wav", entry, medians,
                                      drift_retakes, log)
            if found:
                pitch, bright = found
                entry["warnings"].append(
                    f"{DRIFT_WARNING}: pitch {pitch:+.0%}, brightness {bright:+.0%} against the other "
                    f"{by_id[line_id].voice} lines; listen, rewrite a casual ending (~죠), or retake with --only {line_id} --seed N"
                )
                log(f"{line_id}: WARN {entry['warnings'][-1]}")


def _retake_drift(
    model: Any,
    line: Line,
    loaded: dict[str, tuple[voices.Voice, Path]],
    wav: Path,
    entry: dict[str, Any],
    medians: dict[str, float],
    drift_retakes: int,
    log: Callable[[str], None],
) -> tuple[float, float] | None:
    """Try new seeds for a drifting line; keep the take closest to the voice. Returns its remaining drift."""
    voice, ref = loaded[line.voice]

    def distance(profile: dict[str, float]) -> float:
        return max(abs(profile["f0"] / medians["f0"] - 1), abs(profile["centroid"] / medians["centroid"] - 1))

    best = distance(entry["profile"])
    last_seed = max(item["seed"] for item in entry["attempts"])
    for attempt in range(1, drift_retakes + 1):
        attempt_seed = last_seed + attempt * RETAKE_SEED_STEP
        speech, report = _take(model, line, voice, ref, attempt_seed)
        profile = qa.voice_profile(speech.audio, speech.sample_rate)
        entry["attempts"].append({"seed": attempt_seed, "failures": report.failures, "profile": profile})
        log(f"{line.id} [{line.voice}] seed {attempt_seed}: drift retake {attempt}, "
            f"{'ok' if report.ok else 'failed'} pace {report.pace:.1f}")
        if report.ok and profile and distance(profile) < best:
            best = distance(profile)
            engine.write_wav(wav, speech)
            entry.update(seed=attempt_seed, seconds=round(speech.seconds, 3), pace=round(report.pace, 2),
                         warnings=report.warnings, profile=profile)
            if not qa.drift_of(profile, medians):
                break
    return qa.drift_of(entry["profile"], medians)


def _take(model: Any, line: Line, voice: voices.Voice, ref: Path, seed: int) -> tuple[engine.Speech, qa.Report]:
    """Synthesize one take of a line and run QA on it."""
    speech = engine.synthesize(
        model,
        line.text,
        language=language_name(voice.language),
        seed=seed,
        ref_audio=ref,
        ref_text=voice.ref_text,
        max_tokens=qa.token_cap(line.text, voice.language),
    )
    report = qa.check(speech.audio, speech.sample_rate, line.text, voice.language, allow_fillers=line.fillers)
    if speech.capped:
        report.failures.append("runaway: hit the token cap without stopping")
    return speech, report


def _generate_line(
    model: Any,
    line: Line,
    voice: voices.Voice,
    ref: Path,
    wav: Path,
    seed: int,
    retakes: int,
    log: Callable[[str], None],
) -> dict[str, Any]:
    attempts: list[dict[str, Any]] = []
    for attempt in range(retakes + 1):
        attempt_seed = seed + attempt * RETAKE_SEED_STEP
        speech, report = _take(model, line, voice, ref, attempt_seed)
        attempts.append({"seed": attempt_seed, "failures": report.failures})
        status = "ok" if report.ok else "failed"
        notes = "".join(f"\n  - {item}" for item in report.failures + report.warnings)
        log(f"{line.id} [{line.voice}] seed {attempt_seed}: {status} {speech.seconds:.2f}s pace {report.pace:.1f}{notes}")
        if report.ok:
            break
    engine.write_wav(wav, speech)
    return {
        "voice": line.voice,
        "text": line.text,
        "file": wav.name,
        "seed": attempt_seed,
        "seconds": round(speech.seconds, 3),
        "pace": round(report.pace, 2),
        "rtf": round(speech.elapsed / speech.seconds, 3) if speech.seconds else 0.0,
        "status": status,
        "failures": report.failures,
        "warnings": report.warnings,
        "attempts": attempts,
    }


def join(lines: list[Line], out_dir: Path, target_dbfs: float = -20.0) -> tuple[Path, Path]:
    """Join line WAVs in script order with each line's pause after it.

    Each line is trimmed and leveled to the same RMS so the narration does not
    jump in volume between lines.

    Args:
        lines: Script lines (order and pauses).
        out_dir: Folder holding ``<id>.wav`` files.
        target_dbfs: RMS level for every line.

    Returns:
        Paths of ``full.wav`` and ``timeline.json``.

    Raises:
        FileNotFoundError: If a line has not been generated.
        ValueError: If line files disagree on sample rate.
    """
    parts: list[np.ndarray] = []
    timeline: list[dict[str, Any]] = []
    sample_rate = 0
    cursor = 0
    for line in lines:
        wav = out_dir / f"{line.id}.wav"
        if not wav.is_file():
            raise FileNotFoundError(f"{wav.name} missing; run batch first")
        audio, rate = engine.read_wav(wav)
        if sample_rate and rate != sample_rate:
            raise ValueError(f"{wav.name}: sample rate {rate} != {sample_rate}")
        sample_rate = rate
        audio = qa.match_level(qa.trim(audio, rate), target_dbfs)
        timeline.append(
            {"id": line.id, "voice": line.voice, "speaker": line.speaker or line.voice, "text": line.text,
             "start": round(cursor / rate, 3), "end": round((cursor + len(audio)) / rate, 3)}
        )
        parts.append(audio)
        silence = np.zeros(int(round(line.pause_after * rate)), dtype=np.float32)
        parts.append(silence)
        cursor += len(audio) + len(silence)
    full = np.concatenate(parts) if parts else np.zeros(0, dtype=np.float32)
    seconds = len(full) / sample_rate if sample_rate else 0.0
    full_path = engine.write_wav(out_dir / "full.wav", engine.Speech(full, sample_rate or 24000, seconds, 0.0, 0.0))
    timeline_path = out_dir / "timeline.json"
    timeline_path.write_text(
        json.dumps({"schema": SCHEMA, "seconds": round(seconds, 3), "lines": timeline}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return full_path, timeline_path
