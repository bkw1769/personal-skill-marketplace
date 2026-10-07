// Frame composition shared by every story: scene lookup, paint-blot transitions,
// narration captions, speech/thought bubbles, the lesson quote, and paper grain.
// Story-specific drawing lives in scenes.js; this file reads the storyboard only.
import {
  W, H, C, INK, PAPER, state, clamp, seg, easeIn, backOut, env, hash, rng,
  ink, blob, ellipsePts, inkEllipse, handText, makeCanvas, boil,
} from './util.js';
import { S, spr } from './sprites.js';
import { BG, paper, sky, clouds, sun, moon, ground, nightOverlay, starsField } from './paint.js';

export const BLOT = 0.9; // seconds of paint-bleed transition between scenes
let SB = null;
let DRAW = {};
let BUF, MASK;
const CAPTION_FONT = '"Gaegu", "Apple SD Gothic Neo", sans-serif';
const BUBBLE_FONT = 'Nanum Pen Script';

/** Bind the storyboard and the story's scene functions ({ sceneId: (ctx, T, info) => void }). */
export function initStage(storyboard, sceneDraw) {
  SB = storyboard;
  DRAW = sceneDraw || {};
  BUF = makeCanvas(W, H);
  MASK = makeCanvas(W, H);
}

export function sceneIndexAt(T) {
  const sc = SB.scenes;
  let i = sc.findIndex((s) => T < s.end);
  if (i < 0) i = sc.length - 1;
  return i;
}

/** Everything a scene function may need besides ctx and T. */
function infoFor(i, T) {
  const scene = SB.scenes[i];
  const cast = new Map((SB.cast || []).map((c) => [c.id, c]));
  return {
    scene,
    index: i,
    local: T - scene.start,
    length: scene.end - scene.start,
    progress: clamp((T - scene.start) / (scene.end - scene.start)),
    cast: (scene.characters || []).map((id) => cast.get(id) || { id, sprites: [id] }),
    storyboard: SB,
  };
}

function drawScene(ctx, i, T) {
  const info = infoFor(i, T);
  const f = DRAW[info.scene.id] || DRAW.default || defaultScene;
  ctx.save();
  f(ctx, T, info);
  ctx.restore();
}

// ---------- default scene: an animatic straight from the storyboard ----------
const MOOD_SKY = {
  playful: ['#9cc9dc', '#f6efd9'], calm: ['#bcd8e4', '#f3efe6'], warm: ['#f3c99a', '#f8ecd8'], tense: ['#8f9bb0', '#e9e1d2'],
  sad: ['#a9b4bf', '#ece6dc'], mysterious: ['#9a90b8', '#ece4d8'], festive: ['#f3a98e', '#fbefd6'], wonder: ['#c9b8e6', '#f7efe0'],
  triumphant: ['#f3d36b', '#fbf2dc'], sleepy: ['#3c4a7a', '#7a86ad'], 'spooky-mild': ['#5d5a7a', '#a9a3b8'],
};
const NIGHT = new Set(['sleepy', 'spooky-mild']);

/** Gentle up-down bounce with a little sway, period in seconds. */
export function bob(T, period, amp = 18) {
  const ph = ((T / period) % 1 + 1) % 1;
  return { dy: -Math.abs(Math.sin(ph * Math.PI)) * amp, rot: Math.sin(ph * Math.PI * 2) * 0.035 };
}

/**
 * Paper, a mood-coloured sky, clouds, sun or moon, a ground band and the scene's characters
 * walking in and standing in a row. Replace per scene in scenes.js.
 */
