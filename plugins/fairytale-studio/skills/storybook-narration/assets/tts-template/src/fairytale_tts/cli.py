"""Command line: ``fairytale-tts doctor|pull|design|variant|pick|approve|voices|speak|batch|join|check``.

Run through ``tts/bin/tts`` so uv, Python and the model cache stay on the drive.
"""

from __future__ import annotations

import argparse
import os
import platform
import re
import sys
from pathlib import Path
from typing import Callable, Sequence

from . import batch, catalog, engine, qa, voices
from .config import MODELS, default_out_dir, language_name, project_root, voices_dir


def _report(label: str, speech: engine.Speech) -> None:
    rtf = speech.elapsed / speech.seconds if speech.seconds else 0.0
    print(
        f"{label}: {speech.seconds:.2f}s audio in {speech.elapsed:.2f}s "
        f"(RTF {rtf:.2f}, peak {speech.peak_memory_gb:.2f} GB)"
    )


def cmd_doctor(args: argparse.Namespace) -> int:
    """Print machine, paths and whether each pinned model is cached."""
    print(f"machine: {platform.machine()} macOS {platform.mac_ver()[0] or '-'}")
    print(f"python: {sys.version.split()[0]} ({sys.executable})")
    print(f"root: {project_root()}")
    print(f"HF_HOME: {os.environ.get('HF_HOME', '(not set: source tts/bin/env.sh)')}")
    missing = 0
    for spec in MODELS.values():
        try:
            path = engine.fetch(spec, offline=True)
            print(f"model {spec.key}: ok {spec.repo}@{spec.revision[:8]} -> {path}")
        except Exception as error:  # huggingface_hub raises several error types
            missing += 1
            print(f"model {spec.key}: missing {spec.repo}@{spec.revision[:8]} ({type(error).__name__})")
    return 1 if missing else 0


def cmd_pull(args: argparse.Namespace) -> int:
    """Download every pinned model into ``HF_HOME``."""
    for spec in MODELS.values():
        print(f"pull {spec.key}: {spec.repo}@{spec.revision[:8]}")
        print(f"  -> {engine.fetch(spec, offline=False)}")
    return 0


# Descriptions that point at a real person's voice. Designed voices must be
# original (publicity rights, Unfair Competition Prevention Act (타)목).
IMPERSONATION = re.compile(
    r"(?i:\b(sounds?|sounding|talks?|speaks?) like\b|\bimitat|\bimpersonat|\bin the (style|voice) of\b)"
    r"|\b[Vv]oice of [A-Z]"  # "voice of Ryan" (a name), not "voice of a grandmother"
)


def cmd_design(args: argparse.Namespace) -> int:
    """Generate candidate takes of a new voice from a text description."""
    voice_id = voices.check_voice_id(args.voice)
    language = language_name(args.lang)
    if IMPERSONATION.search(args.instruct):
        raise ValueError("describe the voice by its qualities, not by a real person (no 'sounds like', 'in the style of', names)")
    if qa.HANGUL.search(args.instruct):
        print("note: voice descriptions are documented for English/Chinese only; write --instruct in English")
    spec = MODELS["design"]
    model = engine.load(spec)
    seeds = [args.seed + i for i in range(args.takes)]
    for take, seed in enumerate(seeds, start=1):
        speech = engine.synthesize(model, args.text, language=language, seed=seed, instruct=args.instruct)
        path = engine.write_wav(voices.candidate_path(args.root, voice_id, take), speech)
        _report(f"take {take} (seed {seed}) {path}", speech)
    voices.write_candidates_meta(
        args.root,
        voice_id,
        {
            "language": args.lang,
            "instruct": args.instruct,
            "text": args.text,
            "model": spec.repo,
            "revision": spec.revision,
            "seeds": seeds,
            "labels": {
                "category": args.category,
                "gender": args.gender,
                "age": args.age,
                "character": args.character,
                "story": args.story,
                "moods": args.mood or [],
                "title": args.title,
            },
        },
    )
    print(f"listen, then freeze one: tts/bin/tts pick --voice {voice_id} --take <n>")
    return 0


