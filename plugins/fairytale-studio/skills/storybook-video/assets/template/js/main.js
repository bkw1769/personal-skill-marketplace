// Player: one clock (AudioContext time) drives picture and sound. Loads story.config.js,
// the storyboard and the sprites, then plays, seeks, narrates and records.
import CONFIG from '../story.config.js';
import { W, H } from './util.js';
import { loadSprites, loadPlates } from './sprites.js';
import { initPaint } from './paint.js';
import { Synth, autoScore, cuesToEvents, narrationEvents, renderRange, kWeight, integratedLoudness, peakOf, speechToBedDb } from './audio.js';
import { initStage, renderFrame, narrationLines } from './stage.js';
import { SCENES } from './scenes.js';
import * as SCORE from './score.js';
import { muxMp4 } from './mp4mux.js';

const $ = (id) => document.getElementById(id);
const canvas = $('c');
const ctx = canvas.getContext('2d');
const qp = new URLSearchParams(location.search);

let SB = null;
let DURATION = 0;
let T = Number(qp.get('t') || 0);
let playing = false;
let synth = null;
let events = null;
let anchor = 0;
let voiceOn = false;
let lines = [];
let lineIdx = 0;
let recorder = null;
let seeking = false;
// Recorded narration (CONFIG.narration = { audio: full.wav URL, timeline: timeline.json URL }).
let NARR = null; // { timeline, bytes, buffer }

