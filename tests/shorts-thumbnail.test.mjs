import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(ROOT, 'plugins/shortform-studio/skills/shorts-thumbnail/scripts/thumbnail.mjs');
const T = await import(SCRIPT);
const { check, chars, inSafe, highlightPoints, template, main, SCHEMA, USAGE, RED } = T;

const good = (o = {}) => ({
  schema: SCHEMA,
  image: 'art/x.png',
  crop: { focus: [0.5, 0.4], zoom: 1.2 },
  background: { dim: 0.3, desaturate: 0.4, vignette: 0.5, spot: [0.2, 0.3, 0.6, 0.4] },
  highlights: [{ kind: 'outline', box: [0.3, 0.35, 0.4, 0.3], color: RED }, { kind: 'arrow', from: [0.2, 0.3], to: [0.4, 0.45] }],
  headline: { text: '9mm', y: 0.15, claims: ['c-a'], color: '#ffffff' },
  caption: { text: '부수라고 만든 벽', y: 0.6 },
  ...o,
});
const io = () => { const out = [], err = []; return { out, err, io: { out: (s) => out.push(s), err: (s) => err.push(s) } }; };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'thumb-'));

describe('helpers', () => {
  test('chars ignores whitespace and counts Hangul as one', () => {
    assert.equal(chars(' 9 mm '), 3);
    assert.equal(chars('비상 구'), 3);
  });
  test('inSafe and highlightPoints', () => {
    assert.ok(inSafe([0.5, 0.5]));
    assert.ok(!inSafe([0.5, 0.9]));
    assert.ok(!inSafe([0.01, 0.5]));
    assert.deepEqual(highlightPoints({ kind: 'bar', box: [0.1, 0.2, 0.3, 0.4] }), [[0.1, 0.2], [0.4, 0.6000000000000001]]);
    assert.deepEqual(highlightPoints({ kind: 'arrow', from: [0.1, 0.1], to: [0.2, 0.2] }), [[0.1, 0.1], [0.2, 0.2]]);
    assert.deepEqual(highlightPoints({ kind: 'ring', at: [0.5, 0.5] }), [[0.5, 0.5]]);
  });
  test('template is a valid spec once texts are filled', () => {
    const t = template('art/a.png');
    t.headline.text = '9mm';
    t.caption.text = '비상구';
    assert.deepEqual(check(t), { errors: [], warnings: [] });
  });
});

describe('check', () => {
  test('a good spec is clean', () => {
    assert.deepEqual(check(good()), { errors: [], warnings: [] });
  });
  test('schema', () => {
    assert.deepEqual(check(null).errors, [`schema must be "${SCHEMA}"`]);
    assert.deepEqual(check({ schema: 'x' }).errors, [`schema must be "${SCHEMA}"`]);
  });
  test('size and image', () => {
    assert.deepEqual(check(good({ size: { width: 1080, height: 1080 } })).errors, ['size: 1080x1080 is not 9:16']);
    assert.deepEqual(check(good({ size: 'big' })).errors, ['size: width and height must be positive integers']);
    assert.deepEqual(check(good({ size: { width: 0, height: 0 } })).errors, ['size: width and height must be positive integers']);
    assert.deepEqual(check(good({ size: { width: 720, height: 1280 } })).warnings, ['size: 720 wide is below 1080']);
    assert.deepEqual(check(good({ size: { width: 2160, height: 3840 } })), { errors: [], warnings: [] });
    assert.deepEqual(check(good({ image: '' })).errors, ['image is required (a still from the episode art)']);
  });
  test('crop and background', () => {
    assert.deepEqual(check(good({ crop: 3 })).errors, ['crop must be an object']);
    assert.deepEqual(check(good({ crop: { focus: [2, 0], zoom: 5 } })).errors, ['crop.focus must be [x, y] fractions', 'crop.zoom must be 1..3']);
    assert.deepEqual(check(good({ crop: {} })).errors, []);
    assert.deepEqual(check(good({ background: [] })).errors, ['background must be an object']);
    assert.deepEqual(check(good({ background: { dim: 2, spot: [0.5, 0.5, 0.6, 0.1] } })).errors, ['background.dim must be 0..1', 'background.spot must be [x, y, w, h] fractions inside the frame']);
    assert.deepEqual(check(good({ background: {} })).errors, []);
  });
  test('highlights', () => {
    assert.match(check(good({ highlights: [] })).errors[0], /at least one/);
    assert.match(check(good({ highlights: 'x' })).errors[0], /at least one/);
    const many = Array.from({ length: 4 }, () => ({ kind: 'ring', at: [0.5, 0.5] }));
    assert.deepEqual(check(good({ highlights: many })).warnings, ['highlights: 4 marks compete; use 3 or fewer']);
    const r = check(good({ highlights: [
      null,
      { kind: 'star' },
      { kind: 'outline', box: [0.5, 0.5, 0.6, 0.1] },
      { kind: 'bar', box: [0.1, 0.1, 0, 0.1] },
      { kind: 'arrow', from: [0.1, 0.1] },
      { kind: 'xmark', at: 'mid' },
      { kind: 'ring', at: [0.5, 0.5], size: 2, color: 'red' },
      { kind: 'ring', at: [0.5, 0.9] },
      { kind: 'xmark', at: [0.5, 0.5], size: 0.3, color: '#00ff00' },
    ] }));
    assert.deepEqual(r.errors, [
      'highlights[0]: kind must be one of outline, arrow, xmark, ring, bar',
      'highlights[1]: kind must be one of outline, arrow, xmark, ring, bar',
      'highlights[2]: box must be [x, y, w, h] fractions inside the frame',
      'highlights[3]: box must be [x, y, w, h] fractions inside the frame',
      'highlights[4]: from and to must be [x, y] fractions',
      'highlights[5]: at must be [x, y] fractions',
      'highlights[6]: size must be a fraction of the width (0..1]',
      'highlights[6]: color must be #rrggbb',
    ]);
    assert.ok(r.warnings.includes('highlights[7]: reaches outside the safe area (bottom 20% and the edges are covered in the feed)'));
  });
  test('headline and caption', () => {
    const { headline, ...noHead } = good();
    assert.deepEqual(check(noHead).warnings, ['headline: none; a big number or 2-4 syllable keyword at the top helps in the feed']);
    assert.deepEqual(check(good({ headline: { text: '' } })).errors, ['headline: text is required']);
    assert.deepEqual(check(good({ headline: 'x' })).errors, ['headline: text is required']);
    assert.deepEqual(check(good({ headline: { text: '열다섯글자가넘는아주긴헤드라인' } })).errors, ['headline: "열다섯글자가넘는아주긴헤드라인" has 15 characters (max 14)']);
    assert.deepEqual(check(good({ headline: { text: '아홉글자헤드라인임' } })).warnings, ['headline: "아홉글자헤드라인임" has 9 characters; 8 or fewer reads at phone-grid size']);
    assert.deepEqual(check(good({ headline: { text: 'a\nb\nc', y: 2, claims: 'c', color: 'white' } })).errors, [
      'headline: at most 2 lines', 'headline: y must be a fraction 0..1', 'headline: claims must be a list of claim ids', 'headline: color must be #rrggbb',
    ]);
    assert.deepEqual(check(good({ headline: { text: '9mm', y: 0.5 } })).warnings, ['headline: y 0.5 is outside 0.06..0.32']);
    assert.deepEqual(check(good({ caption: { text: '9mm' }, headline: { text: '9mm' } })).warnings, ['caption repeats the headline']);
    assert.deepEqual(check(good({ caption: { text: '열세글자가넘는캡션입니다요' } })).warnings, ['caption: "열세글자가넘는캡션입니다요" has 13 characters; 12 or fewer reads at phone-grid size']);
    const { caption, ...noCap } = good();
    assert.deepEqual(check(noCap), { errors: [], warnings: [] });
    assert.deepEqual(check(good({ headline: { text: '' }, caption: { text: '' } })).warnings, []);
  });
});

