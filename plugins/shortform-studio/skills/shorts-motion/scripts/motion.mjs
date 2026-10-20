#!/usr/bin/env node
// Check the motion graphics of an informational short in the portrait shorts engine (src/shorts/_engine).
// script.json: overlay kinds and their required fields (the engine table in KINDS), frame and plate
// fractions, run times the engine divides by, counted texts that draw NaN, frame-anchored overlays that point
// at the picture, sprite layers against the sprites manifest, chunk indexes and claims on numbers.
// The storyboard (built or hand-written): how many diagram overlays share the screen, layer timing against
// the scene end (FIT_PAD), timers that never finish, held overlays that blink, pinned overlays that cross a
// change of picture, layered shots that jump at the cut, and whether it is stale. The episode pages that load
// the storyboard (video/, video-<voice>/): overlay kinds, plate pinning and layer code in their engine copy,
// plates and sprites in story.config.js. Also lists review times for the motion scenes (for the page's
// __capture) and maps plate points to frame positions. The engine itself is browser code. Node built-ins only.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const SCRIPT_SCHEMA = 'shorts-script/0';
// Diagram overlays on screen at once (dim_bg, captions and sprite layers do not count). User rule, 2026-10-20.
export const MAX_OVERLAYS = 2;
// build-storyboard.mjs fitMotion: layer paths and timed overlay runs end this long before their scene or overlay.
export const FIT_PAD = 0.3;
// fitMotion rounds times to 0.01 s, so a fitted layer end can sit up to 0.005 s past scene end - FIT_PAD.
export const TOLERANCE = 0.006;
// A layer path walked in less than this reads as a jump (fitMotion folds t to zero length when t starts too late).
export const MIN_MOVE = 0.3;
// The same overlay (kind, place, text) ending and restarting less than this apart blinks off (a hold written with at: 0).
export const BLINK = 0.1;
// Camera moves of scenes.js MOVES: zoom [from, to] and pan offsets [[x, y] at the start, [x, y] at the end] in
// frame fractions. Any other motion silently falls back to still.
export const CAMERA = {
  'push-in': { z: [1.0, 1.14], d: [[0, 0], [0, 0]] },
  'pull-out': { z: [1.16, 1.0], d: [[0, 0], [0, 0]] },
  'pan-left': { z: [1.12, 1.12], d: [[0.04, 0], [-0.04, 0]] },
  'pan-right': { z: [1.12, 1.12], d: [[-0.04, 0], [0.04, 0]] },
  'pan-up': { z: [1.1, 1.1], d: [[0, 0.035], [0, -0.035]] },
  'pan-down': { z: [1.1, 1.1], d: [[0, -0.035], [0, 0.035]] },
  still: { z: [1.03, 1.05], d: [[0, 0], [0, 0]] },
};
export const MOVES = Object.keys(CAMERA);
export const EASES = ['linear', 'inOut'];
// Review stills per motion scene: start + lead (midpoint when shorter than `short`), midpoint, end - tail;
// plus start + after for every scene that follows a layered one (nothing may jump back).
export const STILLS = { lead: 0.5, tail: 0.35, short: 1.2, after: 0.1 };
// Frame bands to keep clear: the caption band (stage.js CAPTION_Y 0.62, 84 px text) and the player controls.
export const BANDS = { caption: [0.6, 0.645], bottom: 0.8 };
// Run times the engine divides by: 0 draws NaN, and on frost (grow) or pulse-path (period) it throws.
export const TIMED = ['grow', 'count', 'dur', 'period'];
const FRAME = { w: 1080, h: 1920 };

const kind = (required, more = {}) => ({
  required, coords: [], points: [], boxes: [], paths: [], shows: [], numbers: false, time: false, motion: false, pin: false, ...more,
});

/**
 * Overlay kinds drawn by src/shorts/_engine/video/js/scenes.js, as of 2026-10-21.
 * required: fields the kind needs besides start/end (the builder writes those from at/at_chunk/until);
 * coords: scalar x/y fractions; points: [x, y] fields; boxes: [x, y, w, h] fields; paths: polyline lists
 * (all frame fractions, or plate fractions with plate:true); shows: text fields drawn on screen;
 * numbers: may show numbers that need claims; time: shows time passing; motion: animates beyond a pop-in
 * (stills lists its scenes); pin: points at the picture, so it belongs on the plate (design rule 7).
 */
