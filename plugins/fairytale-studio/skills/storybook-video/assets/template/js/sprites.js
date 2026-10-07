// Loads transparent sprites listed in a sprites.json (made by the sheet-to-sprites skill)
// and draws them with the hand-drawn "boil" wobble.
import { hash, state } from './util.js';

/** name -> { c: HTMLImageElement, w, h, id, name } */
export const S = {};

function loadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('image load failed: ' + src));
    im.src = src;
  });
}

/** Load every sprite in the manifest. `url` is the sprites.json URL; PNGs sit next to it. */
export async function loadSprites(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`cannot load ${url} (${res.status})`);
  const manifest = await res.json();
  const base = new URL('.', new URL(url, location.href)).href;
  let id = 0;
  await Promise.all(manifest.sprites.filter((s) => !s.empty).map(async (s) => {
    const c = await loadImage(base + s.file);
    S[s.name] = { c, w: c.naturalWidth, h: c.naturalHeight, id: id++, name: s.name };
  }));
  return S;
}

/**
 * Draw a sprite anchored at bottom-centre (or centre with pivot:'center').
 * h is the on-screen height; the sprite boils slightly 8 times a second.
 * Options: rot, flip, sq (squash), alpha, filter, pivot, boil:false, k (boil seed), clipBottom.
 */
export function spr(ctx, name, x, y, h, o = {}) {
  const s = S[name];
  if (!s) return;
  const scale = h / s.h;
  const tick = Math.floor(state.T * 8);
  const r = hash(tick * 13.1 + s.id * 7.7 + (o.k || 0) * 3.3);
  const rot = (o.rot || 0) + (o.boil === false ? 0 : (r - 0.5) * 0.014);
  const sq = o.sq || 0;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale((o.flip ? -1 : 1) * scale * (1 + sq), scale * (1 - sq));
  if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
  if (o.filter) ctx.filter = o.filter;
  const oy = o.pivot === 'center' ? -s.h / 2 : -s.h;
  if (o.clipBottom !== undefined) {
    ctx.beginPath();
    ctx.rect(-s.w / 2 - 4, -s.h * o.clipBottom - 2 + (o.pivot === 'center' ? s.h / 2 : 0), s.w + 8, s.h * o.clipBottom + 4);
    ctx.clip();
  }
  ctx.drawImage(s.c, -s.w / 2, oy, s.w, s.h);
  ctx.restore();
}
