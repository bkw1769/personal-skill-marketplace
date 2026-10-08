// Story-specific drawing. One function per storyboard scene id; scenes without an entry use
// defaultScene (an animatic of the scene's characters on a mood-coloured background).
//
// Signature: (ctx, T, info) => void
//   T     absolute time in seconds (use it for motion so seeking works)
//   info  { scene, index, local, length, progress, cast, storyboard }
//         local = seconds since this scene started, progress = 0..1 through the scene
//
// Draw everything the scene needs, back to front: paper, sky, scenery, characters, effects.
// Captions, bubbles, the quote and paper grain are added on top by stage.js.
import { W, C, seg, easeOut, backOut, lerp, handText, INK } from './util.js';
import { spr, paste, S } from './sprites.js';
import { paper, sky, clouds, sun, ground, house, star } from './paint.js';
import { bob } from './stage.js';

/** Hand-lettered sound word ("쾅!", "통!") that pops in at t0 and fades out. */
export function sfxWord(ctx, text, x, y, T, t0, life = 0.7, size = 110, color = C.coral, rot = -0.08) {
  if (T < t0 || T > t0 + life) return;
  const p = backOut(seg(T, t0, t0 + 0.18), 2.6);
  const a = 1 - seg(T, t0 + life * 0.7, t0 + life);
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(p, p);
  handText(ctx, text, 0, 0, { size, color, outline: INK, outlineW: 7, seed: Math.round(t0 * 10) });
  ctx.restore();
}

export const SCENES = {
  // Example of a custom scene. Rename the key to a scene id from your storyboard, or delete it.
  'example-title': (ctx, T, info) => {
    paper(ctx);
    sky(ctx, C.skyLight, '#f6efd9', 0.8, 700);
    clouds(ctx, T, 0, 0, 0.8);
    sun(ctx, 1550, 210, 0.8);
    ground(ctx, 830, C.grass);
    house(ctx, 260, 830, 220, 180, '#f6e7d2', C.roof, 21);
    const title = info.storyboard.title;
    const p = easeOut(seg(info.local, 0.2, 1.4));
    handText(ctx, title, W / 2, 330, { size: 120, color: INK, reveal: p, seed: 3 });
    for (let i = 0; i < 5; i++) star(ctx, lerp(500, 1420, i / 4), 470 + Math.sin(T * 3 + i) * 10, 18, T + i, C.yellow, 40 + i);
    const hero = info.cast[0];
    const name = hero && (hero.sprites || []).find((n) => S[n]);
    if (name) {
      const b = bob(T, 0.5, 16);
      spr(ctx, name, lerp(-200, W * 0.62, easeOut(seg(info.local, 0.5, 2.5))), 980 + b.dy, 420, { rot: b.rot });
    }
    sfxWord(ctx, '짠!', 1500, 600, T, info.scene.start + 1.4, 0.9, 120, C.coral);
  },
};
