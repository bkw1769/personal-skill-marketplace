import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'plugins/fairytale-studio/skills/sheet-to-sprites/scripts');
const SCRIPT = path.join(DIR, 'measure.mjs');
const { encodePng } = await import(path.join(DIR, 'png.mjs'));
const { opening, colorAt, spill, parseArgs, main } = await import(SCRIPT);

/** Transparent image with opaque rectangles [x, y, w, h, rgb]. */
function img(w, h, rects) {
  const data = new Uint8Array(w * h * 4);
  for (const [x, y, rw, rh, rgb] of rects) {
    for (let yy = y; yy < y + rh; yy++) for (let xx = x; xx < x + rw; xx++) data.set([...rgb, 255], (yy * w + xx) * 4);
  }
  return { width: w, height: h, data };
}
const WALL = [200, 180, 150];
/** A wall 100x20 with a gateway at x 40..59 from the top down to y 15 (threshold strip below). */
const gateway = () => img(100, 20, [[0, 0, 40, 20, WALL], [60, 0, 40, 20, WALL], [40, 15, 20, 5, WALL]]);
const io = () => { const out = [], err = []; return { out, err, io: { out: (s) => out.push(s), err: (s) => err.push(s) } }; };
const save = (dir, name, image) => { const f = path.join(dir, name); fs.writeFileSync(f, encodePng(image)); return f; };

