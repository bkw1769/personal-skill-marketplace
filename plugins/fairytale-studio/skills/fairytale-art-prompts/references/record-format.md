# Recording generated art

Every generated sheet is recorded so it can be reproduced or extended later without the conversation that made it.

## Folder

`out/character-designs/<YYYY-MM-DD>-<story-slug>-v<N>/` containing the images, `prompts.json`, `README.md` and `character-bible.md`.

`out/` is the drafting area and is gitignored. When the user approves a set, promote it to the shared asset store `assets/art/characters/<story-slug>/<set>/` (images, `prompts.json`, `README.md`, `character-bible.md`) and register it with a `manifest.json`, following the `fairytale-assets` skill. Cut sprites go in `sprites/` under that set.

The Troy set predates this convention and now lives only in `assets/art/characters/troy/2026-10-07-v1/` (the video prototype reads it from there); the `saved_path` values in its prompts.json still show the original `out/character-designs/` location. Style reference photos live in `assets/art/style-refs/watercolor-ink/`; the Troy prompts.json still shows their old names (`docs/resouse/creature 1.jpg`, now `creature-1.jpg`).

## prompts.json

Same shape as the Troy record, plus `story`, `style` and `era`:

```json
{
  "created_date": "2026-10-08",
  "story": "헨젤과 그레텔",
  "style": "watercolor-ink",
  "era": "medieval-europe",
  "generation_mode": "built-in image_gen",
  "status": "character concept drafts, not rigged production assets",
  "references_root": "assets/art/style-refs/watercolor-ink",
  "assets": [
    {
      "filename": "hansel-cast-v1.png",
      "sheet": "cast-lineup",
      "source": "<original path written by the image tool>",
      "references": ["creature-1.jpg", "creature-2.jpg", "creature-3.jpg", "nature-2.jpg"],
      "prompt": "<the exact prompt text sent>",
      "width": 1536,
      "height": 1024,
      "sha256": "<hash>",
      "saved_path": "out/character-designs/2026-10-08-hansel-gretel-v1/hansel-cast-v1.png"
    }
  ]
}
```

Element-kit sheets add three fields to their asset entry: `"sheet": "element-kit"`, `"layer": "near"`, `"pieces": ["cottage-dori", "wall-straight", ...]` (slot names in reading order, the same list passed to `find-pieces.mjs --names`) and `"scale_ref": "cottage door = Dori height"`.

Store the prompt exactly as sent, including fix lines added on a retry. Get the hash and size with:

```bash
shasum -a 256 <file>
```

```bash
sips -g pixelWidth -g pixelHeight <file>
```

## README.md

A short Korean summary: what each sheet contains, the style and era used, the color assignment per main character, and known flaws (for example "측면 포즈가 사선에 가까움"). Keep it short enough to read in under a minute.