export const KINDS = {
  keyword: kind(['text'], { coords: ['y'], shows: ['text'], numbers: true }),
  number: kind(['text'], { coords: ['x', 'y'], shows: ['text', 'sub'], numbers: true }),
  label: kind(['x', 'y', 'text'], { coords: ['x', 'y'], points: ['to'], shows: ['text'], numbers: true, pin: true }),
  'arrow-flow': kind(['from', 'to'], { points: ['from', 'to'], shows: ['text'], numbers: true, motion: true, pin: true }),
  dim: kind(['from', 'to'], { points: ['from', 'to'], shows: ['text'], numbers: true, pin: true }),
  xmark: kind([], { coords: ['x', 'y'] }),
  check: kind([], { coords: ['x', 'y'] }),
  dim_bg: kind([]),
  tape: kind(['from', 'to'], { points: ['from', 'to'], shows: ['text'], numbers: true, motion: true, pin: true }),
  timer: kind([], { coords: ['x', 'y'], numbers: true, time: true, motion: true }),
  'signal-bar': kind([], { coords: ['x', 'y'], time: true, motion: true }),
  'pulse-path': kind(['paths'], { paths: ['paths'], motion: true, pin: true }),
  squeeze: kind(['x', 'y'], { coords: ['x', 'y'], shows: ['text'], numbers: true, motion: true, pin: true }),
  ring: kind(['x', 'y'], { coords: ['x', 'y'], motion: true, pin: true }),
  buckle: kind([], { coords: ['x', 'y'], shows: ['skin', 'flesh'], numbers: true, motion: true }),
  frost: kind(['box'], { boxes: ['box'], points: ['from'], motion: true, pin: true }),
  compare: kind(['items'], { coords: ['x', 'y'], numbers: true, motion: true }),
  reveal: kind(['image'], { points: ['from'], motion: true, pin: true }),
  stages: kind(['rows'], { coords: ['x', 'y'], shows: ['title'], numbers: true, motion: true }),
};
export const TIME_KINDS = Object.keys(KINDS).filter((k) => KINDS[k].time);
export const MOTION_KINDS = Object.keys(KINDS).filter((k) => KINDS[k].motion);
export const PIN_KINDS = Object.keys(KINDS).filter((k) => KINDS[k].pin);

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => typeof v === 'string' && v.trim() !== '';
const fin = (v) => Number.isFinite(v);
const frac = (v) => fin(v) && v >= 0 && v <= 1;
const point = (v) => Array.isArray(v) && v.length === 2 && v.every(frac);
const boxOk = (v) => Array.isArray(v) && v.length === 4 && v.every(frac) && v[2] > 0 && v[3] > 0 && v[0] + v[2] <= 1 && v[1] + v[3] <= 1;
const chunkOk = (v, n) => Number.isInteger(v) && v >= 0 && v < n;
const r2 = (x) => Math.round(x * 100) / 100;
const secs = (x) => `${x.toFixed(2)}s`;
const isStoryboard = (sb) => isObj(sb) && Array.isArray(sb.scenes) && Array.isArray(sb.overlays);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const DIGIT = /\d/;
// The number groups scenes.js counts: number reads digits, commas and dots, tape digits and dots.
const COUNTED = { number: /^([^\d]*)([\d,.]+)(.*)$/, tape: /^([^\d]*)([\d.]+)(.*)$/ };

const LAYER_RULES = [
  ['h', (v) => fin(v) && v > 0 && v <= 1, 'h must be a fraction of the plate height (0..1]'],
  ['gait', (v) => fin(v) && v >= 0, 'gait must be 0 or more (0 glides)'],
  ['shadow', frac, 'shadow must be 0..1'],
  ['alpha', frac, 'alpha must be 0..1'],
  ['ease', (v) => EASES.includes(v), `ease must be ${EASES.join(' or ')}`],
  ['depth', (v) => fin(v) && v > 0, 'depth must be above 0'],
  ['rot', fin, 'rot must be a number of degrees'],
];

/**
 * Text an overlay puts on screen, for the claims check. A timer shows its count (`to`, default 10, plus
 * unit, default 초); compare shows each item's label and text (never its value); stages shows its title
 * and each row's name and text.
 * @param {any} o an overlay with a known kind
 * @returns {string[]}
 */
export function shownText(o) {
  if (o.kind === 'timer') return [`${o.to ?? 10}${o.unit ?? '초'}`];
  if (o.kind === 'compare') return (Array.isArray(o.items) ? o.items : []).flatMap((it) => (isObj(it) ? [it.label, it.text] : [])).filter(str);
  if (o.kind === 'stages') return [o.title, ...(Array.isArray(o.rows) ? o.rows : []).flatMap((r) => (isObj(r) ? [r.name, r.text] : []))].filter(str);
  return KINDS[o.kind].shows.map((f) => o[f]).filter(str);
}

// The number group the engine counts in a number or tape text, or null when nothing counts.
function countedGroup(o) {
  const m = COUNTED[o.kind] && str(o.text) ? COUNTED[o.kind].exec(o.text) : null;
  if (!m || (o.kind === 'number' && (o.static || /^\s*년/.test(m[3])))) return null;
  return m[2];
}

function checkLayer(L, at, ctx, errors) {
  if (!isObj(L)) return errors.push(`${at}: must be an object`);
  if (!str(L.sprite)) errors.push(`${at}: sprite is required`);
  else if (ctx.sprites && !ctx.sprites.has(L.sprite)) {
    errors.push(`${at}: sprite "${L.sprite}" ${ctx.emptySprites.has(L.sprite) ? 'is marked empty in the sprites manifest (sprites.js skips it)' : 'is not in the sprites manifest'}`);
  }
  if (!(Array.isArray(L.path) && L.path.length >= 1 && L.path.every(point))) errors.push(`${at}: path must be a list of [u, v] plate fractions (the feet)`);
  if (L.t !== undefined && !(Array.isArray(L.t) && L.t.length === 2 && L.t.every(fin) && L.t[0] >= 0 && L.t[0] < L.t[1])) {
    errors.push(`${at}: t must be [from, to] seconds from the scene start with 0 <= from < to`);
  }
  for (const [f, ok, msg] of LAYER_RULES) if (L[f] !== undefined && !ok(L[f])) errors.push(`${at}: ${msg}`);
}

function checkShot(s, k, at, chunks, ctx, errors, warnings) {
  if (!isObj(s)) return errors.push(`${at}: must be an object`);
  if (!str(s.image)) errors.push(`${at}: image is required (a plate name, art/<image>.png)`);
  else if (!ctx.hasImage(s.image)) errors.push(`${at}: art/${s.image}.png not found`);
  if (k > 0 && !chunkOk(s.from_chunk, chunks)) errors.push(`${at}: from_chunk must index one of the line's ${chunks} chunks; the builder writes null`);
  if (s.motion !== undefined && !MOVES.includes(s.motion)) warnings.push(`${at}: motion "${s.motion}" is not a camera move; the engine falls back to still`);
  if (s.zoom !== undefined && !(Array.isArray(s.zoom) && s.zoom.length === 2 && s.zoom.every((z) => fin(z) && z > 0))) errors.push(`${at}: zoom must be [from, to] above 0`);
  if (s.focus !== undefined && !point(s.focus)) errors.push(`${at}: focus must be [u, v] plate fractions 0..1`);
  if (s.tilt !== undefined && !(Array.isArray(s.tilt) && s.tilt.length === 2 && s.tilt.every(frac) && s.tilt[0] < s.tilt[1])) {
    errors.push(`${at}: tilt must be [v0, v1] plate fractions with v0 < v1`);
  }
  if (s.layers === undefined) return;
  if (!Array.isArray(s.layers)) return errors.push(`${at}: layers must be a list`);
  if (s.layers.length && !ctx.sprites) errors.push(`${at}: layers need a sprites manifest (art/sprites/sprites.json or --sprites)`);
  s.layers.forEach((L, j) => checkLayer(L, `${at} layer ${j + 1}`, ctx, errors));
}

