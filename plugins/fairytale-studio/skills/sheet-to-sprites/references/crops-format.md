# crops.json format

```json
{
  "schema": "sprite-crops/1",
  "note": "free text: sheet size, where the coordinates came from",
  "sheets": {
    "cast": "troy-cast-v1.png",
    "expr": "troy-expressions-v1.png"
  },
  "crops": {
    "girl":        { "sheet": "cast", "x": 105, "y": 140, "w": 205, "h": 368 },
    "horse-cast":  { "sheet": "cast", "x": 702, "y": 558, "w": 395, "h": 398, "options": { "largest": true } },
    "title-text":  ["cast", 520, 10, 320, 46, { "text": true }]
  }
}
```

- `sheets`: short key → PNG path, relative to the folder of crops.json.
- `crops`: name → rectangle in sheet pixels (origin top-left). Object form or compact array form `[sheet, x, y, w, h, options?]`. Order is kept in sprites.json and the contact sheet.
- Element-kit sheets: `find-pieces.mjs` writes these entries for you (object form with `"options": {"largest": true}`), named in slot order.
- Names: kebab-case (`girl-front`, `ody-head-idea`); they become `<name>.png`.
- Rectangles may extend past the sheet edge; they are clipped.

## Options

| Option | Default | Use when |
|---|---|---|
| `largest` | false | Props and objects: remove every blob smaller than 5% of the biggest one (palette dots, labels, stray marks under the object). |
| `text` | false | Hand lettering and swatches: skips flood fill; alpha = how far a pixel is from the paper colour. Keeps thin strokes and dots of Korean letters. |
| `tol` | 24 | Colour distance (0-441) still counted as paper. Lower it if pale washes (light skin, lilac dress) get eaten; raise it if paper texture or shadows remain. |
| `holeMin` | max(90, 0.12% of crop) | Minimum size of an enclosed paper island that is made transparent. Lower it to clear small gaps between fingers or wheel spokes; raise it if a pale area inside the figure turns transparent. |
| `pad` | 2 | Transparent margin kept around the trimmed sprite. |
| `soft` | 42 | Colour-distance range over which edge pixels fade to opaque (and get the background un-mixed). 42 suits ink on paper; about 220 suits a flat chroma backdrop (magenta kits), where the blend band between the white rim and the backdrop is wide in colour distance. |
| `grow` | true | Set `false` to use the rectangle exactly as written (no automatic headroom). |
| `growMax` | 160 | Most pixels each side may grow for this crop. |

## Lessons from the first sheets

- The first Troy crop table cut the tops of Odysseus's hair, both helmet plumes and the horse's ears: boxes drawn at the visible "top of head" miss tufts and plumes. Automatic growth fixed 16 of 34 crops (8-24 px each); start boxes higher anyway.
- A prop crop picked up the palette dots printed above it → `largest: true`.
- A name label lost its last syllable → label boxes need extra room on the right; lettering drifts.
- Two citizens drawn touching could not be separated → keep them as one sprite or regenerate the sheet with a gap.
- Coordinates are only trustworthy after looking at `_boxes-*.png`; estimate, cut, look, adjust.
- White clothing (hanbok, robes, a magpie's belly) is paper-coloured, so enclosed white areas were cleared as holes and showed the background through the figure (golden-axe pose sheets). Set `"holeMin": 1000000` on such characters; the small paper islands between legs then stay paper-coloured, which is invisible on the drawing-paper ground of a collage scene.
- A separate object next to a figure (an axe flying out of a hand) is dropped when it touches the crop border; widen the box so it sits fully inside.
