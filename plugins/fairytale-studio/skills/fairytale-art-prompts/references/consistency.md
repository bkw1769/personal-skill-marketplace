# Keeping characters identical across sheets

Image models do not remember earlier images. Identity survives only through two channels: the anchor image attached as a reference, and the same words repeated in each prompt. Use both every time; either one alone drifts.

## Character bible

One file per story, `character-bible.md` in the story's output folder (template: `assets/character-bible-template.md`). Write it before the first prompt.

Each character gets an **identity sentence**: one paragraph covering age and role, silhouette, face, hair, outfit with two or three named colors, one signature accessory, and personality in a pose. Example from Troy (the girl):

```text
curious thoughtful 8-year-old girl, short dark-brown bob with a small loose tuft, pale coral simple dress, light turquoise short shoulder shawl, thin legs and simple shoes, slightly asymmetrical dot eyes, tiny inquisitive eyebrows
```

Paste the identity sentence unchanged into every prompt that shows the character. Do not "improve" it per sheet: a synonym (coral → salmon, bob → short hair) is enough for the model to redesign the character. If a design really changes, bump the version (see below) and edit the bible first.

Give characters in the same story clearly different silhouettes (tall/thin vs short/round, long dress vs short tunic) and non-overlapping signature colors. That keeps them recognizable at thumbnail size and after cut-out.

## Reference chaining

- Sheet 1 (cast lineup) uses only style references.
- Every later sheet attaches the approved lineup as `Image 1`, described as `a STRICT CHARACTER IDENTITY AND PALETTE reference, not an edit target`, followed by `Preserve face, haircut, clothing colors, age and distinguishing features exactly:` and the identity sentences.
- "not an edit target" matters: without it, some tools paint over the reference instead of drawing a new sheet.
- Attach at most two or three style references next to the anchor so the anchor keeps priority.

## Versions

- Folder per approved set: `<date>-<story-slug>-v<N>`. Regenerating a single failed sheet stays inside the same version; changing a design creates v<N+1> with an updated bible and a note on what changed.
- Never overwrite an approved sheet; downstream work (sprites, video) may already depend on its pixels.
