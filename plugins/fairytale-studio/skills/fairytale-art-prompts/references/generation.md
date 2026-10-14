# Generating sheets with Codex CLI

How assembled prompts become images when the image model is Codex's built-in image tool, run headless from a script. Learned on golden-axe (2026-10-08 to 2026-10-14).

## One sheet

```bash
codex exec --skip-git-repo-check -s read-only -C <project> -i <ref1.png> -i <ref2.png> - < prompts/<sheet>.txt > logs-<sheet>.txt 2>&1
```

- Pass each `-i` path as its own word (in zsh a single `$IMGS` variable is not split and Codex sees no images).
- Codex saves into `~/.codex/generated_images/<session id>/exec-*.png` and cannot copy into a read-only workspace; copy the file yourself.
- "model is at capacity": wait about 60 s and run the sheet again (up to 4 tries).

## Take the image this run made, not the newest one

```bash
img=$(node <skill-dir>/scripts/codex-image.mjs logs-<sheet>.txt) && cp "$img" <sheet>.png
```

`codex-image.mjs` reads the run's own log: the last `generated_images/*.png` path Codex reports (its final take), else the newest PNG in the folder of the log's `session id`. It exits 1 instead of guessing. Never pick "the newest PNG in generated_images": every Codex session on the machine writes there, and on golden-axe a parallel session's channel banner was copied in as `plate-pond-day`, and the mist plate generated next used it as its composition reference. Record `<sheet> <- <path>` per sheet so a wrong capture can be traced and fixed.

## Order and checks in a batch

- Generate a place's **day plate first** and look at it before generating the other times of day that attach it as Image 2 (`@plate-<place>-day`); a wrong or rejected day plate silently spreads to every sheet that references it.
- **Look at every sheet as soon as it lands** (the image, not just the exit code): wrong subject, text or logos, a mirrored figure, a pose facing the wrong way. Re-run that one sheet under a new name rather than editing pixels.
- Skip finished sheets by file existence so a batch can be resumed; to redo a sheet, move the old PNG to a `superseded/` folder and note it in the record.
- Plates with a high horizon (overview, forest floor): the template's "calm, almost empty lower part" sentence wins over a ground description and leaves the lower half empty. For a bird's-eye plate replace that sentence with one that says the ground pattern continues to the bottom edge, getting larger and simpler toward the bottom.
- Cut kit and cut-out sheets right after they land (`sheet-to-sprites`, with `--rim <story paper>`), so a missing or merged piece is caught while the batch still runs.