export function defaultScene(ctx, T, info) {
  const mood = (info.scene.music && info.scene.music.mood) || 'calm';
  const [top, bottom] = MOOD_SKY[mood] || MOOD_SKY.calm;
  const night = NIGHT.has(mood);
  paper(ctx);
  sky(ctx, top, bottom, 0.85, 800);
  if (night) { starsField(ctx, T, 0.9); moon(ctx, 1560, 220, 0.9); } else { sun(ctx, 1600, 200, 0.7); clouds(ctx, T, 0, 0, 0.9); }
  ground(ctx, 820, night ? '#4f6a5a' : C.grass, 11 + info.index);
  const people = info.cast;
  people.forEach((p, k) => {
    const name = (p.sprites || []).find((n) => S[n]);
    if (!name) return;
    const slot = W * (k + 1) / (people.length + 1);
    const enter = easeIn(1 - seg(info.local, 0, 1.2));
    const x = slot - enter * 500 * (k % 2 ? -1 : 1);
    const b = bob(T + k * 0.37, enter > 0 ? 0.45 : 2.4, enter > 0 ? 14 : 5);
    spr(ctx, name, x, 960 + b.dy, 430, { rot: b.rot, k });
  });
  if (night) nightOverlay(ctx, 0.35);
}

// ---------- captions, bubbles, quote ----------
function drawCaptions(ctx, T) {
  for (const c of SB.captions || []) {
    if (c.kind === 'quote') continue;
    const a = env(T, c.start, c.end, 0.35, 0.4);
    if (a <= 0) continue;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = `700 48px ${CAPTION_FONT}`;
    const lines = c.text.split('\n');
    const tw = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const cy = H - 70 - (lines.length - 1) * 30;
    blob(ctx, W / 2, cy, tw / 2 + 70, 40 + lines.length * 28, '#fbf6ea', { alpha: 0.92, seed: Math.round(c.start * 10), rough: 0.06, edge: false });
    ink(ctx, [[W / 2 - tw / 2 - 20, cy + lines.length * 30 + 20], [W / 2 + tw / 2 + 20, cy + lines.length * 30 + 16]], { w: 2, seed: Math.round(c.start * 7), amp: 3, alpha: 0.35 });
    handText(ctx, c.text, W / 2, cy, { size: 48, color: '#3a2c22', seed: Math.round(c.start * 3), wobble: 0.5, lineHeight: 1.25 });
    ctx.restore();
  }
}

function drawQuote(ctx, T) {
  for (const c of SB.captions || []) {
    if (c.kind !== 'quote') continue;
    const a = env(T, c.start, c.end, 0.6, 0.6);
    if (a <= 0) continue;
    ctx.save();
    ctx.globalAlpha = a;
    const reveal = seg(T, c.start, c.start + Math.max(1, c.text.length * 0.06));
    blob(ctx, W / 2, H * 0.42, 760, 170, '#fffaf0', { alpha: 0.9, seed: 77, rough: 0.08 });
    handText(ctx, c.text, W / 2, H * 0.42, { size: 64, color: INK, seed: 5, reveal, lineHeight: 1.35 });
    ctx.restore();
  }
}

/** Where a bubble sits: storyboard x/y/tail if given, otherwise above the speaker's slot. */
function bubbleLayout(b) {
  if (typeof b.x === 'number') return { x: b.x, y: b.y, tail: b.tail || [b.x - 200, b.y + 260] };
  const i = sceneIndexAt(b.start);
  const people = (SB.scenes[i].characters || []);
  const k = Math.max(0, people.indexOf(b.speaker));
  const slot = W * (k + 1) / (people.length + 1);
  const x = clamp(slot + (slot < W / 2 ? 260 : -260), 420, W - 420);
  return { x, y: 250, tail: [slot, 560] };
}

