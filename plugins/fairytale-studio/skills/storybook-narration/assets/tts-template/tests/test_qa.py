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


def _burst(seconds: float) -> np.ndarray:
    return speech_like(seconds, lead=0, tail=0)


def _quiet(seconds: float) -> np.ndarray:
    return np.zeros(int(seconds * RATE), np.float32)


def test_phrase_and_edge_word_units() -> None:
    assert qa.phrase_units("그리고 남북 길은, 서쪽에서 커집니다.", "ko") == [7, 8]
    assert qa.phrase_units("..., !", "ko") == []
    assert qa.edge_word_units("그런데 큰 줄기 중에", "ko") == (3, 2)
    assert qa.edge_word_units("... !", "ko") == (0, 0)


def test_segments_split_at_pauses() -> None:
    assert qa.segments(np.array([3])) == [(3, 3)]
    assert qa.segments(np.array([1, 2, 5, 6, 30, 31])) == [(1, 6), (30, 31)]


def test_filler_after_the_line_fails() -> None:
    audio = np.concatenate([_quiet(0.2), _burst(14 / 5), _quiet(0.4), _burst(0.25), _quiet(0.3)])
    report = qa.check(audio, RATE, KO, "ko")
    assert any(item.startswith("filler: a 0.2") and "after the line" in item for item in report.failures)
    assert qa.check(audio, RATE, KO, "ko", allow_fillers=True).ok


def test_filler_before_the_line_fails() -> None:
    audio = np.concatenate([_quiet(0.2), _burst(0.15), _quiet(0.4), _burst(14 / 5), _quiet(0.3)])
    report = qa.check(audio, RATE, KO, "ko")
    assert any("before the line" in item for item in report.failures)


@pytest.mark.parametrize(
    ("parts", "text"),
    [
        # A pause at the comma: two segments for two phrases.
        ([_burst(1.2), _quiet(0.45), _burst(1.5)], "옛날 옛적에, 작은 마을이 있었어요"),
        # A natural pause after a short opening word, long enough for that word.
        ([_burst(0.44), _quiet(0.4), _burst(2.2)], "그런데 굵은 호스는 손을 세게 밀어냅니다"),
        # A breath or click shorter than any word.
        ([_burst(2.8), _quiet(0.4), _burst(0.06)], KO),
        # An edge segment longer than any filler.
        ([_burst(1.0), _quiet(0.5), _burst(1.8)], KO),
        # No units in the text: nothing to compare with.
        ([_burst(0.3), _quiet(0.5), _burst(0.3)], "..."),
    ],
)
def test_no_filler(parts: list[np.ndarray], text: str) -> None:
    audio = np.concatenate([_quiet(0.2), *parts, _quiet(0.3)])
    assert not any("filler" in item for item in qa.check(audio, RATE, text, "ko").failures)


def test_voice_profile_measures_pitch_and_brightness() -> None:
    profile = qa.voice_profile(speech_like(2.0), RATE)
    assert profile is not None
    assert profile["f0"] == pytest.approx(220, rel=0.03)
    assert profile["centroid"] == pytest.approx(220, rel=0.15)
    low = qa.voice_profile(speech_like(2.0, freq=150), RATE)
    assert low is not None and low["f0"] == pytest.approx(150, rel=0.03)


@pytest.mark.parametrize(
    "audio",
    [
        np.zeros(RATE, np.float32),  # silent
        np.full(100, 0.5, np.float32),  # shorter than one frame
        np.random.default_rng(0).standard_normal(RATE).astype(np.float32) * 0.3,  # noise: no pitched frame
    ],
)
def test_voice_profile_none(audio: np.ndarray) -> None:
    assert qa.voice_profile(audio, RATE) is None


def test_drift_medians_need_enough_lines() -> None:
    lines = [{"f0": 160.0, "centroid": 2200.0}] * (qa.DRIFT_MIN_LINES - 1)
    assert qa.drift_medians(lines) is None
    medians = qa.drift_medians(lines + [{"f0": 100.0, "centroid": 1000.0}])
    assert medians == {"f0": 160.0, "centroid": 2200.0}


@pytest.mark.parametrize(
    ("profile", "expected"),
    [
        ({"f0": 131.0, "centroid": 1743.0}, (131 / 160 - 1, 1743 / 2200 - 1)),  # lower and darker
        ({"f0": 200.0, "centroid": 2700.0}, (200 / 160 - 1, 2700 / 2200 - 1)),  # higher and brighter
        ({"f0": 131.0, "centroid": 2150.0}, None),  # only the pitch moved
        ({"f0": 158.0, "centroid": 1700.0}, None),  # only the brightness moved
        ({"f0": 131.0, "centroid": 2700.0}, None),  # opposite directions
    ],
)
def test_drift_of(profile: dict[str, float], expected: tuple[float, float] | None) -> None:
    found = qa.drift_of(profile, {"f0": 160.0, "centroid": 2200.0})
    if expected is None:
        assert found is None
    else:
        assert found == pytest.approx(expected)

