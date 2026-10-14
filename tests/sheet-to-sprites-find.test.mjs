import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'plugins/fairytale-studio/skills/sheet-to-sprites/scripts');
const { encodePng } = await import(path.join(DIR, 'png.mjs'));
const { findPieces, dilate, readingOrder, parseArgs, main } = await import(path.join(DIR, 'find-pieces.mjs'));

const MAGENTA = [255, 0, 255];
/** Flat backdrop image with filled rectangles [x, y, w, h, rgb]. */
function sheet(w, h, rects, bg = MAGENTA) {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([...bg, 255], i * 4);
  for (const [x, y, rw, rh, rgb] of rects) {
    for (let yy = y; yy < y + rh; yy++) for (let xx = x; xx < x + rw; xx++) data.set([...rgb, 255], (yy * w + xx) * 4);
  }
  return { width: w, height: h, data };
}
const CREAM = [245, 238, 220];
const io = () => { const out = [], err = []; return { out, err, io: { out: (s) => out.push(s), err: (s) => err.push(s) } }; };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'find-pieces-'));

describe('find-pieces helpers', () => {
  test('dilate grows a mask by r in every direction, clipped at the edges', () => {
    const m = new Uint8Array(5 * 4); m[1 * 5 + 1] = 1; m[3 * 5 + 4] = 1;
    const out = dilate(m, 5, 4, 1);
    assert.deepEqual([...out], [
      1, 1, 1, 0, 0,
      1, 1, 1, 0, 0,
      1, 1, 1, 1, 1,
      0, 0, 0, 1, 1,
    ]);
    assert.deepEqual([...dilate(m, 5, 4, 0)], [...m]);
  });

  test('readingOrder groups rows by vertical centre, then sorts left to right', () => {
    const b = (x, y, h = 40) => ({ x, y, w: 30, h, area: 1 });
    const order = readingOrder([b(200, 120), b(10, 5), b(100, 20, 20), b(5, 110), b(300, 0)]);
    assert.deepEqual(order.map((o) => [o.x, o.y]), [[10, 5], [100, 20], [300, 0], [5, 110], [200, 120]]);
  });
});

describe('findPieces', () => {
  test('finds pieces in reading order, merges near fibres, drops specks and small pieces, adds clipped margin', () => {
    const img = sheet(200, 120, [
      [0, 0, 40, 30, CREAM],        // touches the top-left edge
      [41, 10, 5, 5, CREAM],        // fibre 1 px away -> merged into the first piece
      [160, 80, 40, 40, CREAM],     // touches the bottom-right edge
      [90, 10, 50, 40, [120, 160, 90]],
      [100, 100, 3, 3, CREAM],      // speck (9 px)
      [60, 80, 8, 8, CREAM],        // piece below min area
    ]);
    const { backdrop, pieces } = findPieces(img, { minArea: 0.005, margin: 5 });
    assert.deepEqual(backdrop, MAGENTA);
    assert.deepEqual(pieces, [
      { x: 0, y: 0, w: 51, h: 35, area: 1225 },
      { x: 85, y: 5, w: 60, h: 50, area: 2000 },
      { x: 155, y: 75, w: 45, h: 45, area: 1600 },
    ]);
  });

  test('L-shaped neighbours with overlapping bounding boxes stay separate', () => {
    const img = sheet(120, 120, [
      [10, 10, 80, 20, CREAM], [10, 30, 20, 70, CREAM],   // an L
      [50, 50, 50, 50, CREAM],                            // sits inside the L's box, 20 px away
    ]);
    const { pieces } = findPieces(img, { margin: 0 });
    assert.deepEqual(pieces.map((p) => [p.x, p.y, p.w, p.h]), [[10, 10, 80, 90], [50, 50, 50, 50]]);
  });

  test('defaults: tol keeps a colour close to the backdrop as backdrop', () => {
    const img = sheet(100, 100, [[20, 20, 40, 40, [235, 20, 235]], [10, 70, 30, 20, CREAM]]);
    const { pieces } = findPieces(img);
    assert.equal(pieces.length, 1);
    assert.deepEqual(pieces[0], { x: 0, y: 56, w: 54, h: 44, area: 600 });
  });
});