function drawBubble(ctx, b, T) {
  const a = env(T, b.start, b.end, 0.2, 0.25);
  if (a <= 0) return;
  const { x, y, tail } = bubbleLayout(b);
  const p = backOut(seg(T, b.start, b.start + 0.35));
  const size = b.size || 58;
  ctx.save();
  ctx.font = `400 ${size}px "${BUBBLE_FONT}", "Apple SD Gothic Neo", sans-serif`;
  const lines = b.text.split('\n');
  const tw = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const rx = tw / 2 + 56, ry = (lines.length * size * 1.2) / 2 + 34;
  ctx.globalAlpha = a;
  ctx.translate(x, y);
  ctx.scale(p, p);
  const tx = tail[0] - x, ty = tail[1] - y;
  const ang = Math.atan2(ty, tx);
  const bx = Math.cos(ang) * rx * 0.8, by = Math.sin(ang) * ry * 0.8;
  const px = -Math.sin(ang) * 30, py = Math.cos(ang) * 30;
  const fillTri = (pts) => { ctx.save(); ctx.fillStyle = '#fffdf6'; ctx.beginPath(); pts.forEach(([u, v], i) => (i ? ctx.lineTo(u, v) : ctx.moveTo(u, v))); ctx.closePath(); ctx.fill(); ctx.restore(); };
  if (b.kind === 'think') {
    for (let i = 0; i < 3; i++) {
      const k = 0.35 + i * 0.25, r = 18 - i * 5;
      blob(ctx, bx + (tx - bx) * k, by + (ty - by) * k, r, r, '#fffdf6', { alpha: 1, seed: 40 + i, edge: false });
      inkEllipse(ctx, bx + (tx - bx) * k, by + (ty - by) * k, r, r, { seed: boil(40 + i), w: 2.6 });
    }
  } else {
    const t3 = [[bx + px, by + py], [tx * 0.55, ty * 0.55], [bx - px, by - py]];
    fillTri(t3);
    ink(ctx, t3, { w: 3.2, seed: boil(30), amp: 1.5 });
  }
  const pts = ellipsePts(0, 0, rx, ry, 34, boil(31), b.kind === 'think' ? 0.07 : 0.025);
  fillTri(pts);
  if (b.kind !== 'think') fillTri([[bx + px * 0.8, by + py * 0.8], [bx - px * 0.8, by - py * 0.8], [bx * 0.7, by * 0.7]]);
  ink(ctx, pts, { closed: true, w: 3.2, seed: boil(32), amp: 2 });
  if (b.kind !== 'think') fillTri([[bx + px * 0.85, by + py * 0.85], [bx - px * 0.85, by - py * 0.85], [tx * 0.5, ty * 0.5]]);
  const reveal = seg(T, b.start + 0.15, b.start + 0.15 + b.text.length * 0.045);
  handText(ctx, b.text, 0, 0, { size, font: BUBBLE_FONT, weight: 400, color: INK, seed: Math.round(b.start * 10), reveal, lineHeight: 1.2 });
  ctx.restore();
}

// ---------- transitions and the frame ----------
function blotMask(g, p, seed) {
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#000';
  const r = rng(seed);
  for (let i = 0; i < 9; i++) {
    const cx = r() * W, cy = r() * H;
    const rad = easeIn(clamp(p * 1.25 - r() * 0.25)) * 1500;
    if (rad <= 1) continue;
    const pts = ellipsePts(cx, cy, rad, rad * (0.8 + r() * 0.4), 30, seed + i, 0.18);
    g.beginPath(); pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill();
  }
}

/** Draw the whole frame at time T (seconds). */
export function renderFrame(ctx, T) {
  state.T = T;
  const i = sceneIndexAt(T);
  const sc = SB.scenes[i];
  const lt = T - sc.start;
  if (i > 0 && lt < BLOT && sc.transition !== 'cut') {
    drawScene(ctx, i - 1, T);
    const b = BUF.getContext('2d');
    b.clearRect(0, 0, W, H);
    drawScene(b, i, T);
    const m = MASK.getContext('2d');
    blotMask(m, lt / BLOT, i * 101);
    m.save();
    m.globalCompositeOperation = 'source-in';
    m.drawImage(BUF, 0, 0);
    m.restore();
    ctx.drawImage(MASK, 0, 0);
  } else {
    drawScene(ctx, i, T);
  }
  for (const b of SB.bubbles || []) drawBubble(ctx, b, T);
  drawCaptions(ctx, T);
  drawQuote(ctx, T);
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(BG.grain, 0, 0);
  ctx.restore();
}

/** Narration lines for the browser speech engine: captions plus bubbles not marked narrate:false. */
export function narrationLines() {
  const lines = (SB.captions || []).map((c) => ({ t: c.start + (c.kind === 'quote' ? 0.2 : 0), text: c.text.replace(/\n/g, ' ') }));
  for (const b of SB.bubbles || []) if (b.narrate !== false) lines.push({ t: b.start + 0.1, text: b.text.replace(/\n/g, ' ') });
  return lines.sort((a, b) => a.t - b.t);
}

export { PAPER, hash };
