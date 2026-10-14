#!/usr/bin/env node
// Assemble image prompts for one story from the skill's modules and a story spec, so no story needs
// its own prompt script (golden-axe had a 500-line one in a handoff folder).
//   node assemble-prompts.mjs <story-art.json> [--out <dir>] [--only name,name]
// Writes <out>/prompts/<sheet>.txt and <out>/batch.json (read by run-batch.sh). Module blocks are pasted
// verbatim from references/: style (STYLE BLOCK, palette, negatives, reference roles), the torn-paper
// finish (COLLAGE BLOCK, backdrop, negatives), the era (ERA BLOCK, anachronism negatives) and the
// audience band. Sheet kinds: plate (template 8), kit (template 6), cut (template 7). Spec format:
// references/story-spec.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BANDS = { '3-5': 'Band A', '6-8': 'Band B', '9-10': 'Band C' };

/**
 * The first ```text block after the heading that starts with `heading`.
 * @param {string} md
 * @param {string} heading e.g. '## STYLE BLOCK'
 * @returns {string}
 */
export function block(md, heading) {
  const i = md.indexOf('\n' + heading);
  if (i < 0) throw new Error(`heading "${heading}" not found`);
  const next = md.indexOf('\n## ', i + heading.length + 1);
  const section = md.slice(i, next < 0 ? undefined : next);
  const m = /```text\n([\s\S]*?)\n```/.exec(section);
  if (!m) throw new Error(`no text block under "${heading}"`);
  return m[1].trim();
}

/**
 * Reference role sentences from a style module's markdown table: | `file` | role | use |.
 * @param {string} md
 * @returns {Record<string, string>}
 */
export function roleTable(md) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const m of md.matchAll(/^\| `([^`]+)` \| ([^|]+) \|/gm)) out[m[1]] = m[2].trim();
  return out;
}

/**
 * Load the module blocks a spec needs.
 * @param {{style: string, era: string, audience?: string, finish?: string}} spec
 * @param {string} [dir] skill directory (tests point it at a copy)
 */
export function loadModules(spec, dir = SKILL_DIR) {
  const ref = (/** @type {string} */ p) => fs.readFileSync(path.join(dir, 'references', p), 'utf8');
  const style = ref(`styles/${spec.style}.md`);
  const era = ref(`eras/${spec.era}.md`);
  const finish = ref(`styles/${spec.finish || 'torn-paper-collage'}.md`);
  const band = BANDS[/** @type {keyof BANDS} */ (spec.audience || '6-8')];
  if (!band) throw new Error(`unknown audience "${spec.audience}" (use ${Object.keys(BANDS).join(', ')})`);
  let audience = '';
  try { audience = block(ref('audience.md'), `## ${band}`); } catch { /* band without a prompt line (9-10) */ }
  const templates = ref('sheet-templates.md');
  const cutFinish = /^Each figure is drawn on its own piece[^\n]*$/m.exec(templates);
  return {
    style: block(style, '## STYLE BLOCK'),
    palette: block(style, '## Palette'),
    styleNeg: block(style, '## Negatives').replace(/ no cut-paper collage,/, ''),
    roles: roleTable(style),
    collage: block(finish, '## COLLAGE BLOCK'),
    backdrop: block(finish, '## Backdrop block'),
    collageNeg: block(finish, '## Negatives'),
    era: block(era, '## ERA BLOCK'),
    eraNeg: block(era, '## Anachronism negatives'),
    audience,
    cutFinish: cutFinish ? cutFinish[0] : '',
  };
}

/**
 * Name one paper tone everywhere (torn-paper-collage.md, Paper tone): kit rims, character margins
 * and the style block's paper texture must not name two papers.
 * @param {string} text
 * @param {string} [paper] hex colour
 * @returns {string}
 */
