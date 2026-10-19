# thumbnail.json (`shorts-thumbnail/1`)

Coordinates are fractions of the frame (0..1, from the top left). The `image` path is relative to the spec file.

```json
{
  "schema": "shorts-thumbnail/1",
  "size": { "width": 1080, "height": 1920 },
  "image": "art/kick-through.png",
  "crop": { "focus": [0.55, 0.5], "zoom": 1.1 },
  "background": { "dim": 0.25, "desaturate": 0.4, "vignette": 0.5, "spot": [0.2, 0.25, 0.65, 0.5] },
  "highlights": [
    { "kind": "outline", "box": [0.42, 0.28, 0.3, 0.42] },
    { "kind": "arrow", "from": [0.15, 0.5], "to": [0.4, 0.5] }
  ],
  "headline": { "text": "9mm", "claims": ["c-gypsum-9mm"] },
  "caption": { "text": "부수라고 만든 벽" },
  "not_facts": []
}
```

| Field | Required | Meaning |
|---|---|---|
| `schema` | yes | `shorts-thumbnail/1` |
| `size` | no | Default 1080x1920. Must be 9:16. Below 1080 wide warns. |
| `image` | yes | Episode still. Must exist. |
| `crop.focus`, `crop.zoom` | no | Point to keep centred, and zoom (1..3) over a cover fit. |
| `background.dim`, `desaturate`, `vignette` | no | 0..1. Defaults 0.25 / 0.35 / 0.5. |
| `background.spot` | no | `[x, y, w, h]`: region kept at full colour, with soft edges. |
| `highlights[]` | yes, 1-3 | `outline` and `bar` take `box`; `arrow` takes `from` and `to`; `xmark` and `ring` take `at`. Optional `size` (fraction of the width: line width for outline, arrow width, X size, ring radius) and `color` (`#rrggbb`, default red `#ff3b30`). |
| `headline` | recommended | `text` (8 characters or fewer recommended, 14 max, up to 2 lines with `\n`), `y` (default 0.16), `claims`, `color`. |
| `caption` | no | `text` (12 or fewer recommended, 18 max), `y` (default 0.62), `claims`, `color`. |
| `not_facts` | no | Phrases with digits that are not facts, used by `facts.mjs trace`. |