def cmd_variant(args: argparse.Namespace) -> int:
    """Clone emotional takes from a frozen master voice to freeze as a variant.

    The clone model takes no emotion instruction, but it copies the delivery of
    its reference. A variant reference spoken in the wanted emotion therefore
    gives that emotion while keeping the master's timbre.
    """
    master, ref = voices.load(args.root, args.source)
    voice_id = voices.check_voice_id(args.voice)
    master_item = catalog.read_item(args.root / master.voice_id)
    if master_item is None or master_item["status"] != "approved":
        raise ValueError(f"approve {master.voice_id} first: variants must derive from an approved voice")
    spec = MODELS["clone"]
    model = engine.load(spec)
    seeds = [args.seed + i for i in range(args.takes)]
    for take, seed in enumerate(seeds, start=1):
        speech = engine.synthesize(
            model,
            args.text,
            language=language_name(master.language),
            seed=seed,
            ref_audio=ref,
            ref_text=master.ref_text,
            max_tokens=qa.token_cap(args.text, master.language),
        )
        path = engine.write_wav(voices.candidate_path(args.root, voice_id, take), speech)
        _report(f"take {take} (seed {seed}) {path}", speech)
    voices.write_candidates_meta(
        args.root,
        voice_id,
        {
            "language": master.language,
            "instruct": f"variant of {master.voice_id}: {args.note}",
            "text": args.text,
            "model": spec.repo,
            "revision": spec.revision,
            "seeds": seeds,
            "derived_from": master.voice_id,
            "labels": {
                **master_item["labels"],
                "moods": args.mood or master_item["labels"].get("moods", []),
                "title": None,
            },
        },
    )
    print(f"listen, then freeze one: tts/bin/tts pick --voice {voice_id} --take <n>")
    return 0


REF_LEAD_SECONDS = 0.15
REF_TAIL_SECONDS = 0.4


def cmd_pick(args: argparse.Namespace) -> int:
    """Freeze one design take, trimmed to 0.15 s lead and 0.4 s tail silence.

    A clean, short tail keeps the clone from echoing the reference's last words.
    """
    voice = voices.freeze(args.root, args.voice, args.take)
    ref = args.root / voice.voice_id / voices.REF_AUDIO
    audio, rate = engine.read_wav(ref)
    report = qa.check(audio, rate, voice.ref_text, voice.language)
    trimmed = qa.trim(audio, rate, lead=REF_LEAD_SECONDS, tail=REF_TAIL_SECONDS)
    seconds = len(trimmed) / rate
    engine.write_wav(ref, engine.Speech(trimmed, rate, seconds, 0.0, 0.0))
    print(f"frozen {voice.voice_id} ({voice.language}) from take {voice.take}: {seconds:.1f}s reference")
    for item in report.failures:
        print(f"WARN reference {item}; consider another take")
    if not 8 <= seconds <= 20:
        print("WARN reference should be about 8-15 s of speech; redesign with a longer or shorter sample line")
    labels = voices.candidates_meta(args.root, voice.voice_id).get("labels")
    if labels:
        item = catalog.write_manifest(args.root / voice.voice_id, voice, labels)
        ok, output = catalog.rebuild(project_root())
        print(f"registered {item['id']} as candidate in the asset catalog")
        if not ok:
            print(f"WARN asset catalog: {output}")
        print(f"after the user has listened and agreed: tts/bin/tts approve --voice {voice.voice_id}")
    else:
        print("WARN no labels for this voice (designed before labels existed); it is not in the asset catalog")
    return 0


def cmd_approve(args: argparse.Namespace) -> int:
    """Mark a frozen voice approved in the asset catalog; reverts if validation fails."""
    folder = args.root / voices.check_voice_id(args.voice)
    voices.load(args.root, args.voice)
    catalog.set_status(folder, "approved")
    ok, output = catalog.rebuild(project_root())
    if not ok:
        catalog.set_status(folder, "candidate")
        catalog.rebuild(project_root())
        print(f"not approved; asset catalog refused it:\n{output}", file=sys.stderr)
        return 1
    print(f"approved {args.voice}; the voice can be used in published work")
    return 0


