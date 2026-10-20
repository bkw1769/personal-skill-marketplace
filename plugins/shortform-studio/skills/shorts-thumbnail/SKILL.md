---
name: shorts-thumbnail
description: Design and render the thumbnail of an informational YouTube Short (9:16) from the episode's own art, using patterns measured on 1M+ view explainer Shorts - one subject in the middle third, muted surround with the subject kept bright, one to three red marks (outline, arrow, X, ring, bar), a big number or 2-4 syllable keyword at the top and an optional twist caption - written as thumbnail.json, checked by a bundled checker (required parts, text length, safe area, highlight count) and by shorts-research's fact trace for any number, rendered to PNG by a bundled browser page with a phone-grid preview. Use this whenever the user asks for 썸네일, 쇼츠 썸네일, 커버 이미지, 표지, thumbnail, cover frame, 썸네일 만들어줘/바꿔줘/분석해줘, or finishes a short and needs the upload image, even if they never say "thumbnail".
---

# Shorts thumbnail

The thumbnail sells the title's twist in one glance at phone-grid size (about 180 px wide):
- **What** the video is about: one subject, big.
- **Where** to look: a red mark.
- **Why** it matters: a number or a keyword.

The patterns come from 99 Shorts with 1M+ views on a Korean explainer channel. See `references/reference-analysis.md` for the data and its limits, and `references/design-rules.md` for the rules.

## Inputs

- The episode folder `src/shorts/episodes/<id>/` with its art (`art/*.png`), `publish.json` (title) and `research/facts.json`.
- If any of these is missing, ask for the title and the still to use.

## Workflow

1. **Pick the still.** Choose the shot where the title's subject is clearest. A cutaway is best when the title is about something hidden. If no shot works at thumbnail size, generate one more shot with the episode's art prompts: subject large, simple background, no text.

2. **Write the spec.**

   ```bash
   node <skill-dir>/scripts/thumbnail.mjs init src/shorts/episodes/<id>/thumbnail.json --image art/<shot>.png
   ```

   Then fill it in. Format: `references/spec-format.md`. Rules: `references/design-rules.md`.
   - **Headline:** prefer the number from the title's second line, with its `claims`.
   - **Mark:** choose it by the title's claim (outline = "this part", X = myth, arrows = force or flow).

3. **Check.**

   ```bash
   node <skill-dir>/scripts/thumbnail.mjs check src/shorts/episodes/<id>/thumbnail.json
   ```

   ```bash
   node <shorts-research-dir>/scripts/facts.mjs trace src/shorts/episodes/<id>
   ```

   Trace reads `thumbnail.json` and refuses an unsourced number in the headline or caption.

4. **Render.**
   - Copy `assets/renderer/` once to `src/shorts/_engine/thumbnail/`.
   - Serve the project with the dev server (`--serve src,assets --save-dir src/shorts/out`).
   - Open `/src/shorts/_engine/thumbnail/index.html?spec=/src/shorts/episodes/<id>/thumbnail.json&name=<id>/<id>-thumbnail`.
   - Look at both the full image and the 180 px tile. If the headline or mark is unclear at tile size, fix the spec and reload.
   - Save with the button, or `await __saveThumb()` in the console. With `&name=<id>/<id>-thumbnail` the file is `src/shorts/out/<id>/<id>-thumbnail.png`, next to the episode's video (the dev server creates the folder).

5. **Look at the PNG** (open the image, not just the exit code): subject clear, mark on the right spot, words readable, nothing in the bottom 20%.

6. **Make a matching frame in the video** for creators without custom upload, who pick from suggested frames. The hook shot plus the keyword card already looks close. Name that time (for example `0:01`) in the report so the user can pick it.

7. **Upload (user).** Custom upload is in YouTube Studio on desktop: Content, then the Short's edit page, then Thumbnail. As of 2026-07 it is limited to Partner Program creators. Others choose the named frame.

## Report

Say which still you used, the headline and its claim, the marks, both file paths (PNG and spec), the frame time from step 6, and any rule you broke on purpose.
