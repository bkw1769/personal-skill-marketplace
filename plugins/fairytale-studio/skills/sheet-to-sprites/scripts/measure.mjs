#!/usr/bin/env node
// Measure cut sprites so scenes can be laid out from numbers instead of guesses.
//   node measure.mjs opening <sprite.png> [--at 0.7]           empty gateway / hole inside a piece
//   node measure.mjs color <sprite.png> --rgb '#c9d4dc' [--tol 40] [--min-x 0.5] [--max-chroma 30]
//                                                              where a colour sits (axe head, notch)
//   node measure.mjs spill <sprites dir or png...> [--strong]  backdrop-magenta pixels left after cutting
// Results are fractions of the sprite (x from the left, y from the top) plus pixels; --json for scripts.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { decodePng } from './png.mjs';
import { parseHex } from './rim.mjs';

/**
 * Empty region inside a piece (an open gateway, a window): scanned from the middle of the sprite
 * at height `at` (fraction from the top) outwards to the first opaque pixels, then up and down
 * from the middle of that gap.
 * @param {import('./png.mjs').Image} img
 * @param {number} [at]
 * @returns {{x0: number, x1: number, y0: number, y1: number, px: number[]} | null} fractions; px = [x0, x1, y0, y1]
 */
export function opening(img, at = 0.7) {
  const { width: w, height: h, data: d } = img;
  const solid = (x, y) => d[(y * w + x) * 4 + 3] > 128;
  const y = Math.min(h - 1, Math.max(0, Math.round(h * at)));
  let mid = w >> 1;
  if (solid(mid, y)) {
    // The middle is opaque: take the widest transparent run on this row that has opaque pixels on both sides.
    let best = null;
    for (let x = 0, s = -1; x <= w; x++) {
      const empty = x < w && !solid(x, y);
      if (empty && s < 0) s = x;
      if (!empty && s >= 0) { if (s > 0 && x < w && (!best || x - s > best[1] - best[0])) best = [s, x]; s = -1; }
    }
    if (!best) return null;
    mid = (best[0] + best[1]) >> 1;
  }
  let x0 = mid, x1 = mid;
  while (x0 > 0 && !solid(x0 - 1, y)) x0--;
  while (x1 < w - 1 && !solid(x1 + 1, y)) x1++;
  if (x0 === 0 || x1 === w - 1) return null;
  const cx = (x0 + x1) >> 1;
  let y0 = y, y1 = y;
  while (y0 > 0 && !solid(cx, y0 - 1)) y0--;
  while (y1 < h - 1 && !solid(cx, y1 + 1)) y1++;
  const f = (v, n) => Math.round((v / n) * 1000) / 1000;
  return { x0: f(x0, w), x1: f(x1 + 1, w), y0: f(y0, h), y1: f(y1 + 1, h), px: [x0, x1 + 1, y0, y1 + 1] };
}

/**
 * Where a colour sits in a sprite: median position of opaque pixels within `tol` of `rgb`
 * (optionally only right of minX and with low chroma, e.g. a grey axe head among other greys).
 * @param {import('./png.mjs').Image} img
 * @param {number[]} rgb
 * @param {{tol?: number, minX?: number, maxChroma?: number}} [o]
 * @returns {{x: number, y: number, count: number} | null} x, y as fractions (y from the top)
 */
export function colorAt(img, rgb, o = {}) {
  const { width: w, height: h, data: d } = img;
  const tol = o.tol ?? 40, minX = Math.round((o.minX ?? 0) * w), maxChroma = o.maxChroma ?? 255;
  const xs = [], ys = [];
  for (let y = 0; y < h; y++) {
    for (let x = minX; x < w; x++) {
      const j = (y * w + x) * 4;
      if (d[j + 3] < 200) continue;
      const r = d[j], g = d[j + 1], b = d[j + 2];
      if (Math.max(r, g, b) - Math.min(r, g, b) > maxChroma) continue;
      if (Math.hypot(r - rgb[0], g - rgb[1], b - rgb[2]) <= tol) { xs.push(x); ys.push(y); }
    }
  }
  if (!xs.length) return null;
  const med = (a) => a.sort((p, q) => p - q)[a.length >> 1];
  return { x: Math.round((med(xs) / w) * 1000) / 1000, y: Math.round((med(ys) / h) * 1000) / 1000, count: xs.length };
}

/**
 * Visible pixels with a magenta cast (red and blue well above green): what is left of the kit
 * backdrop after cutting. Strong = clearly backdrop; plain ones include pink artwork (a skirt, azaleas).
 * @param {import('./png.mjs').Image} img
 * @returns {{tinted: number, strong: number, visible: number}}
 */