function checkOverlay(o, at, chunks, ctx, errors, warnings) {
  if (!isObj(o)) return errors.push(`${at}: must be an object`);
  if (!Object.hasOwn(KINDS, o.kind)) return errors.push(`${at}: unknown kind "${o.kind}"; the engine skips it silently`);
  const spec = KINDS[o.kind];
  const space = o.plate ? 'plate' : 'frame';
  for (const f of spec.required) if (o[f] === undefined) errors.push(`${at}: ${o.kind} needs ${f}`);
  if (o.text !== undefined && typeof o.text !== 'string') errors.push(`${at}: text must be a string`);
  for (const f of spec.coords) if (o[f] !== undefined && !frac(o[f])) errors.push(`${at}: ${f} must be a ${space} fraction 0..1`);
  for (const f of spec.points) if (o[f] !== undefined && !point(o[f])) errors.push(`${at}: ${f} must be [x, y] ${space} fractions 0..1`);
  for (const f of spec.boxes) {
    if (o[f] !== undefined && !boxOk(o[f])) errors.push(`${at}: ${f} must be [x, y, w, h] ${space} fractions with w, h > 0, x + w <= 1 and y + h <= 1`);
  }
  for (const f of spec.paths) {
    const ok = Array.isArray(o[f]) && o[f].length > 0 && o[f].every((p) => Array.isArray(p) && p.length >= 2 && p.every(point));
    if (o[f] !== undefined && !ok) errors.push(`${at}: ${f} must be a list of polylines, each 2 or more [x, y] ${space} fractions`);
  }
  for (const f of TIMED) {
    if (o[f] !== undefined && !(fin(o[f]) && o[f] > 0)) errors.push(`${at}: ${f} must be a number above 0; the engine divides by it (0 draws NaN, and frost or pulse-path throw and stop the export)`);
  }
  const group = countedGroup(o);
  if (group !== null && (!DIGIT.test(group) || Number.isNaN(Number(group.replace(/,/g, ''))))) {
    const shown = Number.isNaN(Number(group.replace(/,/g, ''))) ? 'NaN' : '0';
    const fix = o.kind === 'number' ? "use static: true, or keep '.' and ','" : "keep '.'";
    errors.push(`${at}: text "${o.text}" counts "${group}", which is not a number, so the engine draws ${shown} in its place; ${fix} out of the text except inside one number`);
  }
  if (o.kind === 'compare' && o.items !== undefined) {
    const items = o.items;
    if (!(Array.isArray(items) && items.length >= 2 && items.every((it) => isObj(it) && str(it.label) && fin(it.value)))) {
      errors.push(`${at}: items must be 2 or more {label, value} with a text label and a finite value`);
    } else if (o.min !== undefined && !(fin(o.min) && items.every((it) => it.value > o.min))) {
      errors.push(`${at}: min ${o.min} must be below every value (bar height is (value - min) / (max - min))`);
    }
  }
  if (o.kind === 'stages' && o.rows !== undefined && !(Array.isArray(o.rows) && o.rows.length >= 2 && o.rows.every((r) => isObj(r) && str(r.name) && str(r.text)))) {
    errors.push(`${at}: rows must be 2 or more {name, text} with text in both`);
  }
  if (o.kind === 'reveal' && o.image !== undefined) {
    if (!str(o.image)) errors.push(`${at}: image must be a plate name (art/<image>.png)`);
    else if (!ctx.hasImage(o.image)) errors.push(`${at}: art/${o.image}.png not found`);
  }
  if (o.kind === 'timer') {
    if (o.plate && o.to) errors.push(`${at}: a timer with "to" must not be plate:true; onFrame reads "to" as a point and the frame fails`);
    else if (o.plate) warnings.push(`${at}: a timer is a card; keep it frame-anchored (drop plate:true) so it does not ride the camera`);
    if (o.to !== undefined && !Number.isInteger(o.to)) errors.push(`${at}: to must be the final count, a whole number (the engine floors the count, so 4.5 shows 4)`);
  }
  for (const f of ['at_chunk', 'until_chunk']) {
    if (o[f] !== undefined && !chunkOk(o[f], chunks)) errors.push(`${at}: ${f} must index one of the line's ${chunks} chunks; the builder writes null`);
  }
  if (spec.pin && !o.plate) warnings.push(`${at}: ${o.kind} points at the picture but is frame-anchored; add plate: true (design rule 7) or the camera move slides the picture under it`);
  if (o.claims !== undefined && !(Array.isArray(o.claims) && o.claims.every(str))) errors.push(`${at}: claims must be a list of claim ids`);
  if (!spec.numbers || (Array.isArray(o.claims) && o.claims.length > 0)) return;
  const notFacts = Array.isArray(o.not_facts) ? o.not_facts.filter(str) : [];
  const strip = (s) => notFacts.reduce((acc, p) => acc.split(p).join(' '), s);
  const shown = shownText(o);
  if (!shown.some((s) => DIGIT.test(strip(s)))) return;
  const traced = spec.shows.includes('text') && str(o.text) && DIGIT.test(strip(o.text));
  warnings.push(`${at}: shows "${shown.join(' / ')}" with no claims; numbers on screen need claims; ${traced ? 'facts.mjs trace will refuse it' : 'facts.mjs trace does not read this field, so check it against facts.json by hand'}`);
}

