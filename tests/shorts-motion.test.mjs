import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(ROOT, 'plugins/shortform-studio/skills/shorts-motion/scripts/motion.mjs');
const T = await import(SCRIPT);
const {
  KINDS, TIME_KINDS, MOTION_KINDS, PIN_KINDS, SCRIPT_SCHEMA, MAX_OVERLAYS, FIT_PAD, MIN_MOVE, GROW, BLINK, CAMERA, MOVES, STILLS, BANDS, TIMED, USAGE,
  shownText, checkScript, checkHandWritten, onScreen, checkStoryboard, builtFrom, captureName, stills, camera, toFrame, bandsHit, pngSize,
  spriteNames, engineKinds, configPlates, configSprites, usage, parseArgs, main,
} = T;

const IMAGES = new Set(['top-empty', 'signal', 'box']);
const SPRITES = new Set(['walker-navy', 'walker-elder']);
const ctx = (o = {}) => ({ hasImage: (n) => IMAGES.has(n), sprites: SPRITES, emptySprites: new Set(), ...o });
const layer = (o = {}) => ({
  sprite: 'walker-navy', path: [[0.52, 0.84], [0.52, 0.2]], t: [0.3, 3.6], h: 0.074, gait: 1.9,
  shadow: 0.35, alpha: 1, ease: 'inOut', depth: 1, rot: 180, flip: true, ...o,
});
const chunks = (n) => Array.from({ length: n }, (_, i) => ({ text: `c${i}` }));
const TAPE = { from: [0.29, 0.79], to: [0.29, 0.176] };
// One valid overlay of every engine kind, as the episodes write them (picture-pointing kinds pinned).
const EVERY_KIND = [
  { kind: 'keyword', text: '초록불?', y: 0.17, at: 0, until: 'end' },
  { kind: 'number', text: '0.709m', static: true, sub: '초속', x: 0.5, y: 0.26, at_chunk: 1, claims: ['c-elder'] },
  { kind: 'number', text: '9', static: true, plate: true, x: 0.552, y: 0.435, not_facts: ['9'] },
  { kind: 'number', text: '절반' },
  { kind: 'number', text: '1995년', count: 0.7, claims: ['c-1995'] },
  { kind: 'label', plate: true, x: 0.5, y: 0.3, text: '계량기', to: [0.6, 0.5] },
  { kind: 'arrow-flow', plate: true, from: [0.27, 0.47], to: [0.88, 0.47], width: 22 },
  { kind: 'dim', plate: true, from: [0.1, 0.5], to: [0.9, 0.5], text: '60cm', claims: ['c-60'] },
  { kind: 'xmark', x: 0.5, y: 0.22, size: 200 },
  { kind: 'check' },
  { kind: 'dim_bg' },
  { kind: 'tape', plate: true, ...TAPE, grow: 1.2, text: '20m', claims: ['c-20m'] },
  { kind: 'tape', plate: true, from: [0.1, 0.9], to: [0.1, 0.1], grow: 0.01, text: '길이' },
  { kind: 'timer', x: 0.8, y: 0.27, dur: 3.3, to: 27, unit: '초', claims: ['c-20m'] },
  { kind: 'signal-bar', x: 0.5, y: 0.13, w: 0.72, dur: 3.2, blink: 1.8 },
  { kind: 'pulse-path', plate: true, period: 0.9, count: 3, slow: 0, paths: [[[0.08, 0.455], [0.2, 0.46]], [[0.2, 0.455], [0.3, 0.4], [0.42, 0.35]]] },
  { kind: 'squeeze', plate: true, x: 0.71, y: 0.45, gap: 0.075, dur: 0.8, period: 0.9, text: '조임' },
  { kind: 'ring', plate: true, x: 0.445, y: 0.29, r: 0.13 },
  { kind: 'buckle', x: 0.5, y: 0.735, dur: 2.6, skin: '피부', flesh: '속살' },
  { kind: 'frost', plate: true, box: [0.29, 0.24, 0.59, 0.43], from: [0.576, 0.498], grow: 2.4 },
  { kind: 'compare', x: 0.5, y: 0.37, min: 80, items: [{ label: '물', value: 100 }, { label: '얼음', value: 109, text: '+9%' }], claims: ['c-9'] },
  { kind: 'compare', items: [{ label: '물', value: 1 }, { label: '얼음', value: 2 }] },
  { kind: 'reveal', image: 'box', plate: true, from: [0.576, 0.498], grow: 1.8, feather: 0.3 },
  { kind: 'stages', title: '일 최저기온', rows: [{ name: '관심', text: '영하 5도 위' }, { name: '주의', text: '영하 5~10도' }], claims: ['c-stages'] },
  { kind: 'stamp', text: '상상 장면', x: 0.05, y: 0.085 },
];
const goodScript = (o = {}) => ({
  schema: SCRIPT_SCHEMA,
  cuts: 'chunk',
  lines: [
    {
      id: 'l04',
      chunks: chunks(2),
      shots: [{ image: 'top-empty', motion: 'push-in', zoom: [1, 1.05], focus: [0.5, 0.5], tilt: [0.28, 0.74], layers: [layer(), layer({ sprite: 'walker-elder', t: undefined })] }],
      overlays: EVERY_KIND,
    },
    { id: 'l05', chunks: chunks(2), shots: [{ image: 'signal' }, { image: 'box', from_chunk: 1, layers: [] }] },
    { id: 'l06', chunks: chunks(1) },
  ],
  ...o,
});
const line = (o) => goodScript({ lines: [{ id: 'l01', chunks: chunks(2), ...o }] });
const sbScene = (o = {}) => ({ id: 's', start: 0, end: 4, image: 'top-empty', ...o });
// A built storyboard (scene ids <line>-<n>) and the script it was built from: one overlay per script overlay.
const goodSb = () => ({
  schema: 'storyboard/1',
  scenes: [
    sbScene({ id: 'l04-1', motion: 'push-in', zoom: [1, 1.05], layers: [{ sprite: 'walker-navy', t: [0.3, 3.7] }, { sprite: 'walker-elder' }] }),
    sbScene({ id: 'l05-1', start: 4, end: 8, motion: 'pull-out', zoom: [1.12, 1.04], layers: [{ sprite: 'walker-navy', t: [0.3, 3.705] }] }),
    sbScene({ id: 'l06-1', start: 8, end: 9, image: 'signal' }),
    sbScene({ id: 'l07-1', start: 9, end: 12, image: 'box' }),
  ],
  captions: [],
  overlays: [
    { start: 0.2, end: 4, kind: 'tape', plate: true, ...TAPE, text: '20m' },
    { start: 4, end: 8, kind: 'tape', plate: true, grow: 0.01, ...TAPE, text: '20m' },
    { start: 4.3, end: 8, kind: 'timer', dur: 3.4, to: 27 },
    { start: 8, end: 9, kind: 'signal-bar', dur: 0.7 },
    { start: 9, end: 12, kind: 'dim_bg' },
    { start: 9, end: 12, kind: 'xmark' },
    { start: 9.5, end: 12, kind: 'number', text: '3' },
  ],
});
const sbScript = () => goodScript({ lines: [
  { id: 'l04', chunks: chunks(1), shots: [{ image: 'top-empty', motion: 'push-in', zoom: [1, 1.05], layers: [layer({ t: [0.3, 3.7] }), layer({ sprite: 'walker-elder', t: undefined })] }],
    overlays: [{ kind: 'tape', plate: true, ...TAPE, text: '20m', at: 0.2, claims: ['c-20m'] }] },
  { id: 'l05', chunks: chunks(1), shots: [{ image: 'top-empty', motion: 'pull-out', zoom: [1.12, 1.04], layers: [layer({ t: [0.3, 3.8] })] }],
    overlays: [{ kind: 'tape', plate: true, ...TAPE, grow: 0.01, text: '20m', at: -0.08, claims: ['c-20m'] }, { kind: 'timer', dur: 3.4, to: 27, at: 0.3, claims: ['c-20m'] }] },
  { id: 'l06', chunks: chunks(1), shots: [{ image: 'signal' }], overlays: [{ kind: 'signal-bar', dur: 1 }] },
  { id: 'l07', chunks: chunks(1), shots: [{ image: 'box' }], overlays: [{ kind: 'dim_bg' }, { kind: 'xmark' }, { kind: 'number', text: '3', claims: ['c-3'] }] },
  { id: 'l08', chunks: chunks(1) },
] });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const io = () => { const out = [], err = []; return { out, err, io: { out: (s) => out.push(s), err: (s) => err.push(s) } }; };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'motion-'));
const write = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data));
};
const episode = (script = goodScript()) => {
  const d = tmp();
  for (const name of IMAGES) write(path.join(d, 'art', `${name}.png`), 'png');
  write(path.join(d, 'art/sprites/sprites.json'), { schema: 'sprites/1', sprites: [{ name: 'walker-navy', file: 'a.png' }, { name: 'walker-elder', file: 'b.png' }] });
  write(path.join(d, 'script.json'), script);
  return d;
};
const age = (file, seconds) => {
  const t = new Date(Date.now() - seconds * 1000);
  fs.utimesSync(file, t, t);
};
const png = (w, h) => {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
};
// An engine copy's scenes.js: the OVERLAY table with the given kinds, plus onFrame and layerAt when asked.
const engineSrc = (kinds, { onFrame = true, layerAt = true } = {}) => [
  onFrame ? 'function onFrame(o, cam) {\n  return o;\n}' : '// no plate pinning',
  layerAt ? 'export function layerAt(L, local, length) {\n  return {};\n}' : '// no layers',
  'const OVERLAY = {',
  ...kinds.map((k) => `  ${k.includes('-') ? `'${k}'` : k}(ctx, o, T) {\n    draw(ctx, o);\n  },`),
  '};',
].join('\n');
const config = ({ storyboard = '../storyboard.json', sprites = ['../art/sprites/sprites.json'], plates = [...IMAGES] } = {}) => [
  'export default {',
  storyboard === null ? '' : `  storyboard: '${storyboard}',`,
  sprites === null ? '' : `  sprites: [${sprites.map((s) => `'${s}'`).join(', ')}],`,
  plates === null ? '' : `  plates: {\n${plates.map((p) => `    '${p}': '../art/${p}.png',`).join('\n')}\n  },`,
  "  saveName: 'x/x',",
  '};',
].join('\n');
const page = (d, name, cfg, src) => {
  if (cfg !== undefined) write(path.join(d, name, 'story.config.js'), cfg);
  if (src !== undefined) write(path.join(d, name, 'js', 'scenes.js'), src);
};
const COPY = 'copy src/shorts/_engine/video/js in';

