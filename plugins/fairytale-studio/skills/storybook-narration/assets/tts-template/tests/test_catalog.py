import json
import wave
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest

from fairytale_tts import catalog, voices


def _voice(folder: Path, derived_from: str = "") -> voices.Voice:
    folder.mkdir(parents=True, exist_ok=True)
    with wave.open(str(folder / "ref.wav"), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(24000)
        handle.writeframes(np.zeros(36000, dtype=np.int16).tobytes())
    return voices.Voice("narrator-ko", "ko", "warm storyteller", "옛날 옛적에.", "repo/design", "rev", 3, 2, derived_from)


LABELS = {"category": "narrator", "gender": "female", "age": "young-adult", "moods": ["calm", "warm"]}


def test_write_manifest_records_labels_and_provenance(tmp_path: Path) -> None:
    folder = tmp_path / "narrator-ko"
    item = catalog.write_manifest(folder, _voice(folder), LABELS)
    assert item["id"] == "voice.narrator.narrator-ko" and item["status"] == "candidate" and item["scope"] == "shared"
    assert item["tags"] == ["lang:ko", "gender:female", "age:young-adult", "voice-origin:designed", "use:narration",
                            "mood:calm", "mood:warm"]
    assert item["duration_s"] == 1.5 and item["bytes"] == (folder / "ref.wav").stat().st_size
    assert item["provenance"]["description"] == "warm storyteller" and item["provenance"]["seed"] == 3
    body = json.loads((folder / "manifest.json").read_text(encoding="utf-8"))
    assert body["schema"] == catalog.SCHEMA and body["items"] == [item]


def test_variant_and_non_wav_reference(tmp_path: Path) -> None:
    folder = tmp_path / "fox-ko-sad"
    voice = _voice(folder, derived_from="fox-ko")
    (folder / "ref.wav").write_bytes(b"not a wav")
    item = catalog.write_manifest(folder, voice, {"category": "creature", "gender": "male", "age": "teen"})
    assert "voice-origin:variant" in item["tags"] and "duration_s" not in item
    assert item["provenance"]["model_license"] == "apache-2.0"


def test_status_helpers(tmp_path: Path) -> None:
    folder = tmp_path / "v"
    folder.mkdir()
    assert catalog.status(folder) == "unregistered" and catalog.read_item(folder) is None
    with pytest.raises(FileNotFoundError, match="run pick first"):
        catalog.set_status(folder, "approved")
    (folder / "manifest.json").write_text('{"items": []}', encoding="utf-8")
    assert catalog.read_item(folder) is None
    catalog.write_manifest(folder, _voice(folder), LABELS)
    assert catalog.set_status(folder, "approved")["status"] == "approved"
    assert catalog.status(folder) == "approved"


def test_rebuild_runs_node_tool(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    assert catalog.rebuild(tmp_path) == (True, "asset catalog tool not found; skipped index rebuild")
    cli = tmp_path / "scripts" / "assets" / "cli.mjs"
    cli.parent.mkdir(parents=True)
    cli.write_text("", encoding="utf-8")
    monkeypatch.setattr(catalog.shutil, "which", lambda name: None)
    assert catalog.rebuild(tmp_path)[0] is True
    monkeypatch.setattr(catalog.shutil, "which", lambda name: "/bin/node")
    seen: list[list[str]] = []

    def run(cmd: list[str], **kwargs: object) -> SimpleNamespace:
        seen.append(cmd)
        return SimpleNamespace(returncode=1, stdout="", stderr="error: bad tag\n")

    monkeypatch.setattr(catalog.subprocess, "run", run)
    assert catalog.rebuild(tmp_path) == (False, "error: bad tag")
    assert seen == [["/bin/node", str(cli), "build"]]
