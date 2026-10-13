"""Fakes for mlx, mlx_audio and huggingface_hub so tests run without models."""

from __future__ import annotations

import sys
import types
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterator

import numpy as np
import pytest


@dataclass
class FakeResult:
    audio: np.ndarray
    sample_rate: int = 24000
    peak_memory_usage: float = 1.5
    token_count: int = 10


def speech_like(seconds: float, rate: int = 24000, lead: float = 0.2, tail: float = 0.3) -> np.ndarray:
    """Silence, a tone burst of ``seconds``, silence: passes every QA check."""
    t = np.arange(int(seconds * rate)) / rate
    tone = (0.3 * np.sin(2 * np.pi * 220 * t)).astype(np.float32)
    return np.concatenate([np.zeros(int(lead * rate), np.float32), tone, np.zeros(int(tail * rate), np.float32)])


@dataclass
class FakeModel:
    """Records every generate() call and yields one or more results.

    With ``realistic`` the audio length follows the text (5 syllables/s in
    Korean, 2.5 words/s in English); ``bad_seeds`` produce a cut-off ending.
    """

    chunks: int = 1
    realistic: bool = False
    bad_seeds: set[int] = field(default_factory=set)
    runaway_seeds: set[int] = field(default_factory=set)
    calls: list[dict[str, Any]] = field(default_factory=list)
    seed: int = 0

    def generate(self, text: str, **kwargs: Any) -> Iterator[FakeResult]:
        self.calls.append({"text": text, **kwargs})
        if self.realistic:
            from fairytale_tts.qa import text_units

            korean = kwargs.get("lang_code") == "korean"
            units = text_units(text, "ko" if korean else "en")
            audio = speech_like(units / (5.0 if korean else 2.5))
            if self.seed in self.bad_seeds:
                audio = audio[: -int(0.3 * 24000)]
            tokens = kwargs.get("max_tokens", 4096) if self.seed in self.runaway_seeds else 10
            yield FakeResult(audio=audio, token_count=tokens)
            return
        for _ in range(self.chunks):
            yield FakeResult(audio=np.ones(12000, dtype=np.float32))


@dataclass
class Fakes:
    model: FakeModel
    downloads: list[dict[str, Any]]
    loads: list[Path]
    writes: list[dict[str, Any]]
    seeds: list[int]
    files: dict[str, tuple[np.ndarray, int]] = field(default_factory=dict)
    fail_offline: bool = False


@pytest.fixture(autouse=True)
def isolated_root(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Path:
    """Point the project root at a temp folder so no test touches the real catalog."""
    monkeypatch.setenv("FAIRYTALE_ROOT", str(tmp_path))
    return tmp_path


@pytest.fixture
def fakes(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Fakes:
    state = Fakes(model=FakeModel(), downloads=[], loads=[], writes=[], seeds=[])

    def snapshot_download(repo: str, revision: str, local_files_only: bool) -> str:
        state.downloads.append({"repo": repo, "revision": revision, "offline": local_files_only})
        if local_files_only and state.fail_offline:
            raise FileNotFoundError("not cached")
        return str(tmp_path / "hf" / repo)

    def load_model(path: Path) -> FakeModel:
        state.loads.append(path)
        return state.model

    def write(file: str, data: np.ndarray, samplerate: int, format: str) -> None:
        Path(file).write_bytes(b"RIFF" + bytes(len(data) % 7))
        state.files[file] = (np.asarray(data, dtype=np.float32), samplerate)
        state.writes.append({"file": file, "samples": len(data), "rate": samplerate, "format": format})

    def read(file: str, dtype: str) -> tuple[np.ndarray, int]:
        # Files copied outside the fake writer (e.g. ref.wav) read as a 10 s clip.
        return state.files.get(file, (speech_like(10.0), 24000))

    def seed(value: int) -> None:
        state.seeds.append(value)
        state.model.seed = value

    hub = types.ModuleType("huggingface_hub")
    hub.snapshot_download = snapshot_download  # type: ignore[attr-defined]
    mlx = types.ModuleType("mlx")
    core = types.ModuleType("mlx.core")
    core.random = types.SimpleNamespace(seed=seed)  # type: ignore[attr-defined]
    mlx.core = core  # type: ignore[attr-defined]
    mlx_audio = types.ModuleType("mlx_audio")
    tts = types.ModuleType("mlx_audio.tts")
    utils = types.ModuleType("mlx_audio.tts.utils")
    utils.load_model = load_model  # type: ignore[attr-defined]
    audio_io = types.ModuleType("mlx_audio.audio_io")
    audio_io.write = write  # type: ignore[attr-defined]
    audio_io.read = read  # type: ignore[attr-defined]
    for name, module in {
        "huggingface_hub": hub,
        "mlx": mlx,
        "mlx.core": core,
        "mlx_audio": mlx_audio,
        "mlx_audio.tts": tts,
        "mlx_audio.tts.utils": utils,
        "mlx_audio.audio_io": audio_io,
    }.items():
        monkeypatch.setitem(sys.modules, name, module)
    return state
