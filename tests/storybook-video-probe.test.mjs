import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(ROOT, 'plugins/fairytale-studio/skills/storybook-video/scripts/probe-mp4.mjs');
const { boxes, find, probe, check, main } = await import(SCRIPT);

// ---- tiny MP4 builder ----
const u32 = (...v) => { const b = Buffer.alloc(4 * v.length); v.forEach((x, i) => b.writeUInt32BE(x, i * 4)); return b; };
const u64 = (v) => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(v)); return b; };
const box = (type, ...parts) => { const body = Buffer.concat(parts); return Buffer.concat([u32(body.length + 8), Buffer.from(type, 'latin1'), body]); };
const full = (type, version, flags, ...parts) => box(type, u32(((version & 255) << 24) | flags), ...parts);
const pad = (n) => Buffer.alloc(n);

function tkhd(v, id, w, h) {
  if (v === 1) { const b = pad(92); b.writeUInt32BE(id, 16); b.writeUInt32BE(w * 65536, 84); b.writeUInt32BE(h * 65536, 88); return full('tkhd', 1, 3, b); }
  const b = pad(80); b.writeUInt32BE(id, 8); b.writeUInt32BE(w * 65536, 72); b.writeUInt32BE(h * 65536, 76); return full('tkhd', 0, 3, b);
}
const mdhd = (v, ts, dur) => (v === 1 ? full('mdhd', 1, 0, pad(16), u32(ts), u64(dur), pad(4)) : full('mdhd', 0, 0, pad(8), u32(ts, dur), pad(4)));
const mvhd = (v, ts, dur) => (v === 1 ? full('mvhd', 1, 0, pad(16), u32(ts), u64(dur), pad(80)) : full('mvhd', 0, 0, pad(8), u32(ts, dur), pad(80)));
const hdlr = (h) => full('hdlr', 0, 0, pad(4), Buffer.from(h, 'latin1'), pad(13));
const stsd = (codec) => (codec ? full('stsd', 0, 0, u32(1), box(codec, pad(8))) : full('stsd', 0, 0, u32(0)));
const stts = (...pairs) => full('stts', 0, 0, u32(pairs.length / 2, ...pairs));
function trak({ v = 0, id, w = 0, h = 0, ts, dur = 0, handler, codec, sttsPairs, noStsd = false }) {
  const stblKids = noStsd ? [] : [stsd(codec)];
  if (sttsPairs) stblKids.push(stts(...sttsPairs));
  const mdiaKids = [mdhd(v, ts, dur)];
  if (handler) mdiaKids.push(hdlr(handler));
  mdiaKids.push(box('minf', box('stbl', ...stblKids)));
  return box('trak', tkhd(v, id, w, h), box('mdia', ...mdiaKids));
}
const ftyp = box('ftyp', Buffer.from('isom'), u32(512), Buffer.from('isomiso2'));
const trex = (id, dur) => full('trex', 0, 0, u32(id, 1, dur, 0, 0));
const tfhd = (flags, id, ...opt) => full('tfhd', 0, flags, u32(id), ...opt);
const tfdt = (v, t) => (v === 1 ? full('tfdt', 1, 0, u64(t)) : full('tfdt', 0, 0, u32(t)));
const trun = (flags, n, ...rest) => full('trun', 0, flags, u32(n), ...rest);

