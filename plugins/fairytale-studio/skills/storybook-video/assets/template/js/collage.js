// Collage helpers for scenes pasted together from torn-paper element kits (fairytale-art-prompts
// element-kits.md): long pieces carried past the frame, open gates assembled from separate leaves,
// pieces that change state during a scene. Learned on golden-axe (2026-10-15).
import { W, H, makeCanvas } from './util.js';
import { S, paste } from './sprites.js';

/**
 * A long piece (front wall, fence, bank) centred on cx and carried past both frame edges with plain
 * sections cut from its own ends; the piece's ends are trimmed and faded over `blend` px into the
 * extensions underneath, so the joins show neither the paper edge nor a hard seam.
 * With `opening` = [x0, x1, y0, y1] (fractions of the piece, measured on the cut sprite with
 * sheet-to-sprites measure.mjs) and `leaves` = [left, right], the two door leaves are drawn first,
 * swung inward (squeezed against each post, a little darker), and the gateway piece over them.
 * Returns a drawing function for a baked layout list: (g, light) => void.
 * @param {string} name
 * @param {number} cx
 * @param {number} base
 * @param {number} h
 * @param {{opening?: number[], leaves?: string[], leafTop?: number, swing?: number, blend?: number}} [o]
 */
export function pasteRun(name, cx, base, h, o = {}) {
  return (g, light) => {
    const s = S[name];
    if (!s) return;
    const k = h / s.h, w = s.w * k;
    const trim = 0.015 * w, left = cx - w / 2 + trim, right = cx + w / 2 - trim;
    const blend = o.blend ?? 40;
    const ext = Math.max(0, left + 60 + blend, W + 60 + blend - right);
    const tint = light ?? null;
    if (ext > 0) {
      g.save(); g.beginPath(); g.rect(-100, 0, left + blend + 100, H); g.clip();
      paste(g, name, cx - Math.min(ext, w * 0.4), base, h, { tilt: 0, tint });
      g.restore();
      g.save(); g.beginPath(); g.rect(right - blend, 0, W - right + blend + 100, H); g.clip();
      paste(g, name, cx + Math.min(ext, w * 0.4), base, h, { tilt: 0, tint });
      g.restore();
    }
    if (o.opening && o.leaves) {
      const [fx0, fx1, fy0, fy1] = o.opening;
      const x0 = cx - w / 2, ox0 = x0 + fx0 * w, ox1 = x0 + fx1 * w, oy1 = base - h + fy1 * h;
      const lh = (fy1 - (o.leafTop ?? fy0)) * h;
      const lw = (ox1 - ox0) / 2;
      for (const [leaf, hinge, dir] of [[o.leaves[0], ox0, 1], [o.leaves[1], ox1, -1]]) {
        const ls = S[leaf];
        if (!ls) continue;
        g.save();
        g.translate(hinge, oy1);
        g.scale(dir * (o.swing ?? 0.42) * (lw / (ls.w * (lh / ls.h))), 1);
        g.filter = 'brightness(0.82)';
        paste(g, leaf, (ls.w * (lh / ls.h)) / 2, 0, lh, { tilt: 0, shadow: 0, tint });
        g.restore();
      }
    }
    const off = makeCanvas(W, H);
    const og = off.getContext('2d');
    paste(og, name, cx, base, h, { tilt: 0, tint });
    og.globalCompositeOperation = 'destination-in';
    const fade = ext > 0 ? Math.min(0.2, blend / (right - left)) : 0;
    const gr = og.createLinearGradient(left, 0, right, 0);
    gr.addColorStop(0, fade ? 'rgba(0,0,0,0)' : '#000');
    gr.addColorStop(fade, '#000');
    gr.addColorStop(1 - fade, '#000');
    gr.addColorStop(1, fade ? 'rgba(0,0,0,0)' : '#000');
    og.fillStyle = gr;
    og.fillRect(left, 0, right - left, H);
    og.clearRect(0, 0, left, H);
    og.clearRect(right, 0, W - right, H);
    g.drawImage(off, 0, 0);
  };
}

/**
 * The state of a piece at time T from [[time, value], ...] (the first entry is the default): the
 * whole tree until the first stroke, the notched tree after it, nothing once it is felled, ...
 * Generate all states of a piece on one sheet so they match line for line (element-kits.md).
 */
export function stateAt(T, list) {
  let v = list[0][1];
  for (const [t, value] of list) if (T >= t) v = value;
  return v;
}
