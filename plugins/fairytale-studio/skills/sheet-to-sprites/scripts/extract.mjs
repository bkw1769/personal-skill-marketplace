// Paper removal for hand-drawn sheets: estimate the paper colour from the crop
// border, flood-fill the paper from the border, clear enclosed paper holes,
// drop specks and neighbouring figures, soften the ink edge, trim to content.

/**
 * @typedef {import('./png.mjs').Image} Image
 * @typedef {Object} ExtractOptions
 * @property {boolean} [text]     Hand lettering: alpha from colour distance only, no flood fill.
 * @property {boolean} [largest]  Props: keep only the largest blob (drops palette dots, stray marks).
 * @property {number}  [tol]      Paper colour tolerance (default 24).
 * @property {number}  [holeMin]  Smallest enclosed paper area (px) treated as a hole.
 * @property {number}  [pad]      Transparent margin kept around the trimmed sprite (default 2).
 */

const clamp01 = (/** @type {number} */ x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * Median of a numeric array (upper median for even lengths).
 * @param {number[]} a
 * @returns {number}
 */
export function median(a) {
  const s = [...a].sort((p, q) => p - q);
  return s[s.length >> 1];
}

/**
 * Copy a rectangle out of an image, clipped to the image bounds.
 * @param {Image} img
 * @param {{x: number, y: number, w: number, h: number}} r
 * @returns {Image}
 */
export function crop(img, r) {
  const x0 = Math.max(0, r.x), y0 = Math.max(0, r.y);
  const x1 = Math.min(img.width, r.x + r.w), y1 = Math.min(img.height, r.y + r.h);
  if (x1 <= x0 || y1 <= y0) throw new Error(`crop ${JSON.stringify(r)} is outside the ${img.width}x${img.height} sheet`);
  const width = x1 - x0, height = y1 - y0;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) data.set(img.data.subarray(((y0 + y) * img.width + x0) * 4, ((y0 + y) * img.width + x1) * 4), y * width * 4);
  return { width, height, data };
}

/**
 * Remove the paper around a drawing. Returns the trimmed RGBA sprite and where it sits in the crop.
 * @param {Image} src A cropped region of the sheet (not modified).
 * @param {ExtractOptions} [opt]
 * @returns {{image: Image, offset: {x: number, y: number}, paper: number[], empty: boolean}}
 */
export function extractSprite(src, opt = {}) {
  const { width: w, height: h } = src;
  const d = Uint8Array.from(src.data);
  const N = w * h;
  const rs = [], gs = [], bs = [];
  const sample = (/** @type {number} */ i) => { rs.push(d[i * 4]); gs.push(d[i * 4 + 1]); bs.push(d[i * 4 + 2]); };
  for (let x = 0; x < w; x++) { sample(x); sample((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { sample(y * w); sample(y * w + w - 1); }
  const paper = [median(rs), median(gs), median(bs)];
  const dist = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const r = d[i * 4] - paper[0], g = d[i * 4 + 1] - paper[1], b = d[i * 4 + 2] - paper[2];
    dist[i] = Math.sqrt(r * r + g * g + b * b);
  }
  const alpha = new Float32Array(N);
  if (opt.text) {
    for (let i = 0; i < N; i++) alpha[i] = clamp01((dist[i] - 16) / 48);
  } else {
    const tol = opt.tol ?? 24;
    const bg = new Uint8Array(N);
    const q = new Int32Array(N);
    let qh = 0, qt = 0;
    const push = (/** @type {number} */ i) => { if (!bg[i] && dist[i] < tol) { bg[i] = 1; q[qt++] = i; } };
    for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    while (qh < qt) {
      const i = q[qh++], x = i % w, y = (i / w) | 0;
      if (x > 0) push(i - 1);
      if (x < w - 1) push(i + 1);
      if (y > 0) push(i - w);
      if (y < h - 1) push(i + w);
    }
    const label = new Int32Array(N);
    /** @type {{size: number, border: boolean}[]} */
    const comps = [];
    const labelAll = (/** @type {(i: number) => boolean} */ pred) => {
      label.fill(-1);
      comps.length = 0;
      for (let s = 0; s < N; s++) {
        if (label[s] !== -1 || !pred(s)) continue;
        const id = comps.length;
        let size = 0, border = false;
        qh = 0; qt = 0; q[qt++] = s; label[s] = id;
        while (qh < qt) {
          const i = q[qh++], x = i % w, y = (i / w) | 0;
          size++;
          if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border = true;
          const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
          for (const j of nb) if (j >= 0 && label[j] === -1 && pred(j)) { label[j] = id; q[qt++] = j; }
        }
        comps.push({ size, border });
      }
    };
    // Enclosed paper (between legs, inside a wheel) becomes transparent too.
    const holeMin = opt.holeMin ?? Math.max(90, N * 0.0012);
    labelAll((i) => !bg[i] && dist[i] < tol * 0.85);
    for (let i = 0; i < N; i++) if (label[i] >= 0 && comps[label[i]].size >= holeMin) bg[i] = 1;
    // Drop specks and pieces of neighbouring figures that leak in from the crop border.
    labelAll((i) => !bg[i]);
    let largest = 0;
    comps.forEach((c, k) => { if (c.size > comps[largest].size) largest = k; });
    const big = comps.length ? comps[largest].size : 0;
    const minBlob = Math.max(20, N * 0.00025);
    for (let i = 0; i < N; i++) {
      const k = label[i];
      if (k < 0) continue;
      const c = comps[k];
      if (c.size < minBlob || (opt.largest && k !== largest && c.size < big * 0.05) || (c.border && k !== largest && c.size < big * 0.3)) bg[i] = 1;
    }
    // Soft edge: pixels within 2px of paper fade by how much pigment they carry.
    const near = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      if (!bg[i]) continue;
      const x = i % w, y = (i / w) | 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < w && yy < h) near[yy * w + xx] = 1;
        }
      }
    }
    for (let i = 0; i < N; i++) alpha[i] = bg[i] ? 0 : near[i] ? clamp01((dist[i] - 8) / 42) : 1;
  }
  let minX = w, minY = h, maxX = -1, maxY = -1;
  // Solid drawing (alpha >= 0.5) on each border row/column of the crop: the figure continues outside it.
  const edges = { top: 0, bottom: 0, left: 0, right: 0 };
  let opaque = 0;
  for (let i = 0; i < N; i++) {
    const a = alpha[i];
    if (a >= 0.5) {
      opaque++;
      const x = i % w, y = (i / w) | 0;
      if (y === 0) edges.top++;
      if (y === h - 1) edges.bottom++;
      if (x === 0) edges.left++;
      if (x === w - 1) edges.right++;
    }
    if (a > 0 && a < 1) {
      // Un-mix the paper colour from semi-transparent edge pixels so they do not halo.
      for (let k = 0; k < 3; k++) d[i * 4 + k] = Math.round(Math.min(255, Math.max(0, paper[k] + (d[i * 4 + k] - paper[k]) / Math.max(a, 0.25))));
    }
    d[i * 4 + 3] = Math.round(a * 255);
    if (a > 0.1) {
      const x = i % w, y = (i / w) | 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return { image: { width: w, height: h, data: d }, offset: { x: 0, y: 0 }, paper, empty: true, edges, opaque };
  const pad = opt.pad ?? 2;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);
  const image = crop({ width: w, height: h, data: d }, { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 });
  return { image, offset: { x: minX, y: minY }, paper, empty: false, edges, opaque };
}

