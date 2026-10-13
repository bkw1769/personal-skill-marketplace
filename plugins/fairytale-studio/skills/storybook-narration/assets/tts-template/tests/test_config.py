from pathlib import Path

import pytest

from fairytale_tts import config


def test_language_name_maps_channel_codes() -> None:
    assert config.language_name("ko") == "korean"
    assert config.language_name("en") == "english"


def test_language_name_rejects_unknown_code() -> None:
    with pytest.raises(ValueError, match="unsupported language 'ja'.*en, ko"):
        config.language_name("ja")


def test_project_root_prefers_env(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("FAIRYTALE_ROOT", str(tmp_path))
    assert config.project_root() == tmp_path.resolve()
    assert config.voices_dir() == tmp_path.resolve() / "assets" / "audio" / "voices"
    assert config.default_out_dir() == tmp_path.resolve() / "out" / "tts"


def test_project_root_falls_back_to_file_location(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("FAIRYTALE_ROOT", raising=False)
    root = config.project_root()
    assert (root / "tts" / "src" / "fairytale_tts" / "config.py").is_file()


def test_models_are_pinned_and_commercially_licensed() -> None:
    assert set(config.MODELS) == {"design", "clone"}
    for spec in config.MODELS.values():
        assert len(spec.revision) == 40
        assert spec.license == "apache-2.0"
        assert "1.7B" in spec.repo