describe('kinds', () => {
  test('the table covers every engine kind', () => {
    assert.deepEqual(Object.keys(KINDS), [
      'keyword', 'number', 'label', 'arrow-flow', 'dim', 'xmark', 'check', 'dim_bg', 'tape', 'timer',
      'signal-bar', 'pulse-path', 'squeeze', 'ring', 'buckle', 'frost', 'compare', 'reveal', 'stages', 'stamp',
    ]);
    assert.deepEqual(TIME_KINDS, ['timer', 'signal-bar']);
    assert.deepEqual(MOTION_KINDS, ['arrow-flow', 'tape', 'timer', 'signal-bar', 'pulse-path', 'squeeze', 'ring', 'buckle', 'frost', 'compare', 'reveal', 'stages']);
    assert.deepEqual(PIN_KINDS, ['label', 'arrow-flow', 'dim', 'tape', 'pulse-path', 'squeeze', 'ring', 'frost', 'reveal']);
    assert.deepEqual(Object.keys(KINDS).filter((k) => KINDS[k].numbers), ['keyword', 'number', 'label', 'arrow-flow', 'dim', 'tape', 'timer', 'squeeze', 'buckle', 'compare', 'stages']);
    assert.deepEqual(Object.keys(KINDS).filter((k) => KINDS[k].shows.length), ['keyword', 'number', 'label', 'arrow-flow', 'dim', 'tape', 'squeeze', 'buckle', 'stages', 'stamp']);
    assert.deepEqual(KINDS.buckle.shows, ['skin', 'flesh']);
    assert.deepEqual(KINDS.label.required, ['x', 'y', 'text']);
    assert.deepEqual(KINDS.dim_bg, { required: [], coords: [], points: [], boxes: [], paths: [], shows: [], numbers: false, time: false, motion: false, pin: false });
    assert.deepEqual(TIMED, ['grow', 'count', 'dur', 'period']);
  });
  test('camera moves mirror scenes.js MOVES', () => {
    assert.deepEqual(MOVES, ['push-in', 'pull-out', 'pan-left', 'pan-right', 'pan-up', 'pan-down', 'still']);
    assert.deepEqual(CAMERA['pan-left'], { z: [1.12, 1.12], d: [[0.04, 0], [-0.04, 0]] });
    assert.deepEqual(CAMERA['pan-down'], { z: [1.1, 1.1], d: [[0, -0.035], [0, 0.035]] });
    assert.deepEqual(BANDS, { caption: [0.6, 0.645], bottom: 0.8 });
  });
  test('shownText', () => {
    assert.deepEqual(shownText({ kind: 'timer' }), ['10초']);
    assert.deepEqual(shownText({ kind: 'timer', to: 36, unit: '' }), ['36']);
    assert.deepEqual(shownText({ kind: 'compare', items: [null, { label: '물', value: 100 }, { label: '얼음', text: '+9%' }] }), ['물', '얼음', '+9%']);
    assert.deepEqual(shownText({ kind: 'compare', items: 'x' }), []);
    assert.deepEqual(shownText({ kind: 'number', text: '27.6% ↓', sub: '혈류 감소' }), ['27.6% ↓', '혈류 감소']);
    assert.deepEqual(shownText({ kind: 'tape', text: '20m', sub: 'not drawn' }), ['20m']);
    assert.deepEqual(shownText({ kind: 'keyword', text: '동파' }), ['동파']);
    assert.deepEqual(shownText({ kind: 'buckle', skin: '피부', flesh: '' }), ['피부']);
    assert.deepEqual(shownText({ kind: 'ring', text: 'not drawn' }), []);
    assert.deepEqual(shownText({ kind: 'stages', title: '기준', rows: [null, { name: '관심', text: '영하 5도 위' }, { name: '주의' }] }), ['기준', '관심', '영하 5도 위', '주의']);
    assert.deepEqual(shownText({ kind: 'stages', rows: 'x' }), []);
  });
  test('imagined lines: stamp, no digits, extreme as a question', () => {
    const stamp = { kind: 'stamp', at: 0, until: 'end' };
    const ok = checkScript(goodScript({ lines: [
      { id: 'l03', beat: 'imagine', imagined: true, chunks: [{ text: '없애고 이어 붙이면?' }], overlays: [stamp] },
      { id: 'l06', beat: 'imagine-extreme', imagined: true, say: '이대로 계속 버틴다면?', chunks: [{ text: '이대로 버틴다면?' }], overlays: [{ kind: 'stamp' }] },
      { id: 'l07', beat: 'problem', imagined: false, chunks: chunks(1) },
    ] }), ctx());
    assert.deepEqual(ok, { errors: [], warnings: [] });
    const bad = checkScript(goodScript({ lines: [
      { id: 'a', imagined: 'yes', chunks: chunks(1) },
      { id: 'b', imagined: true, chunks: [{ text: '30cm 늘어나면' }, null], overlays: [{ kind: 'number', text: '12톤', static: true }, 5] },
      { id: 'c', beat: 'imagine-extreme', imagined: true, say: '다리가 무너집니다.', chunks: [{ text: '가' }, { text: '나' }], overlays: [{ kind: 'stamp', at_chunk: 1 }, { kind: 'frosty' }] },
      { id: 'd', beat: 'imagine-extreme', chunks: chunks(1) },
      { id: 'e', imagined: true, chunks: 'x', overlays: [{ kind: 'stamp', at: 0.5 }] },
      { id: 'f', imagined: true, chunks: [{ text: '가' }], overlays: [{ kind: 'stamp', until: 1 }] },
      { id: 'g', beat: 'imagine-extreme', imagined: true, chunks: [{ text: '가' }], overlays: [stamp] },
      { id: 'h', imagined: true, chunks: [{ text: '가' }] },
    ] }), ctx());
    const whole = 'the stamp should cover the whole imagined line (at 0, until "end")';
    const ask = 'the extreme imagined line should be asked as a question ("이대로 계속 버틴다면?"); it asserts nothing';
    assert.deepEqual(bad.errors.filter((e) => !e.includes('unknown kind') && !e.includes('must be an object') && !e.includes('until_chunk')), [
      'a: imagined must be true or false',
      'b: an imagined line needs a stamp overlay ("상상 장면") so the picture is not taken for something that happened',
      'b: an imagined line shows numbers (30cm 늘어나면 / 12톤); no number may sit on a picture that did not happen',
      'd: beat imagine-extreme needs "imagined": true (a stamp, no numbers)',
      'h: an imagined line needs a stamp overlay ("상상 장면") so the picture is not taken for something that happened',
    ]);
    assert.deepEqual(bad.warnings.filter((w) => !w.includes('no claims')), [`c: ${whole}`, `c: ${ask}`, `e: ${whole}`, `f: ${whole}`, `g: ${ask}`]);
  });
  test('reveal and stages fields', () => {
    const rows = [{ name: '관심', text: '영하 5도 위' }, { name: '주의', text: '영하 5~10도' }];
    let r = checkScript(line({ overlays: [
      { kind: 'reveal', image: 'box', plate: true, from: [0.5, 0.5], grow: 1.8 },
      { kind: 'stages', rows, title: '일 최저기온', claims: ['c-stages'] },
    ] }), ctx());
    assert.deepEqual(r, { errors: [], warnings: [] });
    r = checkScript(line({ overlays: [
      { kind: 'reveal', image: 'box-frozen', plate: true },
      { kind: 'reveal', image: '', plate: true },
      { kind: 'reveal', plate: true },
      { kind: 'reveal', image: 'box' },
      { kind: 'stages', rows: [rows[0]] },
      { kind: 'stages', rows: [rows[0], { name: '주의' }] },
      { kind: 'stages', rows },
    ] }), ctx());
    assert.deepEqual(r.errors, [
      'l01 overlay 1: art/box-frozen.png not found',
      'l01 overlay 2: image must be a plate name (art/<image>.png)',
      'l01 overlay 3: reveal needs image',
      'l01 overlay 5: rows must be 2 or more {name, text} with text in both',
      'l01 overlay 6: rows must be 2 or more {name, text} with text in both',
    ]);
    assert.ok(r.warnings.some((w) => w.startsWith('l01 overlay 4: reveal points at the picture')));
    assert.ok(r.warnings.some((w) => w.startsWith('l01 overlay 7: shows "관심 / 영하 5도 위 / 주의 / 영하 5~10도" with no claims') && w.endsWith('check it against facts.json by hand')));
    const u = usage(line({ overlays: [{ kind: 'reveal', image: 'box-frozen' }, { kind: 'reveal' }] }), null);
    assert.ok(u.images.has('box-frozen'));
  });
});

