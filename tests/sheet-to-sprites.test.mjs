import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'plugins/fairytale-studio/skills/sheet-to-sprites/scripts');
const { decodePng, encodePng, paeth } = await import(path.join(DIR, 'png.mjs'));
const { median, crop, extractSprite, cutSprite, drawBoxes, contactSheet, SIDES } = await import(path.join(DIR, 'extract.mjs'));
const { main, parseArgs, normalizeCrop } = await import(path.join(DIR, 'cut-sprites.mjs'));

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function chunk(type, body) {
  const head = Buffer.alloc(8); head.writeUInt32BE(body.length); head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(Buffer.concat([head.subarray(4), body])));
  return Buffer.concat([head, body, crc]);
}
/** Build a PNG from raw filtered scanlines (each row: filter byte + bytes). */
function png({ w, h, depth = 8, color, interlace = 0, rows, extra = [], ihdr = true }) {
  const hd = Buffer.alloc(13); hd.writeUInt32BE(w, 0); hd.writeUInt32BE(h, 4); hd[8] = depth; hd[9] = color; hd[12] = interlace;
  const parts = [SIG];
  if (ihdr) parts.push(chunk('IHDR', hd));
  parts.push(...extra, chunk('IDAT', zlib.deflateSync(Buffer.from(rows.flat()))), chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}
const io = () => { const out = [], err = []; return { out, err, io: { out: (s) => out.push(s), err: (s) => err.push(s) } }; };

describe('png codec', () => {
  test('paeth picks a, b or c', () => {
    assert.equal(paeth(10, 20, 10), 20);
    assert.equal(paeth(20, 10, 10), 20);
    assert.equal(paeth(10, 10, 30), 10);
    assert.equal(paeth(50, 10, 40), 10);
    assert.equal(paeth(5, 40, 30), 5);
    assert.equal(paeth(30, 40, 50), 30);
    assert.equal(paeth(0, 0, 100), 0);
    assert.equal(paeth(100, 90, 0), 100);
    assert.equal(paeth(1, 100, 99), 1);
    assert.equal(paeth(100, 1, 99), 1);
    assert.equal(paeth(40, 60, 45), 60);
    assert.equal(paeth(20, 0, 10), 10);
  });

  test('round-trips RGBA through encode/decode', () => {
    const img = { width: 3, height: 2, data: Uint8Array.from({ length: 24 }, (_, i) => (i * 37) & 255) };
    const back = decodePng(encodePng(img));
    assert.equal(back.width, 3);
    assert.deepEqual([...back.data], [...img.data]);
  });

  test('decodes every filter type on RGB', () => {
    // 2x2 RGB, row 0 filter 1 (sub) then 0 trick; use filters 0..4 across 5 rows of width 1.
    const rows = [[0, 10, 20, 30], [1, 5, 5, 5], [2, 1, 2, 3], [3, 4, 4, 4], [4, 1, 1, 1]];
    const img = decodePng(png({ w: 1, h: 5, color: 2, rows }));
    const px = (y) => [...img.data.subarray(y * 4, y * 4 + 4)];
    assert.deepEqual(px(0), [10, 20, 30, 255]);
    assert.deepEqual(px(1), [5, 5, 5, 255]);
    assert.deepEqual(px(2), [6, 7, 8, 255]);
    assert.deepEqual(px(3), [7, 7, 8, 255]);
    assert.deepEqual(px(4), [8, 8, 9, 255]);
    const two = decodePng(png({ w: 2, h: 2, color: 2, rows: [[1, 10, 10, 10, 5, 5, 5], [4, 1, 1, 1, 2, 2, 2]] }));
    assert.deepEqual([...two.data.subarray(4, 8)], [15, 15, 15, 255]);
    assert.deepEqual([...two.data.subarray(12, 16)], [17, 17, 17, 255]);
  });

  test('decodes gray, gray+alpha, RGBA and palette (with and without tRNS)', () => {
    assert.deepEqual([...decodePng(png({ w: 1, h: 1, color: 0, rows: [[0, 77]] })).data], [77, 77, 77, 255]);
    assert.deepEqual([...decodePng(png({ w: 1, h: 1, color: 4, rows: [[0, 77, 9]] })).data], [77, 77, 77, 9]);
    assert.deepEqual([...decodePng(png({ w: 1, h: 1, color: 6, rows: [[0, 1, 2, 3, 4]] })).data], [1, 2, 3, 4]);
    const plte = chunk('PLTE', Buffer.from([9, 8, 7, 1, 2, 3]));
    const pal = decodePng(png({ w: 2, h: 1, color: 3, rows: [[0, 0, 1]], extra: [plte, chunk('tRNS', Buffer.from([50])), chunk('tEXt', Buffer.from('a\0b'))] }));
    assert.deepEqual([...pal.data], [9, 8, 7, 50, 1, 2, 3, 255]);
    const opaque = decodePng(png({ w: 1, h: 1, color: 3, rows: [[0, 1]], extra: [plte] }));
    assert.deepEqual([...opaque.data], [1, 2, 3, 255]);
  });

  test('rejects unsupported or broken files', () => {
    assert.throws(() => decodePng(Buffer.from('nope')), /not a PNG/);
    assert.throws(() => decodePng(Buffer.from('GIF89a......')), /not a PNG/);
    assert.throws(() => decodePng(png({ w: 1, h: 1, depth: 16, color: 2, rows: [[0]] })), /bit depth 16/);
    assert.throws(() => decodePng(png({ w: 1, h: 1, color: 5, rows: [[0]] })), /color type 5/);
    assert.throws(() => decodePng(png({ w: 1, h: 1, color: 2, interlace: 1, rows: [[0]] })), /interlaced/);
    assert.throws(() => decodePng(png({ w: 1, h: 1, color: 2, rows: [[0]], ihdr: false })), /missing IHDR/);
    assert.throws(() => decodePng(png({ w: 1, h: 1, color: 3, rows: [[0, 0]] })), /without PLTE/);
    assert.throws(() => decodePng(png({ w: 2, h: 2, color: 2, rows: [[0, 1, 2, 3]] })), /truncated/);
    assert.throws(() => decodePng(png({ w: 1, h: 1, color: 2, rows: [[7, 1, 2, 3]] })), /bad filter type 7/);
    const noEnd = Buffer.concat([SIG, chunk('IHDR', Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 0, 0, 0, 0])), chunk('IDAT', zlib.deflateSync(Buffer.from([0, 5])))]);
    assert.deepEqual([...decodePng(noEnd).data], [5, 5, 5, 255]);
  });
});

