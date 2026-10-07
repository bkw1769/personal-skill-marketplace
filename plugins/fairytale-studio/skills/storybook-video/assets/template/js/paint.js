// Watercolor-and-ink painters shared by every story. Era-specific scenery (city walls,
// temples, castles) belongs in the story's own scenes.js or a story paint module.
import {
  W, H, C, INK, PAPER, rng, hash, ink, wash, blob, ellipsePts, rectPts, inkEllipse, makeCanvas, boil, state,
} from './util.js';

/** Pre-painted canvases, filled by initPaint(). */
export const BG = {};

export function house(g, x, base, w, h, wall, roof, seed, s = 1) {
  const r = rng(seed);
  wash(g, rectPts(x, base - h, w, h), wall, { alpha: 0.75, seed, amp: 4 * s });
  ink(g, rectPts(x, base - h, w, h), { closed: true, w: 2.2 * s + 0.5, seed: seed + 1, amp: 1.8 * s });
  if (r() < 0.6) {
    const roofPts = [[x - 14 * s, base - h], [x + w / 2, base - h - h * 0.38], [x + w + 14 * s, base - h]];
    wash(g, roofPts, roof, { alpha: 0.8, seed: seed + 2, amp: 4 * s });
    ink(g, roofPts, { closed: true, w: 2.2 * s + 0.5, seed: seed + 3, amp: 1.8 * s });
  } else {
    const rp = rectPts(x - 8 * s, base - h - 18 * s, w + 16 * s, 18 * s);
    wash(g, rp, roof, { alpha: 0.8, seed: seed + 2, amp: 3 * s });
    ink(g, rp, { closed: true, w: 2 * s + 0.5, seed: seed + 3, amp: 1.5 * s });
  }
  const nwin = Math.max(1, Math.floor(w / (70 * s)));
  for (let i = 0; i < nwin; i++) {
    const wx = x + (i + 0.5) * (w / nwin) - 13 * s, wy = base - h * 0.72;
    wash(g, rectPts(wx, wy, 26 * s, 30 * s), r() < 0.5 ? C.sky : '#6d8fa6', { alpha: 0.6, seed: seed + 10 + i, amp: 2 * s, edge: false });
    ink(g, rectPts(wx, wy, 26 * s, 30 * s), { closed: true, w: 1.6 * s + 0.4, seed: seed + 20 + i, amp: 1.2 * s, double: false });
  }
  if (h > 90 * s) {
    const dx = x + w * (0.3 + r() * 0.4) - 18 * s;
    const door = [[dx, base], [dx, base - 50 * s], [dx + 18 * s, base - 64 * s], [dx + 36 * s, base - 50 * s], [dx + 36 * s, base]];
    wash(g, door, C.woodDark, { alpha: 0.65, seed: seed + 30, amp: 2 * s, edge: false });
    ink(g, door, { w: 1.8 * s + 0.4, seed: seed + 31, amp: 1.2 * s });
  }
}

export function cypress(g, x, base, h, seed) {
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const k = 1 + (hash(seed + i) - 0.5) * 0.18;
    pts.push([x + Math.sin(a) * h * 0.13 * k, base - h / 2 - Math.cos(a) * h * 0.5 * k]);
  }
  wash(g, pts, C.grassDark, { alpha: 0.8, seed, amp: 5 });
  ink(g, pts.slice(2, 14), { w: 2, seed: seed + 1, amp: 2, alpha: 0.6 });
}

function makeCloud(seed) {
  const c = makeCanvas(460, 220), g = c.getContext('2d');
  const parts = [[150, 130, 90, 60], [240, 110, 110, 75], [330, 135, 85, 55], [200, 150, 120, 45]];
  parts.forEach(([x, y, rx, ry], i) => blob(g, x, y, rx, ry, '#fffdf7', { alpha: 0.95, seed: seed + i, rough: 0.1, edge: false }));
  blob(g, 240, 168, 170, 28, '#c9dbe6', { alpha: 0.35, seed: seed + 9, edge: false });
  const arcs = [];
  for (let i = 0; i <= 26; i++) {
    const a = Math.PI + (i / 26) * Math.PI;
    arcs.push([240 + Math.cos(a) * 190, 145 + Math.sin(a) * 85 * (0.85 + 0.25 * Math.abs(Math.sin(i * 0.9)))]);
  }
  ink(g, arcs, { w: 2, seed: seed + 20, amp: 3, alpha: 0.55 });
  return c;
}

