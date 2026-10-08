#!/usr/bin/env node
// Find the separate pieces on an element-kit sheet (torn-paper elements laid on one flat
// backdrop colour) and write one crop rectangle per piece into crops.json, ready for
// cut-sprites.mjs. Pieces are named in reading order (rows top to bottom, left to right),
// which is the slot order of the element-kit prompt.
//   node find-pieces.mjs <sheet.png> --crops <crops.json> --key <sheet-key> [--names a,b,c]
//                        [--tol 48] [--gap 6] [--min-area 0.003] [--margin 14]
// Re-running for the same key replaces that sheet's crops and keeps the others.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { decodePng } from './png.mjs';
import { median } from './extract.mjs';
import { NAME } from './cut-sprites.mjs';

/**
 * Cutter options written for every kit piece: keep only the piece itself, treat the flat
 * chroma backdrop generously, and fade the torn rim over the whole backdrop-to-paper colour
 * range so the blend band is un-mixed instead of left as a pink fringe (measured on the
 * golden-axe kits: edge pixels with a magenta cast fell from about 94 % to under 1 %).
 */
export const KIT_OPTIONS = Object.freeze({ largest: true, tol: 48, soft: 220 });

/**
 * @typedef {{x: number, y: number, w: number, h: number, area: number}} Piece
 * @typedef {{tol?: number, gap?: number, minArea?: number, margin?: number, speck?: number}} FindOptions
 */

/**
 * Grow a binary mask by r pixels in every direction (square window): a row pass, then a column pass.
 * @param {Uint8Array} mask
 * @param {number} w
 * @param {number} h
 * @param {number} r
 * @returns {Uint8Array} a new mask
 */
export function dilate(mask, w, h, r) {
  const rows = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let count = 0;
    for (let x = -r; x < w; x++) {
      if (x + r < w) count += mask[y * w + x + r];
      if (x - r - 1 >= 0) count -= mask[y * w + x - r - 1];
      if (x >= 0) rows[y * w + x] = count > 0 ? 1 : 0;
    }
  }
  const out = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    let count = 0;
    for (let y = -r; y < h; y++) {
      if (y + r < h) count += rows[(y + r) * w + x];
      if (y - r - 1 >= 0) count -= rows[(y - r - 1) * w + x];
      if (y >= 0) out[y * w + x] = count > 0 ? 1 : 0;
    }
  }
  return out;
}

/**
 * Sort boxes in reading order: a box starts a new row when its vertical centre lies below
 * the bottom of the current row's first box; each row runs left to right.
 * @param {Piece[]} boxes
 * @returns {Piece[]}
 */
export function readingOrder(boxes) {
  const byY = [...boxes].sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2));
  /** @type {Piece[][]} */
  const rows = [];
  for (const b of byY) {
    const row = rows[rows.length - 1];
    if (row && b.y + b.h / 2 <= row[0].y + row[0].h) row.push(b);
    else rows.push([b]);
  }
  return rows.flatMap((r) => r.sort((a, b) => a.x - b.x));
}

/**
 * Find the pieces on a sheet. The backdrop colour is the median of the outermost pixel
 * frame; every pixel farther than `tol` from it is part of a piece. Components smaller
 * than `speck` px are noise; pixels within `gap` px of each other belong to one piece
 * (loose paper fibres, a cloud of sparkles), measured on the pixels themselves, not on
 * bounding boxes, so irregular neighbours whose boxes overlap stay apart; pieces under
 * `minArea` of the sheet are dropped.
 * Rectangles get `margin` px of backdrop on every side, clipped to the sheet.
 * @param {import('./png.mjs').Image} img
 * @param {FindOptions} [opt]
 * @returns {{backdrop: number[], pieces: Piece[]}}
 */
