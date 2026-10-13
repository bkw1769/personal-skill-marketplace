---
name: fairytale-assets
description: Find, reuse and register shared production assets for storybook / fairy-tale projects - character sheets and transparent sprites, backgrounds, props, style references, background music, jingles, sound effects, ambience, instrument samples and adopted TTS character voices - through a labeled catalog in the project's assets/ folder (one manifest.json per folder, controlled tags, a source-and-license ledger, a generated searchable index). Use this before making or downloading any art or sound for a story so existing assets are reused, whenever the user asks for 배경, 소품, 효과음, 배경음악, BGM, 사운드, 악기 샘플, 스프라이트, 시안 재사용, 자산 정리/등록/라벨링, 무료 음원 찾아줘, asks where an asset came from or whether it may be used commercially, wants to 목소리 보관/재사용/라벨링, and after generating or downloading new art or audio so it gets catalogued.
---

# Fairy-tale assets

`assets/` in the project is the single shared store. Every file there is labeled in the `manifest.json` of its folder; the catalog tool turns all manifests into `assets/catalog/index.json`, which is what to query. Human rules for the store are in `assets/README.md`.

## 0. Set up a project that has no catalog yet

If `assets/catalog/taxonomy.json` does not exist, copy the bundled project files (catalog templates, store README, the catalog tool and its unit tests) from `<skill-dir>/assets/project-files/` into the project root, without overwriting anything that exists:

```bash
cp -Rn <skill-dir>/assets/project-files/ <project-root>/
```

Then add these scripts to the project's package.json (create a minimal one with `"type": "module"` if there is none) and run `node scripts/assets/cli.mjs build` once:

```json
"assets:validate": "node scripts/assets/cli.mjs validate",
"assets:build": "node scripts/assets/cli.mjs build",
"assets:fill": "node scripts/assets/cli.mjs fill",
"assets:find": "node scripts/assets/cli.mjs find"
```

The tool uses Node 22.8+ built-ins only. Its tests are `scripts/assets/test/assets.test.mjs` (`node --test`). Review `assets/catalog/sources.json` with the user: it lists vetted libraries with license verdicts as of its `verified_on` date.

## 1. Look before making

```bash
node scripts/assets/cli.mjs find --kind sfx --tag mood:playful
```

```bash
node scripts/assets/cli.mjs find --kind background --tag era:medieval-europe --json
```

Filters: `--kind`, `--category`, `--status`, `--scope`, `--tag facet:value` (repeatable, all must match), `--text` (id/title/notes), `--json` for full records including license fields. Run `build` first if the index is missing or stale.

Prefer `approved` items, then `candidate` items (tell the user they are unreviewed), then making something new. Never ship `reference-only` items inside an output and never use an item whose `source_policy` is `blocked`. Check the project's docs/DECISIONS.md for deliberate exclusions (for example a story whose assets were kept out of the shared store) and respect them.

Two forms exist:

- `file` items: a real file at `path`.
- `impl` items: code that produces the asset, written `<path>#<symbol>`. Read the code there to reuse it. Prefix such ids with `synth-` (sound) or `painter-` (art).

## 2. Use

- Refer to assets by `id` in storyboards, scene data and docs; paths can move, ids stay.
- When a published work uses an item with `attribution_required: true`, copy its line from `assets/licenses/CREDITS.md` into the credits.
- After using an item in a story, add the story slug to its `used_in` list in the manifest.

## 3. Register something new

1. **Source.** Find the origin in `assets/catalog/sources.json`. For a new source, verify the license on the official page first, then add an entry with `license`, `commercial_ok`, `attribution_required`, `redistribute_ok`, `policy` (`allowed` / `restricted` / `blocked`) and `conditions`. Downloading files needs the user's explicit OK (file name, source, size) each time.
2. **Raw copy.** Unzip or clone into `assets/_vendor/<source-id>/<pack>/` untouched (gitignored). Set `"downloaded": true` on that pack.
3. **Curate.** Copy only the files worth reusing into the kind folder (layout in `assets/README.md`), renamed to kebab-case. Ten well-labeled sounds beat five hundred unlabeled ones.
4. **Label.** Add items to the folder's `manifest.json` (`"schema": "fairytale-asset-manifest/1"`, shared values in `defaults`). Every item needs `id` `<kind>.<category>.<slug>`, `title`, `file` or `impl`, and useful tags: `mood:`/`use:` for audio, `era:`/`style:` for art, `story:`/`character:` for story items. New label values go into `assets/catalog/taxonomy.json` first.
5. **Fill and build.**

```bash
node scripts/assets/cli.mjs fill
```

```bash
node scripts/assets/cli.mjs build
```

`build` refuses to write the index while any error remains. Errors include:
- unknown tag, missing file or changed hash
- an approved item from a blocked source, or from a source with `commercial_ok: false`
- an approved NC license
- an approved item of a kind with `approval_requires` (voices) that lacks those `provenance` fields, or whose model license is non-commercial
- an approved item from a `requires_consent` source without an existing `consent` file

Fix the manifest, not the validator. These gates are what keep commercial output legally clean.

6. **Status.** New items stay `candidate` until the user has seen or heard them; then set `approved` and build again.

## Voices

Adopted TTS voices are kind `voice` in `assets/audio/voices/<voice-id>/`: `ref.wav`, `voice.json` and `manifest.json`, labeled with `lang:`, `gender:`, `age:`, `voice-origin:`, `character:` and `mood:`. The storybook-narration skill's `tts/bin/tts pick` writes them as `candidate`. `tts/bin/tts approve` approves a voice after the user has listened; prefer it over editing the status by hand, because it reverts when validation fails.

Before designing a new voice, look for an existing one:

```bash
node scripts/assets/cli.mjs find --kind voice --tag lang:ko
```

Voice sources in `sources.json`:

| Source | Policy | Meaning |
|---|---|---|
| `qwen3-tts-voice-design` | allowed | Voices designed from text descriptions only. |
| `voice-recording-consented` | restricted | A real person's voice. Needs a `consent` file. |
| `qwen3-tts-preset-speakers`, non-commercial TTS models | blocked | Never approve. |

## Related skills

- `fairytale-art-prompts` generates sheets into `out/`; approved sets move to `assets/art/characters/<story>/<set>/` with their prompts.json and a manifest.
- `sheet-to-sprites` cuts sprites; register them in `sprites/` under the set (category `sprite`).
- `storybook-narration` designs, freezes and approves voices into `assets/audio/voices/`.
- `storybook-video` plays synth sounds by name and can play registered samples; see its sound-design reference.