export const SIDES = ['top', 'bottom', 'left', 'right'];

/**
 * @typedef {Object} GrowOptions
 * @property {boolean} [grow]    Enlarge the crop on sides where the drawing is cut (default true).
 * @property {number}  [step]    Pixels added per side per round (default 8).
 * @property {number}  [max]     Most pixels a side may grow (default 160).
 * @property {number}  [minEdge] Solid pixels on a border line that count as "cut" (default 3).
 */

/**
 * Cut one sprite, enlarging the rectangle where the drawing runs into its edge (hair, helmet
 * plumes, ears and hands are the usual victims). A side stops growing when the drawing no longer
 * reaches it, the sheet ends, `max` is used up, or one more step would swallow a neighbouring
 * figure (the solid area jumps by more than half).
 * @param {Image} sheet
 * @param {{x: number, y: number, w: number, h: number}} rect
 * @param {ExtractOptions} [opt]
 * @param {GrowOptions} [g]
 * @returns {ReturnType<typeof extractSprite> & {rect: {x: number, y: number, w: number, h: number}, grown: Record<string, number>, clipped: string[], blockedBy: Record<string, string>}}
 */
export function cutSprite(sheet, rect, opt = {}, g = {}) {
  const step = g.step ?? 8, max = g.max ?? 160, minEdge = g.minEdge ?? 3;
  const x0 = Math.max(0, rect.x), y0 = Math.max(0, rect.y);
  let cur = { x: x0, y: y0, w: Math.min(sheet.width, rect.x + rect.w) - x0, h: Math.min(sheet.height, rect.y + rect.h) - y0 };
  let res = extractSprite(crop(sheet, cur), opt);
  const grown = { top: 0, bottom: 0, left: 0, right: 0 };
  /** @type {Record<string, string>} */
  const blockedBy = {};
  let single = false;   // after a merge while growing several sides, grow one side at a time
  while (g.grow !== false) {
    const open = SIDES.filter((s) => res.edges[s] >= minEdge && !blockedBy[s]);
    const sides = single ? open.slice(0, 1) : open;
    const next = { ...cur };
    const add = {};
    for (const s of sides) {
      const room = s === 'top' ? cur.y : s === 'left' ? cur.x : s === 'bottom' ? sheet.height - cur.y - cur.h : sheet.width - cur.x - cur.w;
      const d = Math.min(step, room, max - grown[s]);
      if (d <= 0) { blockedBy[s] = room <= 0 ? 'sheet edge' : 'max'; continue; }
      add[s] = d;
      if (s === 'top') { next.y -= d; next.h += d; }
      if (s === 'bottom') next.h += d;
      if (s === 'left') { next.x -= d; next.w += d; }
      if (s === 'right') next.w += d;
    }
    const moved = Object.keys(add);
    if (!moved.length) break;
    const nres = extractSprite(crop(sheet, next), opt);
    if (nres.opaque > res.opaque * 1.5 + 200) {
      if (moved.length > 1) single = true;
      else blockedBy[moved[0]] = 'neighbour';
      continue;
    }
    for (const s of moved) grown[s] += add[s];
    cur = next;
    res = nres;
  }
  const clipped = SIDES.filter((s) => res.edges[s] >= minEdge);
  return { ...res, rect: cur, grown, clipped, blockedBy };
}