describe('checkScript', () => {
  test('a script with every kind is clean', () => {
    assert.deepEqual(checkScript(goodScript(), ctx()), { errors: [], warnings: [] });
  });
  test('schema, lines and line shape', () => {
    assert.deepEqual(checkScript(null, ctx()).errors, [`script: schema must be "${SCRIPT_SCHEMA}"`]);
    assert.deepEqual(checkScript({ schema: 'storyboard/1' }, ctx()).errors, [`script: schema must be "${SCRIPT_SCHEMA}"`]);
    assert.deepEqual(checkScript({ schema: SCRIPT_SCHEMA }, ctx()).errors, ['script: lines must be a list']);
    assert.deepEqual(checkScript(goodScript({ lines: [3, { shots: 'x', overlays: {} }] }), ctx()).errors, [
      'line 1: must be an object',
      'line 2: shots must be a list',
      'line 2: overlays must be a list',
    ]);
  });
  test('shots', () => {
    const r = checkScript(line({
      chunks: undefined,
      shots: [
        { image: 'top-empty', motion: 'zoom-in', zoom: [0, 1], focus: [0.5, 1.2], tilt: [0.7, 0.3] },
        null,
        { motion: 'still', zoom: 'big', tilt: [0.2], focus: [0.5] },
        { image: 'gone', from_chunk: 0 },
      ],
    }), ctx());
    assert.deepEqual(r.errors, [
      'l01 shot 1: zoom must be [from, to] above 0',
      'l01 shot 1: focus must be [u, v] plate fractions 0..1',
      'l01 shot 1: tilt must be [v0, v1] plate fractions with v0 < v1',
      'l01 shot 2: must be an object',
      'l01 shot 3: image is required (a plate name, art/<image>.png)',
      "l01 shot 3: from_chunk must index one of the line's 0 chunks; the builder writes null",
      'l01 shot 3: zoom must be [from, to] above 0',
      'l01 shot 3: focus must be [u, v] plate fractions 0..1',
      'l01 shot 3: tilt must be [v0, v1] plate fractions with v0 < v1',
      'l01 shot 4: art/gone.png not found',
      "l01 shot 4: from_chunk must index one of the line's 0 chunks; the builder writes null",
    ]);
    assert.deepEqual(r.warnings, ['l01 shot 1: motion "zoom-in" is not a camera move; the engine falls back to still']);
    const later = checkScript(line({ shots: [{ image: 'box' }, { image: 'box', from_chunk: 2 }, { image: 'box', from_chunk: 1.5 }, { image: 'box', from_chunk: 1 }] }), ctx());
    assert.deepEqual(later.errors, [
      "l01 shot 2: from_chunk must index one of the line's 2 chunks; the builder writes null",
      "l01 shot 3: from_chunk must index one of the line's 2 chunks; the builder writes null",
    ]);
  });
  test('layers', () => {
    const r = checkScript(line({
      shots: [{ image: 'top-empty', layers: [
        7,
        { path: [] },
        layer({ sprite: 'walker-ghost', path: [[0.5, 1.1]], t: [2, 1], h: 0, gait: -1, shadow: 2, alpha: -0.1, ease: 'out', depth: 0, rot: 'left' }),
        layer({ path: 'up', t: [-1, 2], h: 1.2 }),
        layer({ t: [1, 'x'] }),
        layer({ t: [1, 2, 3], h: 1, gait: 0, shadow: 0, alpha: 0, ease: 'linear', depth: 2.5, rot: 0 }),
        layer({ sprite: 'walker-suit' }),
      ] }, { image: 'box', from_chunk: 1, layers: 'walkers' }],
    }), ctx({ emptySprites: new Set(['walker-suit']) }));
    assert.deepEqual(r.errors, [
      'l01 shot 1 layer 1: must be an object',
      'l01 shot 1 layer 2: sprite is required',
      'l01 shot 1 layer 2: path must be a list of [u, v] plate fractions (the feet)',
      'l01 shot 1 layer 3: sprite "walker-ghost" is not in the sprites manifest',
      'l01 shot 1 layer 3: path must be a list of [u, v] plate fractions (the feet)',
      'l01 shot 1 layer 3: t must be [from, to] seconds from the scene start with 0 <= from < to',
      'l01 shot 1 layer 3: h must be a fraction of the plate height (0..1]',
      'l01 shot 1 layer 3: gait must be 0 or more (0 glides)',
      'l01 shot 1 layer 3: shadow must be 0..1',
      'l01 shot 1 layer 3: alpha must be 0..1',
      'l01 shot 1 layer 3: ease must be linear or inOut',
      'l01 shot 1 layer 3: depth must be above 0',
      'l01 shot 1 layer 3: rot must be a number of degrees',
      'l01 shot 1 layer 4: path must be a list of [u, v] plate fractions (the feet)',
      'l01 shot 1 layer 4: t must be [from, to] seconds from the scene start with 0 <= from < to',
      'l01 shot 1 layer 4: h must be a fraction of the plate height (0..1]',
      'l01 shot 1 layer 5: t must be [from, to] seconds from the scene start with 0 <= from < to',
      'l01 shot 1 layer 6: t must be [from, to] seconds from the scene start with 0 <= from < to',
      'l01 shot 1 layer 7: sprite "walker-suit" is marked empty in the sprites manifest (sprites.js skips it)',
      'l01 shot 2: layers must be a list',
    ]);
    assert.deepEqual(r.warnings, []);
  });
  test('layers without a sprites manifest', () => {
    const r = checkScript(line({ shots: [{ image: 'top-empty', layers: [layer({ sprite: 'anything' })] }, { image: 'box', from_chunk: 1, layers: [] }] }), ctx({ sprites: null }));
    assert.deepEqual(r.errors, ['l01 shot 1: layers need a sprites manifest (art/sprites/sprites.json or --sprites)']);
  });
  test('layers on a chunk-cut line are fine', () => {
    const r = checkScript(line({ shots: [{ image: 'top-empty', layers: [layer()] }] }), ctx());
    assert.deepEqual(r, { errors: [], warnings: [] });
  });
  test('overlay kinds and required fields', () => {
    const r = checkScript(line({ overlays: [
      null,
      { kind: 'sparkle' },
      { kind: 'toString' },
      { text: 'x' },
      { kind: 'keyword' },
      { kind: 'label', plate: true, text: 5 },
      { kind: 'arrow-flow', plate: true },
      { kind: 'dim', plate: true, from: [0, 0] },
      { kind: 'tape', plate: true, to: [0, 0] },
      { kind: 'pulse-path', plate: true },
      { kind: 'squeeze', plate: true, y: 0.5 },
      { kind: 'ring', plate: true, x: 0.5 },
      { kind: 'frost', plate: true },
      { kind: 'compare' },
    ] }), ctx());
    assert.deepEqual(r.errors, [
      'l01 overlay 1: must be an object',
      'l01 overlay 2: unknown kind "sparkle"; the engine skips it silently',
      'l01 overlay 3: unknown kind "toString"; the engine skips it silently',
      'l01 overlay 4: unknown kind "undefined"; the engine skips it silently',
      'l01 overlay 5: keyword needs text',
      'l01 overlay 6: label needs x',
      'l01 overlay 6: label needs y',
      'l01 overlay 6: text must be a string',
      'l01 overlay 7: arrow-flow needs from',
      'l01 overlay 7: arrow-flow needs to',
      'l01 overlay 8: dim needs to',
      'l01 overlay 9: tape needs from',
      'l01 overlay 10: pulse-path needs paths',
      'l01 overlay 11: squeeze needs x',
      'l01 overlay 12: ring needs y',
      'l01 overlay 13: frost needs box',
      'l01 overlay 14: compare needs items',
    ]);
    assert.deepEqual(r.warnings, []);
  });
  test('overlay geometry in frame and plate fractions', () => {
    const r = checkScript(line({ overlays: [
      { kind: 'number', text: '절반', x: 1.5, y: -0.1 },
      { kind: 'keyword', text: '동파', plate: true, y: 2 },
      { kind: 'label', x: 0.5, y: 0.5, text: 'a', to: [0.5] },
      { kind: 'arrow-flow', plate: true, from: [0.1, 0.1], to: [1.2, 0.5] },
      { kind: 'dim', from: 'a', to: [0.5, 0.5] },
      { kind: 'frost', box: [0.5, 0.5, 0.6, 0.2], from: [2, 2] },
      { kind: 'frost', plate: true, box: [0.1, 0.1, 0, 0.2] },
      { kind: 'frost', box: [0.1, 0.1, 0.2] },
      { kind: 'pulse-path', paths: [] },
      { kind: 'pulse-path', plate: true, paths: [[[0.1, 0.1]]] },
      { kind: 'pulse-path', paths: [[[0.1, 0.1], [0.2, 1.4]]] },
      { kind: 'pulse-path', paths: ['a'] },
      { kind: 'pulse-path', paths: 'a' },
    ] }), ctx());
    assert.deepEqual(r.errors, [
      'l01 overlay 1: x must be a frame fraction 0..1',
      'l01 overlay 1: y must be a frame fraction 0..1',
      'l01 overlay 2: y must be a plate fraction 0..1',
      'l01 overlay 3: to must be [x, y] frame fractions 0..1',
      'l01 overlay 4: to must be [x, y] plate fractions 0..1',
      'l01 overlay 5: from must be [x, y] frame fractions 0..1',
      'l01 overlay 6: from must be [x, y] frame fractions 0..1',
      'l01 overlay 6: box must be [x, y, w, h] frame fractions with w, h > 0, x + w <= 1 and y + h <= 1',
      'l01 overlay 7: box must be [x, y, w, h] plate fractions with w, h > 0, x + w <= 1 and y + h <= 1',
      'l01 overlay 8: box must be [x, y, w, h] frame fractions with w, h > 0, x + w <= 1 and y + h <= 1',
      'l01 overlay 9: paths must be a list of polylines, each 2 or more [x, y] frame fractions',
      'l01 overlay 10: paths must be a list of polylines, each 2 or more [x, y] plate fractions',
      'l01 overlay 11: paths must be a list of polylines, each 2 or more [x, y] frame fractions',
      'l01 overlay 12: paths must be a list of polylines, each 2 or more [x, y] frame fractions',
      'l01 overlay 13: paths must be a list of polylines, each 2 or more [x, y] frame fractions',
    ]);
  });
  test('frame-anchored overlays that point at the picture', () => {
    const fields = {
      label: { x: 0.5, y: 0.3, text: '효소' }, 'arrow-flow': { from: [0.1, 0.5], to: [0.9, 0.5] }, dim: { from: [0.1, 0.5], to: [0.9, 0.5] },
      tape: TAPE, 'pulse-path': { paths: [[[0.1, 0.5], [0.9, 0.5]]] }, squeeze: { x: 0.5, y: 0.5 }, ring: { x: 0.5, y: 0.5 }, frost: { box: [0.1, 0.1, 0.5, 0.5] }, reveal: { image: 'box' },
    };
    const frame = checkScript(line({ overlays: PIN_KINDS.map((k) => ({ kind: k, ...fields[k] })) }), ctx());
    assert.deepEqual(frame.errors, []);
    assert.deepEqual(frame.warnings, PIN_KINDS.map((k, i) => `l01 overlay ${i + 1}: ${k} points at the picture but is frame-anchored; add plate: true (design rule 7) or the camera move slides the picture under it`));
    const pinned = checkScript(line({ overlays: PIN_KINDS.map((k) => ({ kind: k, plate: true, ...fields[k] })) }), ctx());
    assert.deepEqual(pinned, { errors: [], warnings: [] });
    const cards = checkScript(line({ overlays: [{ kind: 'number', text: '절반' }, { kind: 'xmark' }, { kind: 'check' }, { kind: 'buckle' }, { kind: 'signal-bar' }, { kind: 'keyword', text: '동파' }] }), ctx());
    assert.deepEqual(cards, { errors: [], warnings: [] });
  });
  test('compare items and min', () => {
    const items = [{ label: '물', value: 100 }, { label: '얼음', value: 109, text: '+9%' }];
    const r = checkScript(line({ overlays: [
      { kind: 'compare', items: [{ label: '물', value: 100 }] },
      { kind: 'compare', items: 'bars' },
      { kind: 'compare', items: [{ label: '', value: 1 }, { label: 'b', value: 2 }] },
      { kind: 'compare', items: [{ label: 'a', value: Infinity }, { label: 'b', value: 2 }] },
      { kind: 'compare', items: [null, { label: 'b', value: 2 }] },
      { kind: 'compare', items, min: 100, claims: ['c-9'] },
      { kind: 'compare', items, min: 'low', claims: ['c-9'] },
      { kind: 'compare', items, min: 99.9, claims: ['c-9'] },
      { kind: 'compare', items: [{ label: 'a', value: 100 }, { label: 'b', value: 100 }], claims: ['c-9'] },
    ] }), ctx());
    const bad = 'items must be 2 or more {label, value} with a text label and a finite value';
    assert.deepEqual(r.errors, [
      `l01 overlay 1: ${bad}`, `l01 overlay 2: ${bad}`, `l01 overlay 3: ${bad}`, `l01 overlay 4: ${bad}`, `l01 overlay 5: ${bad}`,
      'l01 overlay 6: min 100 must be below every value (bar height is (value - min) / (max - min))',
      'l01 overlay 7: min low must be below every value (bar height is (value - min) / (max - min))',
    ]);
  });
  test('run times the engine divides by', () => {
    const r = checkScript(line({ overlays: [
      { kind: 'frost', plate: true, box: [0.1, 0.1, 0.5, 0.5], grow: 0 },
      { kind: 'tape', plate: true, ...TAPE, grow: -1 },
      { kind: 'number', text: '절반', count: 0 },
      { kind: 'pulse-path', plate: true, paths: [[[0.1, 0.5], [0.9, 0.5]]], period: 0, count: 'two' },
      { kind: 'timer', dur: Infinity, not_facts: ['10초'] },
      { kind: 'squeeze', plate: true, x: 0.5, y: 0.5, dur: 0.8, period: 0.9 },
      { kind: 'xmark', grow: 0.01 },
    ] }), ctx());
    const why = 'must be a number above 0; the engine divides by it (0 draws NaN, and frost or pulse-path throw and stop the export)';
    assert.deepEqual(r.errors, [
      `l01 overlay 1: grow ${why}`,
      `l01 overlay 2: grow ${why}`,
      `l01 overlay 3: count ${why}`,
      `l01 overlay 4: count ${why}`,
      `l01 overlay 4: period ${why}`,
      `l01 overlay 5: dur ${why}`,
    ]);
    assert.deepEqual(r.warnings, []);
  });
  test('counted texts that draw NaN or 0', () => {
    const r = checkScript(line({ overlays: [
      { kind: 'number', text: '2024.10.20', claims: ['c'] },
      { kind: 'number', text: '2024.10.20', static: true, claims: ['c'] },
      { kind: 'number', text: '정말.' },
      { kind: 'number', text: '그런데, 왜' },
      { kind: 'number', text: '27.', claims: ['c'] },
      { kind: 'number', text: '1995 년', claims: ['c'] },
      { kind: 'number', text: '1.2.3년', claims: ['c'] },
      { kind: 'number', text: 5 },
      { kind: 'number', text: '1,544배 ↓', claims: ['c'] },
      { kind: 'tape', plate: true, ...TAPE, text: '길이.' },
      { kind: 'tape', plate: true, ...TAPE, text: '1.2.3m', static: true, claims: ['c'] },
      { kind: 'tape', plate: true, ...TAPE, text: '그런데, 왜' },
    ] }), ctx());
    const num = "use static: true, or keep '.' and ',' out of the text except inside one number";
    const tape = "keep '.' out of the text except inside one number";
    assert.deepEqual(r.errors, [
      `l01 overlay 1: text "2024.10.20" counts "2024.10.20", which is not a number, so the engine draws NaN in its place; ${num}`,
      `l01 overlay 3: text "정말." counts ".", which is not a number, so the engine draws NaN in its place; ${num}`,
      `l01 overlay 4: text "그런데, 왜" counts ",", which is not a number, so the engine draws 0 in its place; ${num}`,
      'l01 overlay 8: text must be a string',
      `l01 overlay 10: text "길이." counts ".", which is not a number, so the engine draws NaN in its place; ${tape}`,
      `l01 overlay 11: text "1.2.3m" counts "1.2.3", which is not a number, so the engine draws NaN in its place; ${tape}`,
    ]);
    assert.deepEqual(r.warnings, []);
  });
  test('timer, chunk indexes and claims', () => {
    const r = checkScript(line({ overlays: [
      { kind: 'timer', plate: true, x: 0.8, y: 0.27, to: 27, claims: ['c'] },
      { kind: 'timer', to: '27초', claims: ['c'] },
      { kind: 'xmark', at_chunk: 2, until_chunk: -1 },
      { kind: 'xmark', at_chunk: 0, until_chunk: 1 },
      { kind: 'dim', plate: true, from: [0, 0.5], to: [1, 0.5], text: '60cm', claims: 'c-60' },
      { kind: 'dim', plate: true, from: [0, 0.5], to: [1, 0.5], claims: ['c-60', ''] },
      { kind: 'timer', to: 4.5, claims: ['c'] },
      { kind: 'timer', plate: true, x: 0.5, y: 0.5, dur: 1, claims: ['c'] },
      { kind: 'timer', plate: true, to: 0, claims: ['c'] },
    ] }), ctx());
    assert.deepEqual(r.errors, [
      'l01 overlay 1: a timer with "to" must not be plate:true; onFrame reads "to" as a point and the frame fails',
      'l01 overlay 2: to must be the final count, a whole number (the engine floors the count, so 4.5 shows 4)',
      "l01 overlay 3: at_chunk must index one of the line's 2 chunks; the builder writes null",
      "l01 overlay 3: until_chunk must index one of the line's 2 chunks; the builder writes null",
      'l01 overlay 5: claims must be a list of claim ids',
      'l01 overlay 6: claims must be a list of claim ids',
      'l01 overlay 7: to must be the final count, a whole number (the engine floors the count, so 4.5 shows 4)',
    ]);
    const card = 'a timer is a card; keep it frame-anchored (drop plate:true) so it does not ride the camera';
    assert.deepEqual(r.warnings, [
      'l01 overlay 5: shows "60cm" with no claims; numbers on screen need claims; facts.mjs trace will refuse it',
      `l01 overlay 8: ${card}`,
      `l01 overlay 9: ${card}`,
    ]);
  });
  test('numbers on screen without claims', () => {
    const refuse = 'numbers on screen need claims; facts.mjs trace will refuse it';
    const byHand = 'numbers on screen need claims; facts.mjs trace does not read this field, so check it against facts.json by hand';
    const r = checkScript(line({ overlays: [
      { kind: 'number', text: '2,046개' },
      { kind: 'number', text: '67%', sub: '2024년 기준', claims: [] },
      { kind: 'number', text: '절반', sub: '2024년 기준' },
      { kind: 'number', text: '9', not_facts: ['9'] },
      { kind: 'number', text: '9 / 12', not_facts: ['9'] },
      { kind: 'number', text: '19', not_facts: 'nine' },
      { kind: 'tape', plate: true, ...TAPE, text: '20m' },
      { kind: 'tape', plate: true, ...TAPE },
      { kind: 'timer', x: 0.8, y: 0.27, dur: 3.3, to: 27 },
      { kind: 'timer', not_facts: ['10초'] },
      { kind: 'compare', items: [{ label: '물', value: 100 }, { label: '얼음', value: 109, text: '+9%' }] },
      { kind: 'keyword', text: '1995' },
      { kind: 'dim', plate: true, from: [0, 0.5], to: [1, 0.5], text: '60cm' },
      { kind: 'timer' },
      { kind: 'number', text: '', sub: '3배' },
      { kind: 'label', plate: true, x: 0.5, y: 0.3, text: '36초' },
      { kind: 'arrow-flow', plate: true, from: [0.1, 0.5], to: [0.9, 0.5], text: '2배' },
      { kind: 'squeeze', plate: true, x: 0.5, y: 0.5, text: '1.5배' },
      { kind: 'buckle', skin: '피부 2mm', flesh: '속살' },
      { kind: 'dim', plate: true, from: [0, 0.5], to: [1, 0.5], text: '60cm 이상', claims: ['c-60'] },
    ] }), ctx());
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.warnings, [
      `l01 overlay 1: shows "2,046개" with no claims; ${refuse}`,
      `l01 overlay 2: shows "67% / 2024년 기준" with no claims; ${refuse}`,
      `l01 overlay 3: shows "절반 / 2024년 기준" with no claims; ${byHand}`,
      `l01 overlay 5: shows "9 / 12" with no claims; ${refuse}`,
      `l01 overlay 6: shows "19" with no claims; ${refuse}`,
      `l01 overlay 7: shows "20m" with no claims; ${refuse}`,
      `l01 overlay 9: shows "27초" with no claims; ${byHand}`,
      `l01 overlay 11: shows "물 / 얼음 / +9%" with no claims; ${byHand}`,
      `l01 overlay 12: shows "1995" with no claims; ${refuse}`,
      `l01 overlay 13: shows "60cm" with no claims; ${refuse}`,
      `l01 overlay 14: shows "10초" with no claims; ${byHand}`,
      `l01 overlay 15: shows "3배" with no claims; ${byHand}`,
      `l01 overlay 16: shows "36초" with no claims; ${refuse}`,
      `l01 overlay 17: shows "2배" with no claims; ${refuse}`,
      `l01 overlay 18: shows "1.5배" with no claims; ${refuse}`,
      `l01 overlay 19: shows "피부 2mm / 속살" with no claims; ${byHand}`,
    ]);
  });
});