export function paperTone(text, paper) {
  if (!paper) return text;
  return text.replace(/off-white cold-press paper texture/g, 'warm cream cold-press paper texture')
    .replace(/#f4efe2/g, paper);
}

/**
 * Assemble all sheets of a spec.
 * @param {any} spec  see references/story-spec.md
 * @param {ReturnType<typeof loadModules>} mod
 * @returns {{items: any[], texts: Record<string, string>}}
 */
export function assemble(spec, mod) {
  const title = `"${spec.title}"${spec.subtitle ? ` (${spec.subtitle})` : ''}, audience ages ${spec.audience || '6-8'}`;
  const anchor = spec.anchor;
  const P = (/** @type {string} */ t) => paperTone(t, spec.paper);
  const style = P(mod.style), collage = P(mod.collage), cutFinish = P(mod.cutFinish);
  const palette = spec.palette || mod.palette;
  const roles = { ...mod.roles, ...(spec.roles || {}) };
  const eraPeople = mod.era.split(' Architecture, when present')[0];
  const items = [], texts = /** @type {Record<string, string>} */ ({});
  const names = new Set();

  /** Input-images sentence and the file list, in order. refs: names, or [file, role sentence with {n}]. */
  const inputs = (/** @type {string} */ anchorRole, /** @type {any[]} */ refs) => {
    const out = ['Input images: supplied local images are REFERENCES ONLY, not edit targets.'];
    const files = [];
    let n = 1;
    if (anchor) {
      out.push(`Image 1 ${anchor} is the approved character lineup of this story, ${anchorRole}`);
      files.push(anchor);
      n = 2;
    }
    for (const r of refs) {
      const [file, role] = Array.isArray(r) ? r : [r, null];
      const sentence = role ? role.replace(/\{n\}/g, String(n)) : roles[file] ? `Image ${n} ${file}: ${roles[file]}.` : null;
      if (!sentence) throw new Error(`no role sentence for reference "${file}" (add it to spec.roles or give [file, sentence])`);
      out.push(sentence);
      files.push(file);
      n++;
    }
    return { text: out.join(' '), files };
  };
  const PALETTE_ANCHOR = 'a STRICT PALETTE AND STYLE reference only, not an edit target: match its pen line, watercolor washes and colors exactly; do not draw any character.';
  const IDENT_ANCHOR = 'a STRICT CHARACTER IDENTITY AND PALETTE reference, not an edit target: same faces, hair, outfits, colors, proportions and line quality.';
  const add = (/** @type {any} */ s, /** @type {string} */ kind, /** @type {string} */ text, /** @type {string[]} */ files, /** @type {any} */ meta) => {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s.name || '')) throw new Error(`sheet name "${s.name}" must be kebab-case`);
    if (names.has(s.name)) throw new Error(`duplicate sheet name "${s.name}"`);
    names.add(s.name);
    texts[s.name] = text.trim() + '\n';
    items.push({ name: s.name, sheet: kind, prompt: `prompts/${s.name}.txt`, refs: files, ...meta });
  };
  const sentences = (/** @type {[string, string][]} */ pieces) => {
    if (!Array.isArray(pieces) || !pieces.length) throw new Error('a sheet needs pieces: [[name, sentence], ...]');
    return pieces.map(([n, t], i) => `${i + 1} ${n}: ${t.replace(/\.?$/, '.')}`).join('\n');
  };

  for (const s of spec.sheets || []) {
    if (s.kind === 'plate') {
      const refs = [...(s.refs || ['nature.jpg', 'nature-2.jpg'])];
      if (s.base) refs.push([`@${s.base}`, `Image {n} ${s.base}.png is the approved day plate of this same place: keep exactly its composition, ridgelines and horizon; only the light, sky and colour temperature change.`]);
      const inp = inputs(PALETTE_ANCHOR, refs);
      const horizon = s.horizon ?? 58;
      const lower = s.lower || `The lower ${100 - horizon - 4} percent is a calm ground field in this place's own colour, slightly deeper and warmer toward the bottom edge so pasted pieces feel grounded, with only a few loose brush marks and no objects, left open for pasted pieces and characters.`;
      const text = `Use case: illustration-story. Asset type: background plate (far distance only) for the children's fairy tale ${title}. This is the far painted backdrop; nearer houses, trees, rocks, water and characters are separate cut-out pieces that will be pasted on top later.

${inp.text}

${style}

${spec.land || eraPeople}

Composition: one wide landscape painting that fills the whole canvas edge to edge, painted directly on ${spec.paper ? `warm cream cold-press watercolor paper (close to ${spec.paper})` : 'cold-press watercolor paper'}, with no paper rim, torn edge, border, frame or vignette. Back to front: ${s.sky}; ${s.far}; ${s.ground}. Atmospheric distance: the farther a form, the paler, cooler and simpler it is, with fewer and lighter pen lines than the characters; the farthest ridges have no outline at all. The horizon sits at about ${horizon} percent of the height. ${lower} Balanced and unfocused: no single landmark in the centre and nothing a pasted piece would have to line up with.${s.extra ? ' ' + s.extra : ''}

${palette} Overall lighter and slightly cooler than the characters and the cut-out pieces.

Constraints: No characters, people, animals, houses, walls, fences, close trees, rocks, water edges or props; no cut-paper rim, torn edge, sticker outline, frame or border; no hard foreground objects; no text. ${mod.styleNeg}`;
      add(s, 'plate', text, inp.files, { layer: 'plate', location: s.location, time: s.time });
    } else if (s.kind === 'kit') {
      const layer = s.layer || 'near';
      const inp = inputs(PALETTE_ANCHOR, s.refs || ['nature.jpg', 'creature-4.jpg']);
      const count = s.pieces && s.pieces.length === 1 ? 'one single piece' : `${(s.pieces || []).length} separate pieces`;
      const big = s.big ? ' Each piece is drawn very large, filling most of the sheet with only a comfortable magenta margin around it, so it keeps fine pen lines when shown big.' : '';
      const backing = s.backing ? ' Solid backing: every piece is painted on one continuous piece of cream paper; any gap between branches, slats, planks or posts shows what is behind it (the ground colour and a soft shadow) as opaque watercolor, never magenta.' + (s.allowHole ? ` The only magenta inside any piece is ${s.allowHole}.` : ' No magenta and no holes anywhere inside a piece.') : '';
      const text = `Use case: illustration-story. Asset type: background element kit sheet (${s.label || layer}) for the children's fairy tale ${title}. These are separate set pieces to be cut out and pasted together later, not a scene.

${inp.text}

${style}

${collage}

${mod.era}

Composition: an element kit of exactly ${count} arranged ${s.arrange || 'in two rows of four'}, in this reading order (left to right, top to bottom). Every piece is complete, seen from the front at eye level with a straight base, and drawn at the same scale as the others on this sheet so their sizes compare truthfully: ${s.scale || 'all pieces share one scale.'}${big}${backing} Pieces —
${sentences(s.pieces)}

${mod.backdrop}

${palette}

${mod.audience}

Constraints: ${mod.collageNeg} ${mod.eraNeg} No people or animals unless a piece names them. Each piece is a single isolated object on the backdrop with a visible paper margin along every natural edge; no repeated stamped texture symbols; paintings use only the listed palette and the magenta exists only as the flat backdrop. Repeat: the whole sheet is flat pure magenta to every edge, wide magenta gaps between pieces, no text anywhere.`;
      add(s, 'element-kit', text, inp.files, { layer, pieces: s.pieces.map((/** @type {string[]} */ p) => p[0]), scale_ref: s.scale || '' });
    } else if (s.kind === 'cut') {
      if (!s.identity) throw new Error(`cut sheet "${s.name}" needs the character's identity sentence`);
      const inp = inputs(IDENT_ANCHOR, s.refs || []);
      const text = `Use case: illustration-story. Asset type: character cut-out sheet for ${s.who} in the children's fairy tale ${title}: production sprites to be cut out, not a review sheet.

${inp.text}

${style}

${cutFinish}

${eraPeople}

Composition: exactly ${(s.pieces || []).length} separate figures ${s.arrange || 'in two rows of four'}, in this reading order, all at the same scale, ${s.framing || 'complete head-to-toe with every held prop inside its own paper piece'}, wide clear magenta gaps between figures —
${sentences(s.pieces)}

Preserve face, haircut, clothing colors, age and distinguishing features exactly: ${s.identity}

${mod.backdrop}

${palette}

${mod.audience}

Constraints: no title, captions, labels or swatches; no ground line, floor shadow or ground patch under the feet; no effect marks (motion lines, sparkle marks, exclamation marks, sweat drops, tears flying away) outside the paper piece, because the video adds those; no extra characters. ${mod.styleNeg} ${mod.eraNeg}${spec.safety ? ' ' + spec.safety : ''} The magenta exists only as the flat backdrop; every figure keeps a visible paper margin and a closed black outline all around.`;
      add(s, 'character-cutout', text, inp.files, { pieces: s.pieces.map((/** @type {string[]} */ p) => p[0]) });
    } else {
      throw new Error(`sheet "${s.name}": unknown kind "${s.kind}" (plate, kit, cut)`);
    }
  }
  return { items, texts };
}

