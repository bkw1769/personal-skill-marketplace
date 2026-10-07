// Shared math, randomness and hand-drawn painting helpers.
export const W = 1920;
export const H = 1080;
export const state = { T: 0 };

export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const seg = (t, a, b) => clamp((t - a) / (b - a));
export const smooth = (t) => t * t * (3 - 2 * t);
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);
export const easeIn = (t) => t * t * t;
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const backOut = (t, s = 1.70158) => (t <= 0 ? 0 : t >= 1 ? 1 : 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2));
export function bounceOut(t) {
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
}
/** Appear/disappear envelope: 0 before a, ramps in over fin, out over fout before b. */
export function env(t, a, b, fin = 0.3, fout = 0.3) {
  if (t < a || t > b) return 0;
  return Math.min(clamp((t - a) / fin), clamp((b - t) / fout));
}

export function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
export function rng(seed) {
  let s = (Math.floor(seed * 2654435761) >>> 0) || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
export function vnoise(x, seed = 0) {
  const i = Math.floor(x), f = x - i;
  const a = hash(i + seed * 57.31), b = hash(i + 1 + seed * 57.31);
  return a + (b - a) * smooth(f);
}
/** Seed that changes 8 times per second: classic hand-drawn "line boil". */
export const boil = (k = 0, fps = 8) => Math.floor(state.T * fps) * 17 + k;

export const INK = '#2b2420';
export const PAPER = '#f3efe6';
export const C = {
  sky: '#9cc9dc', skyLight: '#cfe5ec', sea: '#5fa3b8', seaDeep: '#3f7f99', sand: '#ead5a4',
  grass: '#9cc27a', grassDark: '#6f9c55', stone: '#e4c792', stoneDark: '#c9a46a', roof: '#d9765a',
  wood: '#c28a4f', woodDark: '#8a5a32', pink: '#f2a7a0', coral: '#ee8f7a', lav: '#b9a6d8',
  yellow: '#f3d36b', ochre: '#d9a743', navy: '#2c3a66', white: '#fbf8f1', green: '#8cbf6a',
};

export function jitterPath(pts, amp, r, closed) {
  const out = [];
  const n = pts.length;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % n];
    const k = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 22));
    for (let j = 0; j < k; j++) {
      const t = j / k;
      out.push([x0 + (x1 - x0) * t + (r() - 0.5) * amp, y0 + (y1 - y0) * t + (r() - 0.5) * amp]);
    }
  }
  if (!closed) out.push([pts[n - 1][0] + (r() - 0.5) * amp * 0.5, pts[n - 1][1] + (r() - 0.5) * amp * 0.5]);
  return out;
}
export function tracePath(ctx, pts, closed) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
  }
  const l = pts[pts.length - 1];
  ctx.lineTo(l[0], l[1]);
  if (closed) ctx.closePath();
}
/** Wobbly pen line, drawn twice like a sketch. */
export function ink(ctx, pts, o = {}) {
  const { w = 3, seed = 1, amp = 2.2, color = INK, closed = false, alpha = 0.9, double = true } = o;
  if (pts.length < 2) return;
  const r = rng(seed);
  ctx.save();
  ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.globalAlpha *= alpha; ctx.lineWidth = w;
  tracePath(ctx, jitterPath(pts, amp, r, closed), closed);
  ctx.stroke();
  if (double) {
    ctx.globalAlpha *= 0.45; ctx.lineWidth = w * 0.5;
    tracePath(ctx, jitterPath(pts, amp * 1.7, r, closed), closed);
    ctx.stroke();
  }
  ctx.restore();
}
/** Transparent watercolor wash with darker pigment edge. */
export function wash(ctx, pts, color, o = {}) {
  const { alpha = 0.55, seed = 1, amp = 10, layers = 3, edge = true } = o;
  const r = rng(seed);
  ctx.save();
  ctx.fillStyle = color;
  const base = ctx.globalAlpha;
  for (let i = 0; i < layers; i++) {
    ctx.globalAlpha = base * (alpha / layers) * 1.5;
    tracePath(ctx, jitterPath(pts, amp, r, true), true);
    ctx.fill();
  }
  if (edge) {
    ctx.globalAlpha = base * alpha * 0.4; ctx.strokeStyle = color; ctx.lineWidth = 2.5;
    tracePath(ctx, jitterPath(pts, amp * 0.6, r, true), true);
    ctx.stroke();
  }
  ctx.restore();
}
export function ellipsePts(cx, cy, rx, ry, n = 26, seed = 0, rough = 0.08) {
  const r = rng(seed + 7);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + (r() - 0.5) * rough * 2;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return pts;
}
export const rectPts = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
export function blob(ctx, cx, cy, rx, ry, color, o = {}) {
  const seed = o.seed ?? 1;
  wash(ctx, ellipsePts(cx, cy, rx, ry, 26, seed, o.rough ?? 0.12), color, { amp: Math.min(rx, ry) * 0.12, ...o });
}
export function inkEllipse(ctx, cx, cy, rx, ry, o = {}) {
  ink(ctx, ellipsePts(cx, cy, rx, ry, 22, o.seed ?? 3, 0.05), { closed: true, ...o });
}
export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/** Hand-lettered text: each glyph wobbles slightly and boils. */
export function handText(ctx, text, x, y, o = {}) {
  const {
    size = 48, font = 'Gaegu', weight = 700, color = INK, align = 'center', seed = 1,
    wobble = 1, lineHeight = 1.25, reveal = 1, outline = null, outlineW = 8,
  } = o;
  ctx.save();
  ctx.font = `${weight} ${size}px "${font}", "Apple SD Gothic Neo", sans-serif`;
  ctx.textBaseline = 'middle';
  const lines = text.split('\n');
  const total = text.replace(/\n/g, '').length;
  let shown = Math.floor(total * reveal + 0.0001);
  lines.forEach((line, li) => {
    const chars = [...line];
    const widths = chars.map((ch) => ctx.measureText(ch).width);
    const lw = widths.reduce((a, b) => a + b, 0);
    let cx = align === 'center' ? x - lw / 2 : align === 'right' ? x - lw : x;
    const cy = y + (li - (lines.length - 1) / 2) * size * lineHeight;
    chars.forEach((ch, i) => {
      if (shown <= 0) return;
      shown--;
      const r = hash(seed * 31 + li * 97 + i * 13 + boil(0, 6) * 0.37);
      const rot = (r - 0.5) * 0.06 * wobble;
      const dy = (hash(r * 91) - 0.5) * 3 * wobble;
      ctx.save();
      ctx.translate(cx + widths[i] / 2, cy + dy);
      ctx.rotate(rot);
      if (outline) {
        ctx.lineJoin = 'round'; ctx.strokeStyle = outline; ctx.lineWidth = outlineW;
        ctx.strokeText(ch, -widths[i] / 2, 0);
      }
      ctx.fillStyle = color;
      ctx.fillText(ch, -widths[i] / 2, 0);
      ctx.restore();
      cx += widths[i];
    });
  });
  ctx.restore();
}
