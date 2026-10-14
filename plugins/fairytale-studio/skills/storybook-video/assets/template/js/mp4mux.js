// Minimal MP4 (ISO BMFF) writer for the frame-by-frame export: one H.264 video track and one AAC
// audio track from WebCodecs chunks, not fragmented, moov first ("fast start") so players and
// uploads can start before reading the whole file. No dependencies; runs in the browser and in Node.

const enc = new TextEncoder();

/** Concatenate byte arrays. */
function cat(parts) {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
const u8 = (...v) => Uint8Array.from(v);
function u16(v) { return u8((v >>> 8) & 255, v & 255); }
function u32(v) { return u8((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255); }
const zeros = (n) => new Uint8Array(n);
/** A box: 32-bit size, 4-char type, payload. */
function box(type, ...payload) {
  const body = cat(payload);
  return cat([u32(body.length + 8), enc.encode(type), body]);
}
/** A full box: box with version and flags. */
const fullBox = (type, version, flags, ...payload) => box(type, u8(version, (flags >>> 16) & 255, (flags >>> 8) & 255, flags & 255), ...payload);
const MATRIX = cat([u32(0x10000), u32(0), u32(0), u32(0), u32(0x10000), u32(0), u32(0), u32(0), u32(0x40000000)]);
/** MPEG-4 descriptor with a 4-byte length. */
const descriptor = (tag, ...payload) => { const body = cat(payload); return cat([u8(tag, 0x80 | ((body.length >>> 21) & 127), 0x80 | ((body.length >>> 14) & 127), 0x80 | ((body.length >>> 7) & 127), body.length & 127), body]); };

/** Run-length time-to-sample table. */
function stts(samples) {
  const runs = [];
  for (const s of samples) {
    const last = runs[runs.length - 1];
    if (last && last[1] === s.duration) last[0]++;
    else runs.push([1, s.duration]);
  }
  return fullBox('stts', 0, 0, u32(runs.length), ...runs.map(([n, d]) => cat([u32(n), u32(d)])));
}

function sampleTables(samples, offset, entry, video) {
  const keys = video ? samples.map((s, i) => (s.key ? i + 1 : 0)).filter(Boolean) : [];
  return box('stbl',
    fullBox('stsd', 0, 0, u32(1), entry),
    stts(samples),
    ...(video ? [fullBox('stss', 0, 0, u32(keys.length), ...keys.map(u32))] : []),
    fullBox('stsc', 0, 0, ...(samples.length ? [u32(1), u32(1), u32(samples.length), u32(1)] : [u32(0)])),
    fullBox('stsz', 0, 0, u32(0), u32(samples.length), ...samples.map((s) => u32(s.data.length))),
    fullBox('stco', 0, 0, ...(samples.length ? [u32(1), u32(offset)] : [u32(0)])));
}

function trak(id, kind, t, offset, movieTicks) {
  const video = kind === 'video';
  const ticks = t.samples.reduce((n, s) => n + s.duration, 0);
  const entry = video
    ? box('avc1', zeros(6), u16(1), zeros(16), u16(t.width), u16(t.height), u32(0x480000), u32(0x480000), u32(0), u16(1), zeros(32), u16(0x18), u16(0xffff), box('avcC', t.avcC))
    : box('mp4a', zeros(6), u16(1), zeros(8), u16(t.channels), u16(16), u16(0), u16(0), u32(t.sampleRate * 65536),
      fullBox('esds', 0, 0, descriptor(3, u16(id), u8(0),
        descriptor(4, u8(0x40, 0x15), u8(0, 0, 0), u32(t.bitrate || 0), u32(t.bitrate || 0), descriptor(5, t.asc)),
        descriptor(6, u8(2)))));
  return box('trak',
    fullBox('tkhd', 0, 3, u32(0), u32(0), u32(id), u32(0), u32(movieTicks), zeros(8), u16(0), u16(0), u16(video ? 0 : 0x100), u16(0), MATRIX,
      u32(video ? t.width * 65536 : 0), u32(video ? t.height * 65536 : 0)),
    box('mdia',
      fullBox('mdhd', 0, 0, u32(0), u32(0), u32(t.timescale), u32(ticks), u16(0x55c4), u16(0)),
      fullBox('hdlr', 0, 0, u32(0), enc.encode(video ? 'vide' : 'soun'), zeros(12), enc.encode(video ? 'VideoHandler\0' : 'SoundHandler\0')),
      box('minf',
        video ? fullBox('vmhd', 0, 1, zeros(8)) : fullBox('smhd', 0, 0, zeros(4)),
        box('dinf', fullBox('dref', 0, 0, u32(1), fullBox('url ', 0, 1))),
        sampleTables(t.samples, offset, entry, video))));
}

/**
 * Build an MP4 file from encoded samples.
 * @param {{width: number, height: number, timescale: number, avcC: Uint8Array,
 *          samples: {data: Uint8Array, duration: number, key: boolean}[]}} video  durations in timescale ticks
 * @param {{sampleRate: number, channels: number, asc: Uint8Array, bitrate?: number, timescale?: number,
 *          samples: {data: Uint8Array, duration: number}[]}} [audio]  durations in sampleRate ticks
 * @returns {Uint8Array[]} the file as parts (pass to `new Blob(parts)`; avoids one more copy of the media)
 */
export function muxMp4(video, audio) {
  const tracks = [['video', video], ...(audio ? [['audio', { timescale: audio.sampleRate, ...audio }]] : [])];
  const bytes = tracks.map(([, t]) => t.samples.reduce((n, s) => n + s.data.length, 0));
  const total = bytes.reduce((a, b) => a + b, 0);
  if (total + 8 > 0xffffffff) throw new Error('media over 4 GB: lower the bitrate or split the export');
  const movieMs = Math.max(...tracks.map(([, t]) => Math.round((t.samples.reduce((n, s) => n + s.duration, 0) / t.timescale) * 1000)));
  const ftyp = box('ftyp', enc.encode('isom'), u32(0x200), enc.encode('isomiso2avc1mp41'));
  const moovFor = (offsets) => box('moov',
    fullBox('mvhd', 0, 0, u32(0), u32(0), u32(1000), u32(movieMs), u32(0x10000), u16(0x100), zeros(10), MATRIX, zeros(24), u32(tracks.length + 1)),
    ...tracks.map(([kind, t], i) => trak(i + 1, kind, t, offsets[i], movieMs)));
  // moov size does not depend on the offset values, so measure it once and then fill them in.
  const moovLen = moovFor(tracks.map(() => 0)).length;
  const first = ftyp.length + moovLen + 8;
  const offsets = bytes.map((_, i) => first + bytes.slice(0, i).reduce((a, b) => a + b, 0));
  const moov = moovFor(offsets);
  return [ftyp, moov, cat([u32(total + 8), enc.encode('mdat')]), ...tracks.flatMap(([, t]) => t.samples.map((s) => s.data))];
}