/**
 * CLI.
 * @param {string[]} argv
 * @param {{out: (s: string) => void, err: (s: string) => void}} io
 * @returns {number}
 */
export function main(argv, io) {
  /** @type {{spec?: string, out?: string, only: string[]}} */
  const a = { only: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') a.out = argv[++i];
    else if (argv[i] === '--only') a.only = argv[++i].split(',').filter(Boolean);
    else a.spec = argv[i];
  }
  if (!a.spec) { io.err('Usage: node assemble-prompts.mjs <story-art.json> [--out <dir>] [--only name,name]'); return 1; }
  try {
    const spec = JSON.parse(fs.readFileSync(a.spec, 'utf8'));
    const base = path.dirname(path.resolve(a.spec));
    const out = path.resolve(base, a.out || spec.out || '.');
    const { items, texts } = assemble(spec, loadModules(spec));
    const chosen = a.only.length ? items.filter((it) => a.only.includes(it.name)) : items;
    const unknown = a.only.filter((n) => !items.some((it) => it.name === n));
    if (unknown.length) throw new Error(`--only names not in the spec: ${unknown.join(', ')}`);
    fs.mkdirSync(path.join(out, 'prompts'), { recursive: true });
    for (const it of chosen) fs.writeFileSync(path.join(out, it.prompt), texts[it.name]);
    const batchFile = path.join(out, 'batch.json');
    const old = fs.existsSync(batchFile) ? JSON.parse(fs.readFileSync(batchFile, 'utf8')) : { items: [] };
    const keep = old.items.filter((/** @type {any} */ it) => !chosen.some((c) => c.name === it.name));
    const refsDirs = (spec.refsDirs || []).map((/** @type {string} */ d) => path.resolve(base, d));
    fs.writeFileSync(batchFile, JSON.stringify({ refs_dirs: [...refsDirs, out], items: [...keep, ...chosen] }, null, 2) + '\n');
    io.out(`Wrote ${chosen.length} prompt(s) to ${path.join(out, 'prompts')} and ${batchFile}.`);
    return 0;
  } catch (e) {
    io.err(`error: ${/** @type {Error} */ (e).message}`);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2), { out: (s) => console.log(s), err: (s) => console.error(s) });
}
