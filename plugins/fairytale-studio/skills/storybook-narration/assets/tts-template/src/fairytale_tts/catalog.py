"""Register frozen voices in the project's asset catalog (``assets/``).

Each voice folder ``assets/audio/voices/<voice-id>/`` gets a ``manifest.json``
in the catalog's format: labels (role, language, gender, age, origin), status,
the license source and the provenance an approval needs. The Node catalog tool
(``scripts/assets/cli.mjs``) validates it and rebuilds the searchable index.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import shutil
import subprocess
import wave
from pathlib import Path
from typing import Any

from .config import MODELS
from .voices import REF_AUDIO, Voice

MANIFEST = "manifest.json"
SCHEMA = "fairytale-asset-manifest/1"
SOURCE = "qwen3-tts-voice-design"
CATEGORIES = ("narrator", "child", "adult", "elder", "creature")
GENDERS = ("female", "male", "neutral")
AGES = ("child", "teen", "young-adult", "middle-aged", "elderly")


def asset_id(category: str, voice_id: str) -> str:
    """Return the catalog id ``voice.<category>.<voice_id>``."""
    return f"voice.{category}.{voice_id}"


def wav_seconds(path: Path) -> float | None:
    """Duration of a PCM WAV file, or None when it cannot be read as one."""
    try:
        with wave.open(str(path), "rb") as handle:
            return round(handle.getnframes() / handle.getframerate(), 3)
    except (wave.Error, EOFError):
        return None


def write_manifest(folder: Path, voice: Voice, labels: dict[str, Any]) -> dict[str, Any]:
    """Write the voice's catalog manifest with status ``candidate``.

    Called on every ``pick``: a new reference clip always needs a fresh
    listening review, so any earlier approval is dropped.

    Args:
        folder: ``assets/audio/voices/<voice-id>``.
        voice: The frozen voice.
        labels: ``category``, ``gender``, ``age`` and optional ``character``,
            ``story``, ``moods`` (list), ``title``.

    Returns:
        The manifest item.
    """
    ref = folder / REF_AUDIO
    data = ref.read_bytes()
    clone = MODELS["clone"]
    origin = "variant" if voice.derived_from else "designed"
    tags = [f"lang:{voice.language}", f"gender:{labels['gender']}", f"age:{labels['age']}", f"voice-origin:{origin}"]
    tags += ["use:narration"] if labels["category"] == "narrator" else ["use:dialogue"]
    if labels.get("character"):
        tags.append(f"character:{labels['character']}")
    if labels.get("story"):
        tags.append(f"story:{labels['story']}")
    tags += [f"mood:{mood}" for mood in labels.get("moods", [])]
    item: dict[str, Any] = {
        "id": asset_id(labels["category"], voice.voice_id),
        "kind": "voice",
        "category": labels["category"],
        "title": labels.get("title") or f"{voice.voice_id} ({labels['category']}, {voice.language})",
        "file": REF_AUDIO,
        "status": "candidate",
        "scope": "story" if labels.get("story") else "shared",
        "source": SOURCE,
        "tags": tags,
        "provenance": {
            "model": voice.design_model,
            "revision": voice.design_revision,
            "model_license": clone.license if voice.derived_from else MODELS["design"].license,
            "clone_model": clone.repo,
            "clone_revision": clone.revision,
            "description": voice.instruct,
            "ref_text": voice.ref_text,
            "seed": voice.seed,
            "take": voice.take,
            "derived_from": voice.derived_from or None,
            "frozen_on": dt.date.today().isoformat(),
        },
        "labels": labels,
        "sha256": hashlib.sha256(data).hexdigest(),
        "bytes": len(data),
    }
    seconds = wav_seconds(ref)
    if seconds is not None:
        item["duration_s"] = seconds
    _save(folder, item)
    return item


def read_item(folder: Path) -> dict[str, Any] | None:
    """Return the voice's manifest item, or None when it is not registered."""
    path = folder / MANIFEST
    if not path.is_file():
        return None
    items = json.loads(path.read_text(encoding="utf-8")).get("items", [])
    return items[0] if items else None


def status(folder: Path) -> str:
    """Return the catalog status of a voice (``unregistered`` without a manifest)."""
    item = read_item(folder)
    return item["status"] if item else "unregistered"


def set_status(folder: Path, value: str) -> dict[str, Any]:
    """Change the status of a registered voice.

    Args:
        folder: Voice folder.
        value: ``approved``, ``candidate``, ``rejected`` or ``reference-only``.

    Returns:
        The updated item.

    Raises:
        FileNotFoundError: If the voice has no manifest yet.
    """
    item = read_item(folder)
    if item is None:
        raise FileNotFoundError(f"{folder.name} is not registered; run pick first")
    item["status"] = value
    _save(folder, item)
    return item


def rebuild(project_root: Path) -> tuple[bool, str]:
    """Validate the asset catalog and rebuild its index with the Node tool.

    Args:
        project_root: Repository root holding ``scripts/assets/cli.mjs``.

    Returns:
        ``(ok, output)``. ``ok`` is True when there is no catalog tool (nothing
        to rebuild) or the build succeeded.
    """
    cli = project_root / "scripts" / "assets" / "cli.mjs"
    node = shutil.which("node")
    if not cli.is_file() or node is None:
        return True, "asset catalog tool not found; skipped index rebuild"
    done = subprocess.run([node, str(cli), "build"], cwd=project_root, capture_output=True, text=True, check=False)
    return done.returncode == 0, (done.stdout + done.stderr).strip()


def _save(folder: Path, item: dict[str, Any]) -> None:
    body = {"schema": SCHEMA, "items": [item]}
    (folder / MANIFEST).write_text(json.dumps(body, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