/**
 * Check the motion fields of a script (shorts-script/0): shots (image, camera, tilt, layers) and overlays.
 * Lines are named by id ('l05 shot 1', 'l05 shot 1 layer 2', 'l05 overlay 2').
 * @param {any} script parsed script.json
 * @param {{hasImage: (name: string) => boolean, sprites: Set<string> | null, emptySprites: Set<string>}} ctx plate lookup,
 *   sprite names the manifests load (null: no manifest) and names they mark empty
 * @returns {{errors: string[], warnings: string[]}}
 */
export function checkScript(script, ctx) {
  const errors = [];
  const warnings = [];
  if (!isObj(script) || script.schema !== SCRIPT_SCHEMA) return { errors: [`script: schema must be "${SCRIPT_SCHEMA}"`], warnings };
  if (!Array.isArray(script.lines)) return { errors: ['script: lines must be a list'], warnings };
  script.lines.forEach((line, i) => {
    if (!isObj(line)) return errors.push(`line ${i + 1}: must be an object`);
    const id = str(line.id) ? line.id : `line ${i + 1}`;
    const chunks = Array.isArray(line.chunks) ? line.chunks.length : 0;
    const shots = line.shots ?? [];
    if (!Array.isArray(shots)) errors.push(`${id}: shots must be a list`);
    else shots.forEach((s, k) => checkShot(s, k, `${id} shot ${k + 1}`, chunks, ctx, errors, warnings));
    const overlays = line.overlays ?? [];
    if (!Array.isArray(overlays)) errors.push(`${id}: overlays must be a list`);
    else overlays.forEach((o, k) => checkOverlay(o, `${id} overlay ${k + 1}`, chunks, ctx, errors, warnings));
  });
  return { errors, warnings };
}

/**
 * Check a hand-written storyboard's scenes and overlays with the script rules (a built one is checked
 * through its script). Each scene is checked like a line's first shot; storyboard overlays have no chunks.
 * Non-objects are left to checkStoryboard.
 * @param {any} sb a storyboard with scenes and overlays lists
 * @param {string} base the storyboard's file name, for the messages
 * @param {{hasImage: (name: string) => boolean, sprites: Set<string> | null, emptySprites: Set<string>}} ctx as for checkScript
 * @returns {{errors: string[], warnings: string[]}}
 */
export function checkHandWritten(sb, base, ctx) {
  const errors = [];
  const warnings = [];
  sb.scenes.forEach((sc, k) => {
    if (isObj(sc)) checkShot(sc, 0, `${base} scene ${str(sc.id) ? sc.id : k + 1}`, 0, ctx, errors, warnings);
  });
  sb.overlays.forEach((o, k) => {
    if (isObj(o)) checkOverlay(o, `${base} overlay ${k + 1}`, 0, ctx, errors, warnings);
  });
  return { errors, warnings };
}

/**
 * Spans of time with the same set of overlays on screen (start <= T < end, as drawOverlays draws them).
 * Every start or end changes the set, so each span runs from one of those times to the next.
 * dim_bg and overlays without a valid start < end are left out. Spans with nothing on screen are dropped.
 * @param {any[]} overlays storyboard overlays
 * @returns {{start: number, end: number, on: any[]}[]} in time order
 */
export function onScreen(overlays) {
  const live = overlays.filter((o) => isObj(o) && o.kind !== 'dim_bg' && fin(o.start) && fin(o.end) && o.start < o.end);
  const cuts = [...new Set(live.flatMap((o) => [o.start, o.end]))].sort((a, b) => a - b);
  const spans = [];
  for (let k = 0; k + 1 < cuts.length; k++) {
    const on = live.filter((o) => o.start <= cuts[k] && o.end > cuts[k]);
    if (on.length) spans.push({ start: cuts[k], end: cuts[k + 1], on });
  }
  return spans;
}

/**
 * Check a storyboard (storyboard/1, shorts profile) for motion problems: invalid scene or overlay times,
 * layers that walk their path in under MIN_MOVE or end too close to their scene end, consecutive layered
 * scenes on the same plate with the same framing and cast, timers and signal bars that never show their end
 * state, an overlay that ends and restarts at the same spot (a blink), a plate:true overlay on screen over
 * two pictures, too many overlays at once (unknown kinds are not drawn, so not counted) and two overlays
 * that both show time.
 * @param {any} sb parsed storyboard.json
 * @param {number} maxOverlays most diagram overlays allowed on screen at once
 * @returns {{errors: string[], warnings: string[]}}
 */
