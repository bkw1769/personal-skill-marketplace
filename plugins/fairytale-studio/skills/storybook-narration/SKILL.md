---
name: storybook-narration
description: Make storybook / fairy-tale narration and character voices in Korean and English with Qwen3-TTS 1.7B running locally on an Apple Silicon Mac (MLX) - design a voice from a text description, freeze one take so the character always sounds the same, store adopted voices with labels and provenance in the asset catalog for reuse (approval blocked for preset speakers, non-commercial models and unconsented real people), turn a script or storyboard.json into lint-checked TTS lines, generate line by line with automatic QA and retakes, and join into full.wav plus timeline.json for subtitles and video. Ships a portable tts/ tool that runs from an external drive. Use this whenever the user asks for 나레이션, 내레이션, 더빙, TTS, 음성 생성, 목소리 만들어줘, 캐릭터 목소리, 목소리 보관/재사용, 대본 읽어줘, 오디오북, 동화 음성, 한국어/영어 채널 음성, voice design, voice clone, or wants to redo specific lines of generated speech, even if they never name the model.
---

# Storybook narration with Qwen3-TTS

The approach is **design once, freeze, clone forever**. A character's voice is invented once with the VoiceDesign model from a text description. One take is chosen by ear and frozen as `ref.wav` together with its transcript. Every later line is cloned from that clip with the Base model.

- **Why freeze:** describing the voice again for every line drifts. Cloning from one fixed clip keeps the character the same across lines, stories, channels and machines.
- **Why line by line:** each line is generated separately, checked automatically and re-taken on its own. That is what makes long stories reliable, because this model skips or repeats words on long inputs.

The tool that does the work is the project's `tts/` folder: a Python CLI on mlx-audio. Commands below assume the project root as the working directory.

## 0. Check the tool

Run `tts/bin/tts doctor`.

- **If it reports both models `ok`**, go on to step 1.
- **If `tts/` does not exist**, copy `assets/tts-template/` from this skill to `<project>/tts/`. Then:
  1. Add these lines to the project `.gitignore`: `.portable/`, `.venv/`, `__pycache__/`, `.pytest_cache/`, `.coverage`, `assets/audio/voices/*/candidates/`, `docs/consent/`.
  1. Set up the asset catalog with the fairytale-assets skill if `assets/catalog/` is missing. Voices are stored and approved there; without the catalog they are still saved but cannot be validated.
  2. Run `tts/bin/setup.sh`. It takes about 7 GB and a few minutes. The template's own README says what it installs.
- **If models are missing**, run `tts/bin/setup.sh`. It is safe to re-run.
- **Machine requirement:** an Apple Silicon Mac with about 10 GB free unified memory. If the user is on Windows or an Intel Mac, say so; this tool cannot run there.

Details, portability across machines and troubleshooting: `references/setup.md`.

## 1. Cast the voices

List the speaking characters and the channel language or languages. Each character gets one voice per language, with an id like `narrator-ko`, `grandma-ko`, `fox-en`.

**Reuse first.** Voices live in the asset catalog at `assets/audio/voices/<voice-id>/`. Look for an existing one before designing:
- `tts/bin/tts voices` lists frozen voices with their status.
- `node scripts/assets/cli.mjs find --kind voice --tag lang:ko` searches them.

A channel narrator should stay the same across stories. Use `approved` voices for anything that will be published. A frozen voice is used through its `ref.wav` alone. A voice frozen before these guidelines (for example with a Korean description) still works. Re-design it only if the user is not happy with how it sounds.

For each new voice:

1. **Write the description and sample line** with `references/voice-design.md`.
   - **The description must be in English**, even for a Korean voice: the model's voice design is documented for English and Chinese only.
   - It should be concrete: gender, age, pitch, timbre, pace, mood, use case.
   - **The sample line is in the channel's language**: 2-3 sentences, 8-15 seconds, in the voice's normal register. It becomes the reference, so its tone and pace are what every later line inherits.
2. **Generate takes:**

   ```bash
   tts/bin/tts design --voice grandma-ko --lang ko --takes 4 --instruct "<English description>" --text "<Korean sample line>" --category elder --gender female --age elderly --character grandma --mood warm
   ```

3. **Screen the takes, then let the user choose.**
   - Run `tts/bin/tts check <take.wav> --text "<sample line>" --lang ko` on each take and drop broken ones.
   - Send the remaining take files from `assets/audio/voices/<id>/candidates/`.
   - Do not pick for the user silently: the voice is a creative decision and becomes permanent.