describe('checkHandWritten', () => {
  test('scenes as first shots and overlays without chunks', () => {
    const sb = { scenes: [
      null,
      { id: 's01', image: 'top-empty', layers: [{ sprite: 'walker-ghost', path: [[0.5, 0.5]] }] },
      { image: 'gone', from_chunk: 3 },
    ], overlays: [7, { kind: 'tape', ...TAPE, text: '30m' }, { kind: 'xmark', at_chunk: 0 }, { kind: 'frosty' }] };
    const r = checkHandWritten(sb, 'hand.json', ctx());
    assert.deepEqual(r.errors, [
      'hand.json scene s01 layer 1: sprite "walker-ghost" is not in the sprites manifest',
      'hand.json scene 3: art/gone.png not found',
      "hand.json overlay 3: at_chunk must index one of the line's 0 chunks; the builder writes null",
      'hand.json overlay 4: unknown kind "frosty"; the engine skips it silently',
    ]);
    assert.deepEqual(r.warnings, [
      'hand.json overlay 2: tape points at the picture but is frame-anchored; add plate: true (design rule 7) or the camera move slides the picture under it',
      'hand.json overlay 2: shows "30m" with no claims; numbers on screen need claims; facts.mjs trace will refuse it',
    ]);
  });
});

describe('onScreen', () => {
  test('splits time into spans with the same overlays', () => {
    const A = { kind: 'tape', start: 0, end: 5 };
    const B = { kind: 'timer', start: 1, end: 3 };
    const C = { kind: 'number', start: 2, end: 4 };
    const D = { kind: 'xmark', start: 6, end: 7 };
    const E = { kind: 'check', start: 7, end: 8 };
    const ignored = [null, { kind: 'dim_bg', start: 0, end: 9 }, { kind: 'ring', start: null, end: 3 }, { kind: 'ring', start: 2, end: '4' }, { kind: 'ring', start: 3, end: 3 }];
    assert.deepEqual(onScreen([A, B, C, D, E, ...ignored]), [
      { start: 0, end: 1, on: [A] },
      { start: 1, end: 2, on: [A, B] },
      { start: 2, end: 3, on: [A, B, C] },
      { start: 3, end: 4, on: [A, C] },
      { start: 4, end: 5, on: [A] },
      { start: 6, end: 7, on: [D] },
      { start: 7, end: 8, on: [E] },
    ]);
    const F = { kind: 'tape', start: 0, end: 2 };
    const G = { kind: 'tape', start: 0, end: 2 };
    const H = { kind: 'tape', start: 2, end: 4 };
    assert.deepEqual(onScreen([F, G, H, { ...H }]), [{ start: 0, end: 2, on: [F, G] }, { start: 2, end: 4, on: [H, { ...H }] }]);
    assert.deepEqual(onScreen([]), []);
    assert.deepEqual(onScreen([{ kind: 'stamp', start: 0, end: 3 }, { kind: 'dim_bg', start: 0, end: 3 }]), []);
  });
  test('dim_bg never splits a span', () => {
    const A = { kind: 'tape', start: 0, end: 4 };
    const B = { kind: 'dim_bg', start: 1, end: 2 };
    assert.deepEqual(onScreen([A, B]), [{ start: 0, end: 4, on: [A] }]);
  });
});

