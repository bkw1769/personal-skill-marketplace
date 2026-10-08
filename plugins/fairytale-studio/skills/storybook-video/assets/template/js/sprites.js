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

/** Stable integer seed from a sprite name (load order is not stable, names are). */
function nameSeed(name) {
  let h = 7;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return h;
}

/**
 * Paste a torn-paper collage piece (element-kit sprite) as if glued on the drawing paper.
 * Anchored bottom-centre (or centre with pivot:'center'); h is the on-screen height.
 * Options: tilt (degrees, default a fixed -1.5..+1.5 from the name), shadow (opacity, default 0.3, 0 = off),
 * parallax (default 1) with camX (camera x; the piece moves by -camX * parallax), sway (radians of slow
 * rocking about the base, for trees and reeds), alpha, flip, pivot. No boil: paper pieces stay still.
 */
export function paste(ctx, name, x, y, h, o = {}) {
  const s = S[name];
  if (!s) return;
  const seed = nameSeed(name);
  const tilt = (o.tilt !== undefined ? o.tilt : (hash(seed * 0.0137) - 0.5) * 3) * Math.PI / 180;
  const sway = o.sway ? Math.sin(state.T * 1.3 + (seed % 7)) * o.sway : 0;
  const shadow = o.shadow ?? 0.3;
  const scale = h / s.h;
  ctx.save();
  ctx.translate(x - (o.camX || 0) * (o.parallax ?? 1), y);
  ctx.rotate(tilt + sway);
  if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
  if (shadow > 0) {
    ctx.shadowColor = `rgba(70, 55, 40, ${shadow})`;
    ctx.shadowBlur = Math.max(2, h * 0.012);
    ctx.shadowOffsetX = h * 0.006;
    ctx.shadowOffsetY = h * 0.008;
  }
  ctx.scale((o.flip ? -1 : 1) * scale, scale);
  ctx.drawImage(s.c, -s.w / 2, o.pivot === 'center' ? -s.h / 2 : -s.h, s.w, s.h);
  ctx.restore();
}
