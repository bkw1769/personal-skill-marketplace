// Shorts thumbnail renderer (browser ESM). Draws a shorts-thumbnail/1 spec onto a canvas:
// cover-cropped still -> muted background with the subject kept bright -> vignette -> red highlights
// -> headline (big number or keyword) -> caption. Checked with scripts/thumbnail.mjs before rendering.

const FONT = '"Noto Sans KR", "Apple SD Gothic Neo", sans-serif';
const RED = '#ff3b30';

export function loadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('image load failed: ' + src));
    im.src = src;
  });
}

function cover(ctx, im, W, H, crop = {}) {
  const [fx, fy] = crop.focus || [0.5, 0.5];
  const k = Math.max(W / im.naturalWidth, H / im.naturalHeight) * (crop.zoom || 1);
  const dw = im.naturalWidth * k, dh = im.naturalHeight * k;
  const x = Math.min(0, Math.max(W - dw, W / 2 - fx * dw));
  const y = Math.min(0, Math.max(H - dh, H / 2 - fy * dh));
  ctx.drawImage(im, x, y, dw, dh);
}

function layer(W, H) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  return c;
}

function background(ctx, im, spec, W, H) {
  const bg = spec.background || {};
  const desat = bg.desaturate ?? 0.35, dim = bg.dim ?? 0.25;
  // Muted copy everywhere.
  ctx.save();
  ctx.filter = `grayscale(${desat}) brightness(${1 - dim})`;
  cover(ctx, im, W, H, spec.crop);
  ctx.restore();
  // The subject region at full colour, with a soft edge.
  if (bg.spot) {
    const [sx, sy, sw, sh] = bg.spot;
    const full = layer(W, H), g = full.getContext('2d');
    cover(g, im, W, H, spec.crop);
    const mask = layer(W, H), m = mask.getContext('2d');
    m.filter = `blur(${Math.round(W * 0.04)}px)`;
    m.fillStyle = '#000';
    m.beginPath(); m.roundRect(sx * W, sy * H, sw * W, sh * H, W * 0.05); m.fill();
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(mask, 0, 0);
    ctx.drawImage(full, 0, 0);
  }
  const v = bg.vignette ?? 0.5;
  if (v > 0) {
    const r = ctx.createRadialGradient(W / 2, H * 0.45, W * 0.35, W / 2, H * 0.45, H * 0.75);
    r.addColorStop(0, 'rgba(0,0,0,0)');
    r.addColorStop(1, `rgba(0,0,0,${0.75 * v})`);
    ctx.fillStyle = r;
    ctx.fillRect(0, 0, W, H);
  }
}

function glow(ctx, color, W) {
  ctx.shadowColor = color;
  ctx.shadowBlur = W * 0.03;
}

const MARK = {
  outline(ctx, h, W, H, color) {
    const [x, y, w, hh] = h.box;
    ctx.fillStyle = color + '22';
    ctx.beginPath(); ctx.roundRect(x * W, y * H, w * W, hh * H, W * 0.015); ctx.fill();
    glow(ctx, color, W);
    ctx.lineWidth = W * (h.size || 0.012);
    ctx.strokeStyle = color;
    ctx.stroke();
  },
  bar(ctx, h, W, H, color) {
    const [x, y, w, hh] = h.box;
    glow(ctx, color, W);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = color;
    ctx.fillRect(x * W, y * H, w * W, hh * H);
  },
  arrow(ctx, h, W, H, color) {
    const [x0, y0] = [h.from[0] * W, h.from[1] * H], [x1, y1] = [h.to[0] * W, h.to[1] * H];
    const lw = W * (h.size || 0.03), a = Math.atan2(y1 - y0, x1 - x0), head = lw * 2.6;
    const xe = x1 - Math.cos(a) * head * 0.8, ye = y1 - Math.sin(a) * head * 0.8;
    glow(ctx, 'rgba(0,0,0,0.6)', W);
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(xe, ye); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - Math.cos(a - 0.5) * head, y1 - Math.sin(a - 0.5) * head);
    ctx.lineTo(x1 - Math.cos(a + 0.5) * head, y1 - Math.sin(a + 0.5) * head);
    ctx.closePath(); ctx.fill();
  },
  xmark(ctx, h, W, H, color) {
    const s = W * (h.size || 0.36), x = h.at[0] * W, y = h.at[1] * H;
    glow(ctx, 'rgba(0,0,0,0.6)', W);
    ctx.strokeStyle = color; ctx.lineWidth = s * 0.17; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - s / 2, y - s / 2); ctx.lineTo(x + s / 2, y + s / 2);
    ctx.moveTo(x + s / 2, y - s / 2); ctx.lineTo(x - s / 2, y + s / 2);
    ctx.stroke();
  },
  ring(ctx, h, W, H, color) {
    const r = W * (h.size || 0.14), x = h.at[0] * W, y = h.at[1] * H;
    glow(ctx, color, W);
    ctx.strokeStyle = color; ctx.lineWidth = W * 0.014;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  },
};

function text(ctx, t, W, H, base, y0, weight) {
  const lines = t.text.split('\n');
  let size = Math.round(W * base);
  ctx.font = `${weight} ${size}px ${FONT}`;
  const tw = Math.max(...lines.map((l) => ctx.measureText(l).width));
  if (tw > W * 0.88) size = Math.floor(size * (W * 0.88) / tw);
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  const y = (t.y ?? y0) * H;
  lines.forEach((l, k) => {
    const ly = y + (k - (lines.length - 1) / 2) * size * 1.12;
    ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = size * 0.25; ctx.shadowOffsetY = size * 0.04;
    ctx.lineWidth = size * 0.16; ctx.strokeStyle = '#111';
    ctx.strokeText(l, W / 2, ly);
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = t.color || '#ffffff';
    ctx.fillText(l, W / 2, ly);
  });
}

/** Draw the whole thumbnail. */
export function drawThumbnail(ctx, spec, im) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  ctx.clearRect(0, 0, W, H);
  background(ctx, im, spec, W, H);
  for (const h of spec.highlights || []) {
    const f = MARK[h.kind];
    if (!f) continue;
    ctx.save();
    f(ctx, h, W, H, h.color || RED);
    ctx.restore();
  }
  if (spec.headline && spec.headline.text) { ctx.save(); text(ctx, spec.headline, W, H, 0.2, 0.16, 900); ctx.restore(); }
  if (spec.caption && spec.caption.text) { ctx.save(); text(ctx, spec.caption, W, H, 0.078, 0.62, 900); ctx.restore(); }
}