const tmpFile = (buf) => { const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp4-')), 'v.mp4'); fs.writeFileSync(f, buf); return f; };
const io = () => { const out = [], err = []; return { out, err, io: { out: (s) => out.push(s), err: (s) => err.push(s) } }; };

function plainMp4() {
  const moov = box('moov',
    mvhd(0, 1000, 2000),
    trak({ id: 1, w: 640, h: 360, ts: 1000, dur: 2000, handler: 'vide', codec: 'avc1', sttsPairs: [50, 40] }),
    trak({ id: 2, ts: 48000, dur: 96000, handler: 'soun', codec: 'mp4a', sttsPairs: [90, 1024, 4, 1024] }),
  );
  return Buffer.concat([ftyp, moov, box('mdat', pad(16))]);
}

function fragmentedMp4() {
  const moov = box('moov',
    mvhd(1, 1000, 0),
    trak({ v: 1, id: 1, w: 1920, h: 1080, ts: 30000, handler: 'vide', codec: 'avc1' }),
    trak({ id: 2, ts: 48000, handler: 'soun', codec: 'mp4a' }),
    box('mvex', trex(1, 1000), trex(2, 1024)),
  );
  // fragment 1: video with explicit per-sample durations (+sizes) and v1 tfdt; audio default from tfhd.
  const moof1 = box('moof', full('mfhd', 0, 0, u32(1)),
    box('traf', tfhd(0x8, 1, u32(1500)), tfdt(1, 0), trun(0x100 | 0x200 | 0x1, 2, u32(0), u32(1500, 10, 1500, 10))),
    box('traf', tfhd(0x8, 2, u32(1024)), tfdt(0, 0), trun(0x0, 47)),
    box('traf', tfdt(0, 0)),                                   // no tfhd: ignored
    box('traf', tfhd(0, 99), trun(0, 5)),                      // unknown track: ignored
  );
  // fragment 2: video without tfdt (continues), base offset + description index flags, trex default duration,
  // trun with data offset + first-sample flags and per-sample flags/cto but no durations.
  const moof2 = box('moof',
    box('traf', tfhd(0x1 | 0x2, 1, u64(0), u32(1)), trun(0x1 | 0x4 | 0x400 | 0x800, 3, u32(0), u32(0), u32(0, 0, 0, 0, 0, 0))),
  );
  const big = Buffer.concat([u32(1), Buffer.from('mdat'), u64(16 + 8), pad(8)]);   // 64-bit size box
  const tail = Buffer.concat([u32(0), Buffer.from('free'), pad(4)]);                // size 0 = to end of file
  return Buffer.concat([ftyp, box('moof', box('traf', tfhd(0, 1), trun(0, 1))), moov, moof1, box('mdat', pad(8)), moof2, big, tail]);
}

describe('box parsing', () => {
  test('boxes handles 32-bit, 64-bit, to-end and corrupt sizes', () => {
    const buf = Buffer.concat([box('free', pad(2)), u32(1), Buffer.from('wide'), u64(20), pad(4), u32(0), Buffer.from('skip'), pad(3)]);
    assert.deepEqual(boxes(buf).map((b) => [b.type, b.hdr, b.size]), [['free', 8, 10], ['wide', 16, 20], ['skip', 8, 11]]);
    assert.deepEqual(boxes(Buffer.concat([u32(4), Buffer.from('bad!')])), []);
    assert.deepEqual(boxes(Buffer.concat([u32(99), Buffer.from('long')])), []);
  });
  test('find walks a path and returns undefined when missing', () => {
    const buf = box('moov', box('trak', box('tkhd', pad(4))));
    const top = boxes(buf)[0];
    assert.equal(find(buf, top, ['trak', 'tkhd']).type, 'tkhd');
    assert.equal(find(buf, top, ['trak', 'mdia']), undefined);
  });
});

describe('probe', () => {
  test('plain MP4: stts durations, sizes, fps, codecs', () => {
    const info = probe(tmpFile(plainMp4()));
    assert.equal(info.brand, 'isom');
    assert.equal(info.fragmented, false);
    assert.equal(info.duration, 2.005);   // longest track (audio)
    assert.deepEqual(info.tracks[0], { id: 1, kind: 'video', codec: 'avc1', timescale: 1000, samples: 50, duration: 2, width: 640, height: 360, fps: 25 });
    assert.deepEqual(info.tracks[1], { id: 2, kind: 'audio', codec: 'mp4a', timescale: 48000, samples: 94, duration: 2.005 });
  });

  test('fragmented MP4: tfdt v0/v1, per-sample and default durations, trex fallback', () => {
    const info = probe(tmpFile(fragmentedMp4()));
    assert.equal(info.fragmented, true);
    assert.equal(info.fragments, 2);
    const v = info.tracks[0], a = info.tracks[1];
    assert.equal(v.width, 1920);
    assert.equal(v.samples, 5);
    assert.equal(v.duration, 0.2);           // (1500*2 + 1000*3) / 30000
    assert.equal(v.fps, 25);
    assert.equal(a.samples, 47);
    assert.equal(a.duration, 1.003);          // 47 * 1024 / 48000
    assert.equal(info.duration, 1.003);
  });

  test('missing handler, empty stsd, no stts, no mvhd, zero timescale', () => {
    const moov = box('moov', trak({ id: 7, ts: 0, codec: '' }), trak({ id: 8, ts: 100, handler: 'text', codec: 'tx3g' }));
    const info = probe(tmpFile(Buffer.concat([ftyp, moov])));
    assert.deepEqual(info.tracks[0], { id: 7, kind: '????', codec: '', timescale: 0, samples: 0, duration: 0 });
    assert.equal(info.tracks[1].kind, 'text');
    assert.equal(info.duration, 0);
  });

  test('zero timescales and a track without stsd', () => {
    const moov = box('moov', mvhd(0, 0, 5), trak({ id: 3, handler: 'vide', ts: 0, w: 2, h: 2, noStsd: true }));
    const info = probe(tmpFile(Buffer.concat([ftyp, moov])));
    assert.deepEqual(info.tracks[0], { id: 3, kind: 'video', codec: '', timescale: 0, samples: 0, duration: 0, width: 2, height: 2, fps: 0 });
    assert.equal(info.duration, 0);
  });

  test('errors: not an MP4, and no moov', () => {
    assert.throws(() => probe(tmpFile(Buffer.from('hello world, not a video'))), /not an MP4/);
    assert.throws(() => probe(tmpFile(ftyp)), /no moov box/);
    assert.throws(() => probe(tmpFile(Buffer.concat([u32(3), Buffer.from('ftyp')]))), /not an MP4/);
  });
});

describe('check', () => {
  const info = { duration: 10, tracks: [{ kind: 'video', width: 1920, height: 1080 }, { kind: 'audio', samples: 5 }] };
  test('passes and fails each expectation', () => {
    assert.deepEqual(check(info, { duration: 10.5, size: '1920x1080', audio: true }), []);
    assert.deepEqual(check(info, { duration: 12 }), ['duration 10s, expected 12s ± 1']);
    assert.deepEqual(check(info, { duration: 12, tolerance: 3 }), []);
    assert.deepEqual(check(info, { size: '1280x720' }), ['frame 1920x1080, expected 1280x720']);
    assert.deepEqual(check({ duration: 1, tracks: [] }, { audio: true, size: '1x1' }), ['no video track', 'no audio track']);
    assert.deepEqual(check({ duration: 1, tracks: [{ kind: 'video', width: 1, height: 1 }, { kind: 'audio', samples: 0 }] }, { audio: true }), ['audio track has no samples']);
    assert.deepEqual(check({ duration: 1, tracks: [{ kind: 'video', width: 1, height: 1 }] }, {}), []);
  });
});

describe('cli', () => {
  test('text output with and without expectations, failures, json, usage, errors', () => {
    const f = tmpFile(plainMp4());
    let r = io();
    assert.equal(main([f], r.io), 0);
    assert.match(r.out[0], /0\.0 MB, brand isom, not fragmented, duration 2.005s/);
    assert.match(r.out[1], /track 1 video avc1 640x360 25 fps, 50 samples, 2s/);
    assert.match(r.out[2], /track 2 audio mp4a, 94 samples/);
    assert.equal(r.out.length, 3);
    r = io();
    assert.equal(main([f, '--expect-duration', '2', '--tolerance', '0.1', '--expect-size', '640x360', '--require-audio'], r.io), 0);
    assert.equal(r.out.at(-1), 'All checks passed.');
    r = io();
    assert.equal(main([f, '--expect-duration', '9'], r.io), 1);
    assert.match(r.err[0], /^FAIL: duration 2.005s/);
    r = io();
    assert.equal(main([tmpFile(fragmentedMp4()), '--json', '--expect-size', '1x1'], r.io), 1);
    const j = JSON.parse(r.out[0]);
    assert.equal(j.fragmented, true);
    assert.deepEqual(j.failures, ['frame 1920x1080, expected 1x1']);
    r = io();
    assert.match(main([tmpFile(fragmentedMp4())], r.io) === 0 && r.out[0], /fragmented \(2 fragments\)/);
    r = io();
    const noFtyp = tmpFile(box('moov', trak({ id: 1, handler: 'vide', ts: 10, codec: 'avc1', w: 4, h: 4, sttsPairs: [10, 1] })));
    assert.equal(main([noFtyp], r.io), 0);
    assert.match(r.out[0], /brand -, not fragmented, duration 1s/);
    r = io();
    assert.equal(main([], r.io), 1);
    assert.match(r.err[0], /^Usage/);
    r = io();
    assert.equal(main(['/nonexistent/x.mp4'], r.io), 1);
    assert.match(r.err[0], /^error: /);
    // Bad check values fail instead of passing every check; unknown options are not taken as the file.
    const good = tmpFile(plainMp4());
    for (const [args, msg] of [
      [['--expect-duration', '<storyboard duration>'], '--expect-duration needs a number of seconds, got "<storyboard duration>"'],
      [['--expect-duration'], '--expect-duration needs a number of seconds, got nothing'],
      [['--tolerance', '-1'], '--tolerance needs a number of seconds, got "-1"'],
      [['--tolerance', ' '], '--tolerance needs a number of seconds, got " "'],
      [['--expect-size', '1080'], '--expect-size needs WxH, got "1080"'],
      [['--expect-fps', '30'], 'unknown option --expect-fps'],
    ]) {
      r = io();
      assert.equal(main([good, ...args], r.io), 2, args.join(' '));
      assert.equal(r.err[0].split('\n')[0], `error: ${msg}`);
    }
    r = io();
    assert.notEqual(main([good, '--tolerance', '0', '--expect-duration', '2'], r.io), 2); // 0 is a valid tolerance
  });
  test('runs as a script', () => {
    const res = spawnSync(process.execPath, [SCRIPT, tmpFile(plainMp4()), '--expect-duration', '2'], { encoding: 'utf8' });
    assert.equal(res.status, 0);
    assert.match(res.stdout, /All checks passed/);
    const bad = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /^Usage/);
  });
});
