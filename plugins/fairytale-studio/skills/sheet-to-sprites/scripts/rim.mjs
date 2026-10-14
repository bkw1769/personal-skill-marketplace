#!/usr/bin/env node
// Measure and match the paper-margin colour of cut-out sprites, so pieces and characters
// cut from different sheets read as one paper in a scene.
//   node rim.mjs <dir|sprites.json> [...more] --target '#f4efe2' [--check] [--tol 8] [--only a,b]
// Without --check every sprite whose rim differs from the target is recoloured in place and
// sprites.json records { rim: { target, before } }. With --check nothing is written and the
// exit code is 1 when a rim is off by more than --tol (largest channel difference).
// The rim is found by walking inward from the transparent outside through pale, low-colour
// "paper" pixels; the closed pen outline stops the walk, so white clothing stays untouched.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { decodePng, encodePng } from './png.mjs';
import { median } from './extract.mjs';

/**
 * @typedef {import('./png.mjs').Image} Image
 * @typedef {{chroma?: number, light?: number, depth?: number}} RimOptions
 */

/**
 * Parse '#rrggbb' (or 'rrggbb').
 * @param {string} hex
 * @returns {number[]} [r, g, b]
 */
export function parseHex(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex));
  if (!m) throw new Error(`colour "${hex}" must look like #f4efe2`);
  const n = parseInt(m[1], 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

/**
 * Format [r, g, b] as '#rrggbb'.
 * @param {number[]} rgb
 * @returns {string}
 */
export function toHex(rgb) {
  return '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

/**
 * Find the paper margin: pixels reachable from the transparent outside through pale, low-chroma pixels,
 * at most `depth` steps in. Defaults: chroma (max-min channel) <= 40, darkest channel >= 180,
 * depth = 8 % of the shorter side (at least 4 px).
 * @param {Image} img
 * @param {RimOptions} [opt]
 * @returns {Uint8Array} 1 = rim pixel
 */
export function findRim(img, opt = {}) {
  const { width: w, height: h, data: d } = img;
  const chroma = opt.chroma ?? 40, light = opt.light ?? 180;
  const depth = opt.depth ?? Math.max(4, Math.round(Math.min(w, h) * 0.08));
  const paper = (/** @type {number} */ i) => {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
    return d[i * 4 + 3] > 0 && Math.max(r, g, b) - Math.min(r, g, b) <= chroma && Math.min(r, g, b) >= light;
  };
  const rim = new Uint8Array(w * h);
  const dist = new Int32Array(w * h).fill(-1);
  /** @type {number[]} */
  let queue = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!paper(i)) continue;
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1
        || d[(i - 1) * 4 + 3] === 0 || d[(i + 1) * 4 + 3] === 0 || d[(i - w) * 4 + 3] === 0 || d[(i + w) * 4 + 3] === 0;
      if (edge) { rim[i] = 1; dist[i] = 0; queue.push(i); }
    }
  }
  for (let step = 1; step <= depth && queue.length; step++) {
    /** @type {number[]} */
    const next = [];
    for (const i of queue) {
      const x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (j < 0 || j >= w * h || dist[j] !== -1 || !paper(j)) continue;
        dist[j] = step; rim[j] = 1; next.push(j);
      }
    }
    queue = next;
  }
  return rim;
}

/**
 * Median colour of the fully opaque rim pixels (falls back to all rim pixels); null when there is no rim.
 * @param {Image} img
 * @param {Uint8Array} rim
 * @returns {number[] | null}
 */
export function rimTone(img, rim) {
  const pick = (/** @type {boolean} */ solidOnly) => {
    const rs = [], gs = [], bs = [];
    for (let i = 0; i < rim.length; i++) {
      if (!rim[i] || (solidOnly && img.data[i * 4 + 3] < 255)) continue;
      rs.push(img.data[i * 4]); gs.push(img.data[i * 4 + 1]); bs.push(img.data[i * 4 + 2]);
    }
    return rs.length ? [median(rs), median(gs), median(bs)] : null;
  };
  return pick(true) ?? pick(false);
}

