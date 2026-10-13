import json

import numpy as np
from pathlib import Path

import pytest

from fairytale_tts import catalog, cli
from fairytale_tts.config import MODELS

from .conftest import Fakes


LABELS = ["--category", "narrator", "--gender", "female", "--age", "young-adult"]


def _run(tmp_path: Path, *argv: str) -> int:
    extra = LABELS if argv and argv[0] == "design" and "--category" not in argv else []
    return cli.main(["--root", str(tmp_path / "voices"), *argv, *extra])


def test_doctor_reports_cached_models(fakes: Fakes, tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert _run(tmp_path, "doctor") == 0
    out = capsys.readouterr().out
    assert "model design: ok" in out and "model clone: ok" in out and "HF_HOME" in out


def test_doctor_flags_missing_models(fakes: Fakes, tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    fakes.fail_offline = True
    assert _run(tmp_path, "doctor") == 1
    assert "model design: missing" in capsys.readouterr().out


def test_doctor_without_mac_version(
    fakes: Fakes, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(cli.platform, "mac_ver", lambda: ("", ("", "", ""), ""))
    monkeypatch.delenv("HF_HOME", raising=False)
    _run(tmp_path, "doctor")
    out = capsys.readouterr().out
    assert "macOS -" in out and "not set" in out


def test_pull_downloads_every_model(fakes: Fakes, tmp_path: Path) -> None:
    assert _run(tmp_path, "pull") == 0
    assert [d["repo"] for d in fakes.downloads] == [s.repo for s in MODELS.values()]
    assert all(d["offline"] is False for d in fakes.downloads)


def test_design_pick_speak_flow(fakes: Fakes, tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    code = _run(
        tmp_path, "design", "--voice", "grandma-ko", "--lang", "ko",
        "--instruct", "따뜻하고 느린 할머니", "--text", "옛날 옛적에", "--takes", "2", "--seed", "10",
    )
    assert code == 0
    assert [c["instruct"] for c in fakes.model.calls] == ["따뜻하고 느린 할머니"] * 2
    assert fakes.seeds == [10, 11]
    meta = json.loads((tmp_path / "voices/grandma-ko/candidates/design.json").read_text(encoding="utf-8"))
    assert meta["seeds"] == [10, 11] and meta["model"] == MODELS["design"].repo

    assert _run(tmp_path, "pick", "--voice", "grandma-ko", "--take", "2") == 0
    assert _run(tmp_path, "voices") == 0
    assert "grandma-ko\tko\tcandidate\t따뜻하고 느린 할머니" in capsys.readouterr().out

    out = tmp_path / "line.wav"
    assert _run(tmp_path, "speak", "--voice", "grandma-ko", "--text", "호랑이가 나타났어요", "--out", str(out)) == 0
    call = fakes.model.calls[-1]
    assert call["ref_text"] == "옛날 옛적에" and call["lang_code"] == "korean"
    assert out.is_file()
    assert "RTF" in capsys.readouterr().out


def test_speak_from_file_with_default_out(
    fakes: Fakes, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("FAIRYTALE_ROOT", str(tmp_path))
    _run(tmp_path, "design", "--voice", "kid-en", "--lang", "en", "--instruct", "a cheerful kid",
         "--text", "Hello", "--takes", "1")
    _run(tmp_path, "pick", "--voice", "kid-en", "--take", "1")
    script = tmp_path / "script.txt"
    script.write_text("Line one\nLine two\n", encoding="utf-8")
    assert _run(tmp_path, "speak", "--voice", "kid-en", "--file", str(script)) == 0
    assert [c["text"] for c in fakes.model.calls[-2:]] == ["Line one", "Line two"]
    assert (tmp_path / "out" / "tts" / "kid-en.wav").is_file()


def test_voices_empty(fakes: Fakes, tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert _run(tmp_path, "voices") == 0
    assert "no frozen voices" in capsys.readouterr().out


def test_handled_errors_return_1(fakes: Fakes, tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert _run(tmp_path, "speak", "--voice", "ghost-ko", "--text", "x") == 1
    assert "not frozen" in capsys.readouterr().err
    assert _run(tmp_path, "pick", "--voice", "Bad_ID", "--take", "1") == 1


def test_report_handles_zero_length(capsys: pytest.CaptureFixture[str]) -> None:
    import numpy as np

    from fairytale_tts.engine import Speech

    cli._report("x", Speech(np.zeros(0, dtype=np.float32), 24000, 0.0, 0.1, 0.0))
    assert "RTF 0.00" in capsys.readouterr().out


def test_default_root_is_project_voices(fakes: Fakes, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("FAIRYTALE_ROOT", str(tmp_path))
    assert cli.main(["voices"]) == 0


def _frozen(tmp_path: Path, voice_id: str, lang: str) -> None:
    _run(tmp_path, "design", "--voice", voice_id, "--lang", lang, "--instruct", "x", "--text", "ref", "--takes", "1")
    _run(tmp_path, "pick", "--voice", voice_id, "--take", "1")


def test_batch_join_and_check(fakes: Fakes, tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    _frozen(tmp_path, "narrator-ko", "ko")
    fakes.model.realistic = True
    script = tmp_path / "lines.jsonl"
    script.write_text(
        json.dumps({"id": "a", "voice": "narrator-ko", "text": "옛날 옛적에 마을이 있었어요"}, ensure_ascii=False) + "\n"
        + json.dumps({"id": "b", "voice": "narrator-ko", "text": "나무꾼이 살았어요"}, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    out = tmp_path / "out"
    assert _run(tmp_path, "batch", str(script), "--out-dir", str(out)) == 0
    assert "all 2 lines passed QA" in capsys.readouterr().out
    assert (out / "timeline.json").is_file()

    fakes.model.bad_seeds = {5, 1005}
    assert _run(tmp_path, "batch", str(script), "--out-dir", str(out), "--only", "b, ,", "--seed", "5",
                "--retakes", "1", "--no-join") == 1
    assert "failed QA after retakes: b" in capsys.readouterr().out

    assert _run(tmp_path, "join", str(script), "--out-dir", str(out)) == 0
    assert "joined" in capsys.readouterr().out

    assert _run(tmp_path, "check", str(out / "a.wav"), "--text", "옛날 옛적에 마을이 있었어요", "--lang", "ko") == 0
    assert _run(tmp_path, "check", str(out / "b.wav"), "--text", "나무꾼이 살았어요", "--lang", "ko") == 1
    assert "FAIL cut-off" in capsys.readouterr().out


def test_check_prints_warnings(fakes: Fakes, tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    from .conftest import speech_like

    audio = np.concatenate([np.zeros(int(1.5 * 24000), np.float32), speech_like(2.0)])
    fakes.files[str(tmp_path / "w.wav")] = (audio, 24000)
    assert _run(tmp_path, "check", str(tmp_path / "w.wav"), "--text", "one two three four five", "--lang", "en") == 0
    assert "WARN leading silence" in capsys.readouterr().out


def test_pick_trims_reference_and_warns(fakes: Fakes, tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    from .conftest import speech_like

    _run(tmp_path, "design", "--voice", "owl-ko", "--lang", "ko", "--instruct", "부엉이 목소리", "--text", "부엉부엉",
         "--takes", "1")
    assert "write --instruct in English" in capsys.readouterr().out
    ref = tmp_path / "voices" / "owl-ko" / "ref.wav"
    fakes.files[str(ref)] = (speech_like(3.0, lead=1.0, tail=0.0)[: -int(0.1 * 24000)], 24000)
    assert _run(tmp_path, "pick", "--voice", "owl-ko", "--take", "1") == 0
    out = capsys.readouterr().out
    assert "WARN reference cut-off" in out and "about 8-15 s" in out
    trimmed, _ = fakes.files[str(ref)]
    assert len(trimmed) / 24000 < 3.1  # 1 s lead silence cut to 0.15 s


def test_variant_clones_from_master(fakes: Fakes, tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    _frozen(tmp_path, "fox-ko", "ko")
    fakes.model.realistic = True
    assert _run(tmp_path, "variant", "--from", "fox-ko", "--voice", "fox-ko-scared", "--text", "x") == 1
    assert "approve fox-ko first" in capsys.readouterr().err
    assert _run(tmp_path, "approve", "--voice", "fox-ko") == 0
    assert _run(tmp_path, "variant", "--from", "fox-ko", "--voice", "fox-ko-scared", "--note", "scared",
                "--text", "으악, 무서워! 누가 거기 있니?", "--takes", "2", "--seed", "4") == 0
    call = fakes.model.calls[-1]
    assert call["ref_text"] == "ref" and call["lang_code"] == "korean" and "instruct" not in call
    assert _run(tmp_path, "pick", "--voice", "fox-ko-scared", "--take", "2") == 0
    capsys.readouterr()
    assert _run(tmp_path, "voices") == 0
    assert "fox-ko-scared\tko\tcandidate\tvariant of fox-ko: scared" in capsys.readouterr().out
    item = catalog.read_item(tmp_path / "voices" / "fox-ko-scared")
    assert item["provenance"]["derived_from"] == "fox-ko" and "voice-origin:variant" in item["tags"]
    assert item["labels"]["category"] == "narrator"


def test_design_refuses_real_person_descriptions(fakes: Fakes, tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    for text in ("A narrator who sounds like Morgan Freeman", "warm voice in the style of a famous actor", "voice of Ryan"):
        assert _run(tmp_path, "design", "--voice", "x-en", "--lang", "en", "--instruct", text, "--text", "Hi.") == 1
        assert "not by a real person" in capsys.readouterr().err
    assert _run(tmp_path, "design", "--voice", "x-en", "--lang", "en", "--instruct", "gentle voice of a grandmother",
                "--text", "Hi.", "--takes", "1") == 0


def test_pick_registers_voice_with_labels(fakes: Fakes, tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    _run(tmp_path, "design", "--voice", "tiger-ko", "--lang", "ko", "--instruct", "raspy tiger", "--text", "어흥.",
         "--takes", "1", "--category", "creature", "--gender", "male", "--age", "middle-aged",
         "--character", "tiger", "--story", "sun-moon", "--mood", "playful", "--title", "Tiger (KO)")
    assert _run(tmp_path, "pick", "--voice", "tiger-ko", "--take", "1") == 0
    out = capsys.readouterr().out
    assert "registered voice.creature.tiger-ko as candidate" in out and "approve --voice tiger-ko" in out
    item = catalog.read_item(tmp_path / "voices" / "tiger-ko")
    assert item["scope"] == "story" and item["title"] == "Tiger (KO)" and item["source"] == "qwen3-tts-voice-design"
    assert set(item["tags"]) >= {"lang:ko", "gender:male", "age:middle-aged", "voice-origin:designed", "use:dialogue",
                                 "character:tiger", "story:sun-moon", "mood:playful"}
    assert item["provenance"]["model_license"] == "apache-2.0" and item["provenance"]["derived_from"] is None


def test_pick_without_labels_and_failed_rebuild(
    fakes: Fakes, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    _frozen(tmp_path, "a-ko", "ko")
    meta = tmp_path / "voices" / "a-ko" / "candidates" / "design.json"
    data = json.loads(meta.read_text(encoding="utf-8"))
    data.pop("labels")
    meta.write_text(json.dumps(data), encoding="utf-8")
    capsys.readouterr()
    _run(tmp_path, "pick", "--voice", "a-ko", "--take", "1")
    assert "not in the asset catalog" in capsys.readouterr().out

    monkeypatch.setattr(catalog, "rebuild", lambda root: (False, "bad tag"))
    _frozen(tmp_path, "b-ko", "ko")
    assert "WARN asset catalog: bad tag" in capsys.readouterr().out


def test_approve_reverts_when_catalog_refuses(
    fakes: Fakes, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    _frozen(tmp_path, "c-ko", "ko")
    calls: list[str] = []

    def refuse(root: Path) -> tuple[bool, str]:
        calls.append(catalog.status(tmp_path / "voices" / "c-ko"))
        return False, "source blocked"

    monkeypatch.setattr(catalog, "rebuild", refuse)
    assert _run(tmp_path, "approve", "--voice", "c-ko") == 1
    assert "asset catalog refused it" in capsys.readouterr().err
    assert calls == ["approved", "candidate"]
    assert catalog.status(tmp_path / "voices" / "c-ko") == "candidate"
    assert _run(tmp_path, "approve", "--voice", "ghost-ko") == 1


def test_batch_warns_about_unapproved_voices(fakes: Fakes, tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    _frozen(tmp_path, "d-ko", "ko")
    fakes.model.realistic = True
    script = tmp_path / "l.jsonl"
    script.write_text(json.dumps({"id": "a", "voice": "d-ko", "text": "옛날 옛적에 마을이 있었어요."}, ensure_ascii=False), encoding="utf-8")
    _run(tmp_path, "batch", str(script), "--out-dir", str(tmp_path / "o"), "--no-join")
    assert "voices not approved in the asset catalog: d-ko" in capsys.readouterr().out
    _run(tmp_path, "approve", "--voice", "d-ko")
    _run(tmp_path, "batch", str(script), "--out-dir", str(tmp_path / "o"), "--no-join")
    assert "not approved" not in capsys.readouterr().out