describe('find-pieces CLI', () => {
  test('parseArgs reads every flag and rejects bad numbers', () => {
    assert.deepEqual(parseArgs(['s.png', '--crops', 'c.json', '--key', 'kit', '--names', 'a, b,,c', '--tol', '30', '--gap', '4', '--min-area', '0.01', '--margin', '9']),
      { sheet: 's.png', crops: 'c.json', key: 'kit', names: ['a', 'b', 'c'], opt: { tol: 30, gap: 4, minArea: 0.01, margin: 9 } });
    assert.throws(() => parseArgs(['--tol', 'x']), /--tol needs a non-negative number/);
    assert.throws(() => parseArgs(['--gap', '-1']), /--gap/);
  });

  test('usage, bad key, bad parse and unreadable sheet fail', () => {
    let r = io();
    assert.equal(main(['s.png'], r.io), 1);
    assert.match(r.err[0], /^Usage/);
    r = io();
    assert.equal(main(['s.png', '--crops', 'c.json', '--key', 'Bad Key'], r.io), 1);
    assert.match(r.err[0], /kebab-case/);
    r = io();
    assert.equal(main(['--margin', 'z'], r.io), 1);
    assert.match(r.err[0], /--margin/);
    r = io();
    assert.equal(main([path.join(tmp(), 'missing.png'), '--crops', 'c.json', '--key', 'kit'], r.io), 1);
    assert.match(r.err[0], /^error:/);
  });

  test('writes a new crops.json with named pieces, then replaces only that sheet on re-run', () => {
    const d = tmp();
    const png = path.join(d, 'kit.png');
    fs.writeFileSync(png, encodePng(sheet(200, 100, [[10, 10, 60, 60, CREAM], [120, 20, 50, 50, CREAM]])));
    const crops = path.join(d, 'cut', 'crops.json');
    let r = io();
    assert.equal(main([png, '--crops', crops, '--key', 'kit', '--names', 'house,tree'], r.io), 0);
    assert.match(r.out[0], /2 piece\(s\) on "kit"/);
    let spec = JSON.parse(fs.readFileSync(crops, 'utf8'));
    assert.equal(spec.schema, 'sprite-crops/1');
    assert.equal(spec.sheets.kit, '../kit.png');
    assert.deepEqual(spec.crops.house, { sheet: 'kit', x: 0, y: 0, w: 84, h: 84, options: { largest: true, tol: 48, soft: 220, key: true } });
    assert.deepEqual(Object.keys(spec.crops), ['house', 'tree']);

    spec.sheets.cast = 'cast.png';
    spec.crops.dori = ['cast', 0, 0, 10, 10];
    fs.writeFileSync(crops, JSON.stringify(spec));
    r = io();
    assert.equal(main([png, '--crops', crops, '--key', 'kit'], r.io), 0);
    assert.match(r.err[0], /no --names given/);
    spec = JSON.parse(fs.readFileSync(crops, 'utf8'));
    assert.deepEqual(Object.keys(spec.crops), ['dori', 'kit-1', 'kit-2']);
    assert.equal(spec.sheets.cast, 'cast.png');
  });

  test('count mismatch, bad names, clashes and specs without sheets or crops', () => {
    const d = tmp();
    const png = path.join(d, 'kit.png');
    fs.writeFileSync(png, encodePng(sheet(120, 80, [[10, 10, 40, 40, CREAM]])));
    const crops = path.join(d, 'crops.json');
    let r = io();
    assert.equal(main([png, '--crops', crops, '--key', 'kit', '--names', 'a,b'], r.io), 1);
    assert.match(r.err[0], /found 1 piece\(s\) but 2 name\(s\)[\s\S]*1\. x=0 y=0/);
    assert.equal(fs.existsSync(crops), false);
    r = io();
    assert.equal(main([png, '--crops', crops, '--key', 'kit', '--names', 'Big_House'], r.io), 1);
    assert.match(r.err[0], /"Big_House" must be kebab-case/);

    fs.writeFileSync(crops, JSON.stringify({ schema: 'sprite-crops/1', crops: { house: { sheet: 'other', x: 0, y: 0, w: 5, h: 5 } } }));
    r = io();
    assert.equal(main([png, '--crops', crops, '--key', 'kit', '--names', 'house'], r.io), 1);
    assert.match(r.err[0], /already used by another sheet[^\n]*house/);

    fs.writeFileSync(crops, JSON.stringify({ schema: 'sprite-crops/1' }));
    r = io();
    assert.equal(main([png, '--crops', crops, '--key', 'kit', '--names', 'house'], r.io), 0);
    assert.deepEqual(JSON.parse(fs.readFileSync(crops, 'utf8')).sheets, { kit: 'kit.png' });
  });

  test('runs as a script', () => {
    let r = spawnSync(process.execPath, [path.join(DIR, 'find-pieces.mjs')], { encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Usage/);
    const d = tmp();
    fs.writeFileSync(path.join(d, 'kit.png'), encodePng(sheet(120, 80, [[10, 10, 40, 40, CREAM]])));
    r = spawnSync(process.execPath, [path.join(DIR, 'find-pieces.mjs'), path.join(d, 'kit.png'), '--crops', path.join(d, 'crops.json'), '--key', 'kit', '--names', 'jar'], { encoding: 'utf8' });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /jar: x=0 y=0/);
  });
});