describe('cli', () => {
  test('usage', () => {
    for (const argv of [[], ['x'], ['check'], ['init', 'f.json'], ['init', 'f.json', '--image']]) {
      const o = io();
      assert.equal(main(argv, o.io), 2);
      assert.deepEqual(o.err, [USAGE]);
    }
  });
  test('init then check', () => {
    const d = tmp();
    fs.mkdirSync(path.join(d, 'art'));
    fs.writeFileSync(path.join(d, 'art/a.png'), 'png');
    const f = path.join(d, 'sub', 'thumbnail.json');
    let o = io();
    assert.equal(main(['init', f, '--image', '../art/a.png'], o.io), 0);
    assert.deepEqual(o.out, [`Wrote ${f}`]);
    o = io();
    assert.equal(main(['init', f, '--image', 'x'], o.io), 1);
    assert.match(o.err[0], /already exists/);
    o = io();
    assert.equal(main(['check', f], o.io), 1);
    assert.ok(o.err.includes('error: headline: text is required'));
    const spec = JSON.parse(fs.readFileSync(f, 'utf8'));
    spec.headline.text = '9mm';
    spec.caption.text = '비상구';
    fs.writeFileSync(f, JSON.stringify(spec));
    o = io();
    assert.equal(main(['check', f], o.io), 0);
    assert.deepEqual(o.out, ['0 error(s), 0 warning(s).']);
    spec.image = '../art/missing.png';
    spec.headline.y = 0.5;
    fs.writeFileSync(f, JSON.stringify(spec));
    o = io();
    assert.equal(main(['check', f], o.io), 1);
    assert.deepEqual(o.err, ['warning: headline: y 0.5 is outside 0.06..0.32', 'error: image not found: ../art/missing.png']);
    assert.deepEqual(o.out, ['1 error(s), 1 warning(s).']);
    spec.image = '';
    fs.writeFileSync(f, JSON.stringify(spec));
    o = io();
    assert.equal(main(['check', f], o.io), 1);
  });
  test('bad file', () => {
    const o = io();
    assert.equal(main(['check', path.join(tmp(), 'nope.json')], o.io), 1);
    assert.match(o.err[0], /^error: ENOENT/);
  });
  test('runs as a script', () => {
    const r = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
    assert.equal(r.status, 2);
    const d = tmp();
    const ok = spawnSync(process.execPath, [SCRIPT, 'init', path.join(d, 't.json'), '--image', 'a.png'], { encoding: 'utf8' });
    assert.equal(ok.status, 0);
    assert.match(ok.stdout, /^Wrote /);
  });
});