describe('checkStoryboard', () => {
  test('a fitted storyboard is clean', () => {
    assert.deepEqual(checkStoryboard(goodSb(), MAX_OVERLAYS), { errors: [], warnings: [] });
    assert.equal(FIT_PAD, 0.3);
    assert.equal(MIN_MOVE, 0.3);
  });
  test('shape', () => {
    for (const sb of [null, {}, { scenes: [] }, { scenes: [], overlays: {} }]) {
      assert.deepEqual(checkStoryboard(sb, 2), { errors: ['storyboard: scenes and overlays must be lists'], warnings: [] });
    }
  });
  test('scene times and layer ends', () => {
    const sb = { scenes: [
      null,
      { id: 'x', start: 'a', end: 2 },
      { start: 3, end: 3 },
      { id: 'y', start: 3, end: null },
      sbScene({ id: 'l05-1', layers: [
        null, { sprite: 'a' }, { sprite: 'b', t: 'x' }, { sprite: 'c', t: [0, null] }, { sprite: 'd', t: [null, 2] },
        { sprite: 'walker-navy', t: [0.3, 3.8] }, { sprite: 'walker-elder', t: [0, 3.71] }, { sprite: 'walker-suit', t: [0.3, 4.2] },
        { sprite: 'walker-child', t: [3.620000000000002, 3.62] }, { sprite: 'walker-grey', t: [3.3, 3.7] },
      ] }),
      sbScene({ id: 'l06-1', start: 4, end: 4.2, image: 'box', layers: [{ sprite: 'walker-navy', t: [0, 0.1] }] }),
      sbScene({ id: 'l07-1', start: 4.2, end: 6, image: 'box', layers: 'x' }),
    ], overlays: [] };
    const { errors, warnings } = checkStoryboard(sb, 2);
    const rebuild = 'rebuild the storyboard (fitMotion) or shorten t';
    const jump = 'so the figure jumps to its path end; start t earlier (fitMotion pulls in only the end) or drop the layer';
    assert.deepEqual(errors, [
      'scene 1: start and end must be numbers with start < end',
      'scene x: start and end must be numbers with start < end',
      'scene 3: start and end must be numbers with start < end',
      'scene y: start and end must be numbers with start < end',
      `scene l05-1: layer 6 (walker-navy) t ends at 3.80s of a 4.00s scene (end by 3.70s); the walker arrives only 0.20s before the cut; ${rebuild}`,
      `scene l05-1: layer 7 (walker-elder) t ends at 3.71s of a 4.00s scene (end by 3.70s); the walker arrives only 0.29s before the cut; ${rebuild}`,
      `scene l05-1: layer 8 (walker-suit) t ends at 4.20s of a 4.00s scene (end by 3.70s); the walker would vanish mid-path; ${rebuild}`,
      `scene l05-1: layer 9 (walker-child) t [3.62, 3.62] walks its path in 0.00s (under 0.30s), ${jump}`,
      `scene l06-1: layer 1 (walker-navy) t [0, 0.1] walks its path in 0.10s (under 0.30s), ${jump}`,
    ]);
    assert.deepEqual(warnings, []);
  });
  test('layered shots that jump at the cut', () => {
    const walkers = (...names) => names.map((sprite) => ({ sprite, path: [[0.5, 0.8], [0.5, 0.2]] }));
    const sb = { scenes: [
      sbScene({ id: 'a', motion: 'push-in', layers: walkers('walker-navy', 'walker-elder') }),
      sbScene({ id: 'b', motion: 'push-in', layers: walkers('walker-elder', 'walker-navy') }),
      sbScene({ id: 'c', motion: 'push-in', focus: [0.4, 0.5], layers: walkers('walker-elder', 'walker-navy') }),
      sbScene({ id: 'd', motion: 'push-in', focus: [0.4, 0.5], layers: walkers('walker-elder') }),
      sbScene({ id: 'e', image: 'box', motion: 'push-in', focus: [0.4, 0.5], layers: walkers('walker-elder') }),
      sbScene({ id: 'f', image: 'box', motion: 'push-in', focus: [0.4, 0.5] }),
      sbScene({ id: 'g', image: 'box', motion: 'push-in', focus: [0.4, 0.5], layers: [null] }),
      sbScene({ id: 'h', image: 'box', motion: 'push-in', focus: [0.4, 0.5], layers: [7] }),
      sbScene({ id: 'i', image: 'box', motion: 'push-in', focus: [0.4, 0.5], layers: [] }),
    ], overlays: [] };
    assert.deepEqual(checkStoryboard(sb, 2).warnings, [
      'scene b: same plate "top-empty", framing and cast as scene a; movers jump at the cut; change zoom/focus or the cast',
      'scene h: same plate "box", framing and cast as scene g; movers jump at the cut; change zoom/focus or the cast',
    ]);
  });
  test('overlay times and timed runs', () => {
    const sb = { scenes: [], overlays: [
      'x',
      { kind: 'tape', start: null, end: 3 },
      { kind: 'number', start: 4, end: 2 },
      { kind: 'ring', start: 4 },
      { kind: 'timer', start: 0, end: 3 },
      { kind: 'signal-bar', start: 4, end: 6, dur: 2 },
      { kind: 'timer', start: 7, end: 9, dur: 2.5 },
      { kind: 'timer', start: 10, end: 12, dur: 1.7 },
      { kind: 'signal-bar', start: 13, end: 15, dur: 'long' },
      { kind: 'timer', start: 16, end: 19.54, dur: 3.5 },
      { kind: 'timer', start: 20, end: 21, dur: null },
      { kind: 'timer', start: 22, end: 22.4, dur: 0.2 },
    ] };
    const { errors, warnings } = checkStoryboard(sb, 2);
    const nulls = 'start and end must be numbers with start < end; an out-of-range at_chunk or until_chunk writes null (a null start draws it from 0 s, a null end never)';
    const trim = 'rebuild the storyboard so fitMotion trims it';
    assert.deepEqual(errors, [
      'overlay 1: must be an object',
      `overlay 2 (tape): ${nulls}`,
      `overlay 3 (number): ${nulls}`,
      `overlay 4 (ring): ${nulls}`,
    ]);
    assert.deepEqual(warnings, [
      'overlay at 0.00s: timer has no dur, so it runs the whole 3.00s and never shows its end state',
      `overlay at 4.00s: signal-bar dur 2.00s leaves 0.00s of its 2.00s for the end state (fitMotion leaves 0.30s); ${trim}`,
      `overlay at 7.00s: timer dur 2.50s leaves 0.00s of its 2.00s for the end state (fitMotion leaves 0.30s); ${trim}`,
      `overlay at 13.00s: signal-bar dur "long" leaves no time of its 2.00s for the end state (fitMotion leaves 0.30s); ${trim}`,
      `overlay at 16.00s: timer dur 3.50s leaves 0.04s of its 3.54s for the end state (fitMotion leaves 0.30s); ${trim}`,
      'overlay at 20.00s: timer has no dur, so it runs the whole 1.00s and never shows its end state',
      `overlay at 22.00s: timer dur 0.20s leaves 0.20s of its 0.40s for the end state (fitMotion leaves 0.30s); ${trim}`,
    ]);
  });
  test('grow-driven overlays cut before they finish', () => {
    const sb = { scenes: [], overlays: [
      { kind: 'reveal', image: 'box-frozen', start: 12.29, end: 13.49, grow: 1.8 },
      { kind: 'reveal', image: 'box-frozen', start: 20, end: 21.6 },
      { kind: 'frost', box: [0.1, 0.1, 0.5, 0.5], start: 30, end: 31 },
      { kind: 'tape', from: [0.1, 0.5], to: [0.9, 0.5], start: 40, end: 40.5, grow: 0.01 },
      { kind: 'compare', items: [], start: 50, end: 50.5 },
      { kind: 'compare', items: [], start: 60, end: 61, grow: 'slow' },
      { kind: 'number', text: '36개', start: 70, end: 70.2 },
    ] };
    const { errors, warnings } = checkStoryboard(sb, 2);
    assert.deepEqual(errors, []);
    const cut = 'so the cut comes before it finishes; shorten grow or start it earlier (fitMotion does not trim grow)';
    assert.deepEqual(warnings, [
      `overlay at 12.29s: reveal grows for 1.80s but is on screen 1.20s, ${cut}`,
      `overlay at 30.00s: frost grows for 2.00s but is on screen 1.00s, ${cut}`,
      `overlay at 50.00s: compare grows for 0.90s but is on screen 0.50s, ${cut}`,
    ]);
    assert.deepEqual(GROW, { tape: 1.2, frost: 2, compare: 0.9, reveal: 1.6 });
  });
  test('too many overlays and the same idea twice', () => {
    const sb = { scenes: [], overlays: [
      { kind: 'dim_bg', start: 0, end: 20 },
      { kind: 'tape', start: 0.6, end: 8.4 },
      { kind: 'timer', start: 2.2, end: 8.4, dur: 5.4 },
      { kind: 'signal-bar', start: 2.5, end: 8.4, dur: 5 },
      { kind: 'number', start: 10, end: 12 },
      { kind: 'timer', start: 13, end: 15, dur: 1 },
      { kind: 'timer', start: 14, end: 16, dur: 1 },
      7,
      { kind: 'frosty', start: 10, end: 12 },
      { kind: 'xmark', start: 10, end: 12 },
    ] };
    const { errors, warnings } = checkStoryboard(sb, 2);
    assert.deepEqual(errors, [
      'overlay 8: must be an object',
      'overlay at 2.50s: 3 overlays on screen until 8.40s (tape, timer, signal-bar); at most 2 at a time',
    ]);
    assert.deepEqual(warnings, [
      'overlay at 2.50s: timer and signal-bar both show time until 8.40s; same idea twice, keep one',
      'overlay at 14.00s: timer and timer both show time until 15.00s; same idea twice, keep one',
    ]);
    assert.deepEqual(checkStoryboard(sb, 3).errors, ['overlay 8: must be an object']);
    assert.deepEqual(checkStoryboard(sb, 1).errors, [
      'overlay 8: must be an object',
      'overlay at 2.20s: 2 overlays on screen until 2.50s (tape, timer); at most 1 at a time',
      'overlay at 2.50s: 3 overlays on screen until 8.40s (tape, timer, signal-bar); at most 1 at a time',
      'overlay at 10.00s: 2 overlays on screen until 12.00s (number, xmark); at most 1 at a time',
      'overlay at 14.00s: 2 overlays on screen until 15.00s (timer, timer); at most 1 at a time',
    ]);
  });
  test('held overlays that blink', () => {
    const box = [0.29, 0.24, 0.59, 0.43];
    const sb = { scenes: [], overlays: [
      { kind: 'tape', plate: true, ...TAPE, text: '20m', start: 9.71, end: 14.29 },
      { kind: 'tape', plate: true, ...TAPE, text: '20m', grow: 0.01, start: 14.37, end: 18.21 },
      { kind: 'frost', plate: true, box, start: 10.71, end: 13.49 },
      { kind: 'frost', plate: true, box, grow: 0.01, start: 13.49, end: 16.77 },
      { kind: 'number', text: '2,046개', start: 2.03, end: 5.29 },
      { kind: 'number', text: '97%', start: 5.37, end: 9.5 },
      { kind: 'xmark', start: 20, end: 21 },
      { kind: 'xmark', start: 21.1, end: 22 },
      { kind: 'xmark', x: 0.5, start: 23, end: 24 },
      { kind: 'xmark', start: 24.05, end: 25 },
      { kind: 'check', start: 26, end: 27 },
      { kind: 'check', start: 27.05, end: 28 },
    ] };
    const hold = 'so it blinks off; write the repeat with "at": -0.08 (the next scene\'s start) to hold it';
    assert.deepEqual(checkStoryboard(sb, 2), { errors: [], warnings: [
      `overlay at 14.37s: tape ends at 14.29s and the same tape restarts 0.08s later, ${hold}`,
      `overlay at 27.05s: check ends at 27.00s and the same check restarts 0.05s later, ${hold}`,
    ] });
    assert.equal(BLINK, 0.1);
  });
  test('pinned overlays over two pictures', () => {
    const sb = { scenes: [
      sbScene({ id: 'l04-1', start: 10, end: 13.13, image: 'crosswalk-stop' }),
      sbScene({ id: 'l04-2', start: 13.13, end: 16, image: 'foot-feel' }),
      sbScene({ id: 'l05-1', start: 16, end: 18, image: 'foot-feel', motion: 'push-in' }),
    ], overlays: [
      { kind: 'ring', plate: true, x: 0.5, y: 0.5, start: 10.5, end: 13.18 },
      { kind: 'ring', plate: true, x: 0.5, y: 0.5, start: 13.18, end: 17 },
      { kind: 'arrow-flow', from: [0.1, 0.5], to: [0.9, 0.5], start: 10, end: 16 },
      { kind: 'ring', plate: true, x: 0.2, y: 0.2, start: 10, end: 13.13 },
    ] };
    assert.deepEqual(checkStoryboard(sb, 3), { errors: [], warnings: [
      "overlay at 10.50s: plate:true ring is on screen in scene l04-1 (crosswalk-stop), scene l04-2 (foot-feel); on another picture it sits on the same plate spot, so it jumps; keep it inside one shot (an until_chunk at the next shot's from_chunk still runs 0.05 s into it)",
    ] });
  });
});