export function checkStoryboard(sb, maxOverlays) {
  const errors = [];
  const warnings = [];
  if (!isStoryboard(sb)) return { errors: ['storyboard: scenes and overlays must be lists'], warnings };
  const scenes = [];
  sb.scenes.forEach((sc, k) => {
    const name = `scene ${isObj(sc) && str(sc.id) ? sc.id : k + 1}`;
    if (!isObj(sc) || !fin(sc.start) || !fin(sc.end) || sc.start >= sc.end) return errors.push(`${name}: start and end must be numbers with start < end`);
    scenes.push({ sc, name });
    const len = sc.end - sc.start;
    (Array.isArray(sc.layers) ? sc.layers : []).forEach((L, j) => {
      if (!isObj(L) || !Array.isArray(L.t) || !fin(L.t[0]) || !fin(L.t[1])) return;
      const [t0, t1] = L.t;
      const who = `${name}: layer ${j + 1} (${L.sprite})`;
      if (t1 - t0 < MIN_MOVE) {
        errors.push(`${who} t [${r2(t0)}, ${r2(t1)}] walks its path in ${secs(Math.max(0, t1 - t0))} (under ${secs(MIN_MOVE)}), so the figure jumps to its path end; start t earlier (fitMotion pulls in only the end) or drop the layer`);
      } else if (t1 > len - FIT_PAD + TOLERANCE) {
        const what = t1 > len + TOLERANCE ? 'the walker would vanish mid-path' : `the walker arrives only ${secs(len - t1)} before the cut`;
        errors.push(`${who} t ends at ${secs(t1)} of a ${secs(len)} scene (end by ${secs(len - FIT_PAD)}); ${what}; rebuild the storyboard (fitMotion) or shorten t`);
      }
    });
  });
  const layered = (sc) => Array.isArray(sc.layers) && sc.layers.length > 0;
  const framing = (sc) => JSON.stringify([sc.motion, sc.zoom, sc.focus]);
  const cast = (sc) => JSON.stringify(sc.layers.map((L) => String(isObj(L) && L.sprite)).sort());
  for (let k = 1; k < scenes.length; k++) {
    const [a, b] = [scenes[k - 1], scenes[k]];
    if (layered(a.sc) && layered(b.sc) && a.sc.image === b.sc.image && framing(a.sc) === framing(b.sc) && cast(a.sc) === cast(b.sc)) {
      warnings.push(`${b.name}: same plate "${b.sc.image}", framing and cast as ${a.name}; movers jump at the cut; change zoom/focus or the cast`);
    }
  }
  const live = [];
  sb.overlays.forEach((o, i) => {
    if (!isObj(o)) return errors.push(`overlay ${i + 1}: must be an object`);
    if (!fin(o.start) || !fin(o.end) || o.start >= o.end) {
      return errors.push(`overlay ${i + 1} (${o.kind}): start and end must be numbers with start < end; an out-of-range at_chunk or until_chunk writes null (a null start draws it from 0 s, a null end never)`);
    }
    live.push(o);
    if (!TIME_KINDS.includes(o.kind)) return;
    const span = o.end - o.start;
    if (o.dur == null) warnings.push(`overlay at ${secs(o.start)}: ${o.kind} has no dur, so it runs the whole ${secs(span)} and never shows its end state`);
    else if (!fin(o.dur) || o.dur > span - FIT_PAD + TOLERANCE) {
      const left = fin(o.dur) ? secs(Math.max(0, span - o.dur)) : 'no time';
      warnings.push(`overlay at ${secs(o.start)}: ${o.kind} dur ${fin(o.dur) ? secs(o.dur) : JSON.stringify(o.dur)} leaves ${left} of its ${secs(span)} for the end state (fitMotion leaves ${secs(FIT_PAD)}); rebuild the storyboard so fitMotion trims it`);
    }
  });
  // A repeat of the same overlay (a hold): same kind, place and text. A new card at the same spot is not one.
  const spot = (o) => JSON.stringify([o.kind, Boolean(o.plate), o.from, o.to, o.box, o.x, o.y, o.paths, o.text]);
  for (const a of live) {
    for (const b of live) {
      const gap = b.start - a.end;
      if (gap > 1e-9 && gap < BLINK && spot(a) === spot(b)) {
        warnings.push(`overlay at ${secs(b.start)}: ${b.kind} ends at ${secs(a.end)} and the same ${b.kind} restarts ${secs(gap)} later, so it blinks off; write the repeat with "at": -0.08 (the next scene's start) to hold it`);
      }
    }
  }
  for (const o of live) {
    if (!o.plate) continue;
    const hit = scenes.filter(({ sc }) => o.start < sc.end && o.end > sc.start);
    if (new Set(hit.map(({ sc }) => sc.image)).size < 2) continue;
    warnings.push(`overlay at ${secs(o.start)}: plate:true ${o.kind} is on screen in ${hit.map(({ sc, name }) => `${name} (${sc.image})`).join(', ')}; on another picture it sits on the same plate spot, so it jumps; keep it inside one shot (an until_chunk at the next shot's from_chunk still runs 0.05 s into it)`);
  }
  for (const s of onScreen(live.filter((o) => Object.hasOwn(KINDS, o.kind)))) {
    if (s.on.length <= maxOverlays) continue;
    errors.push(`overlay at ${secs(s.start)}: ${s.on.length} overlays on screen until ${secs(s.end)} (${s.on.map((o) => o.kind).join(', ')}); at most ${maxOverlays} at a time`);
  }
  for (const s of onScreen(live.filter((o) => TIME_KINDS.includes(o.kind)))) {
    if (s.on.length > 1) warnings.push(`overlay at ${secs(s.start)}: ${s.on.map((o) => o.kind).join(' and ')} both show time until ${secs(s.end)}; same idea twice, keep one`);
  }
  return { errors, warnings };
}

/**
 * Whether a storyboard was built from this script by build-storyboard.mjs: its scene ids are the script's
 * line ids plus `-<n>`. A hand-written storyboard (the crosswalk motion test, scene `s01`) is not.
 * @param {any} sb a storyboard with scenes and overlays lists
 * @param {any} script parsed script.json
 * @returns {boolean}
 */
export function builtFrom(sb, script) {
  const ids = new Set((isObj(script) && Array.isArray(script.lines) ? script.lines : []).filter(isObj).map((l) => l.id).filter(str));
  return sb.scenes.some((sc) => isObj(sc) && str(sc.id) && ids.has(sc.id.replace(/-\d+$/, '')));
}

/**
 * The file name part the episode page's __capture gives a time (`<m>m<s.s>s`, 0.1 s steps):
 * two times with the same name overwrite each other.
 * @param {number} t seconds
 * @returns {string}
 */
export function captureName(t) {
  const m = Math.floor(t / 60);
  return `${m}m${(t - 60 * m).toFixed(1).replace('.', '_')}s`;
}

