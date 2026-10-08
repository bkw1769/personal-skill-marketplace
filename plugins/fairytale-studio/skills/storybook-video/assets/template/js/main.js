// Player: one clock (AudioContext time) drives picture and sound. Loads story.config.js,
// the storyboard and the sprites, then plays, seeks, narrates and records.
import CONFIG from '../story.config.js';
import { W, H } from './util.js';
import { loadSprites } from './sprites.js';
import { initPaint } from './paint.js';
import { Synth, autoScore, cuesToEvents, narrationEvents, renderRange, kWeight, integratedLoudness, peakOf, speechToBedDb } from './audio.js';
import { initStage, renderFrame, narrationLines } from './stage.js';
import { SCENES } from './scenes.js';
import * as SCORE from './score.js';

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
async function record() {
  if (recorder && recorder.state === 'recording') return;
  await ensureAudio();
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
