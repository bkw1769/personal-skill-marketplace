#!/usr/bin/env node
// Cut transparent sprites out of hand-drawn character / prop sheets.
//   node cut-sprites.mjs <crops.json> --out <dir> [--only name,name] [--boxes] [--no-grow] [--update-crops] [--strict]
// Writes <dir>/<name>.png for every crop, <dir>/sprites.json, <dir>/_contact.png,
// and with --boxes <dir>/_boxes-<sheet>.png showing every crop rectangle on its sheet
// (red = rectangle as written, green = rectangle after automatic growth).
// A rectangle whose drawing runs into its edge is grown on that side (see cutSprite);
// --update-crops writes the grown rectangles back into crops.json; --strict exits 1 if a
// sprite is still cut after growing.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { decodePng, encodePng } from './png.mjs';
import { cutSprite, drawBoxes, contactSheet } from './extract.mjs';

export const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const OPTION_KEYS = new Set(['text', 'largest', 'tol', 'holeMin', 'pad', 'grow', 'growMax']);

/**
 * @typedef {{sheet: string, x: number, y: number, w: number, h: number, options: Object}} Crop
 */

/**
 * Normalise one crop entry. Accepts {sheet,x,y,w,h,options} or [sheet,x,y,w,h,options].
 * @param {string} name
 * @param {any} entry
 * @param {Record<string, string>} sheets
 * @returns {Crop}
 */
export function normalizeCrop(name, entry, sheets) {
  if (!NAME.test(name)) throw new Error(`crop name "${name}" must be kebab-case (it becomes the file name)`);
  const c = Array.isArray(entry) ? { sheet: entry[0], x: entry[1], y: entry[2], w: entry[3], h: entry[4], options: entry[5] } : { ...entry };
  if (!(c.sheet in sheets)) throw new Error(`crop "${name}": unknown sheet "${c.sheet}"`);
  for (const k of ['x', 'y', 'w', 'h']) if (!Number.isInteger(c[k]) || c[k] < 0) throw new Error(`crop "${name}": ${k} must be a non-negative integer`);
  if (c.w === 0 || c.h === 0) throw new Error(`crop "${name}": w and h must be positive`);
  c.options = c.options || {};
  for (const k of Object.keys(c.options)) if (!OPTION_KEYS.has(k)) throw new Error(`crop "${name}": unknown option "${k}"`);
  return /** @type {Crop} */ (c);
}

/**
 * Parse argv.
 * @param {string[]} argv
 * @returns {{cropsFile?: string, out?: string, only: string[], boxes: boolean, grow: boolean, updateCrops: boolean, strict: boolean}}
 */
export function parseArgs(argv) {
  const a = { only: /** @type {string[]} */ ([]), boxes: false, grow: true, updateCrops: false, strict: false, cropsFile: undefined, out: undefined };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') a.out = argv[++i];
    else if (argv[i] === '--only') a.only = argv[++i].split(',').filter(Boolean);
    else if (argv[i] === '--boxes') a.boxes = true;
    else if (argv[i] === '--no-grow') a.grow = false;
    else if (argv[i] === '--update-crops') a.updateCrops = true;
    else if (argv[i] === '--strict') a.strict = true;
    else a.cropsFile = argv[i];
  }
  return a;
}

/**
 * Run the cutter.
 * @param {string[]} argv
 * @param {{out: (s: string) => void, err: (s: string) => void}} io
 * @returns {number} exit code
 */