function makeSun() {
  const c = makeCanvas(320, 320), g = c.getContext('2d');
  blob(g, 160, 160, 105, 105, C.yellow, { alpha: 0.95, seed: 301 });
  blob(g, 160, 160, 82, 82, '#f8e391', { alpha: 0.6, seed: 302, edge: false });
  blob(g, 175, 175, 70, 60, C.ochre, { alpha: 0.18, seed: 303, edge: false });
  inkEllipse(g, 160, 160, 102, 102, { seed: 304, w: 2.6 });
  return c;
}

function makeMoon() {
  const c = makeCanvas(260, 260), g = c.getContext('2d');
  blob(g, 130, 130, 92, 92, '#f7f0c8', { alpha: 1, seed: 311 });
  [[100, 110, 16], [155, 150, 22], [120, 170, 10]].forEach(([x, y, r], i) => blob(g, x, y, r, r, '#d9cf9c', { alpha: 0.5, seed: 312 + i }));
  inkEllipse(g, 130, 130, 92, 92, { seed: 316, w: 2.4, color: '#3a3550' });
  return c;
}

function makeShip(seed, sail) {
  const c = makeCanvas(440, 400), g = c.getContext('2d');
  ink(g, [[215, 270], [215, 40]], { w: 5, seed: seed + 1, amp: 2, color: '#5a3b22' });
  const sp = [[110, 70], [320, 70], [312, 205], [215, 222], [118, 205]];
  wash(g, sp, C.white, { alpha: 0.95, seed: seed + 2, amp: 3 });
  for (let i = 0; i < 4; i++) wash(g, [[120 + i * 52, 72], [146 + i * 52, 72], [146 + i * 52, 214], [120 + i * 52, 208]], sail, { alpha: 0.55, seed: seed + 3 + i, amp: 2, edge: false });
  ink(g, sp, { closed: true, w: 2.6, seed: seed + 8, amp: 2 });
  const fl = [[215, 40], [262, 52], [215, 64]];
  wash(g, fl, C.coral, { alpha: 0.9, seed: seed + 9, amp: 2 });
  ink(g, fl, { w: 2, seed: seed + 10, amp: 1 });
  for (let i = 0; i < 6; i++) ink(g, [[110 + i * 42, 300], [80 + i * 42, 360]], { w: 3, seed: seed + 20 + i, amp: 2, color: '#5a3b22' });
  const hull = [[20, 205], [60, 268], [100, 300], [330, 300], [385, 262], [425, 190], [398, 215], [360, 252], [70, 252], [42, 222]];
  wash(g, hull, C.wood, { alpha: 0.9, seed: seed + 30, amp: 3 });
  wash(g, rectPts(70, 268, 280, 18), C.woodDark, { alpha: 0.4, seed: seed + 31, amp: 2, edge: false });
  ink(g, hull, { closed: true, w: 3, seed: seed + 32, amp: 2 });
  ink(g, [[65, 268], [365, 268]], { w: 1.6, seed: seed + 33, amp: 1.5, alpha: 0.6 });
  blob(g, 372, 255, 10, 10, C.white, { alpha: 1, seed: seed + 34 });
  inkEllipse(g, 372, 255, 10, 10, { seed: seed + 35, w: 2 });
  blob(g, 374, 256, 4, 4, INK, { alpha: 1, seed: seed + 36, edge: false });
  return c;
}

