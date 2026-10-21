#!/usr/bin/env node
// Check a Shorts thumbnail spec (thumbnail.json) before it is rendered: required parts, text length,
// positions inside the safe area, highlight count, and write an empty spec for a new episode.
// Rendering happens in the browser page bundled in assets/renderer/. Node built-ins only.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const SCHEMA = 'shorts-thumbnail/1';
export const HIGHLIGHT_KINDS = ['outline', 'arrow', 'xmark', 'ring', 'bar'];
export const DEFAULT_SIZE = { width: 1080, height: 1920 };
// Fractions of the frame. The bottom band is covered by the title and channel row in the Shorts feed,
// the right edge by buttons on the player; keep text and highlights out of both.
export const SAFE = { left: 0.04, right: 0.96, top: 0.04, bottom: 0.8 };
export const HEADLINE = { warnChars: 8, maxChars: 14, minY: 0.06, maxY: 0.32 };
export const CAPTION = { warnChars: 12, maxChars: 18, minY: 0.4, maxY: 0.75 };
export const MAX_HIGHLIGHTS = 3;
export const RED = '#ff3b30';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => typeof v === 'string' && v.trim() !== '';
const frac = (v) => typeof v === 'number' && v >= 0 && v <= 1;
const point = (v) => Array.isArray(v) && v.length === 2 && v.every(frac);
const boxOk = (v) => Array.isArray(v) && v.length === 4 && v.every(frac) && v[2] > 0 && v[3] > 0 && v[0] + v[2] <= 1 && v[1] + v[3] <= 1;
const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Visible characters of a text line (whitespace not counted).
 * @param {string} text
 * @returns {number}
 */
export function chars(text) {
  return [...text.replace(/\s+/g, '')].length;
}

/**
 * Whether a point lies inside the safe area.
 * @param {[number, number]} p
 * @returns {boolean}
 */
export function inSafe([x, y]) {
  return x >= SAFE.left && x <= SAFE.right && y >= SAFE.top && y <= SAFE.bottom;
}

/**
 * Points of a highlight that must stay inside the safe area.
 * @param {any} h a valid highlight
 * @returns {[number, number][]}
 */
export function highlightPoints(h) {
  if (h.kind === 'outline' || h.kind === 'bar') {
    const [x, y, w, hh] = h.box;
    return [[x, y], [x + w, y + hh]];
  }
  if (h.kind === 'arrow') return [h.from, h.to];
  return [h.at];
}

function checkText(name, t, rule, errors, warnings) {
  if (!isObj(t) || !str(t.text)) return errors.push(`${name}: text is required`);
  const n = chars(t.text);
  if (n > rule.maxChars) errors.push(`${name}: "${t.text}" has ${n} characters (max ${rule.maxChars})`);
  else if (n > rule.warnChars) warnings.push(`${name}: "${t.text}" has ${n} characters; ${rule.warnChars} or fewer reads at phone-grid size`);
  if (t.text.split('\n').length > 2) errors.push(`${name}: at most 2 lines`);
  if (t.y !== undefined && !frac(t.y)) errors.push(`${name}: y must be a fraction 0..1`);
  else if (t.y !== undefined && (t.y < rule.minY || t.y > rule.maxY)) warnings.push(`${name}: y ${t.y} is outside ${rule.minY}..${rule.maxY}`);
  if (t.claims !== undefined && !(Array.isArray(t.claims) && t.claims.every(str))) errors.push(`${name}: claims must be a list of claim ids`);
  if (t.color !== undefined && !(str(t.color) && HEX.test(t.color))) errors.push(`${name}: color must be #rrggbb`);
}

/**
 * Check a thumbnail spec.
 * @param {any} spec parsed thumbnail.json
 * @returns {{errors: string[], warnings: string[]}}
 */