export function main(argv, io) {
  const args = parseArgs(argv);
  if (!args.cropsFile || !args.out) {
    io.err('Usage: node cut-sprites.mjs <crops.json> --out <dir> [--only name,name] [--boxes] [--no-grow] [--update-crops] [--strict]');
    return 1;
  }
  try {
    const spec = JSON.parse(fs.readFileSync(args.cropsFile, 'utf8'));
    const base = path.dirname(path.resolve(args.cropsFile));
    const sheets = spec.sheets || {};
    const entries = Object.entries(spec.crops || {}).map(([name, e]) => [name, normalizeCrop(name, e, sheets)]);
    const unknown = args.only.filter((n) => !entries.some(([name]) => name === n));
    if (unknown.length) throw new Error(`--only names not in crops: ${unknown.join(', ')}`);
    const chosen = args.only.length ? entries.filter(([name]) => args.only.includes(name)) : entries;
    /** @type {Record<string, import('./png.mjs').Image>} */
    const images = {};
    const load = (/** @type {string} */ key) => (images[key] ??= decodePng(fs.readFileSync(path.resolve(base, sheets[key]))));
    fs.mkdirSync(args.out, { recursive: true });
    const records = [];
    const sprites = [];
    const marks = [];
    /** @type {Map<string, {x: number, y: number, w: number, h: number}>} */
    const finalRect = new Map();
    let stillCut = 0;
    for (const [name, c] of /** @type {[string, Crop][]} */ (chosen)) {
      const { grow, growMax, ...opt } = c.options;
      const res = cutSprite(load(c.sheet), c, opt, { grow: args.grow && grow !== false, max: growMax });
      fs.writeFileSync(path.join(args.out, `${name}.png`), encodePng(res.image));
      sprites.push(res.image);
      const r = res.rect;
      const moved = r.x !== c.x || r.y !== c.y || r.w !== c.w || r.h !== c.h;
      if (moved) finalRect.set(name, r);
      const rec = { name, file: `${name}.png`, sheet: c.sheet, sheet_file: sheets[c.sheet], crop: r, offset: res.offset, width: res.image.width, height: res.image.height, options: c.options, empty: res.empty };
      if (moved) Object.assign(rec, { requested: { x: c.x, y: c.y, w: c.w, h: c.h }, grown: Object.fromEntries(Object.entries(res.grown).filter(([, v]) => v > 0)) });
      if (res.clipped.length) Object.assign(rec, { clipped: res.clipped, blocked_by: res.blockedBy });
      records.push(rec);
      marks.push(res.clipped.length ? [220, 30, 50] : moved ? [40, 160, 80] : null);
      if (res.empty) io.err(`warning: ${name} has no drawing left after paper removal (check the crop or lower "tol")`);
      if (res.clipped.length) {
        stillCut++;
        io.err(`warning: ${name} is still cut at ${res.clipped.map((s) => `${s} (${res.blockedBy[s] || 'growth off'})`).join(', ')}; widen the rectangle by hand or regenerate the sheet with more space`);
      } else if (moved) io.out(`grew ${name}: ${Object.entries(rec.grown).map(([k, v]) => `${k} +${v}px`).join(', ')}`);
    }
    fs.writeFileSync(path.join(args.out, '_contact.png'), encodePng(contactSheet(sprites, 200, 6, marks)));
    if (args.boxes) {
      for (const key of Object.keys(sheets)) {
        const mine = entries.filter(([, c]) => c.sheet === key);
        let img = drawBoxes(load(key), mine.map(([, c]) => c));
        img = drawBoxes(img, mine.filter(([n]) => finalRect.has(n)).map(([n]) => /** @type {any} */ (finalRect.get(n))), [40, 160, 80]);
        fs.writeFileSync(path.join(args.out, `_boxes-${key}.png`), encodePng(img));
      }
    }
    if (args.updateCrops && finalRect.size) {
      for (const [name, r] of finalRect) {
        const e = spec.crops[name];
        if (Array.isArray(e)) { e[1] = r.x; e[2] = r.y; e[3] = r.w; e[4] = r.h; } else Object.assign(e, r);
      }
      fs.writeFileSync(args.cropsFile, JSON.stringify(spec, null, 2) + '\n');
      io.out(`Updated ${finalRect.size} rectangle(s) in ${args.cropsFile}.`);
    }
    const manifest = { schema: 'sprites/1', crops_file: path.relative(path.resolve(args.out), path.resolve(args.cropsFile)), anchor: 'bottom-center', sprites: records };
    fs.writeFileSync(path.join(args.out, 'sprites.json'), JSON.stringify(manifest, null, 2) + '\n');
    io.out(`Cut ${records.length} sprite(s) into ${args.out} (contact sheet: _contact.png, order = sprites.json; green frame = grown, red = still cut).`);
    return args.strict && stillCut ? 1 : 0;
  } catch (e) {
    io.err(`error: ${/** @type {Error} */ (e).message}`);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2), { out: (s) => console.log(s), err: (s) => console.error(s) });
}