function makeTent(seed, stripe) {
  const c = makeCanvas(400, 330), g = c.getContext('2d');
  const tp = [[30, 300], [200, 60], [370, 300]];
  wash(g, tp, C.white, { alpha: 0.95, seed, amp: 4 });
  for (let i = 0; i < 5; i += 2) {
    const x0 = 30 + i * 68, x1 = x0 + 68;
    const yA = (x) => 300 - (x < 200 ? (x - 30) / 170 : (370 - x) / 170) * 240;
    wash(g, [[x0, 300], [x0, yA(x0)], [x1, yA(x1)], [x1, 300]], stripe, { alpha: 0.6, seed: seed + i, amp: 2, edge: false });
  }
  g.save(); g.globalCompositeOperation = 'destination-in'; g.beginPath(); g.moveTo(26, 302); g.lineTo(200, 56); g.lineTo(374, 302); g.closePath(); g.fill(); g.restore();
  const door = [[170, 300], [200, 190], [230, 300]];
  wash(g, door, '#4a3426', { alpha: 0.8, seed: seed + 9, amp: 2 });
  ink(g, tp, { closed: true, w: 3, seed: seed + 10, amp: 2 });
  ink(g, door, { w: 2, seed: seed + 11, amp: 1.5 });
  ink(g, [[200, 60], [200, 20]], { w: 3, seed: seed + 12, amp: 1, color: '#5a3b22' });
  const fl = [[200, 20], [240, 30], [200, 40]];
  wash(g, fl, C.sky, { alpha: 0.9, seed: seed + 13, amp: 2 });
  ink(g, fl, { w: 2, seed: seed + 14, amp: 1 });
  return c;
}

function makeGrain() {
  const c = makeCanvas(W, H), g = c.getContext('2d');
  const im = g.createImageData(W, H);
  const d = im.data;
  for (let i = 0; i < W * H; i++) {
    const n = 255 - Math.random() * 20 - (Math.random() < 0.004 ? 25 : 0);
    d[i * 4] = n; d[i * 4 + 1] = n - 1; d[i * 4 + 2] = n - 4; d[i * 4 + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  const r = rng(999);
  g.globalAlpha = 0.06;
  g.strokeStyle = '#8a7a60';
  for (let i = 0; i < 900; i++) {
    const x = r() * W, y = r() * H, a = r() * Math.PI;
    g.lineWidth = 0.6 + r();
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 14, y + Math.sin(a) * 14); g.stroke();
  }
  g.globalAlpha = 1;
  const vg = g.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 1.05);
  vg.addColorStop(0, 'rgba(255,255,255,0)');
  vg.addColorStop(1, 'rgba(206,190,160,0.75)');
  g.fillStyle = vg;
  g.fillRect(0, 0, W, H);
  return c;
}

/** Paint the reusable canvases once at start-up (about 100 ms). */
export function initPaint() {
  BG.clouds = [makeCloud(401), makeCloud(431), makeCloud(461)];
  BG.sun = makeSun();
  BG.moon = makeMoon();
  BG.ships = [makeShip(501, C.coral), makeShip(541, C.sky), makeShip(581, C.ochre)];
  BG.tents = [makeTent(601, C.coral), makeTent(631, C.sky)];
  BG.grain = makeGrain();
}

export function paper(ctx) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
}

export function sky(ctx, top, bottom, a = 0.8, h = 760) {
  const gr = ctx.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, top);
  gr.addColorStop(1, bottom);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, W, h);
  ctx.restore();
}

export function clouds(ctx, T, par = 0, camX = 0, alpha = 1, y0 = 0) {
  const list = [[200, 90, 0.9], [760, 180, 0.7], [1300, 70, 1], [1800, 200, 0.65], [2400, 120, 0.85]];
  ctx.save();
  ctx.globalAlpha *= alpha;
  list.forEach(([x, y, s], i) => {
    const cx = ((x + T * (8 + i * 3) - camX * par) % 2600 + 2600) % 2600 - 400;
    ctx.drawImage(BG.clouds[i % 3], cx, y + y0, 460 * s, 220 * s);
  });
  ctx.restore();
}

export function sun(ctx, x, y, s = 1, rays = true) {
  if (rays) {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + state.T * 0.15;
      const r0 = 125 * s, r1 = (165 + (i % 2) * 30) * s;
      ink(ctx, [[x + Math.cos(a) * r0, y + Math.sin(a) * r0], [x + Math.cos(a) * r1, y + Math.sin(a) * r1]], { w: 3 * s, seed: boil(i), amp: 3, color: '#c98a2a', alpha: 0.8 });
    }
  }
  ctx.drawImage(BG.sun, x - 160 * s, y - 160 * s, 320 * s, 320 * s);
}

