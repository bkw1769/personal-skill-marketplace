import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'plugins/fairytale-studio/skills/sheet-to-sprites/scripts');
const { decodePng, encodePng } = await import(path.join(DIR, 'png.mjs'));
const { parseHex, toHex, findRim, rimTone, matchRim, parseArgs, main } = await import(path.join(DIR, 'rim.mjs'));

const WHITE = [253, 252, 253];
const CREAM = [244, 239, 226];
const io = () => { const out = [], err = []; return { out, err, io: { out: (s) => out.push(s), err: (s) => err.push(s) } }; };

/** Transparent canvas. */
function blank(w, h) { return { width: w, height: h, data: new Uint8Array(w * h * 4) }; }
function fill(img, x0, y0, x1, y1, rgb, a = 255) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) img.data.set([...rgb, a], (y * img.width + x) * 4);
}
const px = (img, x, y) => [...img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4)];
const isRim = (rim, img, x, y) => rim[y * img.width + x] === 1;

/**
 * A cut-out figure: 2 px transparent border, 4 px white paper margin, 1 px black pen outline,
 * white clothing inside the outline.
 */
function figure() {
  const img = blank(30, 30);
  fill(img, 2, 2, 28, 28, WHITE);
  fill(img, 6, 6, 24, 24, [20, 20, 20]);
  fill(img, 7, 7, 23, 23, [255, 255, 255]);
  return img;
}