describe('builtFrom', () => {
  test('scene ids name the script lines', () => {
    const sb = (...ids) => ({ scenes: ids.map((id) => (id === null ? null : { id })), overlays: [] });
    assert.equal(builtFrom(sb(null, 7, 'l04-1'), { lines: [null, { id: 'l04' }] }), true);
    assert.equal(builtFrom(sb('l09-law-2'), { lines: [{ id: 'l09-law' }, { id: '' }] }), true);
    assert.equal(builtFrom(sb('s01'), goodScript()), false);
    assert.equal(builtFrom(sb('l04-1'), null), false);
    assert.equal(builtFrom(sb('l04-1'), { lines: 'x' }), false);
    assert.equal(builtFrom(sb(), goodScript()), false);
  });
});

describe('stills', () => {
  test('captureName matches the page file names', () => {
    assert.equal(captureName(0.5), '0m0_5s');
    assert.equal(captureName(75.04), '1m15_0s');
    assert.equal(captureName(59.99), '0m60_0s');
  });
  test('review times for scenes that move, and the scene after a layered one', () => {
    assert.deepEqual(stills(goodSb()), [0.5, 2, 3.65, 4.1, 4.5, 6, 7.65, 8.1, 8.5, 8.65]);
    assert.deepEqual(STILLS, { lead: 0.5, tail: 0.35, short: 1.2, after: 0.1 });
  });
  test('short scenes, overlap edges, motion diagrams and duplicates', () => {
    const sb = { scenes: [
      null,
      { start: 'a', end: 1 },
      { start: 2, end: 2 },
      { start: 3, end: 'x', layers: [{ sprite: 'a' }] },
      { id: 'tiny', start: 10, end: 10.4, layers: [{ sprite: 'a' }] },
      { id: 'close', start: 30, end: 30.76, layers: [{ sprite: 'a' }] },
      { id: 'after', start: 40, end: 42 },
      { id: 'before', start: 50, end: 52 },
      { id: 'none', start: 60, end: 62, layers: [] },
      { id: 'frost', start: 70, end: 72 },
      { id: 'walk', start: 78, end: 80, layers: [{ sprite: 'a' }] },
      { id: 'blip', start: 80, end: 80.1 },
      { id: 'ring', start: 90, end: 92 },
    ], overlays: [
      null,
      { kind: 'tape', start: 38, end: 40 },
      { kind: 'tape', start: 52, end: 54 },
      { kind: 'timer', start: null, end: 72 },
      { kind: 'tape', start: 60 },
      { kind: 'number', start: 60, end: 62 },
      { kind: 'frost', start: 71.9, end: 75 },
      { kind: 'ring', start: 90, end: 92 },
    ] };
    assert.deepEqual(stills(sb), [10.2, 30.1, 30.38, 40.1, 70.5, 71, 71.65, 78.5, 79, 79.65, 80.05, 90.5, 91, 91.65]);
  });
});

describe('frame positions', () => {
  const plate = { w: 1024, h: 1536 };
  test('camera at the start, middle and end of a move', () => {
    const pan = { motion: 'pan-right' };
    const at = (p, scene = pan) => camera(scene, plate, p);
    near(at(0).x, -220);
    near(at(0).y, -115.2);
    near(at(0).k, 1.4);
    near(at(1).x, -133.6);
    near(at(0.25).x, -214.6);
    near(at(0.75).x, -139);
    near(at(1.5).x, -133.6);
    near(at(1, { motion: 'pan-right', focus: [0, 0] }).x, 0);
    near(at(1, { motion: 'pan-right', focus: [1, 1] }).x, -353.6);
    near(at(1, { motion: 'pan-right', focus: [1, 1] }).y, -230.4);
    near(at(0, { motion: 'zoom-in' }).k, 1.25 * 1.03);
    near(at(0, { motion: 'toString' }).k, 1.25 * 1.03);
    near(at(1, { zoom: [1, 1.25] }).k, 1.5625);
    near(at(0, { motion: 'push-in', zoom: [1, 1.05] }).x, -100);
    near(at(0, { motion: 'push-in', zoom: [1, 1.05] }).y, 0);
  });
  test('toFrame and the bands to avoid', () => {
    const cam = camera({ motion: 'push-in', zoom: [1, 1.05] }, plate, 1);
    const [x, y] = toFrame([0.29, 0.79], cam, plate);
    near(x, 257.76 / 1080);
    near(y, 1544.64 / 1920);
    assert.deepEqual(bandsHit([0.5, 0.5]), []);
    assert.deepEqual(bandsHit([0.5, 0.6]), ['caption band']);
    assert.deepEqual(bandsHit([0.5, 0.645]), ['caption band']);
    assert.deepEqual(bandsHit([0.5, 0.646]), []);
    assert.deepEqual(bandsHit([0.5, 0.8]), []);
    assert.deepEqual(bandsHit([0.5, 0.81]), ['bottom 20%']);
    assert.deepEqual(bandsHit([0.5, 1]), ['bottom 20%']);
    assert.deepEqual(bandsHit([0.5, 1.2]), ['off-screen']);
    assert.deepEqual(bandsHit([0.5, -0.1]), ['off-screen']);
    assert.deepEqual(bandsHit([-0.1, 0.62]), ['off-screen', 'caption band']);
    assert.deepEqual(bandsHit([1.1, 0.9]), ['off-screen', 'bottom 20%']);
  });
  test('pngSize', () => {
    assert.deepEqual(pngSize(png(1024, 1536), 'a.png'), { w: 1024, h: 1536 });
    assert.throws(() => pngSize(Buffer.from('png'), 'x/a.png'), /^Error: x\/a\.png: not a PNG$/);
    const gif = png(1, 1);
    gif.write('GIF', 1, 'latin1');
    assert.throws(() => pngSize(gif, 'b.png'), /not a PNG/);
    const chunk = png(1, 1);
    chunk.write('IDAT', 12, 'latin1');
    assert.throws(() => pngSize(chunk, 'c.png'), /not a PNG/);
  });
});

