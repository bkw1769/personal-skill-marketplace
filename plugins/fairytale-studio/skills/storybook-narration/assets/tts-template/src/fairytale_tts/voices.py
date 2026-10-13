"""Frozen character voices: one folder per voice with ``ref.wav`` and ``voice.json``.

A voice is designed once from a text description, then a chosen take is frozen as
the reference clip. Every later line is cloned from that clip, so the character
sounds the same across lines, stories and machines.
"""

from __future__ import annotations

import json
import re
import shutil
from dataclasses import asdict, dataclass
from pathlib import Path

VOICE_ID = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
REF_AUDIO = "ref.wav"
VOICE_FILE = "voice.json"
CANDIDATES = "candidates"


@dataclass(frozen=True)
class Voice:
    """Metadata of a frozen voice. ``ref_text`` is the transcript of ``ref.wav``."""

    voice_id: str
    language: str
    instruct: str
    ref_text: str
    design_model: str
    design_revision: str
    seed: int
    take: int
    derived_from: str = ""


def check_voice_id(voice_id: str) -> str:
    """Validate a kebab-case voice id such as ``narrator-ko``.

    Args:
        voice_id: Candidate id.

    Returns:
        The same id.

    Raises:
        ValueError: If the id is not lowercase kebab-case.
    """
    if not VOICE_ID.match(voice_id):
        raise ValueError(f"invalid voice id '{voice_id}' (use lowercase kebab-case, e.g. narrator-ko)")
    return voice_id


def candidate_path(root: Path, voice_id: str, take: int) -> Path:
    """Return the path of one design take.

    Args:
        root: Voices folder.
        voice_id: Voice id.
        take: 1-based take number.

    Returns:
        ``<root>/<voice_id>/candidates/take-<n>.wav``.
    """
    return root / check_voice_id(voice_id) / CANDIDATES / f"take-{take}.wav"


def write_candidates_meta(root: Path, voice_id: str, meta: dict[str, object]) -> Path:
    """Store the design request next to its takes so ``pick`` can freeze one.

    Args:
        root: Voices folder.
        voice_id: Voice id.
        meta: Design parameters (language, instruct, text, model, seeds).

    Returns:
        Path of the written ``candidates/design.json``.
    """
    path = root / check_voice_id(voice_id) / CANDIDATES / "design.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


def candidates_meta(root: Path, voice_id: str) -> dict[str, object]:
    """Return the stored design request of a voice, or an empty dict.

    Args:
        root: Voices folder.
        voice_id: Voice id.

    Returns:
        Contents of ``candidates/design.json``.
    """
    path = root / check_voice_id(voice_id) / CANDIDATES / "design.json"
    if not path.is_file():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def freeze(root: Path, voice_id: str, take: int) -> Voice:
    """Freeze one design take as the voice's reference clip.

    Args:
        root: Voices folder.
        voice_id: Voice id.
        take: 1-based take number to keep.

    Returns:
        The frozen voice.

    Raises:
        FileNotFoundError: If the take or its design record is missing.
    """
    wav = candidate_path(root, voice_id, take)
    meta_path = wav.parent / "design.json"
    if not wav.is_file() or not meta_path.is_file():
        raise FileNotFoundError(f"take {take} of '{voice_id}' not found; run design first")
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    voice = Voice(
        voice_id=voice_id,
        language=meta["language"],
        instruct=meta["instruct"],
        ref_text=meta["text"],
        design_model=meta["model"],
        design_revision=meta["revision"],
        seed=meta["seeds"][take - 1],
        take=take,
        derived_from=meta.get("derived_from", ""),
    )
    folder = root / voice_id
    shutil.copyfile(wav, folder / REF_AUDIO)
    (folder / VOICE_FILE).write_text(
        json.dumps(asdict(voice), ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return voice


def load(root: Path, voice_id: str) -> tuple[Voice, Path]:
    """Load a frozen voice.

    Args:
        root: Voices folder.
        voice_id: Voice id.

    Returns:
        The voice and the path of its reference clip.

    Raises:
        FileNotFoundError: If the voice has not been frozen with ``pick``.
    """
    folder = root / check_voice_id(voice_id)
    meta_path = folder / VOICE_FILE
    wav = folder / REF_AUDIO
    if not meta_path.is_file() or not wav.is_file():
        raise FileNotFoundError(f"voice '{voice_id}' is not frozen; run design then pick")
    voice = Voice(**json.loads(meta_path.read_text(encoding="utf-8")))
    return voice, wav


def list_voices(root: Path) -> list[Voice]:
    """List every frozen voice, sorted by id.

    Args:
        root: Voices folder.

    Returns:
        Frozen voices; empty when the folder does not exist.
    """
    if not root.is_dir():
        return []
    found = []
    for meta_path in sorted(root.glob(f"*/{VOICE_FILE}")):
        found.append(Voice(**json.loads(meta_path.read_text(encoding="utf-8"))))
    return found
