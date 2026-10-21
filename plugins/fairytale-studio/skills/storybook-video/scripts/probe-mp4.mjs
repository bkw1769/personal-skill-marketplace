#!/usr/bin/env node
// Inspect an MP4 without ffprobe: tracks, codecs, frame size, duration and frame rate,
// including fragmented MP4 written by browser MediaRecorder. Reads box headers only,
// so a multi-GB file is fine.
//   node probe-mp4.mjs <file.mp4> [--expect-duration 180] [--tolerance 1] [--expect-size 1920x1080] [--require-audio] [--json]
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'mvex', 'moof', 'traf', 'edts', 'dinf']);

/**
 * @typedef {{type: string, start: number, hdr: number, size: number}} Box
 */

/**
 * List the boxes inside a buffer region.
 * @param {Buffer} buf
 * @param {number} [start]
 * @param {number} [end]
 * @returns {Box[]}
 */
export function boxes(buf, start = 0, end = buf.length) {
  const out = [];
  let off = start;
  while (off + 8 <= end) {
    let size = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    let hdr = 8;
    if (size === 1) { size = Number(buf.readBigUInt64BE(off + 8)); hdr = 16; }
    else if (size === 0) size = end - off;
    if (size < hdr || off + size > end) break;
    out.push({ type, start: off, hdr, size });
    off += size;
  }
  return out;
}

/**
 * Find the first descendant box by path, e.g. ['mdia', 'minf', 'stbl', 'stsd'].
 * @param {Buffer} buf
 * @param {Box} box
 * @param {string[]} pathTypes
 * @returns {Box | undefined}
 */
export function find(buf, box, pathTypes) {
  let cur = box;
  for (const t of pathTypes) {
    cur = boxes(buf, cur.start + cur.hdr, cur.start + cur.size).find((b) => b.type === t);
    if (!cur) return undefined;
  }
  return cur;
}

/** Content offset (after the box header). */
const at = (/** @type {Box} */ b) => b.start + b.hdr;

/**
 * Parse a moov box: per-track id, handler, codec, size, timescale and (unfragmented) duration.
 * @param {Buffer} buf
 * @param {Box} moov
 */
export function parseMoov(buf, moov) {
  const kids = boxes(buf, at(moov), moov.start + moov.size);
  const mvhd = kids.find((b) => b.type === 'mvhd');
  let movie = null;
  if (mvhd) {
    const o = at(mvhd), v1 = buf[o] === 1;
    const ts = buf.readUInt32BE(o + (v1 ? 20 : 12));
    const dur = v1 ? Number(buf.readBigUInt64BE(o + 24)) : buf.readUInt32BE(o + 16);
    movie = { timescale: ts, duration: ts ? dur / ts : 0 };
  }
  const defaults = new Map();
  const mvex = kids.find((b) => b.type === 'mvex');
  if (mvex) for (const t of boxes(buf, at(mvex), mvex.start + mvex.size).filter((b) => b.type === 'trex')) defaults.set(buf.readUInt32BE(at(t) + 4), buf.readUInt32BE(at(t) + 12));
  const tracks = kids.filter((b) => b.type === 'trak').map((trak) => {
    const tkhd = find(buf, trak, ['tkhd']);
    const o = at(tkhd), v1 = buf[o] === 1;
    const id = buf.readUInt32BE(o + (v1 ? 20 : 12));
    const wOff = o + (v1 ? 88 : 76);
    const width = Math.round(buf.readUInt32BE(wOff) / 65536), height = Math.round(buf.readUInt32BE(wOff + 4) / 65536);
    const mdhd = find(buf, trak, ['mdia', 'mdhd']);
    const mo = at(mdhd), mv1 = buf[mo] === 1;
    const timescale = buf.readUInt32BE(mo + (mv1 ? 20 : 12));
    const mdur = mv1 ? Number(buf.readBigUInt64BE(mo + 24)) : buf.readUInt32BE(mo + 16);
    const hdlr = find(buf, trak, ['mdia', 'hdlr']);
    const handler = hdlr ? buf.toString('latin1', at(hdlr) + 8, at(hdlr) + 12) : '????';
    const stsd = find(buf, trak, ['mdia', 'minf', 'stbl', 'stsd']);
    const codec = stsd && buf.readUInt32BE(at(stsd) + 4) > 0 ? buf.toString('latin1', at(stsd) + 12, at(stsd) + 16) : '';
    const stts = find(buf, trak, ['mdia', 'minf', 'stbl', 'stts']);
    let samples = 0, ticks = 0;
    if (stts) {
      const n = buf.readUInt32BE(at(stts) + 4);
      for (let i = 0; i < n; i++) {
        const c = buf.readUInt32BE(at(stts) + 8 + i * 8), d = buf.readUInt32BE(at(stts) + 12 + i * 8);
        samples += c; ticks += c * d;
      }
    }
    return {
      id, kind: handler === 'vide' ? 'video' : handler === 'soun' ? 'audio' : handler, codec,
      width: handler === 'vide' ? width : 0, height: handler === 'vide' ? height : 0,
      timescale, samples, ticks: Math.max(ticks, mdur), defaultDuration: defaults.get(id) || 0, endTicks: 0,
    };
  });
  return { movie, tracks };
}