def cmd_voices(args: argparse.Namespace) -> int:
    """List frozen voices with their catalog status."""
    found = voices.list_voices(args.root)
    for voice in found:
        print(f"{voice.voice_id}\t{voice.language}\t{catalog.status(args.root / voice.voice_id)}\t{voice.instruct}")
    if not found:
        print("no frozen voices yet")
    return 0


def cmd_speak(args: argparse.Namespace) -> int:
    """Speak text in a frozen voice by cloning its reference clip."""
    voice, ref = voices.load(args.root, args.voice)
    text = args.text if args.text is not None else Path(args.file).read_text(encoding="utf-8")
    model = engine.load(MODELS["clone"])
    speech = engine.synthesize(
        model,
        text,
        language=language_name(voice.language),
        seed=args.seed,
        ref_audio=ref,
        ref_text=voice.ref_text,
    )
    out = args.out or default_out_dir() / f"{voice.voice_id}.wav"
    _report(str(engine.write_wav(Path(out), speech)), speech)
    return 0


def cmd_batch(args: argparse.Namespace) -> int:
    """Generate a JSON Lines script, retake failures, then join."""
    lines = batch.read_lines(Path(args.lines))
    only = {item.strip() for item in args.only.split(",") if item.strip()} if args.only else None
    out_dir = Path(args.out_dir)
    manifest = batch.generate(
        lines, out_dir, args.root, seed=args.seed, retakes=args.retakes,
        drift_retakes=args.drift_retakes, only=only, force=args.force
    )
    failed = sorted(i for i, entry in manifest["lines"].items() if entry["status"] != "ok")
    if not args.no_join:
        full, timeline = batch.join(lines, out_dir)
        print(f"joined {full} ({timeline.name})")
    pending = sorted({line.voice for line in lines if catalog.status(args.root / line.voice) != "approved"})
    if pending:
        print(f"WARN voices not approved in the asset catalog: {', '.join(pending)}; do not publish this audio until they are")
    if failed:
        print(f"failed QA after retakes: {', '.join(failed)} (listen, rewrite the text, or retry with --only)")
        return 1
    print(f"all {len(lines)} lines passed QA")
    return 0


def cmd_join(args: argparse.Namespace) -> int:
    """Join generated lines into ``full.wav`` and ``timeline.json``."""
    full, timeline = batch.join(batch.read_lines(Path(args.lines)), Path(args.out_dir))
    print(f"joined {full} ({timeline.name})")
    return 0


def cmd_check(args: argparse.Namespace) -> int:
    """Run QA checks on any WAV against its text."""
    audio, rate = engine.read_wav(Path(args.wav))
    report = qa.check(audio, rate, args.text, args.lang, allow_fillers=args.allow_fillers)
    print(
        f"{args.wav}: {report.seconds:.2f}s (voiced {report.voiced_seconds:.2f}s), pace {report.pace:.1f}, "
        f"peak {report.peak:.2f}, RMS {report.rms_dbfs:.1f} dBFS"
    )
    for item in report.failures:
        print(f"FAIL {item}")
    for item in report.warnings:
        print(f"WARN {item}")
    return 0 if report.ok else 1