/**
 * Review times for every scene that moves: one with sprite layers, or one that overlaps a motion overlay
 * (MOTION_KINDS). Per scene: start + 0.5 s (the midpoint when the scene is shorter than 1.2 s), the
 * midpoint and end - 0.35 s (never before the midpoint). Every scene that follows a layered scene also gets
 * start + 0.1 s (at most its midpoint), to see that nothing jumps back. Rounded to 0.01, sorted, and unique
 * by captureName so no capture overwrites another.
 * @param {any} sb a storyboard with scenes and overlays lists
 * @returns {number[]}
 */
export function stills(sb) {
  const moving = sb.overlays.filter((o) => isObj(o) && MOTION_KINDS.includes(o.kind) && fin(o.start) && fin(o.end));
  const times = [];
  let afterLayers = false;
  for (const sc of sb.scenes) {
    if (!isObj(sc) || !fin(sc.start) || !fin(sc.end) || sc.start >= sc.end) continue;
    const layered = Array.isArray(sc.layers) && sc.layers.length > 0;
    const len = sc.end - sc.start;
    const mid = sc.start + len / 2;
    if (afterLayers) times.push(sc.start + Math.min(STILLS.after, len / 2));
    afterLayers = layered;
    if (!layered && !moving.some((o) => o.start < sc.end && o.end > sc.start)) continue;
    times.push(len < STILLS.short ? mid : sc.start + STILLS.lead, mid, Math.max(mid, sc.end - STILLS.tail));
  }
  const seen = new Set();
  return times.map(r2).sort((a, b) => a - b).filter((t) => !seen.has(captureName(t)) && seen.add(captureName(t)));
}

/**
 * The camera of scenes.js shot() at progress p (0 = scene start, 1 = scene end): the plate is cover-fitted
 * and zoomed, aimed at `focus`, panned, and clamped so no edge shows.
 * @param {{motion?: string, zoom?: number[], focus?: number[]}} scene a storyboard scene
 * @param {{w: number, h: number}} plate plate size in pixels
 * @param {number} p progress through the scene, 0..1
 * @returns {{x: number, y: number, k: number}} picture offset in frame pixels and plate-pixel scale
 */
export function camera(scene, plate, p) {
  const m = Object.hasOwn(CAMERA, scene.motion) ? CAMERA[scene.motion] : CAMERA.still;
  const t = easeInOut(clamp(p, 0, 1));
  const zs = scene.zoom || m.z;
  const [fx, fy] = scene.focus || [0.5, 0.5];
  const k = Math.max(FRAME.w / plate.w, FRAME.h / plate.h) * lerp(zs[0], zs[1], t);
  const dw = plate.w * k;
  const dh = plate.h * k;
  return {
    x: clamp(FRAME.w / 2 - fx * dw + lerp(m.d[0][0], m.d[1][0], t) * FRAME.w, FRAME.w - dw, 0),
    y: clamp(FRAME.h / 2 - fy * dh + lerp(m.d[0][1], m.d[1][1], t) * FRAME.h, FRAME.h - dh, 0),
    k,
  };
}

/**
 * Where a plate point lands on the 1080 x 1920 frame, as `plate: true` overlays and layers place it.
 * @param {number[]} uv [u, v] plate fractions
 * @param {{x: number, y: number, k: number}} cam from camera()
 * @param {{w: number, h: number}} plate plate size in pixels
 * @returns {number[]} [x, y] frame fractions
 */
export function toFrame([u, v], cam, plate) {
  return [(cam.x + u * plate.w * cam.k) / FRAME.w, (cam.y + v * plate.h * cam.k) / FRAME.h];
}

/**
 * The frame zones a point falls in that overlays should avoid: off-screen, the caption band, the bottom 20%.
 * @param {number[]} xy [x, y] frame fractions
 * @returns {string[]}
 */
export function bandsHit([x, y]) {
  const out = [];
  if (x < 0 || x > 1 || y < 0 || y > 1) out.push('off-screen');
  if (y >= BANDS.caption[0] && y <= BANDS.caption[1]) out.push('caption band');
  if (y > BANDS.bottom && y <= 1) out.push('bottom 20%');
  return out;
}

/**
 * Width and height from a PNG header.
 * @param {Buffer} buf file contents
 * @param {string} file its path, for the error message
 * @returns {{w: number, h: number}}
 */