/**
 * Add one moof's samples to the tracks (fragmented MP4).
 * @param {Buffer} buf
 * @param {Box} moof
 * @param {ReturnType<typeof parseMoov>['tracks']} tracks
 */
export function parseMoof(buf, moof, tracks) {
  for (const traf of boxes(buf, at(moof), moof.start + moof.size).filter((b) => b.type === 'traf')) {
    const kids = boxes(buf, at(traf), traf.start + traf.size);
    const tfhd = kids.find((b) => b.type === 'tfhd');
    if (!tfhd) continue;
    const flags = buf.readUInt32BE(at(tfhd)) & 0xffffff;
    const track = tracks.find((t) => t.id === buf.readUInt32BE(at(tfhd) + 4));
    if (!track) continue;
    let p = at(tfhd) + 8;
    if (flags & 0x1) p += 8;
    if (flags & 0x2) p += 4;
    const defDur = flags & 0x8 ? buf.readUInt32BE(p) : track.defaultDuration;
    const tfdt = kids.find((b) => b.type === 'tfdt');
    let t = tfdt ? (buf[at(tfdt)] === 1 ? Number(buf.readBigUInt64BE(at(tfdt) + 4)) : buf.readUInt32BE(at(tfdt) + 4)) : track.endTicks;
    for (const trun of kids.filter((b) => b.type === 'trun')) {
      const tf = buf.readUInt32BE(at(trun)) & 0xffffff;
      const n = buf.readUInt32BE(at(trun) + 4);
      let q = at(trun) + 8 + (tf & 0x1 ? 4 : 0) + (tf & 0x4 ? 4 : 0);
      const per = ((tf & 0x100 ? 1 : 0) + (tf & 0x200 ? 1 : 0) + (tf & 0x400 ? 1 : 0) + (tf & 0x800 ? 1 : 0)) * 4;
      for (let i = 0; i < n; i++, q += per) t += tf & 0x100 ? buf.readUInt32BE(q) : defDur;
      track.samples += n;
    }
    track.endTicks = Math.max(track.endTicks, t);
  }
}

/**
 * Probe a file on disk.
 * @param {string} file
 */