4. **Freeze the chosen take:** `tts/bin/tts pick --voice grandma-ko --take 2`.
   - `pick` trims the clip's silences, so the clone does not echo the reference's last words.
   - It warns if the take is cut off or outside 8-20 s.
   - It registers the voice in the asset catalog as `candidate`, with labels and provenance: model, revision, license, description, reference text, seed.
5. **Approve it once the user has listened and agreed:** `tts/bin/tts approve --voice grandma-ko`.
   - The catalog validator must accept it, or the status reverts to `candidate`.
   - Never approve on the user's behalf without their OK.

**What the labels mean** (`design` requires the first three):

| Option | Values |
|---|---|
| `--category` | Role: `narrator`, `child`, `adult`, `elder`, `creature` (animals and monsters). |
| `--gender` | `female`, `male`, `neutral`. |
| `--age` | `child`, `teen`, `young-adult`, `middle-aged`, `elderly`. |
| `--character` | Optional character slug. |
| `--story` | Optional. Marks a voice used by one story only. |
| `--mood` | Optional, repeatable. Values come from `assets/catalog/taxonomy.json`. |

**Legal guards built into the tool:**
- `design` refuses descriptions that point at a real person, such as "sounds like ..." or a name.
- Real people's voices are only allowed through the consented-recording path in `references/publishing.md`.

The clone model ignores emotion instructions but copies the delivery of its reference. For a clearly different state, such as scared, sad or whispering, clone a **variant** from the master and freeze it as its own voice. Then assign that voice only to those lines:

```bash
tts/bin/tts variant --from fox-ko --voice fox-ko-scared --note "scared" --text "<8-15 s line whose words carry the emotion>"
```

Then listen, `pick` and `approve`, as for a designed voice. A variant can only come from an approved master, and it inherits the master's labels.

## 2. Prepare the lines

**Convert the script into lines.** `scripts/narration-lines.mjs` (Node 22.8+) does this from a tagged text file or from a storyboard made by the story-storyboard skill:

```bash
node <skill-dir>/scripts/narration-lines.mjs from-text <project>/stories/<id>/script-ko.txt --lang ko --voice narrator=narrator-ko --voice grandma=grandma-ko --prefix ko --voices-dir assets/audio/voices --out <project>/out/tts/<id>-ko/lines.jsonl
```

```bash
node <skill-dir>/scripts/narration-lines.mjs from-storyboard <project>/stories/<id>/storyboard.json --lang ko --voice narrator=narrator-ko --voice fox=fox-ko --voices-dir assets/audio/voices --out <project>/out/tts/<id>-ko/lines.jsonl
```

**Script format** (text file):
- `[speaker] text` starts a block.
- Untagged lines continue the current speaker. Text before the first tag belongs to `narrator`.
- A blank line ends a paragraph.
- Lines starting with `#` are comments.

**Put every piece of dialogue on its own `[speaker]` line**, even when one voice reads everything. In that case, map all speakers to the same voice: `--voice narrator=narrator-ko --voice deer=narrator-ko`. This keeps lines short, keeps the speaker in `timeline.json` for captions and bubbles, and makes it easy to give the character its own voice later. The converter warns when quoted dialogue sits inside a narration paragraph.

**Where to write the cleaned script.** Raw input from the user is usually messy. Write a cleaned TTS script next to the story, `<project>/stories/<id>/script-<lang>.txt`, and convert that. Leave the original as it is. Fix later problems in that script and re-convert; edit `lines.jsonl` directly only for quick `pause_after` tweaks and for `"fillers": true` on a line that should keep a written filler ("음, ...").

**What the converter produces:**
- One sentence per line, because the model skips or repeats words on long inputs.
- Very short sentences are merged with a neighbour, because tiny inputs can loop.
- Quotation marks are stripped.
- Pauses after each line: 0.6 s within a paragraph, 0.6 s when the speaker changes, 1.1 s at a paragraph end. For a scene change, set about 2 s by hand.

**Fix the warnings by rewriting the text, not by ignoring them.** The converter lints the text for:
- digits
- Latin letters inside Korean
- symbols, emoji and brackets
- quotes and speaker labels
- long ellipses
- over-long or very short lines
- missing final punctuation

