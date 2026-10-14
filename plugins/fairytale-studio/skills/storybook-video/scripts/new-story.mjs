#!/usr/bin/env node
// Create (or upgrade) a storybook video page from the bundled template.
//   node new-story.mjs <story-dir> --storyboard <storyboard.json> --sprites <sprites.json> [--sprites <kit sprites.json> ...]
//                      [--narration <tts out dir>] [--save-name name]
//   node new-story.mjs <story-dir> --update-engine
// --sprites may repeat (characters plus background element kits). --narration points at the folder
// with full.wav and timeline.json from the storybook-narration tts tool; the page then plays the
// recorded voice at the times the story-storyboard retime step wrote (voice_lines).
// Engine files are replaced by --update-engine; author files (story.config.js, js/scenes.js,
// js/score.js) are only ever created, never overwritten.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const TEMPLATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'template');
export const ENGINE_FILES = ['index.html', 'js/util.js', 'js/paint.js', 'js/sprites.js', 'js/audio.js', 'js/stage.js', 'js/main.js', 'js/collage.js', 'js/mp4mux.js'];
export const AUTHOR_FILES = ['js/scenes.js', 'js/score.js'];

/**
 * URL from the story folder to a file, with forward slashes.
 * @param {string} storyDir
 * @param {string} file
 * @returns {string}
 */
export function relUrl(storyDir, file) {
  const rel = path.relative(path.resolve(storyDir), path.resolve(file)).split(path.sep).join('/');
  return rel.startsWith('.') ? rel : `./${rel}`;
}

export const TIMELINE_SCHEMA = 'fairytale-tts-batch/1';

/**
 * Check inputs: storyboard schema, that every cast member has at least one sprite in one of the
 * sprite manifests, and (with a narration timeline) that the storyboard's voice_lines exist in it.
 * @param {any} sb
 * @param {any} sprites One sprites.json object or a list of them.
 * @param {any} [timeline] Narration timeline.json object.
 * @returns {{errors: string[], warnings: string[]}}
 */
export function checkInputs(sb, sprites, timeline) {
  const errors = [];
  const warnings = [];
  const lists = Array.isArray(sprites) ? sprites : [sprites];
  if (sb.schema !== 'storyboard/1') errors.push('storyboard schema must be "storyboard/1" (make it with the story-storyboard skill)');
  if (!Array.isArray(sb.scenes) || !sb.scenes.length) errors.push('storyboard has no scenes');
  for (const sp of lists) if (sp.schema !== 'sprites/1') errors.push('sprites.json schema must be "sprites/1" (make it with the sheet-to-sprites skill)');
  const names = new Set(lists.flatMap((sp) => (sp.sprites || []).filter((/** @type {any} */ s) => !s.empty).map((/** @type {any} */ s) => s.name)));
  if (timeline) {
    if (timeline.schema !== TIMELINE_SCHEMA) errors.push(`timeline.json schema must be "${TIMELINE_SCHEMA}" (made by the storybook-narration tts batch)`);
    const ids = new Set((timeline.lines || []).map((/** @type {any} */ l) => l.id));
    const items = [...(sb.captions || []), ...(sb.bubbles || [])];
    const voiced = items.filter((it) => (it.voice_lines || []).length);
    if (!voiced.length) warnings.push('no caption or bubble has voice_lines; run the story-storyboard retime step with this timeline, or the page stays silent');
    const missing = [...new Set(voiced.flatMap((it) => it.voice_lines.filter((/** @type {string} */ id) => !ids.has(id))))];
    if (missing.length) errors.push(`voice_lines not in timeline.json: ${missing.join(', ')} (re-run retime with the current timeline)`);
  }
  for (const c of sb.cast || []) {
    const list = c.sprites || [];
    if (!list.some((n) => names.has(n))) warnings.push(`cast "${c.id}" has no sprite in sprites.json (listed: ${list.join(', ') || 'none'}); default scenes will skip it`);
  }
  return { errors, warnings };
}

/**
 * Parse argv.
 * @param {string[]} argv
 * @returns {{dir?: string, storyboard?: string, sprites: string[], narration?: string, saveName?: string, update: boolean}}
 */
export function parseArgs(argv) {
  /** @type {{dir?: string, storyboard?: string, sprites: string[], narration?: string, saveName?: string, update: boolean}} */
  const a = { update: false, dir: undefined, storyboard: undefined, sprites: [], narration: undefined, saveName: undefined };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--storyboard') a.storyboard = argv[++i];
    else if (argv[i] === '--sprites') a.sprites.push(argv[++i]);
    else if (argv[i] === '--narration') a.narration = argv[++i];
    else if (argv[i] === '--save-name') a.saveName = argv[++i];
    else if (argv[i] === '--update-engine') a.update = true;
    else a.dir = argv[i];
  }
  return a;
}