export function probe(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const head = Buffer.alloc(16);
    let off = 0, brand = '', moovInfo = null, fragments = 0;
    while (off + 8 <= size) {
      fs.readSync(fd, head, 0, 16, off);
      let boxSize = head.readUInt32BE(0);
      const type = head.toString('latin1', 4, 8);
      if (boxSize === 1) boxSize = Number(head.readBigUInt64BE(8));
      else if (boxSize === 0) boxSize = size - off;
      if (boxSize < 8 || off + boxSize > size) break;
      if (type === 'ftyp' || type === 'moov' || type === 'moof') {
        const buf = Buffer.alloc(boxSize);
        fs.readSync(fd, buf, 0, boxSize, off);
        const box = boxes(buf)[0];
        if (type === 'ftyp') brand = buf.toString('latin1', at(box), at(box) + 4);
        else if (type === 'moov') moovInfo = parseMoov(buf, box);
        else if (moovInfo) { parseMoof(buf, box, moovInfo.tracks); fragments++; }
      }
      off += boxSize;
    }
    if (!brand && !moovInfo) throw new Error('not an MP4 file (no ftyp or moov box)');
    if (!moovInfo) throw new Error('no moov box (file may be truncated or still being written)');
    const tracks = moovInfo.tracks.map((t) => {
      const ticks = Math.max(t.ticks, t.endTicks);
      const duration = t.timescale ? ticks / t.timescale : 0;
      const out = { id: t.id, kind: t.kind, codec: t.codec, timescale: t.timescale, samples: t.samples, duration: Math.round(duration * 1000) / 1000 };
      if (t.kind === 'video') Object.assign(out, { width: t.width, height: t.height, fps: duration ? Math.round((t.samples / duration) * 100) / 100 : 0 });
      return out;
    });
    const duration = Math.max(0, ...tracks.map((t) => t.duration), moovInfo.movie ? moovInfo.movie.duration : 0);
    return { file, bytes: size, brand, fragmented: fragments > 0, fragments, duration: Math.round(duration * 1000) / 1000, tracks };
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Compare a probe result with expectations; returns failure messages.
 * @param {ReturnType<typeof probe>} info
 * @param {{duration?: number, tolerance?: number, size?: string, audio?: boolean}} want
 * @returns {string[]}
 */
export function check(info, want) {
  const fails = [];
  const video = info.tracks.find((t) => t.kind === 'video');
  const audio = info.tracks.find((t) => t.kind === 'audio');
  if (!video) fails.push('no video track');
  if (want.audio && !audio) fails.push('no audio track');
  if (want.audio && audio && audio.samples === 0) fails.push('audio track has no samples');
  if (want.duration !== undefined && Math.abs(info.duration - want.duration) > (want.tolerance ?? 1)) fails.push(`duration ${info.duration}s, expected ${want.duration}s ± ${want.tolerance ?? 1}`);
  if (want.size && video && `${video.width}x${video.height}` !== want.size) fails.push(`frame ${video.width}x${video.height}, expected ${want.size}`);
  return fails;
}

/**
 * CLI.
 * @param {string[]} argv
 * @param {{out: (s: string) => void, err: (s: string) => void}} io
 * @returns {number}
 */
export function main(argv, io) {
  const want = {};
  let file, json = false;
  const usage = 'Usage: node probe-mp4.mjs <file.mp4> [--expect-duration s] [--tolerance s] [--expect-size WxH] [--require-audio] [--json]';
  // A check option with a bad value (a placeholder left in, "abc") must fail, not quietly pass every check.
  const seconds = (flag, v) => {
    const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
    if (!Number.isFinite(n) || n < 0) throw new Error(`${flag} needs a number of seconds, got ${v === undefined ? 'nothing' : JSON.stringify(v)}`);
    return n;
  };
  try {
    for (let i = 0; i < argv.length; i++) {
      const a = argv[i];
      if (a === '--expect-duration') want.duration = seconds(a, argv[++i]);
      else if (a === '--tolerance') want.tolerance = seconds(a, argv[++i]);
      else if (a === '--expect-size') {
        want.size = argv[++i];
        if (!/^\d+x\d+$/.test(String(want.size))) throw new Error(`--expect-size needs WxH, got ${JSON.stringify(want.size)}`);
      } else if (a === '--require-audio') want.audio = true;
      else if (a === '--json') json = true;
      else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
      else file = a;
    }
  } catch (e) {
    io.err(`error: ${/** @type {Error} */ (e).message}\n${usage}`);
    return 2;
  }
  if (!file) {
    io.err(usage);
    return 1;
  }
  let info;
  try {
    info = probe(file);
  } catch (e) {
    io.err(`error: ${/** @type {Error} */ (e).message}`);
    return 1;
  }
  const fails = check(info, want);
  if (json) io.out(JSON.stringify({ ...info, failures: fails }, null, 2));
  else {
    io.out(`${info.file}: ${(info.bytes / 1e6).toFixed(1)} MB, brand ${info.brand || '-'}, ${info.fragmented ? `fragmented (${info.fragments} fragments)` : 'not fragmented'}, duration ${info.duration}s`);
    for (const t of info.tracks) io.out(`  track ${t.id} ${t.kind} ${t.codec}${t.width ? ` ${t.width}x${t.height} ${t.fps} fps` : ''}, ${t.samples} samples, ${t.duration}s`);
    fails.forEach((f) => io.err(`FAIL: ${f}`));
    if (!fails.length && Object.keys(want).length) io.out('All checks passed.');
  }
  return fails.length ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2), { out: (s) => console.log(s), err: (s) => console.error(s) });
}