export function spill(img) {
  const { width: w, height: h, data: d } = img;
  let tinted = 0, strong = 0, visible = 0;
  for (let i = 0; i < w * h; i++) {
    if (d[i * 4 + 3] < 40) continue;
    visible++;
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
    if (r - g > 50 && b - g > 50) { tinted++; if (r - g > 120 && b - g > 120) strong++; }
  }
  return { tinted, strong, visible };
}

/**
 * Parse argv.
 * @param {string[]} argv
 * @returns {{cmd?: string, files: string[], at?: number, rgb?: string, tol?: number, minX?: number, maxChroma?: number, strong: boolean, json: boolean}}
 */
export function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  /** @type {{cmd?: string, files: string[], at?: number, rgb?: string, tol?: number, minX?: number, maxChroma?: number, strong: boolean, json: boolean}} */
  const a = { cmd, files: [], strong: false, json: false };
  const num = (/** @type {string} */ f, /** @type {string} */ v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error(`${f} needs a number, got "${v}"`);
    return n;
  };
  for (let i = 0; i < rest.length; i++) {
    const f = rest[i];
    if (f === '--at') a.at = num(f, rest[++i]);
    else if (f === '--rgb') a.rgb = rest[++i];
    else if (f === '--tol') a.tol = num(f, rest[++i]);
    else if (f === '--min-x') a.minX = num(f, rest[++i]);
    else if (f === '--max-chroma') a.maxChroma = num(f, rest[++i]);
    else if (f === '--strong') a.strong = true;
    else if (f === '--json') a.json = true;
    else a.files.push(f);
  }
  return a;
}

const USAGE = 'Usage: node measure.mjs opening <sprite.png> [--at 0.7] | color <sprite.png> --rgb #rrggbb [--tol 40] [--min-x 0..1] [--max-chroma n] | spill <dir or png...> [--strong]  [--json]';

/**
 * CLI.
 * @param {string[]} argv
 * @param {{out: (s: string) => void, err: (s: string) => void}} io
 * @returns {number}
 */
export function main(argv, io) {
  try {
    const a = parseArgs(argv);
    if (!['opening', 'color', 'spill'].includes(/** @type {string} */ (a.cmd)) || !a.files.length) { io.err(USAGE); return 1; }
    const load = (/** @type {string} */ f) => decodePng(fs.readFileSync(f));
    if (a.cmd === 'opening') {
      const r = opening(load(a.files[0]), a.at);
      if (!r) { io.err(`no enclosed empty region found in ${a.files[0]} at height ${a.at ?? 0.7}`); return 1; }
      io.out(a.json ? JSON.stringify(r) : `opening [${r.x0}, ${r.x1}, ${r.y0}, ${r.y1}] (fractions x0 x1 y0 y1; px ${r.px.join(' ')})`);
      return 0;
    }
    if (a.cmd === 'color') {
      if (!a.rgb) throw new Error('color needs --rgb #rrggbb');
      const r = colorAt(load(a.files[0]), parseHex(a.rgb), { tol: a.tol, minX: a.minX, maxChroma: a.maxChroma });
      if (!r) { io.err(`no pixels near ${a.rgb} in ${a.files[0]}`); return 1; }
      io.out(a.json ? JSON.stringify(r) : `${a.rgb} at x ${r.x}, y ${r.y} (fractions from the top left; ${r.count} px)`);
      return 0;
    }
    const files = a.files.flatMap((f) => (fs.statSync(f).isDirectory()
      ? fs.readdirSync(f).filter((n) => n.endsWith('.png') && !n.startsWith('_')).sort().map((n) => path.join(f, n))
      : [f]));
    const rows = files.map((f) => ({ file: path.basename(f), ...spill(load(f)) }))
      .filter((r) => (a.strong ? r.strong : r.tinted) > 0)
      .sort((p, q) => q.strong - p.strong || q.tinted - p.tinted);
    if (a.json) io.out(JSON.stringify(rows));
    else {
      for (const r of rows) io.out(`${r.file}\ttinted ${r.tinted}\tstrong ${r.strong}\t${((100 * r.tinted) / r.visible).toFixed(2)}%`);
      io.out(`${rows.length} of ${files.length} sprite(s) with ${a.strong ? 'strong ' : ''}magenta pixels`);
    }
    return rows.some((r) => r.strong > 0) ? 2 : 0;
  } catch (e) {
    io.err(`error: ${/** @type {Error} */ (e).message}`);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2), { out: (s) => console.log(s), err: (s) => console.error(s) });
}