export function waves(ctx, x0, x1, y0, y1, T, seed = 1, n = 30, color = '#2d5f73') {
  for (let i = 0; i < n; i++) {
    const x = x0 + ((hash(seed + i) * (x1 - x0) + T * 20 * (0.5 + hash(i + 3))) % (x1 - x0));
    const y = y0 + hash(seed * 3 + i) * (y1 - y0);
    const sz = 12 + ((y - y0) / (y1 - y0)) * 22;
    const lift = Math.sin(T * 2 + i) * 4;
    ink(ctx, [[x - sz, y + lift], [x - sz / 2, y - sz * 0.4 + lift], [x, y + lift], [x + sz / 2, y - sz * 0.4 + lift], [x + sz, y + lift]], { w: 2, seed: boil(i), amp: 1.5, alpha: 0.6, color, double: false });
  }
}

export function gull(ctx, x, y, s, T, k = 0) {
  const f = Math.sin(T * 9 + k) * 0.5 + 0.5;
  const wy = -10 * s + f * 18 * s;
  ink(ctx, [[x - 26 * s, y + wy], [x - 12 * s, y - 8 * s], [x, y], [x + 12 * s, y - 8 * s], [x + 26 * s, y + wy]], { w: 3 * s, seed: boil(k + 50), amp: 1.5 });
}

export function heart(ctx, x, y, s, seed) {
  const pts = [];
  for (let i = 0; i < 26; i++) {
    const t = (i / 26) * Math.PI * 2;
    pts.push([x + 16 * Math.pow(Math.sin(t), 3) * s, y - (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * s]);
  }
  wash(ctx, pts, C.pink, { alpha: 0.85, seed, amp: 1.5 * s });
  ink(ctx, pts, { closed: true, w: 2.4, seed: boil(seed), amp: 1.2 });
}

export function star(ctx, x, y, r, rot, color = C.yellow, seed = 1) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = rot + (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
  }
  wash(ctx, pts, color, { alpha: 0.9, seed, amp: 1 });
  ink(ctx, pts, { closed: true, w: 2, seed: boil(seed), amp: 1 });
}

export function note(ctx, x, y, s, seed) {
  blob(ctx, x, y, 11 * s, 8 * s, INK, { alpha: 0.9, seed, edge: false });
  ink(ctx, [[x + 10 * s, y], [x + 10 * s, y - 42 * s], [x + 24 * s, y - 30 * s]], { w: 3 * s, seed: boil(seed), amp: 1 });
}

export function bulb(ctx, x, y, s, glow) {
  if (glow > 0) {
    ctx.save();
    const gr = ctx.createRadialGradient(x, y, 10, x, y, 220 * s);
    gr.addColorStop(0, `rgba(255,236,150,${0.7 * glow})`);
    gr.addColorStop(1, 'rgba(255,236,150,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(x - 240 * s, y - 240 * s, 480 * s, 480 * s);
    ctx.restore();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ink(ctx, [[x + Math.cos(a) * 62 * s, y + Math.sin(a) * 62 * s], [x + Math.cos(a) * (88 + (i % 2) * 18) * s, y + Math.sin(a) * (88 + (i % 2) * 18) * s]], { w: 3, seed: boil(i + 90), amp: 2, color: '#c98a2a' });
    }
  }
  blob(ctx, x, y - 6 * s, 40 * s, 44 * s, C.yellow, { alpha: 0.95, seed: 801 });
  inkEllipse(ctx, x, y - 6 * s, 40 * s, 44 * s, { seed: boil(802), w: 2.6 });
  wash(ctx, rectPts(x - 18 * s, y + 34 * s, 36 * s, 26 * s), '#b9b4a8', { alpha: 0.9, seed: 803, amp: 1 });
  ink(ctx, rectPts(x - 18 * s, y + 34 * s, 36 * s, 26 * s), { closed: true, w: 2.2, seed: boil(804), amp: 1 });
  ink(ctx, [[x - 10 * s, y + 34 * s], [x - 6 * s, y], [x + 6 * s, y], [x + 10 * s, y + 34 * s]], { w: 2, seed: boil(805), amp: 1, alpha: 0.7 });
}