const fmt = (s) => { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const now = () => (playing ? synth.ctx.currentTime - anchor : T);

async function fontsReady() {
  try {
    await Promise.race([
      Promise.all([document.fonts.load('700 48px "Gaegu"'), document.fonts.load('48px "Nanum Pen Script"')]),
      new Promise((r) => setTimeout(r, 4000)),
    ]);
  } catch (e) { /* system fonts */ }
}

function voice() {
  const lang = (SB.language || 'ko').slice(0, 2);
  const vs = speechSynthesis.getVoices();
  return vs.find((v) => v.lang.startsWith(lang) && /yuna|유나|sora|google/i.test(v.name)) || vs.find((v) => v.lang.startsWith(lang)) || null;
}
function resetNarration(t) {
  lineIdx = lines.findIndex((l) => l.t >= t - 0.05);
  if (lineIdx < 0) lineIdx = lines.length;
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}
function narrate(t) {
  if (NARR || !voiceOn || !playing) return;
  while (lineIdx < lines.length && lines[lineIdx].t <= t) {
    const l = lines[lineIdx++];
    if (t - l.t > 1) continue;
    const u = new SpeechSynthesisUtterance(l.text);
    const v = voice();
    if (v) u.voice = v;
    u.lang = v ? v.lang : 'ko-KR';
    u.rate = 1.05;
    u.pitch = 1.1;
    speechSynthesis.speak(u);
  }
}

/** All sound events: the story's written score if it has one, else the auto score, plus cues and recorded narration. */
function buildEvents() {
  const music = typeof SCORE.buildScore === 'function' ? SCORE.buildScore(SB) : autoScore(SB);
  const ev = [...music, ...cuesToEvents(SB)];
  if (NARR) {
    const { events: voice, missing } = narrationEvents(SB, NARR.timeline);
    if (missing.length) console.warn(`voice_lines not in timeline.json (silent): ${missing.join(', ')}`);
    if (!voice.length) console.warn('narration is configured but no caption or bubble has voice_lines; run the storyboard retime step');
    ev.push(...voice);
  }
  return ev.sort((a, b) => a.t - b.t);
}

async function ensureAudio() {
  if (synth) return;
  synth = new Synth(undefined, CONFIG.mix || {});
  events = buildEvents();
  if (NARR) {
    NARR.buffer = await synth.ctx.decodeAudioData(NARR.bytes.slice(0));
    synth.setVoice(NARR.buffer);
  }
  const unknown = [...new Set(events.map((e) => e.fn).filter((fn) => typeof synth[fn] !== 'function'))];
  if (unknown.length) console.warn('Unknown sound names (silent):', unknown.join(', '));
  setInterval(() => synth && synth.pump(), 50);
}
async function play() {
  await ensureAudio();
  await synth.ctx.resume();
  if (T >= DURATION) T = 0;
  anchor = synth.ctx.currentTime - T;
  synth.start(events, T, anchor);
  playing = true;
  resetNarration(T);
  document.body.classList.remove('paused');
  $('play').textContent = '일시정지';
}
function pause() {
  if (!playing) return;
  T = now();
  playing = false;
  synth.stop();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  document.body.classList.add('paused');
  $('play').textContent = '재생';
}
function seek(t) {
  T = Math.max(0, Math.min(DURATION, t));
  if (playing) {
    anchor = synth.ctx.currentTime - T;
    synth.start(events, T, anchor);
    resetNarration(T);
  }
}

function frame() {
  const t = now();
  if (playing && t >= DURATION) {
    T = DURATION;
    pause();
    if (recorder && recorder.state === 'recording') setTimeout(() => recorder.stop(), 600);
  }
  const shown = Math.min(DURATION, playing ? t : T);
  if (!window.__frozen) renderFrame(ctx, shown);
  if (playing) synth.pump();
  narrate(shown);
  if (!seeking) $('seek').value = String(shown);
  $('time').textContent = `${fmt(shown)} / ${fmt(DURATION)}`;
  nextFrame();
}
// A hidden page (background tab, collapsed preview pane) gets no requestAnimationFrame at all;
// while it plays audio its timers still run, so frames keep coming and a recording keeps its
// frame rate. Visible pages use requestAnimationFrame.
function nextFrame() {
  if (document.hidden) setTimeout(frame, 1000 / 32);
  else requestAnimationFrame(frame);
}

function pickMime() {
  const c = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return c.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
}
/**
 * Checks before a real-time recording, each of which spoiled a take once: the audio did not start
 * (a scripted click is not a user gesture while the page is visible), the machine was busy (the take
 * drifted about 1 s out of sync while still passing the probe), the audio clock ran at half speed.
 * Returns a list of problems; window.__preflight keeps the last result.
 */
async function preflight() {
  const issues = [];
  await synth.ctx.resume().catch(() => {});
  if (synth.ctx.state !== 'running') issues.push('소리가 시작되지 않았습니다: 저장 버튼을 마우스로 직접 누르세요');
  let load = null;
  try {
    const r = await fetch('/__load', { cache: 'no-store' });
    if (r.ok) load = await r.json();
  } catch (e) { /* server without /__load */ }
  if (load && load.busy) issues.push(`컴퓨터 부하가 높습니다(${load.load[0]} / CPU ${load.cpus}개): 실시간 녹화는 어긋날 수 있으니 '정밀 저장'을 쓰세요`);
  const a0 = synth.ctx.currentTime, p0 = performance.now();
  await new Promise((r) => setTimeout(r, 1000));
  const rate = (synth.ctx.currentTime - a0) / ((performance.now() - p0) / 1000);
  if (synth.ctx.state === 'running' && Math.abs(rate - 1) > 0.02) issues.push(`오디오 시계가 실제의 ${rate.toFixed(2)}배로 갑니다`);
  window.__preflight = { issues, rate: +rate.toFixed(3), load };
  return issues;
}

async function record(force = false) {
  if (recorder && recorder.state === 'recording') return;
  await ensureAudio();
  const issues = await preflight();
  if (issues.length && !force) {
    console.warn('recording not started:', issues.join(' / '));
    $('rec').textContent = '녹화하지 않음 · ' + issues[0];
    $('rec').style.display = 'block';
    setTimeout(() => { $('rec').style.display = 'none'; $('rec').textContent = '녹화 중 · 끝까지 재생됩니다'; }, 8000);
    return;
  }
  if (NARR) { voiceOn = true; synth.setVoiceOn(true); $('voice').classList.add('on'); }
  const mime = pickMime();
  if (!mime) { alert('이 브라우저는 영상 녹화를 지원하지 않습니다.'); return; }
  const dest = synth.ctx.createMediaStreamDestination();
  synth.out.connect(dest);
  const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 14_000_000, audioBitsPerSecond: 192_000 });
  const chunks = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.onstop = async () => {
    synth.out.disconnect(dest);
    $('rec').style.display = 'none';
    const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
    const blob = new Blob(chunks, { type: mime.split(';')[0] });
    const name = `${CONFIG.saveName || 'story'}.${ext}`;
    try {
      const r = await fetch(`/save?name=${encodeURIComponent(name)}`, { method: 'POST', body: blob });
      if (!r.ok) throw new Error('save failed');
      document.title = 'saved ' + name;
    } catch (e) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
    }
  };
  pause();
  seek(0);
  $('rec').style.display = 'block';
  recorder.start(1000);
  await play();
}