describe('rim colour helpers', () => {
  test('parseHex and toHex', () => {
    assert.deepEqual(parseHex('#f4efe2'), CREAM);
    assert.deepEqual(parseHex('F4EFE2'), CREAM);
    assert.throws(() => parseHex('cream'), /must look like #f4efe2/);
    assert.throws(() => parseHex('#fff'), /must look like/);
    assert.equal(toHex([244, 239, 226]), '#f4efe2');
    assert.equal(toHex([0, 15.4, 255]), '#000fff');
  });

  test('findRim walks the paper margin from the outside and stops at the pen outline', () => {
    const img = figure();
    const rim = findRim(img);
    assert.ok(isRim(rim, img, 2, 2));          // outer corner of the margin
    assert.ok(isRim(rim, img, 5, 15));         // inner edge of the margin, next to the outline
    assert.ok(!isRim(rim, img, 6, 15));        // the outline itself
    assert.ok(!isRim(rim, img, 15, 15));       // white clothing inside the outline
    assert.ok(!isRim(rim, img, 0, 0));         // transparent
  });

  test('findRim counts paper on the image border and honours depth, chroma and light', () => {
    const img = blank(12, 3);
    fill(img, 0, 0, 12, 3, WHITE);             // paper touching every border, no transparency at all
    let rim = findRim(img, { depth: 2 });
    assert.equal(rim.reduce((a, b) => a + b, 0), 36);
    const wide = blank(40, 9);
    fill(wide, 1, 1, 39, 8, WHITE);
    rim = findRim(wide, { depth: 1 });
    assert.ok(isRim(rim, wide, 1, 4) && isRim(rim, wide, 2, 4));
    assert.ok(!isRim(rim, wide, 3, 4));        // two steps in from the left: beyond depth 1
    const tinted = blank(6, 6);
    fill(tinted, 1, 1, 5, 5, [250, 200, 200]); // pink: too much colour for paper by default
    assert.equal(findRim(tinted).reduce((a, b) => a + b, 0), 0);
    assert.equal(findRim(tinted, { chroma: 60 }).reduce((a, b) => a + b, 0), 16);
    const grey = blank(6, 6);
    fill(grey, 1, 1, 5, 5, [150, 150, 150]);   // too dark for paper by default
    assert.equal(findRim(grey).reduce((a, b) => a + b, 0), 0);
    assert.equal(findRim(grey, { light: 140 }).reduce((a, b) => a + b, 0), 16);
  });

  test('rimTone uses solid rim pixels, falls back to soft ones, null without a rim', () => {
    const img = figure();
    assert.deepEqual(rimTone(img, findRim(img)), WHITE);
    const soft = blank(5, 5);
    fill(soft, 1, 1, 4, 4, [240, 240, 240], 128);
    assert.deepEqual(rimTone(soft, findRim(soft)), [240, 240, 240]);
    const dark = blank(5, 5);
    fill(dark, 1, 1, 4, 4, [10, 10, 10]);
    assert.equal(rimTone(dark, findRim(dark)), null);
  });

  test('matchRim scales the rim to the target, keeps grain, leaves the inside and caps at 255', () => {
    const img = figure();
    img.data.set([243, 242, 243, 255], (3 * 30 + 3) * 4);  // a darker paper fibre in the margin
    const res = matchRim(img, CREAM);
    assert.deepEqual(res.before, WHITE);
    assert.equal(res.off, 27);
    assert.equal(res.pixels, 26 * 26 - 18 * 18);
    assert.deepEqual(px(res.image, 2, 2), [...CREAM, 255]);
    assert.ok(px(res.image, 3, 3)[0] < CREAM[0]);           // fibre stays darker than the paper
    assert.deepEqual(px(res.image, 15, 15), [255, 255, 255, 255]);
    assert.deepEqual(px(img, 2, 2), [...WHITE, 255]);       // input not modified
    const dim = blank(4, 4);
    fill(dim, 0, 0, 4, 4, [200, 200, 200]);
    dim.data.set([250, 250, 250, 255], 0);
    assert.equal(matchRim(dim, [250, 250, 250]).image.data[0], 255);
    const none = blank(3, 3);
    const r = matchRim(none, CREAM);
    assert.equal(r.image, none);
    assert.equal(r.before, null);
    assert.equal(r.pixels, 0);
  });
});

describe('rim CLI', () => {
  function project() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rim-'));
    const sp = path.join(dir, 'sp');
    fs.mkdirSync(sp);
    fs.writeFileSync(path.join(sp, 'white.png'), encodePng(figure()));
    const cream = figure();
    fill(cream, 2, 2, 28, 6, CREAM); fill(cream, 2, 24, 28, 28, CREAM); fill(cream, 2, 6, 6, 24, CREAM); fill(cream, 24, 6, 28, 24, CREAM);
    fs.writeFileSync(path.join(sp, 'cream.png'), encodePng(cream));
    const dark = blank(5, 5); fill(dark, 1, 1, 4, 4, [10, 10, 10]);
    fs.writeFileSync(path.join(sp, 'dark.png'), encodePng(dark));
    fs.writeFileSync(path.join(sp, 'sprites.json'), JSON.stringify({ schema: 'sprites/1', sprites: [
      { name: 'white', file: 'white.png' }, { name: 'cream', file: 'cream.png' }, { name: 'dark', file: 'dark.png' }, { name: 'gone', file: 'gone.png', empty: true },
    ] }));
    return sp;
  }

  test('parseArgs', () => {
    assert.deepEqual(parseArgs(['a', 'b/sprites.json', '--target', '#f4efe2', '--check', '--tol', '3', '--only', 'x,,y']), { inputs: ['a', 'b/sprites.json'], target: '#f4efe2', check: true, tol: 3, only: ['x', 'y'] });
    assert.deepEqual(parseArgs([]), { inputs: [], target: undefined, check: false, tol: 8, only: [] });
  });

  test('--check reports rims and fails on an off one without writing', () => {
    const sp = project();
    const before = fs.readFileSync(path.join(sp, 'white.png'));
    const r = io();
    assert.equal(main([sp, '--target', '#f4efe2', '--check'], r.io), 1);
    assert.ok(r.err.some((e) => /white: rim #fdfcfd \(off 27\) > tol 8/.test(e)));
    assert.ok(r.err.some((e) => /dark: no paper rim found/.test(e)));
    assert.ok(r.out.some((o) => /cream: rim #f4efe2 \(off 0\) ok/.test(o)));
    assert.match(r.out.at(-1), /2 of 3 rim\(s\) within 8 of #f4efe2/);
    assert.deepEqual(fs.readFileSync(path.join(sp, 'white.png')), before);
  });

  test('fixes off rims in place, records them, respects --only and a sprites.json path', () => {
    const sp = project();
    let r = io();
    assert.equal(main([path.join(sp, 'sprites.json'), '--target', '#f4efe2', '--only', 'cream'], r.io), 0);
    assert.match(r.out.at(-1), /Recoloured 0 of 1/);
    r = io();
    assert.equal(main([sp, '--target', '#f4efe2'], r.io), 0);
    assert.ok(r.out.some((o) => /white: rim #fdfcfd \(off 27\) -> #f4efe2 \(352 px\)/.test(o)));
    assert.match(r.out.at(-1), /Recoloured 1 of 3 rim\(s\) to #f4efe2/);
    const m = JSON.parse(fs.readFileSync(path.join(sp, 'sprites.json'), 'utf8'));
    assert.deepEqual(m.sprites[0].rim, { target: '#f4efe2', before: '#fdfcfd' });
    assert.deepEqual(px(decodePng(fs.readFileSync(path.join(sp, 'white.png'))), 2, 2), [...CREAM, 255]);
    r = io();
    assert.equal(main([sp, '--target', '#f4efe2', '--check'], r.io), 0);
  });

  test('usage and input errors', () => {
    const sp = project();
    let r = io();
    assert.equal(main([sp], r.io), 1);
    assert.match(r.err[0], /Usage/);
    r = io();
    assert.equal(main(['--target', '#f4efe2'], r.io), 1);
    r = io();
    assert.equal(main([sp, '--target', '#f4efe2', '--tol', '-1'], r.io), 1);
    assert.match(r.err[0], /--tol must be/);
    fs.writeFileSync(path.join(sp, 'old.json'), JSON.stringify({ sprites: [] }));
    r = io();
    assert.equal(main([path.join(sp, 'old.json'), '--target', '#f4efe2'], r.io), 1);
    assert.match(r.err[0], /schema must be "sprites\/1"/);
    r = io();
    assert.equal(main([path.join(sp, 'missing'), '--target', '#f4efe2'], r.io), 1);
    assert.match(r.err[0], /^error: /);
  });

  test('runs as a script', () => {
    const sp = project();
    const ok = spawnSync(process.execPath, [path.join(DIR, 'rim.mjs'), sp, '--target', '#f4efe2'], { encoding: 'utf8' });
    assert.equal(ok.status, 0);
    const bad = spawnSync(process.execPath, [path.join(DIR, 'rim.mjs')], { encoding: 'utf8' });
    assert.equal(bad.status, 1);
  });
});
