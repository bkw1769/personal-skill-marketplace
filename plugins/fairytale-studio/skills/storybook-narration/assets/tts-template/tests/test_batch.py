import json
from pathlib import Path

import numpy as np
import pytest

from fairytale_tts import batch, voices

from .conftest import Fakes


def _voice(root: Path, voice_id: str, language: str) -> None:
    path = voices.candidate_path(root, voice_id, 1)
    path.parent.mkdir(parents=True)
    path.write_bytes(b"ref-" + voice_id.encode())
    voices.write_candidates_meta(
        root, voice_id,
        {"language": language, "instruct": "x", "text": "ref", "model": "m", "revision": "r", "seeds": [1]},
    )
    voices.freeze(root, voice_id, 1)


def _script(tmp_path: Path, rows: list[dict[str, object]]) -> Path:
    path = tmp_path / "lines.jsonl"
    path.write_text("\n".join(json.dumps(row, ensure_ascii=False) for row in rows) + "\n\n", encoding="utf-8")
    return path


ROWS = [
    {"id": "ko-001", "voice": "narrator-ko", "text": "옛날 옛적에 작은 마을이 있었어요.", "pause_after": 0.5, "speaker": "narrator"},
    {"id": "en-001", "voice": "narrator-en", "text": "Once upon a time there was a village."},
]


@pytest.fixture
def setup(fakes: Fakes, tmp_path: Path) -> tuple[Fakes, Path, Path]:
    root = tmp_path / "voices"
    _voice(root, "narrator-ko", "ko")
    _voice(root, "narrator-en", "en")
    fakes.model.realistic = True
    return fakes, root, tmp_path / "out"


def test_read_lines_defaults_pause(tmp_path: Path) -> None:
    lines = batch.read_lines(_script(tmp_path, ROWS))
    assert [line.id for line in lines] == ["ko-001", "en-001"]
    assert lines[1].pause_after == batch.DEFAULT_PAUSE
    assert lines[0].speaker == "narrator" and lines[1].speaker == ""


@pytest.mark.parametrize(
    ("content", "message"),
    [
        ("{bad", "invalid JSON"),
        ('{"id": "a", "text": "x"}', "missing voice"),
        ('{"id": "-a", "voice": "v", "text": "x"}', "invalid id"),
        ('{"id": "a", "voice": "v", "text": "x"}\n{"id": "a", "voice": "v", "text": "y"}', "duplicate id"),
        ('{"id": "a", "voice": "v", "text": "  "}', "empty text"),
    ],
)
def test_read_lines_rejects_bad_input(tmp_path: Path, content: str, message: str) -> None:
    path = tmp_path / "bad.jsonl"
    path.write_text(content, encoding="utf-8")
    with pytest.raises(ValueError, match=message):
        batch.read_lines(path)


def test_generate_then_skip_unchanged(setup: tuple[Fakes, Path, Path], tmp_path: Path) -> None:
    fakes, root, out = setup
    lines = batch.read_lines(_script(tmp_path, ROWS))
    logs: list[str] = []
    manifest = batch.generate(lines, out, root, log=logs.append)
    assert manifest["order"] == ["ko-001", "en-001"]
    entry = manifest["lines"]["ko-001"]
    assert entry["status"] == "ok" and entry["seed"] == 1 and entry["rtf"] >= 0
    assert entry["pace"] == pytest.approx(5.0, rel=0.1)
    assert fakes.model.calls[0]["ref_text"] == "ref" and fakes.model.calls[0]["lang_code"] == "korean"
    assert len(fakes.loads) == 1 and len(logs) == 2
    assert json.loads((out / "manifest.json").read_text(encoding="utf-8"))["lines"]["en-001"]["file"] == "en-001.wav"

    batch.generate(lines, out, root, log=logs.append)
    assert len(fakes.model.calls) == 2  # nothing regenerated, model not reloaded
    assert len(fakes.loads) == 1

    batch.generate(lines, out, root, force=True, log=logs.append)
    assert len(fakes.model.calls) == 4


def test_generate_only_selected_ids(setup: tuple[Fakes, Path, Path], tmp_path: Path) -> None:
    fakes, root, out = setup
    lines = batch.read_lines(_script(tmp_path, ROWS))
    batch.generate(lines, out, root, log=lambda _: None)
    batch.generate(lines, out, root, only={"en-001"}, seed=7, log=lambda _: None)
    assert fakes.model.calls[-1]["text"].startswith("Once")
    assert len(fakes.model.calls) == 3
    with pytest.raises(ValueError, match="unknown line ids: nope"):
        batch.generate(lines, out, root, only={"nope"}, log=lambda _: None)


