import numpy as np
import pytest

from fairytale_tts import qa

from .conftest import speech_like

RATE = 24000
KO = "옛날 옛적에 작은 마을이 있었어요"  # 14 syllables


def test_text_units_counts_syllables_or_words() -> None:
    assert qa.text_units(KO, "ko") == 14
    assert qa.text_units("Once upon a time, it's late.", "en") == 6


def test_frame_rms_handles_short_audio() -> None:
    assert qa.frame_rms(np.zeros(10, np.float32), RATE).size == 0
    assert qa.frame_rms(np.ones(RATE, np.float32), RATE).shape == (50,)


def test_good_line_passes() -> None:
    report = qa.check(speech_like(14 / 5), RATE, KO, "ko")
    assert report.ok and not report.warnings
    assert report.pace == pytest.approx(5.0, rel=0.05)
    assert report.peak == pytest.approx(0.3, abs=0.01)
    assert -25 < report.rms_dbfs < -10


@pytest.mark.parametrize(
    ("audio", "text", "lang", "message"),
    [
        (np.zeros(RATE, np.float32), KO, "ko", "silent"),
        (np.zeros(0, np.float32), KO, "ko", "silent"),
        (speech_like(14 / 1.5), KO, "ko", "too slow"),
        (speech_like(14 / 12), KO, "ko", "too fast"),
        (speech_like(6 / 0.5), "one two three four five six", "en", "too slow"),
        (speech_like(3.0)[: -int(0.3 * RATE)], "one two three four five six seven", "en", "cut-off"),
    ],
)
def test_failures(audio: np.ndarray, text: str, lang: str, message: str) -> None:
    report = qa.check(audio, RATE, text, lang)
    assert not report.ok
    assert any(message in item for item in report.failures)


def test_clipping_fails() -> None:
    audio = speech_like(14 / 5)
    audio[RATE] = 1.0
    assert any("clipping" in item for item in qa.check(audio, RATE, KO, "ko").failures)


def test_text_without_units_skips_pace() -> None:
    report = qa.check(speech_like(1.0), RATE, "...", "en")
    assert report.ok and report.pace == 0.0


def test_warnings_for_long_pause_and_lead() -> None:
    gap = np.zeros(2 * RATE, np.float32)
    audio = np.concatenate([np.zeros(int(1.5 * RATE), np.float32), speech_like(1.3, lead=0, tail=0), gap, speech_like(1.3)])
    report = qa.check(audio, RATE, KO, "ko")
    assert any("long pause" in item for item in report.warnings)
    assert any("leading silence" in item for item in report.warnings)


def test_trim_keeps_pad() -> None:
    audio = speech_like(1.0, lead=1.0, tail=1.0)
    trimmed = qa.trim(audio, RATE)
    assert 1.0 <= len(trimmed) / RATE <= 1.2
    padded = qa.trim(audio, RATE, lead=0.15, tail=0.4)
    assert 1.5 <= len(padded) / RATE <= 1.6
    silent = np.zeros(RATE, np.float32)
    assert qa.trim(silent, RATE) is silent


def test_match_level_targets_rms_and_respects_ceiling() -> None:
    quiet = speech_like(1.0, lead=0, tail=0) * 0.1
    leveled = qa.match_level(quiet, target_dbfs=-20.0)
    rms = np.sqrt(np.mean(leveled.astype(np.float64) ** 2))
    assert 20 * np.log10(rms) == pytest.approx(-20.0, abs=0.1)
    spiky = np.zeros(RATE, np.float32)
    spiky[0] = 0.5
    assert np.max(np.abs(qa.match_level(spiky, target_dbfs=-3.0))) == pytest.approx(0.89, abs=1e-4)
    assert qa.match_level(np.zeros(10, np.float32)).dtype == np.float32


def test_token_cap_scales_with_text_and_clamps() -> None:
    assert qa.token_cap("가" * 45, "ko") == 275  # 10 s expected -> 12.5*10*2+25
    assert qa.token_cap("a", "en") == 100
    assert qa.token_cap("word " * 1000, "en") == 1500
