# Personal Skill Marketplace

A private-ready Codex plugin marketplace for bkw1769. It currently contains `personal-tools`, with the `personal-project-init` skill and a self-contained copy of the personal base rules.

## Local installation

```sh
codex plugin marketplace add /Volumes/BAE_DATA/BAE_DATA/developer/personal-skill-marketplace
codex plugin add personal-tools@bkw1769-personal
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
```

## Add or update skills

Place each self-contained skill in `plugins/personal-tools/skills/<skill-name>/SKILL.md`, including its referenced assets and resources. Edit the packaged skill here; the original loose SSD copy is not synchronized automatically. Increment both manifest versions when releasing changes, commit, and push:

```sh
git add plugins .agents README.md .gitignore
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
