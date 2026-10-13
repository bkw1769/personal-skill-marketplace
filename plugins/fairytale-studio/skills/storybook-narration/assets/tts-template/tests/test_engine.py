from pathlib import Path

import numpy as np
import pytest

from fairytale_tts import engine
from fairytale_tts.config import MODELS

from .conftest import Fakes


def test_fetch_and_load_use_pinned_revision(fakes: Fakes) -> None:
    spec = MODELS["clone"]
    path = engine.fetch(spec, offline=False)
    assert path.name == spec.repo.split("/")[-1]
    model = engine.load(spec)
    assert model is fakes.model
    assert fakes.downloads == [
        {"repo": spec.repo, "revision": spec.revision, "offline": False},
        {"repo": spec.repo, "revision": spec.revision, "offline": True},
    ]


def test_synthesize_design_concatenates_segments(fakes: Fakes) -> None:
    fakes.model.chunks = 2
    speech = engine.synthesize(fakes.model, "가\n\n 나 ", language="korean", seed=5, instruct="bright kid")
    assert fakes.seeds == [5]
    assert [c["text"] for c in fakes.model.calls] == ["가", "나"]
    call = fakes.model.calls[0]
    assert call["instruct"] == "bright kid" and call["lang_code"] == "korean"
    assert (call["temperature"], call["top_k"], call["top_p"], call["repetition_penalty"]) == (0.9, 50, 1.0, 1.05)
    assert call["max_tokens"] == 4096 and not speech.capped
    assert "ref_audio" not in call
    assert speech.sample_rate == 24000 and speech.seconds == 2.0
    assert speech.audio.dtype == np.float32 and speech.peak_memory_gb == 1.5
    assert speech.elapsed >= 0


def test_synthesize_clone_passes_reference(fakes: Fakes, tmp_path: Path) -> None:
    engine.synthesize(
        fakes.model, "hi", language="english", seed=1, ref_audio=tmp_path / "ref.wav", ref_text="ref"
    )
    call = fakes.model.calls[0]
    assert call["ref_audio"] == str(tmp_path / "ref.wav") and call["ref_text"] == "ref"
    assert "instruct" not in call


def test_synthesize_without_audio_fails(fakes: Fakes) -> None:
    fakes.model.chunks = 0
    with pytest.raises(RuntimeError, match="no audio"):
        engine.synthesize(fakes.model, "x", language="korean", seed=1)


def test_write_wav_creates_folders(fakes: Fakes, tmp_path: Path) -> None:
    speech = engine.Speech(np.zeros(10, dtype=np.float32), 24000, 0.0, 0.0, 0.0)
    out = engine.write_wav(tmp_path / "a" / "b.wav", speech)
    assert out.is_file()
    assert fakes.writes == [{"file": str(out), "samples": 10, "rate": 24000, "format": "wav"}]


def test_read_wav_downmixes_to_mono(fakes: Fakes, tmp_path: Path) -> None:
    stereo = np.ones((4, 2), dtype=np.float64)
    fakes.files[str(tmp_path / "s.wav")] = (stereo, 22050)
    audio, rate = engine.read_wav(tmp_path / "s.wav")
    assert audio.shape == (4,) and audio.dtype == np.float32 and rate == 22050
    fakes.files[str(tmp_path / "m.wav")] = (np.zeros(3, np.float32), 24000)
    assert engine.read_wav(tmp_path / "m.wav")[0].shape == (3,)


def test_synthesize_flags_token_cap(fakes: Fakes) -> None:
    fakes.model.realistic = True
    fakes.model.runaway_seeds = {3}
    speech = engine.synthesize(fakes.model, "hello there", language="english", seed=3, max_tokens=120)
    assert speech.capped and fakes.model.calls[0]["max_tokens"] == 120


def test_load_refuses_non_commercial_models(fakes: Fakes) -> None:
    from dataclasses import replace

    with pytest.raises(ValueError, match="only \\['apache-2.0', 'mit'\\]"):
        engine.load(replace(MODELS["clone"], license="cc-by-nc-4.0"))
    assert fakes.loads == []