// ---- synthetic sheet --------------------------------------------------------
const PAPER = [240, 236, 228];
function sheet(w, h) {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([...PAPER, 255], i * 4);
  return { width: w, height: h, data };
}
function fill(img, x0, y0, x1, y1, rgb) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) img.data.set([...rgb, 255], (y * img.width + x) * 4);
}
const alphaAt = (img, x, y) => img.data[(y * img.width + x) * 4 + 3];

describe('extract', () => {
  test('median and crop (clipped, and outside the sheet)', () => {
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([4, 1, 3, 2]), 3);
    const s = sheet(10, 10);
    fill(s, 8, 8, 10, 10, [1, 2, 3]);
    const c = crop(s, { x: 8, y: 8, w: 5, h: 5 });
    assert.equal(c.width, 2);
    assert.deepEqual([...c.data.subarray(0, 4)], [1, 2, 3, 255]);
    assert.throws(() => crop(s, { x: 20, y: 0, w: 5, h: 5 }), /outside the 10x10 sheet/);
    assert.throws(() => crop(s, { x: 0, y: 20, w: 5, h: 5 }), /outside/);
  });

  test('cuts a figure, clears an enclosed hole, drops specks and border fragments, trims with pad', () => {
    const s = sheet(120, 120);
    fill(s, 30, 30, 90, 90, [60, 40, 30]);        // figure
    fill(s, 45, 45, 75, 75, PAPER);                // enclosed paper hole (900 px)
    fill(s, 100, 10, 102, 12, [20, 20, 20]);       // speck (4 px)
    fill(s, 0, 100, 6, 110, [20, 20, 20]);         // neighbour fragments touching each border
    fill(s, 114, 10, 120, 20, [20, 20, 20]);
    fill(s, 60, 0, 66, 4, [20, 20, 20]);
    fill(s, 60, 116, 66, 120, [20, 20, 20]);
    fill(s, 31, 31, 33, 33, [200, 200, 195]);      // pale wash near paper colour, inside figure
    const res = extractSprite(s);
    assert.equal(res.empty, false);
    assert.deepEqual(res.paper, PAPER);
    assert.deepEqual(res.offset, { x: 28, y: 28 });
    assert.equal(res.image.width, 64);
    assert.equal(alphaAt(res.image, 10, 10), 255);            // figure interior (crop 38,38)
    assert.equal(alphaAt(res.image, 32, 32), 0);              // hole centre (crop 60,60) is transparent
    assert.equal(alphaAt(res.image, 0, 0), 0);                // pad
    assert.equal(src(s), 'untouched');
    function src(img) { return img.data[(35 * 120 + 35) * 4] === 60 ? 'untouched' : 'modified'; }
  });

  test('soft edge un-mixes paper from semi-transparent pixels', () => {
    const s = sheet(60, 60);
    fill(s, 20, 20, 40, 40, [40, 40, 40]);
    fill(s, 19, 20, 20, 40, [215, 211, 204]);       // faint stroke next to paper (distance ~43)
    const res = extractSprite(s, { pad: 0 });
    const a = alphaAt(res.image, 0, 5);
    assert.ok(a > 0 && a < 255, `edge alpha ${a}`);
    assert.ok(res.image.data[(5 * res.image.width) * 4] < 215, 'colour pushed away from paper');
  });

  test('options: largest, holeMin, tol, text', () => {
    const s = sheet(100, 100);
    fill(s, 20, 20, 70, 70, [60, 40, 30]);
    fill(s, 80, 50, 86, 56, [90, 160, 60]);          // paint dot, 36 px (< 5% of figure)
    const kept = extractSprite(s, { pad: 0 });
    assert.equal(kept.image.width, 66);
    const only = extractSprite(s, { largest: true, pad: 0 });
    assert.equal(only.image.width, 50);
    const holeSheet = sheet(100, 100);
    fill(holeSheet, 20, 20, 80, 80, [60, 40, 30]);
    fill(holeSheet, 45, 45, 50, 50, PAPER);          // 25 px hole: kept by default, cleared with holeMin 10
    assert.equal(alphaAt(extractSprite(holeSheet, { pad: 0 }).image, 27, 27), 255);
    assert.equal(alphaAt(extractSprite(holeSheet, { pad: 0, holeMin: 10 }).image, 27, 27), 0);
    const pale = sheet(60, 60);
    fill(pale, 20, 20, 40, 40, [228, 225, 217]);     // distance ~20 from paper
    assert.equal(extractSprite(pale).empty, true);
    assert.equal(extractSprite(pale, { tol: 10 }).empty, false);
    const text = sheet(50, 20);
    fill(text, 10, 5, 12, 15, [30, 30, 30]);
    fill(text, 30, 5, 31, 6, [30, 30, 30]);          // tiny dot survives in text mode
    const t = extractSprite(text, { text: true, pad: 0 });
    assert.equal(t.image.width, 21);
  });

  test('blank crop is reported empty and returned uncropped', () => {
    const res = extractSprite(sheet(10, 10));
    assert.equal(res.empty, true);
    assert.equal(res.image.width, 10);
  });

  test('extractSprite counts solid pixels on each crop edge', () => {
    const s = sheet(60, 60);
    fill(s, 10, 0, 30, 40, [40, 40, 40]);           // runs off the top of the crop
    const r = extractSprite(s);
    assert.equal(r.edges.top, 20);
    assert.deepEqual([r.edges.bottom, r.edges.left, r.edges.right], [0, 0, 0]);
    assert.equal(r.opaque, 800);
    assert.deepEqual(extractSprite(sheet(10, 10)).edges, { top: 0, bottom: 0, left: 0, right: 0 });
    const corner = sheet(60, 60);
    fill(corner, 0, 30, 30, 60, [40, 40, 40]);     // runs off the bottom-left corner
    const c = extractSprite(corner).edges;
    assert.deepEqual([c.top, c.bottom, c.left, c.right], [0, 30, 30, 0]);
  });

  test('cutSprite grows a side the drawing runs into, then stops', () => {
    const s = sheet(200, 200);
    fill(s, 80, 30, 120, 150, [60, 40, 30]);        // figure from y=30 to 150
    const r = cutSprite(s, { x: 60, y: 50, w: 80, h: 120 });   // top cut at y=50
    assert.deepEqual(r.clipped, []);
    assert.equal(r.grown.top, 24);                  // 50 -> 26: first rectangle clear of y=30
    assert.deepEqual(r.rect, { x: 60, y: 26, w: 80, h: 144 });
    assert.deepEqual(SIDES, ['top', 'bottom', 'left', 'right']);
    const off = cutSprite(s, { x: 60, y: 50, w: 80, h: 120 }, {}, { grow: false });
    assert.deepEqual(off.clipped, ['top']);
    assert.deepEqual(off.rect, { x: 60, y: 50, w: 80, h: 120 });
  });

  test('cutSprite clips the request to the sheet and reports sheet edge and max limits', () => {
    const s = sheet(100, 100);
    fill(s, 30, 0, 60, 70, [60, 40, 30]);           // touches the sheet's top edge
    const r = cutSprite(s, { x: 20, y: -10, w: 60, h: 90 });
    assert.deepEqual(r.rect, { x: 20, y: 0, w: 60, h: 80 });
    assert.deepEqual(r.clipped, ['top']);
    assert.equal(r.blockedBy.top, 'sheet edge');
    const t = sheet(200, 200);
    fill(t, 80, 10, 120, 150, [60, 40, 30]);
    const m = cutSprite(t, { x: 60, y: 60, w: 80, h: 110 }, {}, { max: 16, step: 10 });
    assert.equal(m.grown.top, 16);
    assert.deepEqual(m.clipped, ['top']);
    assert.equal(m.blockedBy.top, 'max');
  });

  test('cutSprite ignores neighbours that stay cut by the border, stops before swallowing one', () => {
    // A neighbour only partly inside the grown box is removed as a border fragment: growth just goes on.
    const p = sheet(300, 200);
    fill(p, 40, 40, 100, 160, [60, 40, 30]);
    fill(p, 104, 20, 260, 180, [30, 60, 90]);
    const partial = cutSprite(p, { x: 20, y: 20, w: 80, h: 160 });
    assert.deepEqual(partial.clipped, []);
    assert.equal(partial.image.width, 64);
    // A whole neighbour would land inside after one step: the solid area jumps, so that side stops.
    const s = sheet(300, 220);
    fill(s, 60, 100, 100, 110, [60, 40, 30]);       // small figure touching the right edge (x=99)
    fill(s, 102, 30, 106, 170, [30, 60, 90]);       // thin neighbour fully inside after +8
    const r = cutSprite(s, { x: 20, y: 20, w: 80, h: 160 });
    assert.deepEqual(r.clipped, ['right']);
    assert.equal(r.blockedBy.right, 'neighbour');
    assert.equal(r.rect.w, 80);
    // Two sides growing at once and one swallows a neighbour: retry one side at a time.
    const t = sheet(300, 300);
    fill(t, 150, 40, 160, 100, [60, 40, 30]);       // cut at top (crop y=60) and right (crop ends x=159)
    fill(t, 162, 40, 166, 215, [30, 60, 90]);       // neighbour fully inside once the right side grows
    const two = cutSprite(t, { x: 80, y: 60, w: 80, h: 160 });
    assert.equal(two.grown.top, 24);
    assert.equal(two.blockedBy.right, 'neighbour');
    assert.deepEqual(two.clipped, ['right']);
  });

  test('drawBoxes outlines rectangles and ignores off-sheet pixels', () => {
    const s = sheet(20, 20);
    const out = drawBoxes(s, [{ x: 2, y: 2, w: 10, h: 10 }, { x: 15, y: 15, w: 10, h: 10 }]);
    assert.deepEqual([...out.data.subarray((2 * 20 + 5) * 4, (2 * 20 + 5) * 4 + 3)], [230, 30, 60]);
    assert.deepEqual([...out.data.subarray((7 * 20 + 7) * 4, (7 * 20 + 7) * 4 + 3)], PAPER);
    assert.deepEqual([...s.data.subarray((2 * 20 + 5) * 4, (2 * 20 + 5) * 4 + 3)], PAPER);
    assert.deepEqual([...drawBoxes(s, [{ x: 0, y: 0, w: 3, h: 3 }], [1, 2, 3]).data.subarray(0, 3)], [1, 2, 3]);
  });

  test('contactSheet scales large sprites, keeps small ones, skips transparent pixels', () => {
    const big = { width: 400, height: 100, data: new Uint8Array(400 * 100 * 4).fill(255) };
    const small = { width: 2, height: 2, data: Uint8Array.from([10, 10, 10, 255, 0, 0, 0, 0, 10, 10, 10, 255, 10, 10, 10, 255]) };
    const cs = contactSheet([big, small], 100, 6);
    assert.equal(cs.width, 200);
    assert.equal(cs.height, 100);
    assert.deepEqual([...cs.data.subarray((50 * 200 + 50) * 4, (50 * 200 + 50) * 4 + 4)], [255, 255, 255, 255]);
    assert.deepEqual([...cs.data.subarray((49 * 200 + 149) * 4, (49 * 200 + 149) * 4 + 3)], [10, 10, 10]);
    const marked = contactSheet([small, small], 20, 2, [[255, 0, 0], null]);
    assert.deepEqual([...marked.data.subarray(0, 3)], [255, 0, 0]);
    assert.notDeepEqual([...marked.data.subarray(20 * 4, 20 * 4 + 3)], [255, 0, 0]);
    const empty = contactSheet([]);
    assert.equal(empty.width, 200);
    assert.equal(contactSheet([small, small, small], 10, 2).height, 20);
  });
});

