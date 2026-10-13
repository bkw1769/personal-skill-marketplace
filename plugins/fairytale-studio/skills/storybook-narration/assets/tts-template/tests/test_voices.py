import json
from pathlib import Path

import pytest

from fairytale_tts import voices


def _design(root: Path, voice_id: str = "narrator-ko", takes: int = 2) -> None:
    for take in range(1, takes + 1):
        path = voices.candidate_path(root, voice_id, take)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(f"take{take}".encode())
    voices.write_candidates_meta(
        root,
        voice_id,
        {
            "language": "ko",
            "instruct": "따뜻한 할머니 목소리",
            "text": "옛날 옛적에",
            "model": "repo/design",
            "revision": "a" * 40,
            "seeds": [7, 8][:takes],
        },
    )


@pytest.mark.parametrize("voice_id", ["narrator-ko", "a", "kid2-en"])
def test_check_voice_id_accepts_kebab_case(voice_id: str) -> None:
    assert voices.check_voice_id(voice_id) == voice_id


@pytest.mark.parametrize("voice_id", ["Narrator", "a_b", "-a", "a-", "../x", ""])
def test_check_voice_id_rejects_other_forms(voice_id: str) -> None:
    with pytest.raises(ValueError, match="invalid voice id"):
        voices.check_voice_id(voice_id)


def test_freeze_copies_take_and_records_metadata(tmp_path: Path) -> None:
    _design(tmp_path)
    voice = voices.freeze(tmp_path, "narrator-ko", 2)
    assert voice.seed == 8 and voice.take == 2 and voice.ref_text == "옛날 옛적에"
    assert (tmp_path / "narrator-ko" / "ref.wav").read_bytes() == b"take2"
    stored = json.loads((tmp_path / "narrator-ko" / "voice.json").read_text(encoding="utf-8"))
    assert stored["instruct"] == "따뜻한 할머니 목소리"
    loaded, wav = voices.load(tmp_path, "narrator-ko")
    assert loaded == voice and wav == tmp_path / "narrator-ko" / "ref.wav"


def test_freeze_missing_take_fails(tmp_path: Path) -> None:
    _design(tmp_path, takes=1)
    with pytest.raises(FileNotFoundError, match="take 3"):
        voices.freeze(tmp_path, "narrator-ko", 3)


def test_freeze_without_design_record_fails(tmp_path: Path) -> None:
    path = voices.candidate_path(tmp_path, "kid-en", 1)
    path.parent.mkdir(parents=True)
    path.write_bytes(b"x")
    with pytest.raises(FileNotFoundError, match="run design first"):
        voices.freeze(tmp_path, "kid-en", 1)


def test_load_unfrozen_voice_fails(tmp_path: Path) -> None:
    _design(tmp_path)
    with pytest.raises(FileNotFoundError, match="not frozen"):
        voices.load(tmp_path, "narrator-ko")


def test_list_voices(tmp_path: Path) -> None:
    assert voices.list_voices(tmp_path / "missing") == []
    assert voices.list_voices(tmp_path) == []
    _design(tmp_path, "zeta-en")
    _design(tmp_path, "alpha-ko")
    voices.freeze(tmp_path, "zeta-en", 1)
    voices.freeze(tmp_path, "alpha-ko", 1)
    assert [v.voice_id for v in voices.list_voices(tmp_path)] == ["alpha-ko", "zeta-en"]


def test_candidates_meta(tmp_path: Path) -> None:
    assert voices.candidates_meta(tmp_path, "narrator-ko") == {}
    _design(tmp_path)
    assert voices.candidates_meta(tmp_path, "narrator-ko")["language"] == "ko"