export function findPieces(img, opt = {}) {
  const { tol = 48, gap = 6, minArea = 0.003, margin = 14, speck = 20 } = opt;
  const { width: w, height: h, data: d } = img;
  const rs = [], gs = [], bs = [];
  const sample = (/** @type {number} */ i) => { rs.push(d[i * 4]); gs.push(d[i * 4 + 1]); bs.push(d[i * 4 + 2]); };
  for (let x = 0; x < w; x++) { sample(x); sample((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { sample(y * w); sample(y * w + w - 1); }
  const backdrop = [median(rs), median(gs), median(bs)];
  const N = w * h;
  const fg = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const r = d[i * 4] - backdrop[0], g = d[i * 4 + 1] - backdrop[1], b = d[i * 4 + 2] - backdrop[2];
    fg[i] = r * r + g * g + b * b > tol * tol ? 1 : 0;
  }
  const near = dilate(fg, w, h, Math.round(gap / 2));
  const seen = new Uint8Array(N);
  const q = new Int32Array(N);
  /** @type {Piece[]} */
  const comps = [];
  for (let s = 0; s < N; s++) {
    if (!near[s] || seen[s]) continue;
    let qh = 0, qt = 0, area = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
    seen[s] = 1; q[qt++] = s;
    while (qh < qt) {
      const i = q[qh++], x = i % w, y = (i / w) | 0;
      if (fg[i]) {
        area++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
      for (const n of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
        if (n >= 0 && near[n] && !seen[n]) { seen[n] = 1; q[qt++] = n; }
      }
    }
    if (area >= speck) comps.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, area });
  }
  const keep = comps.filter((b) => b.area >= minArea * N);
  const pieces = readingOrder(keep).map((b) => {
    const x = Math.max(0, b.x - margin), y = Math.max(0, b.y - margin);
    return { x, y, w: Math.min(w, b.x + b.w + margin) - x, h: Math.min(h, b.y + b.h + margin) - y, area: b.area };
  });
  return { backdrop, pieces };
}

/**
 * Parse argv.
 * @param {string[]} argv
 * @returns {{sheet?: string, crops?: string, key?: string, names: string[], opt: FindOptions}}
 */
export function parseArgs(argv) {
  /** @type {{sheet?: string, crops?: string, key?: string, names: string[], opt: FindOptions}} */
  const a = { names: [], opt: {} };
  const num = (/** @type {string} */ flag, /** @type {string} */ v) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) throw new Error(`${flag} needs a non-negative number, got "${v}"`);
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    const f = argv[i];
    if (f === '--crops') a.crops = argv[++i];
    else if (f === '--key') a.key = argv[++i];
    else if (f === '--names') a.names = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (f === '--tol') a.opt.tol = num(f, argv[++i]);
    else if (f === '--gap') a.opt.gap = num(f, argv[++i]);
    else if (f === '--min-area') a.opt.minArea = num(f, argv[++i]);
    else if (f === '--margin') a.opt.margin = num(f, argv[++i]);
    else a.sheet = f;
  }
  return a;
}

/**
 * Run the finder.
 * @param {string[]} argv
 * @param {{out: (s: string) => void, err: (s: string) => void}} io
 * @returns {number} exit code
 */
export function main(argv, io) {
  try {
    const args = parseArgs(argv);
    if (!args.sheet || !args.crops || !args.key) {
      io.err('Usage: node find-pieces.mjs <sheet.png> --crops <crops.json> --key <sheet-key> [--names a,b,c] [--tol 48] [--gap 6] [--min-area 0.003] [--margin 14]');
      return 1;
    }
    if (!NAME.test(args.key)) throw new Error(`--key "${args.key}" must be kebab-case`);
    const { backdrop, pieces } = findPieces(decodePng(fs.readFileSync(args.sheet)), args.opt);
    const list = pieces.map((p, i) => `  ${i + 1}. x=${p.x} y=${p.y} w=${p.w} h=${p.h}`).join('\n');
    if (args.names.length && args.names.length !== pieces.length) {
      throw new Error(`found ${pieces.length} piece(s) but ${args.names.length} name(s); check the sheet for touching or missing pieces, or tune --gap / --min-area:\n${list}`);
    }
    const names = args.names.length ? args.names : pieces.map((_, i) => `${args.key}-${i + 1}`);
    for (const n of names) if (!NAME.test(n)) throw new Error(`name "${n}" must be kebab-case (it becomes the file name)`);
    const spec = fs.existsSync(args.crops)
      ? JSON.parse(fs.readFileSync(args.crops, 'utf8'))
      : { schema: 'sprite-crops/1', note: 'element-kit crops written by find-pieces.mjs', sheets: {}, crops: {} };
    spec.sheets ||= {};
    spec.crops ||= {};
    const sheetOf = (/** @type {any} */ e) => (Array.isArray(e) ? e[0] : e.sheet);
    const clash = names.filter((n) => n in spec.crops && sheetOf(spec.crops[n]) !== args.key);
    if (clash.length) throw new Error(`name(s) already used by another sheet in ${args.crops}: ${clash.join(', ')}`);
    spec.sheets[args.key] = path.relative(path.dirname(path.resolve(args.crops)), path.resolve(args.sheet));
    spec.crops = Object.fromEntries(Object.entries(spec.crops).filter(([, e]) => sheetOf(e) !== args.key));
    pieces.forEach((p, i) => { spec.crops[names[i]] = { sheet: args.key, x: p.x, y: p.y, w: p.w, h: p.h, options: { ...KIT_OPTIONS } }; });
    fs.mkdirSync(path.dirname(path.resolve(args.crops)), { recursive: true });
    fs.writeFileSync(args.crops, JSON.stringify(spec, null, 2) + '\n');
    io.out(`Backdrop rgb(${backdrop.join(', ')}); ${pieces.length} piece(s) on "${args.key}" written to ${args.crops}:\n${pieces.map((p, i) => `  ${names[i]}: x=${p.x} y=${p.y} w=${p.w} h=${p.h}`).join('\n')}`);
    if (!args.names.length) io.err('warning: no --names given; pieces are numbered. Pass the slot names from the element-kit prompt in order.');
    return 0;
  } catch (e) {
    io.err(`error: ${/** @type {Error} */ (e).message}`);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2), { out: (s) => console.log(s), err: (s) => console.error(s) });
}