describe('cut-sprites CLI', () => {
  const sheets = { a: 'a.png' };
  test('normalizeCrop validates names, sheets, numbers and options', () => {
    assert.deepEqual(normalizeCrop('girl', ['a', 1, 2, 3, 4], sheets), { sheet: 'a', x: 1, y: 2, w: 3, h: 4, options: {} });
    assert.deepEqual(normalizeCrop('girl-2', { sheet: 'a', x: 0, y: 0, w: 1, h: 1, options: { largest: true } }, sheets).options, { largest: true });
    assert.throws(() => normalizeCrop('Girl', ['a', 0, 0, 1, 1], sheets), /kebab-case/);
    assert.throws(() => normalizeCrop('g', ['b', 0, 0, 1, 1], sheets), /unknown sheet "b"/);
    assert.throws(() => normalizeCrop('g', ['a', -1, 0, 1, 1], sheets), /x must be a non-negative integer/);
    assert.throws(() => normalizeCrop('g', ['a', 0, 1.5, 1, 1], sheets), /y must be/);
    assert.throws(() => normalizeCrop('g', ['a', 0, 0, 0, 1], sheets), /must be positive/);
    assert.throws(() => normalizeCrop('g', ['a', 0, 0, 1, 1, { blur: 1 }], sheets), /unknown option "blur"/);
    assert.deepEqual(normalizeCrop('g', ['a', 0, 0, 1, 1, { grow: false, growMax: 40 }], sheets).options, { grow: false, growMax: 40 });
  });

  test('parseArgs', () => {
    assert.deepEqual(parseArgs(['c.json', '--out', 'o', '--only', 'a,,b', '--boxes', '--no-grow', '--update-crops', '--strict']), { only: ['a', 'b'], boxes: true, grow: false, updateCrops: true, strict: true, cropsFile: 'c.json', out: 'o' });
    assert.deepEqual(parseArgs([]), { only: [], boxes: false, grow: true, updateCrops: false, strict: false, cropsFile: undefined, out: undefined });
  });

  function project() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cut-'));
    const s = sheet(200, 100);
    fill(s, 20, 20, 60, 80, [60, 40, 30]);
    fill(s, 120, 20, 160, 80, [30, 60, 90]);
    fs.writeFileSync(path.join(dir, 'a.png'), encodePng(s));
    fs.writeFileSync(path.join(dir, 'crops.json'), JSON.stringify({
      sheets: { a: 'a.png' },
      crops: { left: ['a', 10, 10, 60, 80], right: { sheet: 'a', x: 110, y: 10, w: 60, h: 80, options: { largest: true } }, blank: ['a', 75, 5, 30, 10] },
    }));
    return dir;
  }

  test('cuts all crops, writes manifest, contact sheet and boxes, warns on empty', () => {
    const dir = project();
    const r = io();
    assert.equal(main([path.join(dir, 'crops.json'), '--out', path.join(dir, 'out'), '--boxes'], r.io), 0);
    const m = JSON.parse(fs.readFileSync(path.join(dir, 'out', 'sprites.json'), 'utf8'));
    assert.deepEqual(m.sprites.map((s) => s.name), ['left', 'right', 'blank']);
    assert.equal(m.crops_file, path.join('..', 'crops.json'));
    assert.equal(m.sprites[0].width, 44);
    assert.equal(m.sprites[2].empty, true);
    for (const f of ['left.png', 'right.png', '_contact.png', '_boxes-a.png']) assert.ok(fs.existsSync(path.join(dir, 'out', f)), f);
    assert.match(r.err[0], /blank has no drawing left/);
    assert.match(r.out[0], /Cut 3 sprite\(s\)/);
  });

  test('--only limits the cut; unknown names and bad input fail', () => {
    const dir = project();
    let r = io();
    assert.equal(main([path.join(dir, 'crops.json'), '--out', path.join(dir, 'o2'), '--only', 'right'], r.io), 0);
    assert.deepEqual(fs.readdirSync(path.join(dir, 'o2')).sort(), ['_contact.png', 'right.png', 'sprites.json']);
    r = io();
    assert.equal(main([path.join(dir, 'crops.json'), '--out', path.join(dir, 'o3'), '--only', 'ghost'], r.io), 1);
    assert.match(r.err[0], /--only names not in crops: ghost/);
    fs.writeFileSync(path.join(dir, 'bad.json'), '{');
    r = io();
    assert.equal(main([path.join(dir, 'bad.json'), '--out', path.join(dir, 'o4')], r.io), 1);
    assert.match(r.err[0], /^error: /);
    fs.writeFileSync(path.join(dir, 'empty.json'), '{}');
    assert.equal(main([path.join(dir, 'empty.json'), '--out', path.join(dir, 'o5')], io().io), 0);
    r = io();
    assert.equal(main(['only-crops.json'], r.io), 1);
    assert.match(r.err[0], /Usage/);
  });

  test('grows cut crops, reports them, writes them back with --update-crops, --strict fails on leftovers', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cut-grow-'));
    const s = sheet(300, 200);
    fill(s, 40, 20, 80, 150, [60, 40, 30]);          // A: cut at top by its crop
    fill(s, 140, 0, 180, 150, [30, 60, 90]);         // B: touches the sheet edge, cannot be fixed
    fill(s, 220, 20, 260, 150, [90, 60, 30]);        // C: cut at top, growth switched off
    fs.writeFileSync(path.join(dir, 'a.png'), encodePng(s));
    const crops = { sheets: { a: 'a.png' }, crops: {
      a: ['a', 20, 40, 80, 130],
      b: { sheet: 'a', x: 120, y: 0, w: 80, h: 170 },
      c: { sheet: 'a', x: 200, y: 40, w: 80, h: 130, options: { grow: false } },
      d: { sheet: 'a', x: 20, y: 160, w: 60, h: 30 },
    } };
    const file = path.join(dir, 'crops.json');
    fs.writeFileSync(file, JSON.stringify(crops));
    let r = io();
    assert.equal(main([file, '--out', path.join(dir, 'o'), '--boxes'], r.io), 0);
    assert.deepEqual(r.out[0], 'grew a: top +24px');
    assert.ok(r.err.some((e) => /b is still cut at top \(sheet edge\)/.test(e)));
    assert.ok(r.err.some((e) => /c is still cut at top \(growth off\)/.test(e)));
    const m = JSON.parse(fs.readFileSync(path.join(dir, 'o', 'sprites.json'), 'utf8'));
    assert.deepEqual(m.sprites[0].requested, { x: 20, y: 40, w: 80, h: 130 });
    assert.deepEqual(m.sprites[0].crop, { x: 20, y: 16, w: 80, h: 154 });
    assert.deepEqual(m.sprites[0].grown, { top: 24 });
    assert.deepEqual(m.sprites[1].clipped, ['top']);
    assert.equal(m.sprites[1].requested, undefined);
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).crops.a[2], 40);   // unchanged without --update-crops
    r = io();
    assert.equal(main([file, '--out', path.join(dir, 'o2'), '--no-grow', '--strict'], r.io), 1);
    r = io();
    assert.equal(main([file, '--out', path.join(dir, 'o3'), '--update-crops'], r.io), 0);
    assert.match(r.out.at(-2), /Updated 1 rectangle\(s\)/);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).crops.a, ['a', 20, 16, 80, 154]);
    const obj = { sheets: { a: 'a.png' }, crops: { a: { sheet: 'a', x: 20, y: 40, w: 80, h: 130 } } };
    fs.writeFileSync(file, JSON.stringify(obj));
    assert.equal(main([file, '--out', path.join(dir, 'o4'), '--update-crops', '--strict'], io().io), 0);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).crops.a, { sheet: 'a', x: 20, y: 16, w: 80, h: 154 });
    r = io();
    assert.equal(main([file, '--out', path.join(dir, 'o5'), '--update-crops'], r.io), 0);
    assert.doesNotMatch(r.out.join('\n'), /Updated/);
  });

  test('runs as a script', () => {
    const dir = project();
    const ok = spawnSync(process.execPath, [path.join(DIR, 'cut-sprites.mjs'), path.join(dir, 'crops.json'), '--out', path.join(dir, 'cli')], { encoding: 'utf8' });
    assert.equal(ok.status, 0);
    const bad = spawnSync(process.execPath, [path.join(DIR, 'cut-sprites.mjs')], { encoding: 'utf8' });
    assert.equal(bad.status, 1);
  });
});
