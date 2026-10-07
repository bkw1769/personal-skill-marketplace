#!/usr/bin/env node
// Cut transparent sprites out of hand-drawn character / prop sheets.
//   node cut-sprites.mjs <crops.json> --out <dir> [--only name,name] [--boxes]
// Writes <dir>/<name>.png for every crop, <dir>/sprites.json, <dir>/_contact.png,
// and with --boxes <dir>/_boxes-<sheet>.png showing every crop rectangle on its sheet.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { decodePng, encodePng } from './png.mjs';
import { crop, extractSprite, drawBoxes, contactSheet } from './extract.mjs';

export const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const OPTION_KEYS = new Set(['text', 'largest', 'tol', 'holeMin', 'pad']);

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
 * @returns {{cropsFile?: string, out?: string, only: string[], boxes: boolean}}
 */
export function parseArgs(argv) {
  const a = { only: /** @type {string[]} */ ([]), boxes: false, cropsFile: undefined, out: undefined };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') a.out = argv[++i];
    else if (argv[i] === '--only') a.only = argv[++i].split(',').filter(Boolean);
    else if (argv[i] === '--boxes') a.boxes = true;
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
    io.err('Usage: node cut-sprites.mjs <crops.json> --out <dir> [--only name,name] [--boxes]');
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
    for (const [name, c] of /** @type {[string, Crop][]} */ (chosen)) {
      const res = extractSprite(crop(load(c.sheet), c), c.options);
      fs.writeFileSync(path.join(args.out, `${name}.png`), encodePng(res.image));
      sprites.push(res.image);
      records.push({ name, file: `${name}.png`, sheet: c.sheet, sheet_file: sheets[c.sheet], crop: { x: c.x, y: c.y, w: c.w, h: c.h }, offset: res.offset, width: res.image.width, height: res.image.height, options: c.options, empty: res.empty });
      if (res.empty) io.err(`warning: ${name} has no drawing left after paper removal (check the crop or lower "tol")`);
    }
    fs.writeFileSync(path.join(args.out, '_contact.png'), encodePng(contactSheet(sprites)));
    if (args.boxes) {
      for (const key of Object.keys(sheets)) {
        const boxes = entries.filter(([, c]) => c.sheet === key).map(([, c]) => c);
        fs.writeFileSync(path.join(args.out, `_boxes-${key}.png`), encodePng(drawBoxes(load(key), boxes)));
      }
    }
    const manifest = { schema: 'sprites/1', crops_file: path.relative(path.resolve(args.out), path.resolve(args.cropsFile)), anchor: 'bottom-center', sprites: records };
    fs.writeFileSync(path.join(args.out, 'sprites.json'), JSON.stringify(manifest, null, 2) + '\n');
    io.out(`Cut ${records.length} sprite(s) into ${args.out} (contact sheet: _contact.png, order = sprites.json).`);
    return 0;
  } catch (e) {
    io.err(`error: ${/** @type {Error} */ (e).message}`);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2), { out: (s) => console.log(s), err: (s) => console.error(s) });
}
