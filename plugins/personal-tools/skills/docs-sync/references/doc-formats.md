# Document formats

## docs/STRUCTURE.md

````markdown
# Project structure

Measured on 2026-10-07 after <what changed>. OS metadata excluded.

```text
project/
├── README.md
├── package.json              # root scripts
├── docs/
│   ├── DECISIONS.md, MEMORY.md, STRUCTURE.md
│   └── research/source_inventory.json
├── scripts/
│   └── assets/               # catalog CLI and test/
└── out/                      # generated outputs only (gitignored)
```

| Path | Purpose |
|---|---|
| `package.json` | Root scripts: `npm test`, `npm run dev`. |
| `scripts/assets/` | Asset catalog CLI with unit tests. |
````

The checker reads tree lines (`├──` / `└──`, four characters per level), comma-separated names on one line, `{a,b}` alternatives, and the first table column. Comments after `#` are ignored. A line with several names cannot have children; give each folder with children its own line.

## docs/DECISIONS.md

```markdown
| Date (Asia/Seoul) | Decision | Rationale | Impact |
|---|---|---|---|
| 2026-10-07 | Keep `out/` for generated files only; move the video source to `prototypes/`. | Source in a gitignored folder is not version-controlled. | Video reads sheets from `/assets/...`; recordings still land in `out/`. |
```

- Decision: the rule or contract as it now stands, in one sentence.
- Rationale: the constraint or evidence that forced it.
- Impact: what changed for code, commands, people; what it supersedes.

## docs/MEMORY.md

```markdown
- Run: `npm run dev`, open `http://127.0.0.1:8765/prototypes/troy-video/`.
- Python http.server fails on this external volume; use the Node dev server.
- Pending: product direction (FT-001) undecided.
```

One fact per line, greppable keywords first, no paragraphs.

## README.md

- Summary (2-3 sentences), structure bullets with links, run commands in fenced blocks, test command, documentation links.
- Sub-repo READMEs: role of the sub-repo, its own run and test commands.
- Mark unknowns as `TBD` instead of guessing.