def test_retakes_until_pass_then_gives_up(setup: tuple[Fakes, Path, Path], tmp_path: Path) -> None:
    fakes, root, out = setup
    lines = batch.read_lines(_script(tmp_path, ROWS[:1]))
    fakes.model.bad_seeds = {1}
    entry = batch.generate(lines, out, root, log=lambda _: None)["lines"]["ko-001"]
    assert entry["status"] == "ok" and entry["seed"] == 1001
    assert [a["seed"] for a in entry["attempts"]] == [1, 1001]

    fakes.model.bad_seeds = {1, 1001, 2001}
    entry = batch.generate(lines, out, root, force=True, log=lambda _: None)["lines"]["ko-001"]
    assert entry["status"] == "failed" and entry["seed"] == 2001
    assert any("cut-off" in item for item in entry["failures"])


def test_line_key_changes_with_text_and_reference(setup: tuple[Fakes, Path, Path]) -> None:
    _, root, _ = setup
    voice, ref = voices.load(root, "narrator-ko")
    a = batch.Line("a", "narrator-ko", "하나")
    key = batch.line_key(a, voice, ref, 1)
    assert key == batch.line_key(a, voice, ref, 1)
    assert key != batch.line_key(batch.Line("a", "narrator-ko", "둘"), voice, ref, 1)
    assert key != batch.line_key(a, voice, ref, 2)
    ref.write_bytes(b"new reference")
    assert key != batch.line_key(a, voice, ref, 1)


def test_join_writes_full_audio_and_timeline(setup: tuple[Fakes, Path, Path], tmp_path: Path) -> None:
    fakes, root, out = setup
    lines = batch.read_lines(_script(tmp_path, ROWS))
    batch.generate(lines, out, root, log=lambda _: None)
    full, timeline_path = batch.join(lines, out)
    timeline = json.loads(timeline_path.read_text(encoding="utf-8"))
    first, second = timeline["lines"]
    assert first["speaker"] == "narrator" and second["speaker"] == "narrator-en"
    assert first["start"] == 0.0
    assert second["start"] == pytest.approx(first["end"] + 0.5, abs=0.001)
    audio, rate = fakes.files[str(full)]
    assert timeline["seconds"] == pytest.approx(len(audio) / rate, abs=0.001)


def test_join_errors(setup: tuple[Fakes, Path, Path], tmp_path: Path) -> None:
    fakes, root, out = setup
    lines = batch.read_lines(_script(tmp_path, ROWS))
    with pytest.raises(FileNotFoundError, match="ko-001.wav missing"):
        batch.join(lines, out)
    batch.generate(lines, out, root, log=lambda _: None)
    audio, _ = fakes.files[str(out / "en-001.wav")]
    fakes.files[str(out / "en-001.wav")] = (audio, 16000)
    with pytest.raises(ValueError, match="sample rate"):
        batch.join(lines, out)


def test_join_empty_script(fakes: Fakes, tmp_path: Path) -> None:
    full, timeline = batch.join([], tmp_path)
    assert json.loads(timeline.read_text(encoding="utf-8"))["seconds"] == 0.0
    assert fakes.files[str(full)][0].size == 0


def test_generate_handles_zero_length_speech(setup: tuple[Fakes, Path, Path], tmp_path: Path) -> None:
    fakes, root, out = setup
    fakes.model.realistic = False
    fakes.model.chunks = 1
    lines = [batch.Line("x", "narrator-en", "...")]
    original = fakes.model.generate

    def empty(text: str, **kwargs: object):  # type: ignore[no-untyped-def]
        for result in original(text, **kwargs):
            result.audio = np.zeros(0, np.float32)
            yield result

    fakes.model.generate = empty  # type: ignore[method-assign]
    entry = batch.generate(lines, out, root, retakes=0, log=lambda _: None)["lines"]["x"]
    assert entry["rtf"] == 0.0 and entry["status"] == "failed"


def test_runaway_generation_fails_qa(setup: tuple[Fakes, Path, Path], tmp_path: Path) -> None:
    fakes, root, out = setup
    lines = batch.read_lines(_script(tmp_path, ROWS[:1]))
    fakes.model.runaway_seeds = {1}
    entry = batch.generate(lines, out, root, retakes=0, log=lambda _: None)["lines"]["ko-001"]
    assert entry["status"] == "failed" and any("runaway" in item for item in entry["failures"])
    assert fakes.model.calls[0]["max_tokens"] == batch.qa.token_cap(ROWS[0]["text"], "ko")