export function puff(ctx, x, y, r, a, seed) {
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha *= a;
  blob(ctx, x, y, r, r * 0.8, '#d8c4a0', { alpha: 0.7, seed, rough: 0.3 });
  ink(ctx, ellipsePts(x, y, r, r * 0.8, 14, seed, 0.3).slice(0, 8), { w: 1.6, seed: seed + 1, amp: 2, alpha: 0.5 });
  ctx.restore();
}

export function plank(ctx, x, y, rot, s = 1, seed = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const pts = rectPts(-60 * s, -11 * s, 120 * s, 22 * s);
  wash(ctx, pts, C.wood, { alpha: 0.95, seed, amp: 2 });
  ink(ctx, pts, { closed: true, w: 2.2, seed: boil(seed), amp: 1.2 });
  ink(ctx, [[-50 * s, 0], [40 * s, 2 * s]], { w: 1.2, seed: seed + 2, amp: 1, alpha: 0.5, double: false });
  ctx.restore();
}

export function torch(ctx, x, y, s, T, k) {
  ink(ctx, [[x, y], [x + 4 * s, y - 70 * s]], { w: 5 * s, seed: k, amp: 1, color: '#4a3426' });
  const fl = 1 + Math.sin(T * 17 + k) * 0.12 + Math.sin(T * 29 + k * 2) * 0.08;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const gr = ctx.createRadialGradient(x + 4 * s, y - 86 * s, 4, x + 4 * s, y - 86 * s, 130 * s * fl);
  gr.addColorStop(0, 'rgba(255,170,60,0.55)');
  gr.addColorStop(1, 'rgba(255,120,30,0)');
  ctx.fillStyle = gr;
  ctx.fillRect(x - 140 * s, y - 230 * s, 290 * s, 290 * s);
  ctx.restore();
  blob(ctx, x + 4 * s, y - 86 * s, 14 * s * fl, 22 * s * fl, '#f6a23c', { alpha: 0.95, seed: boil(k), edge: false });
  blob(ctx, x + 4 * s, y - 82 * s, 7 * s, 11 * s, '#fde58a', { alpha: 0.95, seed: boil(k + 1), edge: false });
}

export function moon(ctx, x, y, s = 1) {
  ctx.drawImage(BG.moon, x - 130 * s, y - 130 * s, 260 * s, 260 * s);
}
/** A watercolor ground band from y to the bottom of the frame with a pen horizon line. */
export function ground(ctx, y, color = C.grass, seed = 11) {
  wash(ctx, [[-40, y + 10], [W * 0.3, y - 6], [W * 0.7, y + 8], [W + 40, y - 4], [W + 40, H + 40], [-40, H + 40]], color, { alpha: 0.7, seed, amp: 14 });
  ink(ctx, [[-20, y + 6], [W * 0.5, y], [W + 20, y + 4]], { w: 2, seed: seed + 1, amp: 3, alpha: 0.5 });
}
/** Multiply a cool tint over the frame for night scenes (a = 0..1). */
export function nightOverlay(ctx, a, color = '#34437a') {
  if (a <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = a;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}
/** Twinkling stars in the upper part of the frame. */
export function starsField(ctx, T, a, n = 60, maxY = 560) {
  if (a <= 0) return;
  for (let i = 0; i < n; i++) {
    const x = hash(i * 5 + 1) * W, y = hash(i * 9 + 2) * maxY;
    const tw = 0.5 + 0.5 * Math.sin(T * (2 + hash(i) * 3) + i);
    ctx.save();
    ctx.globalAlpha = a * (0.4 + 0.6 * tw);
    star(ctx, x, y, 5 + hash(i * 3) * 7, i, '#fff4c2', i + 1000);
    ctx.restore();
  }
}