describe('episode page sources', () => {
  test('engineKinds', () => {
    assert.equal(engineKinds(null), null);
    assert.equal(engineKinds('const X = {\n};'), null);
    assert.deepEqual(engineKinds(engineSrc(['keyword', 'arrow-flow', 'dim_bg'])), ['keyword', 'arrow-flow', 'dim_bg']);
  });
  test('configPlates and configSprites', () => {
    assert.equal(configPlates(null), null);
    assert.equal(configPlates("export default { storyboard: '../storyboard.json' };"), null);
    assert.deepEqual(configPlates("plates: { 'a-b': '../a.png', c: '../c.png',\n  \"d\": '/x/d.png' },"), ['a-b', 'c', 'd']);
    assert.deepEqual(configPlates(config()), ['top-empty', 'signal', 'box']);
    assert.equal(configSprites(null), null);
    assert.equal(configSprites('plates: {}'), null);
    assert.deepEqual(configSprites('sprites: [],'), []);
    assert.deepEqual(configSprites("sprites: ['../a.json', \"/b.json\"],"), ['../a.json', '/b.json']);
  });
  test('usage', () => {
    const u = usage(goodScript(), { scenes: [null, { image: 'extra', layers: [] }], overlays: [null, { kind: 'frosty', plate: true }] });
    assert.deepEqual([...u.kinds], Object.keys(KINDS));
    assert.equal(u.plate, true);
    assert.equal(u.layers, true);
    assert.deepEqual([...u.images], ['top-empty', 'box', 'signal', 'extra']); // box first: l04's reveal image
    assert.deepEqual(usage(null, null), { kinds: new Set(), plate: false, layers: false, images: new Set() });
    const v = usage({ lines: [null, { shots: 'x', overlays: 'y' }, { shots: [7, { image: '', layers: [{}] }], overlays: [{ kind: 'ring' }] }] }, null);
    assert.deepEqual(v, { kinds: new Set(['ring']), plate: false, layers: true, images: new Set() });
  });
});

describe('helpers', () => {
  test('spriteNames', () => {
    assert.deepEqual(spriteNames({ sprites: [{ name: 'a' }, { name: 'b', empty: true }, { name: '' }, null, { name: 'c', empty: false }] }, 'f'), ['a', 'c']);
    assert.throws(() => spriteNames({ sprites: {} }, 'x/sprites.json'), /^Error: x\/sprites\.json: not a sprites manifest \(no sprites list\)$/);
    assert.throws(() => spriteNames(null, 'f'), /not a sprites manifest/);
  });
  test('parseArgs', () => {
    assert.deepEqual(parseArgs(['check', 'ep']), { cmd: 'check', target: 'ep', opts: { sprites: [] } });
    assert.deepEqual(parseArgs(['stills', 'sb.json']), { cmd: 'stills', target: 'sb.json', opts: { sprites: [] } });
    assert.deepEqual(parseArgs(['check', 'ep', '--script', 's.json', '--storyboard', 'b.json', '--sprites', 'a.json', '--sprites', 'b.json', '--max-overlays', '3']), {
      cmd: 'check', target: 'ep', opts: { sprites: ['a.json', 'b.json'], script: 's.json', storyboard: 'b.json', maxOverlays: 3 },
    });
    assert.deepEqual(parseArgs(['frame', 'sb.json', 'l04-1', '0.29,0.79', '.5,1']), {
      cmd: 'frame', target: 'sb.json', opts: { scene: 'l04-1', points: [[0.29, 0.79], [0.5, 1]] },
    });
    for (const argv of [
      [], ['x'], ['check'], ['check', '--script'], ['stills'], ['stills', 'a', 'b'],
      ['check', 'ep', '--force', 'x'], ['check', 'ep', '--script'], ['check', 'ep', '--script', '--storyboard'],
      ['check', 'ep', '--max-overlays', '0'], ['check', 'ep', '--max-overlays', '1.5'], ['check', 'ep', '--max-overlays', 'two'],
      ['frame', 'sb.json'], ['frame', 'sb.json', 'l04-1'], ['frame', 'sb.json', '', '0.5,0.5'], ['frame', 'sb.json', 'l04-1', '1.5,0.2'],
      ['frame', 'sb.json', 'l04-1', '0.5'], ['frame', 'sb.json', 'l04-1', 'a,b'], ['frame', 'sb.json', 'l04-1', '0.5,0.5', '-0.1,0.5'],
    ]) assert.equal(parseArgs(argv), null, argv.join(' '));
  });
});

