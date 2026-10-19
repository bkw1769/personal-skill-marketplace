# Personal Skill Marketplace

A private-ready Codex plugin marketplace for bkw1769.

| Plugin | Skill | What it does |
|---|---|---|
| `personal-tools` | `personal-project-init` | Scaffold a project with the personal base rules (AGENTS.md, docs, src, out). |
| `personal-tools` | `docs-sync` | After a task, bring STRUCTURE / DECISIONS / MEMORY / README and links back in line with the files (bundled checker). |
| `fairytale-studio` | `fairytale-art-prompts` | Assemble image prompts for character, expression, prop, location, plate and torn-paper element-kit sheets from art-style x era modules; one JSON spec per story -> all prompts and a Codex batch (bundled assembler + tests). |
| `fairytale-studio` | `fairytale-assets` | Labeled asset store for art and sound: manifests, controlled tags, license ledger of vetted libraries, searchable index, one-step sprite registration and refresh (bundled tool + tests). |
| `fairytale-studio` | `story-storyboard` | Synopsis to timed storyboard.json (scenes, captions, bubbles, music, sound cues) with a validator and Markdown view. |
| `fairytale-studio` | `sheet-to-sprites` | Cut transparent sprites out of hand-drawn sheets (pure Node PNG codec, paper removal, magenta key, paper-rim colour matching, contact sheet) and measure them (openings, colour positions, leftover magenta). |
| `fairytale-studio` | `storybook-narration` | Korean/English narration with Qwen3-TTS 1.7B on MLX: design and freeze voices, script/storyboard to lint-checked lines, batch generation with QA and retakes, full.wav + timeline.json (portable tts/ template + line tool). |
| `fairytale-studio` | `storybook-video` | Watercolor storybook video from storyboard + sprites (Canvas 2D + Web Audio template, recorded narration with ducking, collage helpers, frame-by-frame MP4 export, real-time recording with a pre-check, review stills, dev server) plus an MP4 probe and a picture/sound sync check. |
| `shortform-studio` | `shorts-research` | Informational shorts: topic scoring, source ledger and claim ledger, and a checker that traces every on-screen number (captions, overlays, title, description, hashtags) to a claim and prints the description's source list (bundled checker + tests). |

The fairytale skills chain: art prompts → (image generation) → sheet-to-sprites → assets; story-storyboard → storybook-narration → storybook-video.

## Local installation

```sh
codex plugin marketplace add /Volumes/BAE_DATA/BAE_DATA/developer/personal-skill-marketplace
codex plugin add personal-tools@bkw1769-personal
codex plugin add fairytale-studio@bkw1769-personal
codex plugin add shortform-studio@bkw1769-personal
```

Start a new chat after installation. Use the personal project initialization skill to create a project scaffold.

## Publish to GitHub

The intended repository is `bkw1769/personal-skill-marketplace`, private by default. If it has not yet been created:

```sh
cd /Volumes/BAE_DATA/BAE_DATA/developer/personal-skill-marketplace
gh auth login --hostname github.com --web
gh repo create bkw1769/personal-skill-marketplace --private --source=. --remote=origin --push
```

These commands require GitHub authentication and a local commit. They must not be run again if the repository already exists. Repository publication does not submit this plugin to the public plugin directory.

## Install on another computer

Authenticate with a GitHub account that can read the private repository, then:

```sh
codex plugin marketplace add bkw1769/personal-skill-marketplace --ref main
codex plugin add personal-tools@bkw1769-personal
codex plugin add fairytale-studio@bkw1769-personal
```

For Claude Code, copy a skill folder into a project's `.claude/skills/` (or `~/.claude/skills/`); the SKILL.md format is the same.

## Tests

Scripts bundled in skills are plain Node.js (22.8+, built-ins only) and have unit tests in `tests/` (plus bundled project tests under `plugins/**/test/`). The suite enforces 100% line, branch and function coverage:

```sh
npm test
```

The `storybook-narration/assets/tts-template/` Python tool has its own pytest suite (100% coverage, run with `tts/bin/test.sh` after copying it into a project); it is not run by `npm test`. Browser template code (`storybook-video/assets/template/`) is not unit-tested; it was checked end to end (scaffold, render, record, probe) with real storyboard and sprite data.

## Add or update skills

Place each self-contained skill in `plugins/personal-tools/skills/<skill-name>/SKILL.md`, including its referenced assets and resources. Edit the packaged skill here; the original loose SSD copy is not synchronized automatically. Increment both manifest versions when releasing changes, commit, and push:

```sh
git add plugins .agents tests package.json README.md .gitignore
git commit -m "Update personal skills"
git push origin main
```

For an additional plugin, create a separate directory under `plugins/` and add an entry to `.agents/plugins/marketplace.json`. Source paths are relative to this repository root. Never commit credentials, environment files, or unrelated project data.

For Git-backed installations, refresh the marketplace, then refresh the plugin:

```sh
codex plugin marketplace upgrade bkw1769-personal
codex plugin add personal-tools@bkw1769-personal
```

For the local SSD source, refresh the plugin directly with the second command. Start a new chat to use updated skills.

Reference: https://developers.openai.com/plugins/build/plugins