/**
 * Copy one template file.
 * @param {string} rel
 * @param {string} dir
 */
function copy(rel, dir) {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.copyFileSync(path.join(TEMPLATE, rel), path.join(dir, rel));
}

/**
 * CLI.
 * @param {string[]} argv
 * @param {{out: (s: string) => void, err: (s: string) => void}} io
 * @returns {number}
 */
export function main(argv, io) {
  const a = parseArgs(argv);
  const usage = 'Usage: node new-story.mjs <story-dir> --storyboard <storyboard.json> --sprites <sprites.json> [--sprites <more.json> ...] [--narration <tts out dir>] [--save-name name] | <story-dir> --update-engine';
  if (!a.dir) { io.err(usage); return 1; }
  const exists = fs.existsSync(path.join(a.dir, 'index.html'));
  if (a.update) {
    if (!exists) { io.err(`error: ${a.dir} has no index.html to update`); return 1; }
    for (const f of ENGINE_FILES) copy(f, a.dir);
    for (const f of AUTHOR_FILES) if (!fs.existsSync(path.join(a.dir, f))) copy(f, a.dir);
    io.out(`Updated ${ENGINE_FILES.length} engine files in ${a.dir}; story.config.js, scenes.js and score.js kept.`);
    return 0;
  }
  if (!a.storyboard || !a.sprites.length) { io.err(usage); return 1; }
  if (exists) { io.err(`error: ${a.dir} already has a storybook page; use --update-engine to refresh the engine`); return 1; }
  let sb, sprites, timeline;
  const narr = a.narration ? { audio: path.join(a.narration, 'full.wav'), timeline: path.join(a.narration, 'timeline.json') } : null;
  try {
    sb = JSON.parse(fs.readFileSync(a.storyboard, 'utf8'));
    sprites = a.sprites.map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
    if (narr) {
      if (!fs.existsSync(narr.audio)) throw new Error(`${narr.audio} not found (run the tts batch first)`);
      timeline = JSON.parse(fs.readFileSync(narr.timeline, 'utf8'));
    }
  } catch (e) {
    io.err(`error: ${/** @type {Error} */ (e).message}`);
    return 1;
  }
  const { errors, warnings } = checkInputs(sb, sprites, timeline);
  errors.forEach((e) => io.err(`error: ${e}`));
  warnings.forEach((w) => io.err(`warning: ${w}`));
  if (errors.length) return 1;
  for (const f of [...ENGINE_FILES, ...AUTHOR_FILES]) copy(f, a.dir);
  const saveName = a.saveName || path.basename(path.resolve(a.dir));
  const spriteUrls = a.sprites.map((f) => `'${relUrl(/** @type {string} */ (a.dir), f)}'`);
  const lines = [
    '// Paths are URLs relative to this page (or absolute from the server root, e.g. "/assets/...").',
    'export default {',
    `  storyboard: '${relUrl(a.dir, a.storyboard)}',`,
    `  sprites: ${spriteUrls.length > 1 ? `[${spriteUrls.join(', ')}]` : spriteUrls[0]},`,
  ];
  if (narr) {
    lines.push(`  narration: { audio: '${relUrl(a.dir, narr.audio)}', timeline: '${relUrl(a.dir, narr.timeline)}' },`);
    lines.push('  // Levels: music bed gain, music gain while a line plays (0.3 = about -10 dB), voice gain, master gain.');
    lines.push('  // Check with `await __mix()` in the console: voice 15 dB+ over the music, about -14 LUFS.');
    lines.push('  mix: { music: 1, duck: 0.3, voice: 1, master: 0.85 },');
  }
  lines.push(`  saveName: '${saveName}',`, '};', '');
  fs.writeFileSync(path.join(a.dir, 'story.config.js'), lines.join('\n'));
  const count = sprites.reduce((n, sp) => n + (sp.sprites || []).length, 0);
  io.out(`Created ${a.dir} for "${sb.title}" (${sb.scenes.length} scenes, ${count} sprites${narr ? `, narration ${(timeline.lines || []).length} lines` : ''}).`);
  io.out('Next: serve the project root (the page, storyboard and sprites must all be under it) and open the page; scenes without code use the default animatic.');
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2), { out: (s) => console.log(s), err: (s) => console.error(s) });
}