export function pngSize(buf, file) {
  if (buf.length < 24 || buf.toString('latin1', 1, 4) !== 'PNG' || buf.toString('latin1', 12, 16) !== 'IHDR') throw new Error(`${file}: not a PNG`);
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

/**
 * Sprite names a sprites/1 manifest loads (entries marked `empty` are skipped, as sprites.js does).
 * @param {any} manifest parsed sprites.json
 * @param {string} file its path, for the error message
 * @returns {string[]}
 */
export function spriteNames(manifest, file) {
  if (!isObj(manifest) || !Array.isArray(manifest.sprites)) throw new Error(`${file}: not a sprites manifest (no sprites list)`);
  return manifest.sprites.filter((s) => isObj(s) && str(s.name) && !s.empty).map((s) => s.name);
}

/**
 * Overlay kinds an engine copy can draw: the keys of the `OVERLAY` object in its js/scenes.js.
 * @param {string | null} src scenes.js source, or null when the file is missing
 * @returns {string[] | null} null when there is no OVERLAY object
 */
export function engineKinds(src) {
  const body = src ? /const OVERLAY = \{([\s\S]*?)\n\};/.exec(src) : null;
  return body ? [...body[1].matchAll(/^ {2}(?:'([a-z_-]+)'|([a-z_]+))\(ctx/gm)].map((m) => m[1] ?? m[2]) : null;
}

/**
 * Plate names in a page's story.config.js (`plates: { name: url, ... }`).
 * @param {string | null} src story.config.js source
 * @returns {string[] | null} null when there is no plates object literal
 */
export function configPlates(src) {
  const body = src ? /plates:\s*\{([^}]*)\}/.exec(src) : null;
  return body ? [...body[1].matchAll(/(?:^|,)\s*['"]?([\w-]+)['"]?\s*:/gm)].map((m) => m[1]) : null;
}

/**
 * Sprite manifest URLs in a page's story.config.js (`sprites: [url, ...]`).
 * @param {string | null} src story.config.js source
 * @returns {string[] | null} null when there is no sprites array literal
 */
export function configSprites(src) {
  const body = src ? /sprites:\s*\[([^\]]*)\]/.exec(src) : null;
  return body ? [...body[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]) : null;
}

/**
 * What a script and a storyboard ask of the episode page: overlay kinds (known ones), whether any
 * overlay is plate:true, whether any shot has layers, and every shot image (reveal images included).
 * @param {any} script parsed script.json, or null to leave it out
 * @param {any} sb a storyboard with scenes and overlays lists, or null
 * @returns {{kinds: Set<string>, plate: boolean, layers: boolean, images: Set<string>}}
 */
export function usage(script, sb) {
  const use = { kinds: new Set(), plate: false, layers: false, images: new Set() };
  const shot = (s) => {
    if (!isObj(s)) return;
    if (str(s.image)) use.images.add(s.image);
    if (Array.isArray(s.layers) && s.layers.length) use.layers = true;
  };
  const overlay = (o) => {
    if (!isObj(o)) return;
    if (Object.hasOwn(KINDS, o.kind)) use.kinds.add(o.kind);
    // A reveal draws a second plate, so the page must load it like a shot image.
    if (o.kind === 'reveal' && str(o.image)) use.images.add(o.image);
    if (o.plate) use.plate = true;
  };
  const lines = isObj(script) && Array.isArray(script.lines) ? script.lines.filter(isObj) : [];
  for (const l of lines) {
    (Array.isArray(l.shots) ? l.shots : []).forEach(shot);
    (Array.isArray(l.overlays) ? l.overlays : []).forEach(overlay);
  }
  if (sb) {
    sb.scenes.forEach(shot);
    sb.overlays.forEach(overlay);
  }
  return use;
}

const FLAGS = ['--script', '--storyboard', '--sprites', '--max-overlays'];
const POINT = /^(\d*\.?\d+),(\d*\.?\d+)$/;

/**
 * Parse the command line. --sprites may be repeated; --max-overlays takes a positive integer; frame takes a
 * scene id and one or more u,v plate points (0..1).
 * @param {string[]} argv
 * @returns {{cmd: string, target: string, opts: {script?: string, storyboard?: string, sprites?: string[], maxOverlays?: number, scene?: string, points?: number[][]}} | null} null on bad usage
 */
export function parseArgs(argv) {
  const [cmd, target, ...rest] = argv;
  if (!['check', 'stills', 'frame'].includes(cmd) || !str(target) || target.startsWith('--')) return null;
  if (cmd === 'stills') return rest.length ? null : { cmd, target, opts: { sprites: [] } };
  if (cmd === 'frame') {
    const [scene, ...pts] = rest;
    const points = pts.map((p) => POINT.exec(p)).map((m) => (m ? [Number(m[1]), Number(m[2])] : null));
    if (!str(scene) || !points.length || !points.every(point)) return null;
    return { cmd, target, opts: { scene, points } };
  }
  const opts = { sprites: [] };
  for (let k = 0; k < rest.length; k += 2) {
    const [flag, value] = [rest[k], rest[k + 1]];
    if (!FLAGS.includes(flag) || !str(value) || value.startsWith('--')) return null;
    if (flag === '--sprites') opts.sprites.push(value);
    else if (flag === '--max-overlays') {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 1) return null;
      opts.maxOverlays = n;
    } else opts[flag.slice(2)] = value;
  }
  return { cmd, target, opts };
}

function readJson(file) {
  const text = fs.readFileSync(file, 'utf8');
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`${file}: ${e.message}`);
  }
}

function readStoryboard(file) {
  const sb = readJson(file);
  if (!isStoryboard(sb)) throw new Error('storyboard: scenes and overlays must be lists');
  return sb;
}

const readText = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null);

// Whether a URL in a page's story.config.js names this file: relative URLs resolve against the page
// folder; server paths (/src/...) are matched against the end of the file path.
const urlIs = (page, url, file) => (url.startsWith('/') ? path.resolve(file).endsWith(path.normalize(url)) : path.resolve(page, url) === path.resolve(file));

// The episode pages (video/, video-<voice>/) whose story.config.js loads this storyboard.
function pagesFor(dir, sbFile) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^video(-|$)/.test(e.name))
    .map((e) => path.join(dir, e.name))
    .sort()
    .filter((page) => {
      const m = /storyboard:\s*['"]([^'"]+)['"]/.exec(readText(path.join(page, 'story.config.js')) ?? '');
      return m !== null && urlIs(page, m[1], sbFile);
    });
}

function checkPage(page, rel, use, spriteFiles) {
  const errors = [];
  const src = readText(path.join(page, 'js', 'scenes.js'));
  const kinds = engineKinds(src);
  const copy = 'copy src/shorts/_engine/video/js in';
  if (!kinds) errors.push(`${rel}/js/scenes.js is missing or has no OVERLAY table; ${copy}`);
  else {
    for (const k of use.kinds) if (!kinds.includes(k)) errors.push(`${rel}/js/scenes.js has no "${k}" overlay; ${copy} or it draws nothing`);
    if (use.plate && !/function onFrame\b/.test(src)) errors.push(`${rel}/js/scenes.js has no onFrame, so plate:true overlays are drawn at frame fractions; ${copy}`);
    if (use.layers && !/\blayerAt\b/.test(src)) errors.push(`${rel}/js/scenes.js has no layerAt, so sprite layers draw nothing; ${copy}`);
  }
  const config = readText(path.join(page, 'story.config.js'));
  const plates = configPlates(config);
  if (plates) for (const img of use.images) if (!plates.includes(img)) errors.push(`${rel}/story.config.js plates has no "${img}"; the scene draws "missing image" and no layers`);
  const urls = configSprites(config);
  if (use.layers && urls) {
    for (const f of spriteFiles) if (!urls.some((u) => urlIs(page, u, f))) errors.push(`${rel}/story.config.js sprites does not load ${path.relative(page, f)}; its sprites draw nothing`);
  }
  return errors;
}

