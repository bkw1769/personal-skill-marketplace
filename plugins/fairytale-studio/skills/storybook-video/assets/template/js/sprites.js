// Loads transparent sprites listed in a sprites.json (made by the sheet-to-sprites skill)
// and draws them with the hand-drawn "boil" wobble.
import { hash, state, makeCanvas } from './util.js';

/** name -> { c: HTMLImageElement, w, h, id, name } */
export const S = {};
/** name -> { c: HTMLImageElement, w, h } full-bleed background plates (far distance, never cut). */
export const P = {};

function loadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('image load failed: ' + src));
    im.src = src;
  });
}

/**
 * Load every sprite in one manifest or a list of manifests (for example the character sprites and
 * a background element kit). `urls` are sprites.json URLs; each manifest's PNGs sit next to it.
 * A name found in two manifests keeps the later one and is reported in the console.
 */
export async function loadSprites(urls) {
  for (const url of Array.isArray(urls) ? urls : [urls]) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`cannot load ${url} (${res.status})`);
    const manifest = await res.json();
    const base = new URL('.', new URL(url, location.href)).href;
    await Promise.all(manifest.sprites.filter((s) => !s.empty).map(async (s) => {
      const c = await loadImage(base + s.file);
      if (S[s.name]) console.warn(`sprite "${s.name}" is in more than one manifest; using ${url}`);
      S[s.name] = { c, w: c.naturalWidth, h: c.naturalHeight, id: nameSeed(s.name) & 0xffff, name: s.name };
    }));
  }
  return S;
}

/**
 * Scene light for pasted pieces and character sprites. Plates are painted per time of day and are never
 * tinted; without this, daylight figures on a sunset or night plate look stuck on. Multiply tint: `amount`
 * 0..1 blends the colour from white (no change) to full strength.
 */
export const TINTS = {
  sunset: { color: '#f0a060', amount: 0.32 },
  night: { color: '#4f5f9e', amount: 0.5 },
  mist: { color: '#d8d2ea', amount: 0.22 },
};
/** @type {string | {color: string, amount: number} | null} */
let sceneTint = null;

/**
 * Set the light every spr()/paste() uses until changed: a TINTS name, {color, amount}, or null for daylight.
 * stage.js resets it before each scene from the storyboard scene's `light` field (default daylight).
 * @param {string | {color: string, amount: number} | null | undefined} t
 * @returns {void}
 */
export function setTint(t) {
  sceneTint = t ?? null;
}

const TINTED = new WeakMap();

/**
 * The image tinted for a light (cached per image and light); the image itself for daylight.
 * Usable on any image or canvas, e.g. pieces a story draws without paste().
 * @param {HTMLImageElement | HTMLCanvasElement} im
 * @param {string | {color: string, amount: number} | null | undefined} t
 * @returns {HTMLImageElement | HTMLCanvasElement}
 */
export function tinted(im, t) {
  const v = typeof t === 'string' ? TINTS[t] : t;
  if (typeof t === 'string' && !v) console.warn(`unknown tint "${t}" (use ${Object.keys(TINTS).join(', ')})`);
  if (!v || !(v.amount > 0)) return im;
  const key = v.color + '|' + v.amount;
  let byLight = TINTED.get(im);
  if (!byLight) TINTED.set(im, (byLight = new Map()));
  let c = byLight.get(key);
  if (!c) {
    const w = im.naturalWidth || im.width, h = im.naturalHeight || im.height;
    c = makeCanvas(w, h);
    const g = c.getContext('2d');
    const n = parseInt(v.color.slice(1), 16);
    const mix = [n >> 16, (n >> 8) & 255, n & 255].map((ch) => Math.round(255 + (ch - 255) * Math.min(1, v.amount)));
    g.drawImage(im, 0, 0);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = `rgb(${mix.join(',')})`;
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(im, 0, 0);
    byLight.set(key, c);
  }
  return c;
}

/**
 * Draw a sprite anchored at bottom-centre (or centre with pivot:'center').
 * h is the on-screen height; the sprite boils slightly 8 times a second.
 * Options: rot, flip, sq (squash), alpha, filter, pivot, boil:false, k (boil seed), clipBottom,
 * tint (a TINTS name, {color, amount}, or null for daylight; default: the scene light from setTint).
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
  ctx.drawImage(tinted(s.c, o.tint !== undefined ? o.tint : sceneTint), -s.w / 2, oy, s.w, s.h);
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
 * rocking about the base, for trees and reeds), alpha, flip, pivot, tint (as in spr). No boil: paper pieces stay still.
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
  ctx.drawImage(tinted(s.c, o.tint !== undefined ? o.tint : sceneTint), -s.w / 2, o.pivot === 'center' ? -s.h / 2 : -s.h, s.w, s.h);
  ctx.restore();
}

/**
 * Load background plates: `map` is { name: url } (relative to the page), e.g.
 * { 'plate-pond-day': '../assets/plates/plate-pond-day.png' }.
 * @param {Record<string, string>} map
 * @returns {Promise<Record<string, {c: HTMLImageElement, w: number, h: number}>>}
 */
export async function loadPlates(map) {
  await Promise.all(Object.entries(map).map(async ([name, url]) => {
    const c = await loadImage(url);
    P[name] = { c, w: c.naturalWidth, h: c.naturalHeight };
  }));
  return P;
}

/**
 * Draw a background plate (the painted far distance) so it covers the whole canvas.
 * Options: camX with parallax (default 0.1; the plate shifts by -camX * parallax, clamped so no edge shows),
 * zoom (overscan, default 1.06), dy (vertical offset in px), alpha, filter.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} name
 * @param {{camX?: number, parallax?: number, zoom?: number, dy?: number, alpha?: number, filter?: string}} [o]
 * @returns {void}
 */
export function plate(ctx, name, o = {}) {
  const p = P[name];
  if (!p) return;
  const cw = ctx.canvas.width, ch = ctx.canvas.height;
  const k = Math.max(cw / p.w, ch / p.h) * (o.zoom ?? 1.06);
  const dw = p.w * k, dh = p.h * k;
  const maxX = (dw - cw) / 2, maxY = (dh - ch) / 2;
  const dx = Math.max(-maxX, Math.min(maxX, -(o.camX || 0) * (o.parallax ?? 0.1)));
  const dy = Math.max(-maxY, Math.min(maxY, o.dy || 0));
  ctx.save();
  if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
  if (o.filter) ctx.filter = o.filter;
  ctx.drawImage(p.c, (cw - dw) / 2 + dx, (ch - dh) / 2 + dy, dw, dh);
  ctx.restore();
}
