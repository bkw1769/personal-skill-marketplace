---
name: docs-sync
description: Bring a project's living documentation back in line with the code after work is done - measured tree vs docs/STRUCTURE.md, a dated row in docs/DECISIONS.md, a terse line in docs/MEMORY.md, README run commands and links, broken Markdown links and stale absolute paths - using a bundled checker. Use this at the end of any task that added, moved, renamed or deleted files, changed behavior, commands, schemas or workflows, and whenever the user says 문서 정리해줘, 문서 동기화, STRUCTURE 갱신, 프로젝트 문서 맞춰줘, docs out of date, or asks for a project analysis where stale docs are likely. Pairs with personal-project-init, which creates these documents; this skill maintains them.
---

# Docs sync

Projects built on the personal base rules keep four kinds of living documents: README (what it is and how to run it), docs/STRUCTURE.md (what each path is for), docs/DECISIONS.md (durable why), docs/MEMORY.md (terse lookup). They rot one small change at a time. This skill closes that gap at the end of a task, in the same pass as the change.

## 1. Measure

```bash
node <skill-dir>/scripts/check-docs.mjs <project-root>
```

It reports:

- **Errors**: paths drawn or listed in STRUCTURE.md that no longer exist, relative Markdown links that point nowhere, missing README.md.
- **Warnings**: top-level files and first-level folders that STRUCTURE.md does not describe, absolute paths or links to places that do not exist on this machine, missing AGENTS/DECISIONS/MEMORY/STRUCTURE, sub-repo folders (with package.json, pyproject.toml, ...) that have no README.md.

Options: `--structure <file>` if the tree lives elsewhere, `--ignore name,name` for extra folders to skip (`.git`, `node_modules`, caches are skipped already), `--json`.

The checker only sees paths. Read the diff of the task too (`git status`/`git diff`, or the list of files you touched) to know which behavior, command or schema changed.

## 2. Update, in this order

1. **STRUCTURE.md**: redraw the tree from what is on disk (not from memory), then the path table: one row per meaningful path, purpose in one line. Mark folders that are empty on purpose. Put proposed-but-not-created folders in the plan document, not in STRUCTURE.
2. **DECISIONS.md**: one row per durable decision made in this task: date (user's local date), decision, rationale, impact. Behavior and contracts only; no changelog of edits. If a later decision replaces an older one, add the new row and say what it supersedes rather than rewriting history.
3. **MEMORY.md**: short, searchable facts someone needs next time: commands, paths, gotchas, pending items. Update or delete lines that became false; do not append contradictions.
4. **README.md** (root and each sub-repo): summary, structure bullets, run and test commands that actually work now, links to docs. Run the commands you write down if you can.
5. Fix every broken relative link. For absolute paths to other machines, either replace them with project-relative paths or mark them as historical where they appear.

Details and examples of each format: `references/doc-formats.md`.

## 3. Verify

Re-run the checker until it reports no errors, and explain any warning you leave (for example a historical path in a research record). Report to the user in their language: which documents changed and why, the checker result, and anything left open.

## Boundaries

- Do not invent decisions or facts. If the reason for a change is unknown, ask or write "reason not recorded".
- Do not rewrite AGENTS.md beyond what its own rules allow (for example filling a TBD row of the per-language table once a stack is chosen).
- Keep each document in its role: rationale in DECISIONS, not MEMORY; path purposes in STRUCTURE, not README.