async function main() {
  const res = await fetch(CONFIG.storyboard);
  if (!res.ok) throw new Error(`cannot load ${CONFIG.storyboard} (${res.status})`);
  SB = await res.json();
  DURATION = SB.duration;
  document.title = SB.title;
  $('seek').max = String(DURATION);
  $('length').textContent = `소리를 켜고 보세요 · ${fmt(DURATION)}`;
  if (CONFIG.narration) {
    const [tl, au] = await Promise.all([fetch(CONFIG.narration.timeline), fetch(CONFIG.narration.audio)]);
    if (!tl.ok || !au.ok) throw new Error(`cannot load narration ${CONFIG.narration.timeline} / ${CONFIG.narration.audio}`);
    NARR = { timeline: await tl.json(), bytes: await au.arrayBuffer(), buffer: null };
    voiceOn = true;
    $('voice').classList.add('on');
    $('voice').title = '녹음된 내레이션 켜기/끄기';
  }
  await fontsReady();
  await loadSprites(CONFIG.sprites);
  if (CONFIG.plates) await loadPlates(CONFIG.plates);
  initPaint();
  initStage(SB, SCENES);
  lines = narrationLines();
  if ('speechSynthesis' in window) speechSynthesis.getVoices();
  $('go').disabled = false;
  $('go').textContent = '이야기 시작';
  nextFrame();
  if (qp.has('still')) { $('start').style.display = 'none'; document.title = 'ready'; return; }
  $('go').onclick = () => { $('start').style.display = 'none'; play(); };
  $('play').onclick = () => (playing ? pause() : play());
  $('seek').oninput = (e) => { seeking = true; seek(Number(e.target.value)); };
  $('seek').onchange = () => { seeking = false; };
  $('voice').onclick = () => {
    voiceOn = !voiceOn;
    $('voice').classList.toggle('on', voiceOn);
    if (NARR) { if (synth) synth.setVoiceOn(voiceOn); } else resetNarration(now());
  };
  $('save').onclick = () => { $('start').style.display = 'none'; record(); };
  $('export').onclick = () => { $('start').style.display = 'none'; exportVideo().catch((e) => { console.error(e); alert('정밀 저장 실패: ' + e.message); }); };
  $('save2').onclick = () => { $('start').style.display = 'none'; record(); };
  $('full').onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen());
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); $('start').style.display = 'none'; playing ? pause() : play(); }
    if (e.code === 'ArrowRight') seek(now() + 5);
    if (e.code === 'ArrowLeft') seek(now() - 5);
  });
  document.title = 'ready';
}

main().catch((e) => {
  console.error(e);
  ctx.fillStyle = '#f3efe6'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#2b2420'; ctx.font = '40px sans-serif';
  ctx.fillText('불러오기 실패: ' + e.message, 80, H / 2);
});

/**
 * Frame-by-frame export (not real time): every frame is drawn from its exact time and encoded with
 * WebCodecs, the sound is rendered offline from the same events, and both are written into one MP4.
 * Independent of machine load and of a hidden page; picture and sound cannot drift.
 */
