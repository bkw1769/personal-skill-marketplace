import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILL = path.join(ROOT, 'plugins/fairytale-studio/skills/storybook-video');
const { muxMp4 } = await import(path.join(SKILL, 'assets/template/js/mp4mux.js'));
const { probe, boxes, find } = await import(path.join(SKILL, 'scripts/probe-mp4.mjs'));

const bytes = (n, v) => new Uint8Array(n).fill(v);
const write = (parts) => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mux-')), 'out.mp4');
  fs.writeFileSync(file, Buffer.concat(parts.map((p) => Buffer.from(p))));
  return file;
};
const video = (n) => ({
  width: 1920, height: 1080, timescale: 30000, avcC: Uint8Array.from([1, 100, 0, 40, 255, 225, 0, 0]),
  samples: Array.from({ length: n }, (_, i) => ({ data: bytes(10 + i, 0x10 + i), duration: 1000, key: i % 30 === 0 })),
});
const audio = (n) => ({
  sampleRate: 48000, channels: 2, asc: Uint8Array.from([0x11, 0x90]), bitrate: 192000,
  samples: Array.from({ length: n }, (_, i) => ({ data: bytes(6, 0xa0 + (i % 16)), duration: i === n - 1 ? 512 : 1024 })),
});

describe('muxMp4', () => {
  test('writes a fast-start MP4 with one H.264 and one AAC track that the probe reads back', () => {
    const file = write(muxMp4(video(60), audio(94)));
    const info = probe(file);
    assert.equal(info.fragmented, false);
    assert.equal(info.brand, 'isom');
    const [v, a] = info.tracks;
    assert.deepEqual([v.kind, v.codec, v.width, v.height, v.samples, v.duration], ['video', 'avc1', 1920, 1080, 60, 2]);
    assert.deepEqual([a.kind, a.codec, a.samples], ['audio', 'mp4a', 94]);
    assert.equal(a.duration, 1.995); // (93 * 1024 + 512) / 48000, rounded to ms by the probe
    assert.equal(info.duration, 2);
    const buf = fs.readFileSync(file);
    const top = boxes(buf).map((b) => b.type);
    assert.deepEqual(top, ['ftyp', 'moov', 'mdat']);
    // Chunk offsets point at the first sample of each track.
    const moov = boxes(buf).find((b) => b.type === 'moov');
    const traks = boxes(buf, moov.start + 8, moov.start + moov.size).filter((b) => b.type === 'trak');
    const firstByte = traks.map((t) => {
      const stco = find(buf, t, ['mdia', 'minf', 'stbl', 'stco']);
      return buf[buf.readUInt32BE(stco.start + 16)];
    });
    assert.deepEqual(firstByte, [0x10, 0xa0]);
    const stss = find(buf, traks[0], ['mdia', 'minf', 'stbl', 'stss']);
    assert.equal(buf.readUInt32BE(stss.start + 12), 2); // key frames 1 and 31
  });

  test('video only, empty tracks and the 4 GB limit', () => {
    const only = probe(write(muxMp4(video(3))));
    assert.equal(only.tracks.length, 1);
    const empty = probe(write(muxMp4({ ...video(0) }, audio(0))));
    assert.deepEqual(empty.tracks.map((t) => t.samples), [0, 0]);
    const huge = { ...video(0), samples: [{ data: { length: 0xfffffff8 }, duration: 1000, key: true }] };
    assert.throws(() => muxMp4(huge), /over 4 GB/);
  });
});