Each of these is a known way this model misreads or truncates. `references/script-writing.md` has the rewriting rules with examples. Conversion already lints. Run `lint` separately only after editing `lines.jsonl` by hand:

```bash
node <skill-dir>/scripts/narration-lines.mjs lint <project>/out/tts/<id>-ko/lines.jsonl --lang ko --voices-dir assets/audio/voices
```

Keep Korean and English as separate line files and output folders: one per channel.

## 3. Generate

```bash
tts/bin/tts batch <project>/out/tts/<id>-ko/lines.jsonl --out-dir <project>/out/tts/<id>-ko
```

**Per line**, the tool clones from the frozen voice with the checkpoint's own sampling settings and a token cap sized to the text. It then runs the QA checks:
- pace in syllables or words per second
- cut-off ending
- clipping
- silence
- runaway generation that hits the cap
- a filler the text does not have ("예", "음" before or after the line); fillers are opt-in with `"fillers": true` on a line (`references/qa-and-retakes.md`)

When a check fails, it retakes the line with a new seed, up to `--retakes` times (default 2).

**At the end** it writes these files into the output folder:

| File | Contents |
|---|---|
| `<id>.wav` | One file per line. |
| `manifest.json` | Seed, QA result and attempts for each line. |
| `full.wav` | All lines trimmed, leveled and joined with the pauses. |
| `timeline.json` | Real start and end of each line. |

**Re-running** skips unchanged lines, so editing three lines regenerates three lines.

**Expected speed** on an M4 Pro: roughly 0.3-0.7 s of compute per second of audio, plus about 30 s to load the model. A 9-line story took 26 s in total.

Ignore the transformers notice "You are using a model of type `qwen3_tts` to instantiate a model of type ...". It is printed on every load and is harmless.

## 4. Review and fix

Read the batch summary and `manifest.json`. Then work through `references/qa-and-retakes.md`:

- **Lines with `status: failed` after retakes:**
  - Usually the text is the problem. Rewrite it: shorter, end punctuation, numbers spelled out. Then rerun `batch`; only changed lines regenerate.
  - If the text is fine, retry just those lines with a new seed: `--only id1,id2 --seed 7`.
- **Warnings**, such as a long pause inside a line: listen to those lines first.
- **Have the user listen to `full.wav`.** The automatic checks catch skipped or repeated words through pace, cut-off endings, clipping, silences and added fillers. They do not hear mispronunciations or wrong emphasis.
- **When the user names a bad line**, fix that line's text or retake it with `--only`, then rebuild with `tts/bin/tts join <lines> --out-dir <dir>`.

## 5. Hand off

`timeline.json` holds the real timing of every spoken line. Use it to set caption and bubble times in the storyboard (voice first, picture follows) before rendering video with the storybook-video skill.

`batch` warns when a line uses a voice that is not `approved` in the catalog. Do not publish that audio until the voice is approved.

Before anything is published, go through `references/publishing.md`. It covers:
- the AI voice notice
- model and voice rights
- not using the preset speakers
- the YouTube "inauthentic content" monetization risk

## Files

- `scripts/narration-lines.mjs`: script or storyboard to `lines.jsonl`, plus lint. Covered by the marketplace unit tests.
- `assets/tts-template/`: the portable `tts/` tool. It is Python 3.12 + uv + mlx-audio 0.5.8 with pinned model revisions, and has its own pytest suite at 100% coverage.
- `references/voice-design.md`: writing voice descriptions and reference lines (Korean and English examples), choosing takes, emotion variants.
- `references/script-writing.md`: writing text the model reads well.
- `references/qa-and-retakes.md`: what each QA failure means and the fix ladder.
- `references/setup.md`: install, portable drive, troubleshooting.
- `references/publishing.md`: legal and platform checklist.

Reply to the user in their language. When asking them to listen, never send raw `take-1.wav` files: a player shows only the file name, and several `take-1.wav` from different characters cannot be told apart. Copy them into a `listen/` folder with an order number and the role in the name, then send those:

```text
<project>/out/tts/<id>-<lang>/listen/00-narrator-full-story.wav
<project>/out/tts/<id>-<lang>/listen/01-narrator-slow-storyteller-en-take3.wav
<project>/out/tts/<id>-<lang>/listen/02-dori-en-take1.wav  02-dori-en-take2.wav ...
```

Say in the reply what each number group is (00 whole story, 01 narrator candidates, 02 Dori, ...) and ask for the choice by those names.
