# Animation patterns and known pitfalls

## Motion recipes

| Effect | Recipe |
|---|---|
| Walk | `bob(T, 0.45, 14)` while moving (`dy` and `rot`), `bob(T, 2.4, 5)` standing; move x with `lerp` over `seg(local, t0, t1)`. |
| Landing / impact | Squash for ~0.15 s: `spr(..., { sq: 0.15 })`, then back to 0. Add `puff()` dust and a `sfxWord`. |
| Pop-in | Scale by `backOut(seg(T, t0, t0 + 0.35))` (bubbles, signs, stars). |
| Hand-drawn feel | Draw pen lines with `seed: boil(k)` (8 fps shimmer); step character motion "on twos": `const st = Math.floor(T * 12) / 12` and animate from `st`. |
| Close-up | Circle inset with a face sprite: clip an arc, draw the sprite scaled to the circle, ink the rim; pop it in with `backOut`. |
| Idea | `bulb(ctx, x, y, s, glow)` with glow ramping in, plus a `ding` cue. |
| Night | `nightOverlay(ctx, 0.35)` after the scene, `starsField`, `moon`; warm `torch()` glows use `lighter` compositing so they punch through. |
| Camera pan | Paint a wide background once (e.g. 3200 px) and `drawImage` it at `-camX`; move characters with the same `camX` (parallax: clouds at a fraction). |
| Zoom | `ctx.translate(cx, cy); ctx.scale(z, z); ctx.translate(-cx, -cy)` before drawing the scene. |
| Crowd | Reuse two or three sprites with `flip` and small size/`k` variations; spread them across the visible width. |
| Celebration | Confetti and bunting (simple rotated rectangles and washed triangles) driven by `T`. |

## Audience rules (from the age research of 2026-10-08)

The storyboard's `audience` band (`3-5`, `6-8`, `9-10`) decides how a scene should move; the numbers are in the story-storyboard skill's `references/audience-profiles.md`.

- **Move what the narration names.** Animation that matches the sentence being read guides the eye and helps comprehension; everything else stays still or nearly still. Decorative sparkles, idle background motion and "tap here" style cues compete with the story.
- **Clarity beats cut count.** Fantastical, hard-to-follow scenes lowered 4-year-olds' executive function even when short; editing pace alone mattered less. For 3-5: one picture per narration sentence, held about a second after it ends, 8-20 s per scene; for 6-8: 5-15 s. Never cut in the middle of a sentence.
- **New words need stillness.** When a sentence introduces a new word, hold the picture 1-2 s and drop the music (children learned new words better from still pictures without music).
- **Questions to the viewer.** After an on-screen question, freeze the action for the band's silence (2-4 s for 3-5, about 2 s for 6-8), then let a character show the answer.
- **Fear by age.** For 3-5 never show a transformation on screen (cover it with the paint-blot transition), no teeth or claw close-ups, a safety cue before a threat, resolve it in the same scene. From 8, classic villains are fine; keep danger short and reassure right after.
- **Captions.** 6-8: full narration captions with word-by-word highlighting in sync with the voice (early readers look at the text twice as often when words are highlighted). 3-5: optional, refrain only, large. 9-10: plain captions. Never more than two lines; captions match the narration exactly.
- **Calm ending.** Show the moral as an action, ask one short question, confirm the moral in one sentence, then a calm close. No "keep watching" pushes: the channel is made for kids and screen-time guidance is about an hour a day for 2-5.

## Pitfalls already hit once

- **Visible before entering.** Floating-point easing left a character at 0.0001 opacity on screen before its entrance. Clamp entrance curves so they are exactly 0 before `t0` and exactly 1 after `t1` (`seg` already clamps; custom curves must too).
- **Objects off screen.** Nine ships were animated but only one ever entered the frame because their x range was relative to the wrong origin. Compute positions from the visible frame (0..1920) and check with `__sheet` at several times.
- **Scale breaks the story.** The wooden horse drawn taller than the city gate it is pulled through. Check size relations between props, buildings and characters on the same frame.
- **Overlay hides controls.** The start screen covered the save button. Keep primary actions on the overlay itself or above it.
- **Hidden preview pane.** A hidden or background browser tab throttles `requestAnimationFrame`; review stills with `?still&t=` and screenshots of the visible page, not a background tab.
- **Heavy frames drop frames while recording.** Real-time capture of busy scenes ran at about 20 fps instead of 30 (check with probe-mp4). Pre-paint static layers, reduce per-frame `wash` calls with many layers, and avoid recording while other heavy tabs run.

## Review routine

1. After every scene: `?still&t=<middle of scene>` and one frame right after the transition.
2. After all scenes: `__sheet([...one time per scene...], 4)` and look at the whole story as a strip.
3. Play once with sound, then once more with narration on, watching caption timing against the picture.