function runCheck(dir, opts, io) {
  const scriptFile = opts.script ?? path.join(dir, 'script.json');
  const sbFile = opts.storyboard ?? path.join(dir, 'storyboard.json');
  const spriteFiles = opts.sprites.length ? opts.sprites : [path.join(dir, 'art', 'sprites', 'sprites.json')].filter((f) => fs.existsSync(f));
  const ctx = { hasImage: (name) => fs.existsSync(path.join(dir, 'art', `${name}.png`)), sprites: null, emptySprites: new Set() };
  let script;
  let sb;
  try {
    script = readJson(scriptFile);
    if (opts.storyboard || fs.existsSync(sbFile)) sb = readJson(sbFile);
    const manifests = spriteFiles.map((f) => [f, readJson(f)]);
    if (manifests.length) ctx.sprites = new Set(manifests.flatMap(([f, m]) => spriteNames(m, f)));
    for (const [, m] of manifests) for (const s of m.sprites) if (isObj(s) && str(s.name) && s.empty) ctx.emptySprites.add(s.name);
  } catch (e) {
    io.err(`error: ${e.message}`);
    return 1;
  }
  const { errors, warnings } = checkScript(script, ctx);
  let hand = false;
  if (sb !== undefined) {
    const s = checkStoryboard(sb, opts.maxOverlays ?? MAX_OVERLAYS);
    errors.push(...s.errors);
    warnings.push(...s.warnings);
  }
  if (isStoryboard(sb)) {
    const base = path.basename(sbFile);
    hand = !builtFrom(sb, script);
    if (hand) {
      const h = checkHandWritten(sb, base, ctx);
      errors.push(...h.errors);
      warnings.push(...h.warnings);
    } else {
      // build() writes one storyboard overlay per script overlay, in order: their kinds are a fingerprint.
      const want = script.lines.filter(isObj).flatMap((l) => (Array.isArray(l.overlays) ? l.overlays : []).map((o) => (isObj(o) ? o.kind : null)));
      const have = sb.overlays.map((o) => (isObj(o) ? o.kind : null));
      if (JSON.stringify(want) !== JSON.stringify(have)) warnings.push(`${base} overlays (${have.length}) do not match the ${want.length} in ${path.basename(scriptFile)} (kind by kind, in order); rebuild storyboard`);
      else if (fs.statSync(sbFile).mtimeMs < fs.statSync(scriptFile).mtimeMs) warnings.push(`${base} is older than ${path.basename(scriptFile)}; rebuild storyboard`);
    }
  }
  const use = usage(hand ? null : script, isStoryboard(sb) ? sb : null);
  for (const page of pagesFor(dir, sbFile)) errors.push(...checkPage(page, path.relative(dir, page), use, spriteFiles));
  errors.forEach((e) => io.err(`error: ${e}`));
  warnings.forEach((w) => io.err(`warning: ${w}`));
  io.out(`${errors.length} error(s), ${warnings.length} warning(s).`);
  return errors.length ? 1 : 0;
}

function runStills(file, io) {
  let sb;
  try {
    sb = readStoryboard(file);
  } catch (e) {
    io.err(`error: ${e.message}`);
    return 1;
  }
  io.out(JSON.stringify(stills(sb)));
  return 0;
}

function runFrame(file, id, points, io) {
  let sc;
  let plate;
  try {
    sc = readStoryboard(file).scenes.find((s) => isObj(s) && s.id === id);
    if (!sc) throw new Error(`${file}: no scene "${id}"`);
    const png = path.join(path.dirname(file), 'art', `${sc.image}.png`);
    plate = pngSize(fs.readFileSync(png), png);
  } catch (e) {
    io.err(`error: ${e.message}`);
    return 1;
  }
  const cams = [camera(sc, plate, 0), camera(sc, plate, 1)];
  const at = (xy) => {
    const flags = bandsHit(xy);
    return `${xy.map((f) => f.toFixed(3)).join(',')}${flags.length ? ` (${flags.join(', ')})` : ''}`;
  };
  io.out(`${id} on ${sc.image} (${plate.w}x${plate.h}), frame x,y at the scene start and end:`);
  for (const p of points) io.out(`${p.join(',')}: start ${at(toFrame(p, cams[0], plate))}; end ${at(toFrame(p, cams[1], plate))}`);
  return 0;
}

export const USAGE = `usage: motion.mjs check <episode-dir> [--script <file>] [--storyboard <file>] [--sprites <sprites.json>]... [--max-overlays <n>]
       motion.mjs stills <storyboard.json>
       motion.mjs frame <storyboard.json> <scene-id> <u,v> [<u,v>]...`;

/**
 * Command-line entry point.
 * @param {string[]} argv
 * @param {{out: (s: string) => void, err: (s: string) => void}} io
 * @returns {number} exit code (0 ok, 1 findings or bad file, 2 usage)
 */
export function main(argv, io) {
  const args = parseArgs(argv);
  if (!args) { io.err(USAGE); return 2; }
  if (args.cmd === 'stills') return runStills(args.target, io);
  if (args.cmd === 'frame') return runFrame(args.target, args.opts.scene, args.opts.points, io);
  return runCheck(args.target, args.opts, io);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2), { out: (s) => console.log(s), err: (s) => console.error(s) });
}