export function check(spec) {
  const errors = [];
  const warnings = [];
  if (!isObj(spec) || spec.schema !== SCHEMA) return { errors: [`schema must be "${SCHEMA}"`], warnings };
  const size = spec.size === undefined ? DEFAULT_SIZE : spec.size;
  if (!isObj(size) || !Number.isInteger(size.width) || !Number.isInteger(size.height) || size.width <= 0) errors.push('size: width and height must be positive integers');
  else if (size.width * 16 !== size.height * 9) errors.push(`size: ${size.width}x${size.height} is not 9:16`);
  else if (size.width < 1080) warnings.push(`size: ${size.width} wide is below 1080`);
  if (!str(spec.image)) errors.push('image is required (a still from the episode art)');

  if (spec.crop !== undefined) {
    if (!isObj(spec.crop)) errors.push('crop must be an object');
    else {
      if (spec.crop.focus !== undefined && !point(spec.crop.focus)) errors.push('crop.focus must be [x, y] fractions');
      if (spec.crop.zoom !== undefined && !(typeof spec.crop.zoom === 'number' && spec.crop.zoom >= 1 && spec.crop.zoom <= 3)) errors.push('crop.zoom must be 1..3');
    }
  }
  if (spec.background !== undefined) {
    if (!isObj(spec.background)) errors.push('background must be an object');
    else for (const k of ['dim', 'desaturate', 'vignette']) {
      const v = spec.background[k];
      if (v !== undefined && !frac(v)) errors.push(`background.${k} must be 0..1`);
    }
    if (isObj(spec.background) && spec.background.spot !== undefined && !boxOk(spec.background.spot)) errors.push('background.spot must be [x, y, w, h] fractions inside the frame');
  }

  const hs = spec.highlights;
  if (!Array.isArray(hs) || hs.length === 0) errors.push('highlights: at least one (outline, arrow, xmark, ring or bar) on the subject');
  else {
    if (hs.length > MAX_HIGHLIGHTS) warnings.push(`highlights: ${hs.length} marks compete; use ${MAX_HIGHLIGHTS} or fewer`);
    hs.forEach((h, i) => {
      const at = `highlights[${i}]`;
      if (!isObj(h) || !HIGHLIGHT_KINDS.includes(h.kind)) return errors.push(`${at}: kind must be one of ${HIGHLIGHT_KINDS.join(', ')}`);
      let ok = true;
      if ((h.kind === 'outline' || h.kind === 'bar') && !boxOk(h.box)) { errors.push(`${at}: box must be [x, y, w, h] fractions inside the frame`); ok = false; }
      if (h.kind === 'arrow' && !(point(h.from) && point(h.to))) { errors.push(`${at}: from and to must be [x, y] fractions`); ok = false; }
      if ((h.kind === 'xmark' || h.kind === 'ring') && !point(h.at)) { errors.push(`${at}: at must be [x, y] fractions`); ok = false; }
      if (h.size !== undefined && !(typeof h.size === 'number' && h.size > 0 && h.size <= 1)) errors.push(`${at}: size must be a fraction of the width (0..1]`);
      if (h.color !== undefined && !(str(h.color) && HEX.test(h.color))) errors.push(`${at}: color must be #rrggbb`);
      if (ok && !highlightPoints(h).every(inSafe)) warnings.push(`${at}: reaches outside the safe area (bottom 20% and the edges are covered in the feed)`);
    });
  }

  if (spec.headline === undefined) warnings.push('headline: none; a big number or 2-4 syllable keyword at the top helps in the feed');
  else checkText('headline', spec.headline, HEADLINE, errors, warnings);
  if (spec.caption !== undefined) checkText('caption', spec.caption, CAPTION, errors, warnings);
  if (spec.headline !== undefined && spec.caption !== undefined && isObj(spec.headline) && isObj(spec.caption) && str(spec.headline.text) && spec.headline.text === spec.caption.text) {
    warnings.push('caption repeats the headline');
  }
  return { errors, warnings };
}

/**
 * A starting spec for an episode, pointing at one of its shots.
 * @param {string} image path of the still, relative to the spec
 * @returns {object}
 */
export function template(image) {
  return {
    schema: SCHEMA,
    size: { ...DEFAULT_SIZE },
    image,
    crop: { focus: [0.5, 0.5], zoom: 1 },
    background: { dim: 0.25, desaturate: 0.35, vignette: 0.5 },
    highlights: [{ kind: 'outline', box: [0.3, 0.35, 0.4, 0.3], color: RED }],
    headline: { text: '', claims: [] },
    caption: { text: '' },
  };
}

export const USAGE = `usage: thumbnail.mjs check <thumbnail.json>
       thumbnail.mjs init <thumbnail.json> --image <still path relative to the spec>`;

/**
 * Command-line entry point.
 * @param {string[]} argv
 * @param {{out: (s: string) => void, err: (s: string) => void}} io
 * @returns {number} exit code (0 ok, 1 findings or bad file, 2 usage)
 */
export function main(argv, io) {
  const [cmd, file, ...rest] = argv;
  if (!['check', 'init'].includes(cmd) || !file) { io.err(USAGE); return 2; }
  if (cmd === 'init') {
    const k = rest.indexOf('--image');
    const image = k >= 0 ? rest[k + 1] : undefined;
    if (!str(image)) { io.err(USAGE); return 2; }
    if (fs.existsSync(file)) { io.err(`error: already exists: ${file}`); return 1; }
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(template(image), null, 2)}\n`);
    io.out(`Wrote ${file}`);
    return 0;
  }
  let spec;
  try {
    spec = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    io.err(`error: ${e.message}`);
    return 1;
  }
  const { errors, warnings } = check(spec);
  errors.forEach((e) => io.err(`error: ${e}`));
  warnings.forEach((w) => io.err(`warning: ${w}`));
  if (str(spec.image) && !fs.existsSync(path.resolve(path.dirname(file), spec.image))) {
    io.err(`error: image not found: ${spec.image}`);
    errors.push('image');
  }
  io.out(`${errors.length} error(s), ${warnings.length} warning(s).`);
  return errors.length ? 1 : 0;
}

if (import.meta.url === pathToFileURL(String(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2), { out: (s) => console.log(s), err: (s) => console.error(s) });
}