describe('cli', () => {
  test('usage', () => {
    for (const argv of [[], ['x'], ['check'], ['stills'], ['frame'], ['frame', 'sb.json', 'l04-1'], ['check', 'ep', '--max-overlays', '0']]) {
      const o = io();
      assert.equal(main(argv, o.io), 2);
      assert.deepEqual(o.err, [USAGE]);
      assert.deepEqual(o.out, []);
    }
  });
  test('check an episode without a storyboard', () => {
    const d = episode();
    const o = io();
    assert.equal(main(['check', d], o.io), 0);
    assert.deepEqual(o.err, []);
    assert.deepEqual(o.out, ['0 error(s), 0 warning(s).']);
  });
  test('check an episode with its storyboard, then break it', () => {
    const d = episode(sbScript());
    const sbFile = path.join(d, 'storyboard.json');
    write(sbFile, goodSb());
    age(path.join(d, 'script.json'), 60);
    let o = io();
    assert.equal(main(['check', d], o.io), 0);
    assert.deepEqual(o.err, []);
    assert.deepEqual(o.out, ['0 error(s), 0 warning(s).']);
    const sb = goodSb();
    sb.overlays.push({ start: 4.5, end: 8, kind: 'signal-bar', dur: 3 });
    sb.scenes[1].layers[0].t = [0.3, 4.2];
    write(sbFile, sb);
    o = io();
    assert.equal(main(['check', d], o.io), 1);
    assert.deepEqual(o.err, [
      'error: scene l05-1: layer 1 (walker-navy) t ends at 4.20s of a 4.00s scene (end by 3.70s); the walker would vanish mid-path; rebuild the storyboard (fitMotion) or shorten t',
      'error: overlay at 4.50s: 3 overlays on screen until 8.00s (tape, timer, signal-bar); at most 2 at a time',
      'warning: overlay at 4.50s: timer and signal-bar both show time until 8.00s; same idea twice, keep one',
      'warning: storyboard.json overlays (8) do not match the 7 in script.json (kind by kind, in order); rebuild storyboard',
    ]);
    assert.deepEqual(o.out, ['2 error(s), 2 warning(s).']);
    o = io();
    assert.equal(main(['check', d, '--max-overlays', '3'], o.io), 1);
    assert.deepEqual(o.out, ['1 error(s), 2 warning(s).']);
  });
  test('stale storyboards', () => {
    const d = episode(sbScript());
    const sbFile = path.join(d, 'storyboard.json');
    const sb = goodSb();
    write(sbFile, sb);
    age(sbFile, 120);
    let o = io();
    assert.equal(main(['check', d], o.io), 0);
    assert.deepEqual(o.err, ['warning: storyboard.json is older than script.json; rebuild storyboard']);
    sb.overlays[5] = { ...sb.overlays[5], kind: 'check' };
    write(sbFile, sb);
    o = io();
    assert.equal(main(['check', d], o.io), 0);
    assert.deepEqual(o.err, ['warning: storyboard.json overlays (7) do not match the 7 in script.json (kind by kind, in order); rebuild storyboard']);
    // A copied or handed-over storyboard can be newer on disk yet older in content; the fingerprint still matches here.
    const script = sbScript();
    script.lines[3].overlays[0] = null;
    write(path.join(d, 'script.json'), script);
    age(path.join(d, 'script.json'), 60);
    const fresh = goodSb();
    fresh.overlays[4] = 7;
    write(sbFile, fresh);
    o = io();
    assert.equal(main(['check', d], o.io), 1);
    assert.deepEqual(o.err, ['error: l07 overlay 1: must be an object', 'error: overlay 5: must be an object']);
  });
  test('a storyboard the script did not build (hand-written)', () => {
    const d = episode();
    const file = path.join(d, 'hand.json');
    write(file, {
      schema: 'storyboard/1',
      scenes: [
        { id: 's01', start: 0, end: 8.4, image: 'top-empty', motion: 'push-in', layers: [
          { sprite: 'walker-navy', path: [[0.52, 0.86], [0.52, 0.2]], t: [2.2, 7.6] },
          { sprite: 'walker-ghost', path: [[0.5, 0.5]] },
        ] },
        7,
        { start: 8.4, end: 9, image: 'no-such-plate' },
      ],
      overlays: [
        { start: 0.6, end: 8.4, kind: 'tape', plate: true, ...TAPE, grow: 1.4, text: '30m' },
        { start: 2.2, end: 8.4, kind: 'timer', dur: 5.4, to: 30 },
        { start: 3, end: 8.4, kind: 'frosty' },
        'x',
      ],
    });
    age(file, 120);
    page(d, 'video-test', config({ storyboard: '../hand.json', plates: ['top-empty', 'no-such-plate'] }), engineSrc(['timer', 'number'], { layerAt: false }));
    page(d, 'video', config(), engineSrc([]));
    const o = io();
    assert.equal(main(['check', d, '--storyboard', file], o.io), 1);
    assert.deepEqual(o.err, [
      'error: scene 2: start and end must be numbers with start < end',
      'error: overlay 4: must be an object',
      'error: hand.json scene s01 layer 2: sprite "walker-ghost" is not in the sprites manifest',
      'error: hand.json scene 3: art/no-such-plate.png not found',
      'error: hand.json overlay 3: unknown kind "frosty"; the engine skips it silently',
      `error: video-test/js/scenes.js has no "tape" overlay; ${COPY} or it draws nothing`,
      `error: video-test/js/scenes.js has no layerAt, so sprite layers draw nothing; ${COPY}`,
      'warning: hand.json overlay 1: shows "30m" with no claims; numbers on screen need claims; facts.mjs trace will refuse it',
      'warning: hand.json overlay 2: shows "30초" with no claims; numbers on screen need claims; facts.mjs trace does not read this field, so check it against facts.json by hand',
    ]);
    assert.deepEqual(o.out, ['7 error(s), 2 warning(s).']);
  });
  test('episode pages that load the storyboard', () => {
    const d = episode(sbScript());
    write(path.join(d, 'storyboard.json'), goodSb());
    age(path.join(d, 'script.json'), 60);
    const all = engineSrc(Object.keys(KINDS));
    page(d, 'video', config(), all);
    page(d, 'video-soft-m', config({ storyboard: '../storyboard-soft-m.json' }));
    page(d, 'video-old', config({ sprites: [], plates: ['top-empty'] }), engineSrc(['keyword', 'number', 'dim_bg', 'xmark'], { onFrame: false, layerAt: false }));
    const base = path.basename(d);
    page(d, 'video-abs', config({ storyboard: `/${base}/storyboard.json`, sprites: [`/${base}/art/sprites/sprites.json`], plates: null }));
    page(d, 'video-nosprites', config({ sprites: null }), '// not an engine copy');
    page(d, 'video-x', config({ storyboard: null }), all);
    page(d, 'videos', config(), '');
    fs.mkdirSync(path.join(d, 'video-empty'));
    write(path.join(d, 'video-notes.txt'), 'notes');
    let o = io();
    assert.equal(main(['check', d], o.io), 1);
    assert.deepEqual(o.err, [
      `error: video-abs/js/scenes.js is missing or has no OVERLAY table; ${COPY}`,
      `error: video-nosprites/js/scenes.js is missing or has no OVERLAY table; ${COPY}`,
      `error: video-old/js/scenes.js has no "tape" overlay; ${COPY} or it draws nothing`,
      `error: video-old/js/scenes.js has no "timer" overlay; ${COPY} or it draws nothing`,
      `error: video-old/js/scenes.js has no "signal-bar" overlay; ${COPY} or it draws nothing`,
      `error: video-old/js/scenes.js has no onFrame, so plate:true overlays are drawn at frame fractions; ${COPY}`,
      `error: video-old/js/scenes.js has no layerAt, so sprite layers draw nothing; ${COPY}`,
      'error: video-old/story.config.js plates has no "signal"; the scene draws "missing image" and no layers',
      'error: video-old/story.config.js plates has no "box"; the scene draws "missing image" and no layers',
      'error: video-old/story.config.js sprites does not load ../art/sprites/sprites.json; its sprites draw nothing',
    ]);
    assert.deepEqual(o.out, ['10 error(s), 0 warning(s).']);
    const soft = path.join(d, 'storyboard-soft-m.json');
    write(soft, goodSb());
    o = io();
    assert.equal(main(['check', d, '--storyboard', soft], o.io), 1);
    assert.deepEqual(o.err, [`error: video-soft-m/js/scenes.js is missing or has no OVERLAY table; ${COPY}`]);
    page(d, 'video-soft-m', undefined, all);
    o = io();
    assert.equal(main(['check', d, '--storyboard', soft], o.io), 0);
    assert.deepEqual(o.out, ['0 error(s), 0 warning(s).']);
  });
  test('a page for an overlay-only script', () => {
    const d = episode(line({ shots: [{ image: 'box' }], overlays: [{ kind: 'xmark' }] }));
    page(d, 'video', config({ plates: ['box'] }), engineSrc(['xmark'], { onFrame: false, layerAt: false }));
    const o = io();
    assert.equal(main(['check', d], o.io), 0);
    assert.deepEqual(o.out, ['0 error(s), 0 warning(s).']);
  });
  test('script errors, missing plates and sprites', () => {
    const script = goodScript();
    script.lines[0].shots[0].image = 'missing';
    script.lines[0].shots[0].layers.push(layer({ sprite: 'walker-suit' }));
    const d = episode(script);
    let o = io();
    assert.equal(main(['check', d], o.io), 1);
    assert.deepEqual(o.err, [
      'error: l04 shot 1: art/missing.png not found',
      'error: l04 shot 1 layer 3: sprite "walker-suit" is not in the sprites manifest',
    ]);
    const extra = path.join(d, 'more-sprites.json');
    write(extra, { sprites: [{ name: 'walker-suit' }] });
    o = io();
    assert.equal(main(['check', d, '--sprites', path.join(d, 'art/sprites/sprites.json'), '--sprites', extra], o.io), 1);
    assert.deepEqual(o.err, ['error: l04 shot 1: art/missing.png not found']);
    write(extra, { sprites: [{ name: 'walker-suit', file: 'c.png', empty: true }, null, { name: '', empty: true }] });
    o = io();
    assert.equal(main(['check', d, '--sprites', path.join(d, 'art/sprites/sprites.json'), '--sprites', extra], o.io), 1);
    assert.deepEqual(o.err, [
      'error: l04 shot 1: art/missing.png not found',
      'error: l04 shot 1 layer 3: sprite "walker-suit" is marked empty in the sprites manifest (sprites.js skips it)',
    ]);
    fs.rmSync(path.join(d, 'art/sprites'), { recursive: true });
    o = io();
    assert.equal(main(['check', d], o.io), 1);
    assert.deepEqual(o.err, [
      'error: l04 shot 1: art/missing.png not found',
      'error: l04 shot 1: layers need a sprites manifest (art/sprites/sprites.json or --sprites)',
    ]);
  });
  test('explicit script and storyboard files', () => {
    const d = episode();
    const other = path.join(d, 'drafts', 'script-b.json');
    write(other, line({ shots: [{ image: 'box' }], overlays: [{ kind: 'number', text: '27%' }] }));
    const sbFile = path.join(d, 'storyboard-soft-m.json');
    write(sbFile, { scenes: [], overlays: [{ kind: 'timer', start: 0, end: 2, dur: 1, to: 27, claims: ['c-27'] }] });
    age(other, 60);
    const o = io();
    assert.equal(main(['check', d, '--script', other, '--storyboard', sbFile], o.io), 0);
    assert.deepEqual(o.err, ['warning: l01 overlay 1: shows "27%" with no claims; numbers on screen need claims; facts.mjs trace will refuse it']);
    assert.deepEqual(o.out, ['0 error(s), 1 warning(s).']);
  });
  test('a missing episode folder with --script', () => {
    const d = episode(line({ shots: [{ image: 'box' }] }));
    const o = io();
    assert.equal(main(['check', path.join(d, 'gone'), '--script', path.join(d, 'script.json')], o.io), 1);
    assert.deepEqual(o.err, ['error: l01 shot 1: art/box.png not found']);
  });
  test('bad files', () => {
    const d = episode();
    let o = io();
    assert.equal(main(['check', path.join(d, 'nope')], o.io), 1);
    assert.match(o.err[0], /^error: ENOENT/);
    assert.deepEqual(o.out, []);
    o = io();
    assert.equal(main(['check', d, '--storyboard', path.join(d, 'nope.json')], o.io), 1);
    assert.match(o.err[0], /^error: ENOENT/);
    o = io();
    assert.equal(main(['check', d, '--sprites', path.join(d, 'nope.json')], o.io), 1);
    assert.match(o.err[0], /^error: ENOENT/);
    write(path.join(d, 'storyboard.json'), '{ not json');
    o = io();
    assert.equal(main(['check', d], o.io), 1);
    assert.equal(o.err.length, 1);
    assert.ok(o.err[0].startsWith(`error: ${path.join(d, 'storyboard.json')}: `), o.err[0]);
    write(path.join(d, 'storyboard.json'), { scenes: {} });
    o = io();
    assert.equal(main(['check', d], o.io), 1);
    assert.deepEqual(o.err, ['error: storyboard: scenes and overlays must be lists']);
    fs.rmSync(path.join(d, 'storyboard.json'));
    write(path.join(d, 'art/sprites/sprites.json'), { sprites: 'none' });
    o = io();
    assert.equal(main(['check', d], o.io), 1);
    assert.deepEqual(o.err, [`error: ${path.join(d, 'art/sprites/sprites.json')}: not a sprites manifest (no sprites list)`]);
    write(path.join(d, 'script.json'), { schema: 'shorts-script/9', lines: [] });
    fs.rmSync(path.join(d, 'art/sprites'), { recursive: true });
    o = io();
    assert.equal(main(['check', d], o.io), 1);
    assert.deepEqual(o.err, [`error: script: schema must be "${SCRIPT_SCHEMA}"`]);
    assert.deepEqual(o.out, ['1 error(s), 0 warning(s).']);
  });
  test('stills', () => {
    const d = tmp();
    const f = path.join(d, 'storyboard.json');
    write(f, goodSb());
    let o = io();
    assert.equal(main(['stills', f], o.io), 0);
    assert.deepEqual(o.out, ['[0.5,2,3.65,4.1,4.5,6,7.65,8.1,8.5,8.65]']);
    assert.deepEqual(o.err, []);
    write(f, { scenes: [] });
    o = io();
    assert.equal(main(['stills', f], o.io), 1);
    assert.deepEqual(o.err, ['error: storyboard: scenes and overlays must be lists']);
    o = io();
    assert.equal(main(['stills', path.join(d, 'nope.json')], o.io), 1);
    assert.match(o.err[0], /^error: ENOENT/);
  });
  test('frame', () => {
    const d = tmp();
    write(path.join(d, 'art', 'top-empty.png'), png(1024, 1536));
    write(path.join(d, 'art', 'broken.png'), 'png');
    const f = path.join(d, 'storyboard.json');
    write(f, { scenes: [
      null,
      { id: 'l04-1', start: 9.43, end: 14.29, image: 'top-empty', motion: 'push-in', zoom: [1, 1.05], focus: [0.5, 0.5] },
      { id: 'l06-1', start: 0, end: 1, image: 'broken' },
      { id: 'l07-1', image: 'gone' },
    ], overlays: [] });
    let o = io();
    assert.equal(main(['frame', f, 'l04-1', '0.29,0.79', '0.5,0.62', '0.02,0.5'], o.io), 0);
    assert.deepEqual(o.out, [
      'l04-1 on top-empty (1024x1536), frame x,y at the scene start and end:',
      '0.29,0.79: start 0.251,0.790; end 0.239,0.805 (bottom 20%)',
      '0.5,0.62: start 0.500,0.620 (caption band); end 0.500,0.626 (caption band)',
      '0.02,0.5: start -0.069,0.500 (off-screen); end -0.097,0.500 (off-screen)',
    ]);
    assert.deepEqual(o.err, []);
    o = io();
    assert.equal(main(['frame', f, 'l09-1', '0.5,0.5'], o.io), 1);
    assert.deepEqual(o.err, [`error: ${f}: no scene "l09-1"`]);
    o = io();
    assert.equal(main(['frame', f, 'l06-1', '0.5,0.5'], o.io), 1);
    assert.deepEqual(o.err, [`error: ${path.join(d, 'art', 'broken.png')}: not a PNG`]);
    o = io();
    assert.equal(main(['frame', f, 'l07-1', '0.5,0.5'], o.io), 1);
    assert.match(o.err[0], /^error: ENOENT/);
    write(f, { scenes: [] });
    o = io();
    assert.equal(main(['frame', f, 'l04-1', '0.5,0.5'], o.io), 1);
    assert.deepEqual(o.err, ['error: storyboard: scenes and overlays must be lists']);
    o = io();
    assert.equal(main(['frame', path.join(d, 'nope.json'), 'l04-1', '0.5,0.5'], o.io), 1);
    assert.match(o.err[0], /^error: ENOENT/);
  });
  test('runs as a script', () => {
    const r = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
    assert.equal(r.status, 2);
    assert.equal(r.stderr.trim(), USAGE);
    const d = episode();
    const ok = spawnSync(process.execPath, [SCRIPT, 'check', d], { encoding: 'utf8' });
    assert.equal(ok.status, 0);
    assert.equal(ok.stdout, '0 error(s), 0 warning(s).\n');
  });
  test('imports without running when there is no script argument (node -e)', () => {
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(SCRIPT).href)}); console.log('imported');`], { encoding: 'utf8' });
    assert.equal(r.stderr, '');
    assert.equal(r.status, 0);
    assert.equal(r.stdout, 'imported\n');
  });
});
