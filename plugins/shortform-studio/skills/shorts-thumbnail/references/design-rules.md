# Thumbnail design rules

These rules turn the patterns in `reference-analysis.md` into checks. The checker enforces the ones marked **(checked)**.

## 1. The picture

- **One subject.** Use the episode's own still, the shot where the "X" of the title is easiest to see. A cutaway shot is best when the title is about something hidden inside.
- **Crop to the subject (checked: `crop.focus` within 0..1, `crop.zoom` within 1..3).** The subject should fill 40-60% of the height and sit in the middle third.
- **Mute the rest.** Use `background.desaturate` 0.3-0.5, `dim` 0.2-0.35 and `vignette` about 0.5. Then set `background.spot` to the subject's box, so the subject alone keeps full colour. The muted surround is what makes the red mark pop.

## 2. The mark (checked: at least one, warning above three)

Pick the mark by what the title claims:

| Title claim | Mark |
|---|---|
| "This part is the secret" | `outline` around the part |
| "It is not X" / myth busting | `xmark` over the thing people believe |
| Force, flow, pressure, where it goes | 1-3 `arrow`s pointing into the subject |
| "This spot" in a wide shot | `ring` |
| Height, depth, amount | `bar` |

- Use red `#ff3b30` by default. Use the episode accent colour only when red would clash with a red subject.
- Marks are drawn thick: outline about 1.2% of the width, arrows about 3%.

## 3. Words

- **Headline (checked: 8 characters or fewer recommended, 14 max, `y` 0.06-0.32).** A number with its unit, or a 2-4 syllable keyword. Prefer the number from the title's second line; a number must come from the fact ledger (list its `claims`, and `facts.mjs trace` checks it). Write numbers as digits.
- **Caption (optional; checked: 12 characters or fewer recommended, 18 max, `y` 0.40-0.75).** The twist in a few words, for example `부수라고 만든 벽`. It must not repeat the headline (checked).
- Never write the full title on the thumbnail; the feed shows the title under it anyway.
- Font: Noto Sans KR 900, white fill, black outline and soft shadow (the renderer does this). Use charcoal `#222222` only on a very light sky.

## 4. Safe area (checked: warning)

- Keep marks and words inside x 4-96% and y 4-80%.
- The bottom 20% is covered by the title and channel row in the Shorts feed, and the right edge by the player buttons.

## 5. Phone-grid test

- The renderer page shows the thumbnail at 180x320, about one tile in a phone grid.
- At that size you must still read the headline and see the mark. If not, make the words shorter, zoom in, or remove a mark.

## 6. Do not

- No faces made to look shocked, and no clickbait words (`충격`, `경악`).
- No claim on the thumbnail that the video does not prove.
- No picture that contradicts the ledger. Image models miscount: on tactile-paving the first macro had 5 bars and 16 dots, where the law says 4 and 36. Count anything countable in the still (dots, bars, floors, gaps) against the claims before using it, and regenerate with the exact count written into the prompt ("EXACTLY 36 dots in a 6 by 6 grid").
- No logos, brand names or real people.
- Nothing copied from the reference channel: no art, no text, no layout tracing.
