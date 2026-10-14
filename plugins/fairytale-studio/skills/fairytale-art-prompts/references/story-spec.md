# Story art spec (assemble-prompts.mjs)

One JSON file per story describes every sheet; `scripts/assemble-prompts.mjs` pastes the module blocks around it and writes the prompts and `batch.json`, and `scripts/run-batch.sh` generates the images. No story needs its own prompt script (golden-axe had a 500-line one in a handoff folder, which nobody could reuse). Worked example: `examples/golden-axe-art.json` (a plate, the gate states and the whole/notched tree).

```bash
node <skill-dir>/scripts/assemble-prompts.mjs stories/<id>/art.json
```

```bash
<skill-dir>/scripts/run-batch.sh <out dir> [sheet ...]
```

`--only a,b` rewrites only those prompts (batch.json keeps the others); `--out` overrides the folder.

## Fields

| Field | Meaning |
|---|---|
| `title`, `subtitle` | Story title, and a short note after it ("a Korean folktale"). |
| `audience` | `3-5`, `6-8` (default) or `9-10`: the audience.md band line. |
| `style`, `era`, `finish` | Module file names: `styles/<style>.md`, `eras/<era>.md`, `styles/<finish>.md` (default `torn-paper-collage`). |
| `paper` | The story's one paper colour (`#f4efe2`); renames "off-white" paper in the style block and fills the plate paper sentence. |
| `anchor` | Approved cast lineup file, attached as Image 1 of every sheet (palette anchor for plates and kits, identity anchor for cut sheets). |
| `palette` | Palette line with the era tilt; default the style module's palette. |
| `land` | Landscape line for plates; default the era block's people/setting part. |
| `roles` | Extra reference role sentences `{ "file.png": "what to borrow" }`; the style module's table is used otherwise. |
| `safety` | Extra constraint sentence for cut sheets (story-specific: "axes are tools ..."). |
| `out` | Output folder, relative to the spec file. |
| `refsDirs` | Folders where `run-batch.sh` looks up reference images (relative to the spec). |
| `sheets` | The sheets, in generation order (day plates before the plates that attach them). |

## Sheets

All sheets: `name` (kebab-case, becomes `<name>.png`), `kind`, `refs` (file names from the role table, `[file, "Image {n} ... sentence"]` for anything else, `@<sheet>` for a sheet of this batch).

- `plate` (template 8): `location`, `time`, `sky`, `far`, `ground` (a Ground field sentence from element-kits.md), `horizon` (percent, default 58), optional `base` (the day plate whose composition it keeps), `lower` (replaces the calm-ground sentence, e.g. for a bird's-eye plate), `extra`.
- `kit` (template 6): `label`, `layer`, `arrange` (rows), `scale` (scale relations and any sheet-wide rule), `pieces` `[[name, sentence], ...]`, `big` (one or two large pieces: the "drawn very large" sentence), `backing` (solid backing for gates, fences, lattices), `allowHole` (the one intended opening, e.g. an empty gateway).
- `cut` (template 7): `who`, `identity` (the character bible sentence), `arrange`, `pieces` (pose slots), `framing` (default head-to-toe), refs usually `[["<pose sheet>.png", "Image {n} ... approved pose sheet ..."]]`.

## Habits that saved regenerations on golden-axe

- States of one object (whole and notched tree, closed wall / empty gateway / door leaves) go on one sheet so they match line for line.
- Where an action lands is measured on the character sprite first (`sheet-to-sprites/scripts/measure.mjs color`), then written into the piece sentence ("the notch about 40 percent up the trunk, the height of the felling stroke").
- Prompts are regenerated from the spec, never edited by hand in `prompts/`, so the record and the next retry stay in step.