describe('measure', () => {
  test('opening: empty gateway in the middle, found from an opaque middle too, none when open to the side', () => {
    assert.deepEqual(opening(gateway(), 0.5), { x0: 0.4, x1: 0.6, y0: 0, y1: 0.75, px: [40, 60, 0, 15] });
    const off = img(100, 20, [[0, 0, 20, 20, WALL], [30, 0, 70, 20, WALL]]); // hole at 20..29, middle opaque
    assert.deepEqual(opening(off, 0.5).px, [20, 30, 0, 20]);
    assert.deepEqual(opening(gateway()).px, [40, 60, 0, 15]); // default height 0.7
    assert.equal(opening(img(100, 20, [[0, 0, 50, 20, WALL]]), 0.5), null); // empty to the right edge
    assert.equal(opening(img(10, 10, [[0, 0, 10, 10, WALL]]), 0.5), null); // fully opaque
    assert.equal(opening(img(10, 10, [[0, 0, 3, 10, WALL]]), 2), null); // clamped row, open to the right
    assert.deepEqual(opening(img(10, 4, [[0, 0, 2, 4, WALL], [8, 0, 2, 4, WALL], [2, 3, 6, 1, WALL]]), -1).px, [2, 8, 0, 3]);
  });

  test('colorAt: median position of matching opaque pixels, with x and chroma limits', () => {
    const im = img(10, 10, [[0, 0, 2, 2, [110, 110, 110]], [8, 6, 2, 2, [112, 110, 108]], [8, 0, 2, 2, [110, 60, 60]]]);
    assert.deepEqual(colorAt(im, [110, 110, 110], { tol: 10 }), { x: 0.8, y: 0.6, count: 8 });
    assert.deepEqual(colorAt(im, [110, 110, 110], { tol: 10, minX: 0.5 }), { x: 0.9, y: 0.7, count: 4 });
    assert.deepEqual(colorAt(im, [110, 85, 85], { tol: 60, minX: 0.5, maxChroma: 20 }), { x: 0.9, y: 0.7, count: 4 });
    assert.equal(colorAt(im, [0, 0, 255]), null);
    const faint = img(2, 1, [[0, 0, 2, 1, [110, 110, 110]]]);
    faint.data[3] = 100;
    assert.equal(colorAt(faint, [110, 110, 110]).count, 1);
  });

  test('spill: tinted and strong magenta among visible pixels', () => {
    const im = img(4, 1, [[0, 0, 1, 1, [250, 5, 249]], [1, 0, 1, 1, [235, 150, 210]], [2, 0, 1, 1, [120, 120, 120]]]);
    assert.deepEqual(spill(im), { tinted: 2, strong: 1, visible: 3 });
  });

  test('parseArgs reads every flag and rejects bad numbers', () => {
    assert.deepEqual(parseArgs(['color', 'a.png', '--rgb', '#6e6e6e', '--tol', '60', '--min-x', '0.5', '--max-chroma', '25', '--at', '0.4', '--strong', '--json']),
      { cmd: 'color', files: ['a.png'], rgb: '#6e6e6e', tol: 60, minX: 0.5, maxChroma: 25, at: 0.4, strong: true, json: true });
    assert.throws(() => parseArgs(['opening', 'a.png', '--at', 'x']), /--at needs a number/);
  });

  test('cli: opening, color and spill in text and json, with exit codes', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'measure-'));
    const gate = save(d, 'gate.png', gateway());
    const solid = save(d, 'solid.png', img(10, 10, [[0, 0, 10, 10, WALL]]));
    const sprites = path.join(d, 'sprites');
    fs.mkdirSync(sprites);
    save(sprites, 'a.png', img(4, 1, [[0, 0, 1, 1, [250, 5, 249]], [1, 0, 3, 1, WALL]]));
    save(sprites, 'b.png', img(4, 1, [[0, 0, 1, 1, [235, 150, 210]], [1, 0, 3, 1, WALL]]));
    save(sprites, 'c.png', img(4, 1, [[0, 0, 4, 1, WALL]]));
    save(sprites, 'd.png', img(4, 1, [[0, 0, 2, 1, [235, 150, 210]], [2, 0, 2, 1, WALL]])); // more tinted than b, no strong
    save(sprites, '_contact.png', img(4, 1, [[0, 0, 4, 1, [250, 5, 249]]]));
    fs.writeFileSync(path.join(sprites, 'notes.txt'), 'x');
    let r = io();
    assert.equal(main(['opening', gate, '--at', '0.5'], r.io), 0);
    assert.match(r.out[0], /^opening \[0\.4, 0\.6, 0, 0\.75\]/);
    r = io();
    assert.equal(main(['opening', gate, '--at', '0.5', '--json'], r.io), 0);
    assert.deepEqual(JSON.parse(r.out[0]).px, [40, 60, 0, 15]);
    r = io();
    assert.equal(main(['opening', solid], r.io), 1);
    assert.match(r.err[0], /no enclosed empty region found .* at height 0\.7/);
    r = io();
    assert.equal(main(['opening', solid, '--at', '0.2'], r.io), 1);
    assert.match(r.err[0], /at height 0\.2/);
    r = io();
    assert.equal(main(['color', gate, '--rgb', '#c8b496', '--tol', '5'], r.io), 0);
    assert.match(r.out[0], /^#c8b496 at x 0\.\d+, y 0\.\d+ .* px\)$/);
    r = io();
    assert.equal(main(['color', gate, '--rgb', '#c8b496', '--json'], r.io), 0);
    assert.equal(JSON.parse(r.out[0]).count, 1700); // 40*20*2 wall + 20*5 threshold
    r = io();
    assert.equal(main(['color', gate, '--rgb', '#0000ff'], r.io), 1);
    assert.match(r.err[0], /no pixels near #0000ff/);
    r = io();
    assert.equal(main(['color', gate], r.io), 1);
    assert.match(r.err[0], /needs --rgb/);
    r = io();
    assert.equal(main(['spill', sprites], r.io), 2);
    assert.deepEqual(r.out.map((l) => l.split('\t')[0]), ['a.png', 'd.png', 'b.png', '3 of 4 sprite(s) with magenta pixels']);
    r = io();
    assert.equal(main(['spill', path.join(sprites, 'b.png'), '--strong'], r.io), 0);
    assert.deepEqual(r.out, ['0 of 1 sprite(s) with strong magenta pixels']);
    r = io();
    assert.equal(main(['spill', sprites, '--json'], r.io), 2);
    assert.equal(JSON.parse(r.out[0])[0].file, 'a.png');
    r = io();
    assert.equal(main(['nope', gate], r.io), 1);
    assert.match(r.err[0], /^Usage/);
    r = io();
    assert.equal(main(['spill'], r.io), 1);
    r = io();
    assert.equal(main(['spill', path.join(d, 'missing.png')], r.io), 1);
    assert.match(r.err[0], /^error:/);
  });

  test('runs as a script', () => {
    const r = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
    assert.equal(r.status, 1);
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'measure-'));
    const ok = spawnSync(process.execPath, [SCRIPT, 'opening', save(d, 'g.png', gateway()), '--at', '0.5'], { encoding: 'utf8' });
    assert.equal(ok.status, 0);
    assert.match(ok.stdout, /^opening/);
  });
});