async function exportVideo(o = {}) {
  if (typeof VideoEncoder === 'undefined' || typeof AudioEncoder === 'undefined') {
    alert('이 브라우저는 정밀 저장(WebCodecs)을 지원하지 않습니다. 실시간 녹화를 쓰세요.');
    return null;
  }
  const fps = o.fps || 30, rate = 48000;
  const end = o.duration ?? DURATION;
  pause();
  window.__frozen = true;
  const show = (text) => { $('rec').style.display = 'block'; $('rec').textContent = text; window.__exportStatus = text; };
  try {
    show('정밀 저장 · 소리 만드는 중');
    let voiceBuf = null;
    if (NARR) voiceBuf = NARR.buffer || (await new OfflineAudioContext(1, 1, rate).decodeAudioData(NARR.bytes.slice(0)));
    // The sound is rendered in 20 s pieces so progress shows and memory stays small. Each piece starts
    // LEAD seconds early (notes and effects begun before the piece ring on into it, the master compressor
    // settles), and only its own 20 s are kept; the pieces are joined end to end.
    const LEAD = 4;
    const total = Math.ceil(end * rate);
    const sound = { L: new Float32Array(total), R: new Float32Array(total) };
    const ev = buildEvents();
    for (let t = 0; t < end; t += 20) {
      const from = Math.max(0, t - LEAD);
      const piece = await renderRange(ev, from, Math.min(end, t + 20), { voiceBuf, mix: CONFIG.mix || {}, part: 'all', rate });
      const skip = Math.round((t - from) * rate);
      const at = Math.round(t * rate), n = Math.min(piece.length - skip, total - at);
      sound.L.set(piece.getChannelData(0).subarray(skip, skip + n), at);
      sound.R.set((piece.numberOfChannels > 1 ? piece.getChannelData(1) : piece.getChannelData(0)).subarray(skip, skip + n), at);
      show(`정밀 저장 · 소리 ${Math.min(100, Math.round(((t + 20) / end) * 100))}%`);
    }
    const vs = [], as = [];
    let avcC = null, asc = null, failed = null;
    const ve = new VideoEncoder({
      output: (c, m) => {
        if (m && m.decoderConfig && m.decoderConfig.description) avcC = new Uint8Array(m.decoderConfig.description);
        const b = new Uint8Array(c.byteLength); c.copyTo(b);
        vs.push({ data: b, duration: 30000 / fps, key: c.type === 'key' });
      },
      error: (e) => { failed = e; },
    });
    ve.configure({ codec: 'avc1.640028', width: W, height: H, bitrate: o.bitrate || 12_000_000, framerate: fps, avc: { format: 'avc' } });
    const n = Math.round(end * fps);
    for (let i = 0; i < n && !failed; i++) {
      renderFrame(ctx, i / fps);
      const f = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / fps), duration: Math.round(1e6 / fps) });
      ve.encode(f, { keyFrame: i % (fps * 2) === 0 });
      f.close();
      // Wait on the encoder itself (timers are throttled in a hidden page).
      while (ve.encodeQueueSize > 6) await new Promise((r) => ve.addEventListener('dequeue', r, { once: true }));
      if (i % fps === 0) show(`정밀 저장 · 화면 ${Math.round((i / n) * 100)}%`);
    }
    await ve.flush();
    show('정밀 저장 · 소리 압축 중');
    const ae = new AudioEncoder({
      output: (c, m) => {
        if (m && m.decoderConfig && m.decoderConfig.description) asc = new Uint8Array(m.decoderConfig.description);
        const b = new Uint8Array(c.byteLength); c.copyTo(b);
        as.push({ data: b, duration: c.duration ? Math.round((c.duration * rate) / 1e6) : 1024 });
      },
      error: (e) => { failed = e; },
    });
    ae.configure({ codec: 'mp4a.40.2', sampleRate: rate, numberOfChannels: 2, bitrate: 192000 });
    const L = sound.L, R = sound.R;
    for (let off = 0; off < L.length && !failed; off += 4800) {
      const k = Math.min(4800, L.length - off);
      const data = new Float32Array(k * 2);
      data.set(L.subarray(off, off + k), 0);
      data.set(R.subarray(off, off + k), k);
      const ad = new AudioData({ format: 'f32-planar', sampleRate: rate, numberOfFrames: k, numberOfChannels: 2, timestamp: Math.round((off * 1e6) / rate), data });
      ae.encode(ad);
      ad.close();
    }
    await ae.flush();
    if (failed) throw failed;
    show('정밀 저장 · 파일 쓰는 중');
    const parts = muxMp4({ width: W, height: H, timescale: 30000, avcC, samples: vs }, { sampleRate: rate, channels: 2, asc, bitrate: 192000, samples: as });
    const blob = new Blob(parts, { type: 'video/mp4' });
    const name = `${CONFIG.saveName || 'story'}${o.suffix ?? ''}.mp4`;
    const r = await fetch(`/save?name=${encodeURIComponent(name)}`, { method: 'POST', body: blob });
    if (!r.ok) throw new Error(`save failed (${r.status})`);
    document.title = 'saved ' + name;
    return { name, frames: vs.length, audioFrames: as.length, bytes: blob.size };
  } finally {
    window.__frozen = false;
    $('rec').style.display = 'none';
    $('rec').textContent = '녹화 중 · 끝까지 재생됩니다';
  }
}
window.__export = exportVideo;
window.__record = record;

// Review stills saved next to the recordings (POST /save): send these for approval before recording.
// With saveName '<id>/<id>' they go to <save dir>/<id>/review/.
const SAVE_FOLDER = (CONFIG.saveName || '').replace(/[^/]*$/, '');
window.__capture = async (times, prefix = 'review') => {
  const off = document.createElement('canvas');
  off.width = W; off.height = H;
  const g = off.getContext('2d');
  const safe = String(prefix).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[^a-z0-9]+/, '') || 'review';
  const names = [];
  for (const t of times) {
    renderFrame(g, t);
    const blob = await new Promise((r) => off.toBlob(r, 'image/png'));
    const m = Math.floor(t / 60), sec = (t - m * 60).toFixed(1).replace('.', '_');
    const name = `${SAVE_FOLDER ? SAVE_FOLDER + 'review/' : ''}${safe}-${m}m${sec}s.png`;
    const r = await fetch(`/save?name=${encodeURIComponent(name)}`, { method: 'POST', body: blob });
    if (!r.ok) throw new Error(`save ${name} failed (${r.status})`);
    names.push(name);
  }
  renderFrame(ctx, T);
  return names;
};