/**
 * Draw rectangle outlines (crop boxes) onto a copy of the sheet for coordinate checking.
 * @param {Image} sheet
 * @param {{x: number, y: number, w: number, h: number}[]} boxes
 * @param {number[]} [rgb]
 * @returns {Image}
 */
export function drawBoxes(sheet, boxes, rgb = [230, 30, 60]) {
  const data = Uint8Array.from(sheet.data);
  const put = (/** @type {number} */ x, /** @type {number} */ y) => {
    if (x < 0 || y < 0 || x >= sheet.width || y >= sheet.height) return;
    const i = (y * sheet.width + x) * 4;
    data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255;
  };
  for (const b of boxes) {
    for (let t = 0; t < 3; t++) {
      for (let x = b.x; x < b.x + b.w; x++) { put(x, b.y + t); put(x, b.y + b.h - 1 - t); }
      for (let y = b.y; y < b.y + b.h; y++) { put(b.x + t, y); put(b.x + b.w - 1 - t, y); }
    }
  }
  return { width: sheet.width, height: sheet.height, data };
}

/**
 * Lay sprites out on a checkerboard grid, each scaled down (box filter) to fit its cell.
 * @param {Image[]} sprites
 * @param {number} [cell] Cell size in px.
 * @param {number} [cols]
 * @param {(number[] | null)[]} [marks] Optional frame colour per sprite (e.g. red for "still cut").
 * @returns {Image}
 */
export function contactSheet(sprites, cell = 200, cols = 6, marks = []) {
  const n = Math.max(1, sprites.length);
  const c = Math.min(cols, n), r = Math.ceil(n / c);
  const width = c * cell, height = r * cell;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = ((x >> 4) + (y >> 4)) % 2 ? 236 : 210;
      const i = (y * width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  sprites.forEach((s, k) => {
    const scale = Math.min(1, (cell - 8) / Math.max(s.width, s.height));
    const tw = Math.max(1, Math.round(s.width * scale)), th = Math.max(1, Math.round(s.height * scale));
    const ox = (k % c) * cell + ((cell - tw) >> 1), oy = Math.floor(k / c) * cell + ((cell - th) >> 1);
    for (let y = 0; y < th; y++) {
      for (let x = 0; x < tw; x++) {
        const sx0 = Math.floor(x / scale), sx1 = Math.max(sx0 + 1, Math.floor((x + 1) / scale));
        const sy0 = Math.floor(y / scale), sy1 = Math.max(sy0 + 1, Math.floor((y + 1) / scale));
        let rr = 0, gg = 0, bb = 0, aa = 0, cnt = 0;
        for (let sy = sy0; sy < Math.min(sy1, s.height); sy++) {
          for (let sx = sx0; sx < Math.min(sx1, s.width); sx++) {
            const i = (sy * s.width + sx) * 4, a = s.data[i + 3];
            rr += s.data[i] * a; gg += s.data[i + 1] * a; bb += s.data[i + 2] * a; aa += a; cnt++;
          }
        }
        if (aa === 0) continue;
        const a = aa / cnt / 255;
        const o = ((oy + y) * width + ox + x) * 4;
        data[o] = Math.round(data[o] * (1 - a) + (rr / aa) * a);
        data[o + 1] = Math.round(data[o + 1] * (1 - a) + (gg / aa) * a);
        data[o + 2] = Math.round(data[o + 2] * (1 - a) + (bb / aa) * a);
      }
    }
    const m = marks[k];
    if (m) {
      const cx = (k % c) * cell, cy = Math.floor(k / c) * cell;
      for (let t = 0; t < cell; t++) {
        for (let b = 0; b < 4; b++) {
          for (const [x, y] of [[cx + t, cy + b], [cx + t, cy + cell - 1 - b], [cx + b, cy + t], [cx + cell - 1 - b, cy + t]]) {
            const o = (y * width + x) * 4;
            data[o] = m[0]; data[o + 1] = m[1]; data[o + 2] = m[2];
          }
        }
      }
    }
  });
  return { width, height, data };
}