def build_parser() -> argparse.ArgumentParser:
    """Return the argument parser for every subcommand."""
    parser = argparse.ArgumentParser(prog="fairytale-tts", description=__doc__)
    parser.add_argument("--root", type=Path, default=None, help="voices folder (default assets/audio/voices)")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("doctor", help="check machine, paths and cached models").set_defaults(func=cmd_doctor)
    sub.add_parser("pull", help="download pinned models").set_defaults(func=cmd_pull)

    design = sub.add_parser("design", help="create candidate takes of a voice from a description")
    design.add_argument("--voice", required=True, help="kebab-case id, e.g. narrator-ko")
    design.add_argument("--lang", required=True, choices=["ko", "en"])
    design.add_argument("--instruct", required=True, help="voice description, in English")
    design.add_argument("--text", required=True, help="sample line; becomes the reference transcript")
    design.add_argument("--takes", type=int, default=4)
    design.add_argument("--seed", type=int, default=1)
    design.add_argument("--category", required=True, choices=catalog.CATEGORIES, help="role in the asset catalog")
    design.add_argument("--gender", required=True, choices=catalog.GENDERS)
    design.add_argument("--age", required=True, choices=catalog.AGES)
    design.add_argument("--character", help="kebab-case character slug, e.g. fox")
    design.add_argument("--story", help="kebab-case story slug for a story-only voice (default: shared)")
    design.add_argument("--mood", action="append", help="mood label from assets/catalog/taxonomy.json (repeatable)")
    design.add_argument("--title", help="catalog title (default: id, role, language)")
    design.set_defaults(func=cmd_design)

    variant = sub.add_parser("variant", help="clone emotional takes of a frozen voice for a variant voice")
    variant.add_argument("--from", dest="source", required=True, help="frozen master voice id, e.g. fox-ko")
    variant.add_argument("--voice", required=True, help="variant id, e.g. fox-ko-scared")
    variant.add_argument("--text", required=True, help="8-15 s line whose words carry the emotion")
    variant.add_argument("--note", default="", help="short label stored in voice.json, e.g. scared whisper")
    variant.add_argument("--takes", type=int, default=4)
    variant.add_argument("--seed", type=int, default=1)
    variant.add_argument("--mood", action="append", help="mood label for the variant (repeatable)")
    variant.set_defaults(func=cmd_variant)

    pick = sub.add_parser("pick", help="freeze one design or variant take")
    pick.add_argument("--voice", required=True)
    pick.add_argument("--take", type=int, required=True)
    pick.set_defaults(func=cmd_pick)

    approve = sub.add_parser("approve", help="mark a frozen voice approved after the user listened")
    approve.add_argument("--voice", required=True)
    approve.set_defaults(func=cmd_approve)

    sub.add_parser("voices", help="list frozen voices").set_defaults(func=cmd_voices)

    speak = sub.add_parser("speak", help="speak text in a frozen voice")
    speak.add_argument("--voice", required=True)
    source = speak.add_mutually_exclusive_group(required=True)
    source.add_argument("--text")
    source.add_argument("--file", help="UTF-8 text file; each line is generated separately")
    speak.add_argument("--out", help="output .wav (default out/tts/<voice>.wav)")
    speak.add_argument("--seed", type=int, default=1)
    speak.set_defaults(func=cmd_speak)

    run = sub.add_parser("batch", help="generate a .jsonl script line by line with QA and retakes")
    run.add_argument("lines", help="JSON Lines: {id, voice, text, pause_after?} per line")
    run.add_argument("--out-dir", required=True)
    run.add_argument("--seed", type=int, default=1)
    run.add_argument("--retakes", type=int, default=2, help="extra attempts after a failed check")
    run.add_argument("--drift-retakes", type=int, default=3,
                     help="extra attempts for a new line that sounds unlike the other lines of its voice (0: warn only)")
    run.add_argument("--only", help="comma-separated ids to regenerate")
    run.add_argument("--force", action="store_true", help="regenerate unchanged lines too")
    run.add_argument("--no-join", action="store_true", help="skip full.wav and timeline.json")
    run.set_defaults(func=cmd_batch)

    join = sub.add_parser("join", help="join generated lines into full.wav + timeline.json")
    join.add_argument("lines")
    join.add_argument("--out-dir", required=True)
    join.set_defaults(func=cmd_join)

    check = sub.add_parser("check", help="QA one WAV: pace, cut-off, clipping, silences, fillers")
    check.add_argument("wav")
    check.add_argument("--text", required=True)
    check.add_argument("--lang", required=True, choices=["ko", "en"])
    check.add_argument("--allow-fillers", action="store_true", help="do not fail a filler sound (예, 음) before or after the line")
    check.set_defaults(func=cmd_check)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    """Run the CLI and return the exit code.

    Args:
        argv: Arguments without the program name; defaults to ``sys.argv[1:]``.

    Returns:
        0 on success, 1 on a handled error.
    """
    args = build_parser().parse_args(argv)
    if args.root is None:
        args.root = voices_dir()
    func: Callable[[argparse.Namespace], int] = args.func
    try:
        return func(args)
    except (ValueError, FileNotFoundError, RuntimeError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