// Picture against sound in a saved video: each frame is matched to frames drawn at nearby story times;
// the best offset should be 0 everywhere (a take recorded under load ended about 1 s late).
window.__sync = async (url, times) => {
  const v = document.createElement('video');
  v.src = url + (url.includes('?') ? '&' : '?') + Date.now();
  v.muted = true;
  await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('cannot load ' + url)); });
  const w = 192, h = 108;
  const mk = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c.getContext('2d', { willReadFrequently: true }); };
  const shot = mk(), ref = mk();
  const full = document.createElement('canvas'); full.width = W; full.height = H;
  const fg = full.getContext('2d');
  const diff = (t) => {
    renderFrame(fg, Math.max(0, Math.min(DURATION, t)));
    ref.drawImage(full, 0, 0, w, h);
    const x = shot.getImageData(0, 0, w, h).data, y = ref.getImageData(0, 0, w, h).data;
    let s = 0;
    for (let i = 0; i < x.length; i += 4) s += Math.abs(x[i] - y[i]) + Math.abs(x[i + 1] - y[i + 1]) + Math.abs(x[i + 2] - y[i + 2]);
    return s / (w * h);
  };
  const points = [];
  for (const t of times) {
    v.currentTime = t;
    await new Promise((r) => { v.onseeked = r; });
    shot.drawImage(v, 0, 0, w, h);
    let best = [0, Infinity];
    for (let k = -10; k <= 10; k++) { const d = diff(t + k / 10); if (d < best[1]) best = [k / 10, d]; }
    points.push({ t, offset: best[0], diff: +best[1].toFixed(1) });
  }
  renderFrame(ctx, T);
  const worst = Math.max(...points.map((p) => Math.abs(p.offset)));
  return { ok: worst <= 0.1, worst, points };
};

// Review hooks: ?still&t=<s> shows one paused frame; __sheet([t1, t2, ...]) draws a contact sheet;
// await __mix(t0, t1) renders the sound offline and reports levels (voice over music, LUFS, peak).
window.__mix = async (t0 = 0, t1 = DURATION) => {
  const ev = buildEvents();
  const mix = CONFIG.mix || {};
  let voiceBuf = null;
  if (NARR) voiceBuf = NARR.buffer || (await new OfflineAudioContext(1, 1, 48000).decodeAudioData(NARR.bytes.slice(0)));
  const all = await renderRange(ev, t0, t1, { voiceBuf, mix, part: 'all' });
  const out = { seconds: +(t1 - t0).toFixed(1), lufs: +integratedLoudness(await kWeight(all)).toFixed(1), peak: +peakOf(all).toFixed(3) };
  if (voiceBuf) {
    // The balance is measured before the master compressor and limiter, which act on the sum.
    const raw = { ...mix, dynamics: false };
    const v = await renderRange(ev, t0, t1, { voiceBuf, mix: raw, part: 'voice' });
    const b = await renderRange(ev, t0, t1, { voiceBuf, mix: raw, part: 'bed' });
    const d = speechToBedDb(v, b);
    out.voiceOverMusicDb = d === null ? null : +d.toFixed(1);
    out.voiceLufs = +integratedLoudness(await kWeight(v)).toFixed(1);
    out.bedLufs = +integratedLoudness(await kWeight(b)).toFixed(1);
  }
  return out;
};
window.__seek = (t) => { T = t; renderFrame(ctx, t); };
window.__sheet = (times, cols = 3) => {
  const off = document.createElement('canvas');
  off.width = W; off.height = H;
  const o = off.getContext('2d');
  const rows = Math.ceil(times.length / cols);
  const tw = W / cols, th = tw * 9 / 16;
  const sheet = document.createElement('canvas');
  sheet.width = W; sheet.height = th * rows;
  const s = sheet.getContext('2d');
  times.forEach((t, i) => {
    renderFrame(o, t);
    s.drawImage(off, (i % cols) * tw, Math.floor(i / cols) * th, tw, th);
    s.fillStyle = '#000'; s.font = '28px sans-serif'; s.fillText(String(t), (i % cols) * tw + 8, Math.floor(i / cols) * th + 30);
  });
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(sheet, 0, 0, W, Math.min(H, sheet.height));
  window.__frozen = true;
};