/**
 * Recolour the rim so its median becomes `target`, scaling each channel so paper grain and fibres survive.
 * @param {Image} img
 * @param {number[]} target [r, g, b]
 * @param {RimOptions} [opt]
 * @returns {{image: Image, before: number[] | null, pixels: number, off: number}} off = largest channel difference before
 */
export function matchRim(img, target, opt = {}) {
  const rim = findRim(img, opt);
  const before = rimTone(img, rim);
  if (!before) return { image: img, before, pixels: 0, off: 0 };
  const off = Math.max(...before.map((v, c) => Math.abs(v - target[c])));
  const data = Uint8Array.from(img.data);
  let pixels = 0;
  const k = before.map((v, c) => target[c] / Math.max(1, v));
  for (let i = 0; i < rim.length; i++) {
    if (!rim[i]) continue;
    pixels++;
    for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.min(255, Math.round(data[i * 4 + c] * k[c]));
  }
  return { image: { width: img.width, height: img.height, data }, before, pixels, off };
}

/**
 * Parse argv.
 * @param {string[]} argv
 * @returns {{inputs: string[], target?: string, check: boolean, tol: number, only: string[]}}
 */
export function parseArgs(argv) {
  const a = { inputs: /** @type {string[]} */ ([]), target: /** @type {string | undefined} */ (undefined), check: false, tol: 8, only: /** @type {string[]} */ ([]) };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--target') a.target = argv[++i];
    else if (argv[i] === '--check') a.check = true;
    else if (argv[i] === '--tol') a.tol = Number(argv[++i]);
    else if (argv[i] === '--only') a.only = argv[++i].split(',').filter(Boolean);
    else a.inputs.push(argv[i]);
  }
  return a;
}

/**
 * Run the rim matcher.
 * @param {string[]} argv
 * @param {{out: (s: string) => void, err: (s: string) => void}} io
 * @returns {number} exit code
 */
export function main(argv, io) {
  const args = parseArgs(argv);
  if (!args.inputs.length || !args.target) {
    io.err("Usage: node rim.mjs <dir|sprites.json> [...] --target '#f4efe2' [--check] [--tol 8] [--only a,b]");
    return 1;
  }
  try {
    const target = parseHex(args.target);
    if (!Number.isFinite(args.tol) || args.tol < 0) throw new Error('--tol must be a non-negative number');
    let bad = 0, fixed = 0, total = 0;
    for (const input of args.inputs) {
      const file = input.endsWith('.json') ? input : path.join(input, 'sprites.json');
      const dir = path.dirname(file);
      const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (manifest.schema !== 'sprites/1') throw new Error(`${file}: schema must be "sprites/1" (made by cut-sprites.mjs)`);
      for (const rec of manifest.sprites) {
        if (rec.empty || (args.only.length && !args.only.includes(rec.name))) continue;
        total++;
        const png = path.join(dir, rec.file);
        const res = matchRim(decodePng(fs.readFileSync(png)), target);
        if (!res.before) { io.err(`warning: ${rec.name}: no paper rim found`); continue; }
        const line = `${rec.name}: rim ${toHex(res.before)} (off ${res.off})`;
        if (res.off <= args.tol) { io.out(`${line} ok`); continue; }
        if (args.check) { bad++; io.err(`${line} > tol ${args.tol}`); continue; }
        fs.writeFileSync(png, encodePng(res.image));
        rec.rim = { target: toHex(target), before: toHex(res.before) };
        fixed++;
        io.out(`${line} -> ${toHex(target)} (${res.pixels} px)`);
      }
      if (!args.check) fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
    }
    io.out(args.check ? `${total - bad} of ${total} rim(s) within ${args.tol} of ${toHex(target)}.` : `Recoloured ${fixed} of ${total} rim(s) to ${toHex(target)}.`);
    return bad ? 1 : 0;
  } catch (e) {
    io.err(`error: ${/** @type {Error} */ (e).message}`);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2), { out: (s) => console.log(s), err: (s) => console.error(s) });
}
