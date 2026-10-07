#!/usr/bin/env node
// Create (or upgrade) a storybook video page from the bundled template.
//   node new-story.mjs <story-dir> --storyboard <storyboard.json> --sprites <sprites.json> [--save-name name]
//   node new-story.mjs <story-dir> --update-engine
// Engine files are replaced by --update-engine; author files (story.config.js, js/scenes.js,
// js/score.js) are only ever created, never overwritten.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const TEMPLATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'template');
export const ENGINE_FILES = ['index.html', 'js/util.js', 'js/paint.js', 'js/sprites.js', 'js/audio.js', 'js/stage.js', 'js/main.js'];
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

/**
 * Check inputs: storyboard schema and that every cast member has at least one sprite.
 * @param {any} sb
 * @param {any} sprites
 * @returns {{errors: string[], warnings: string[]}}
 */
export function checkInputs(sb, sprites) {
  const errors = [];
  const warnings = [];
  if (sb.schema !== 'storyboard/1') errors.push('storyboard schema must be "storyboard/1" (make it with the story-storyboard skill)');
  if (!Array.isArray(sb.scenes) || !sb.scenes.length) errors.push('storyboard has no scenes');
  if (sprites.schema !== 'sprites/1') errors.push('sprites.json schema must be "sprites/1" (make it with the sheet-to-sprites skill)');
  const names = new Set((sprites.sprites || []).filter((s) => !s.empty).map((s) => s.name));
  for (const c of sb.cast || []) {
    const list = c.sprites || [];
    if (!list.some((n) => names.has(n))) warnings.push(`cast "${c.id}" has no sprite in sprites.json (listed: ${list.join(', ') || 'none'}); default scenes will skip it`);
  }
  return { errors, warnings };
}

/**
 * Parse argv.
 * @param {string[]} argv
 * @returns {{dir?: string, storyboard?: string, sprites?: string, saveName?: string, update: boolean}}
 */
export function parseArgs(argv) {
  const a = { update: false, dir: undefined, storyboard: undefined, sprites: undefined, saveName: undefined };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--storyboard') a.storyboard = argv[++i];
    else if (argv[i] === '--sprites') a.sprites = argv[++i];
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
  const usage = 'Usage: node new-story.mjs <story-dir> --storyboard <storyboard.json> --sprites <sprites.json> [--save-name name] | <story-dir> --update-engine';
  if (!a.dir) { io.err(usage); return 1; }
  const exists = fs.existsSync(path.join(a.dir, 'index.html'));
  if (a.update) {
    if (!exists) { io.err(`error: ${a.dir} has no index.html to update`); return 1; }
    for (const f of ENGINE_FILES) copy(f, a.dir);
    for (const f of AUTHOR_FILES) if (!fs.existsSync(path.join(a.dir, f))) copy(f, a.dir);
    io.out(`Updated ${ENGINE_FILES.length} engine files in ${a.dir}; story.config.js, scenes.js and score.js kept.`);
    return 0;
  }
  if (!a.storyboard || !a.sprites) { io.err(usage); return 1; }
  if (exists) { io.err(`error: ${a.dir} already has a storybook page; use --update-engine to refresh the engine`); return 1; }
  let sb, sprites;
  try {
    sb = JSON.parse(fs.readFileSync(a.storyboard, 'utf8'));
    sprites = JSON.parse(fs.readFileSync(a.sprites, 'utf8'));
  } catch (e) {
    io.err(`error: ${/** @type {Error} */ (e).message}`);
    return 1;
  }
  const { errors, warnings } = checkInputs(sb, sprites);
  errors.forEach((e) => io.err(`error: ${e}`));
  warnings.forEach((w) => io.err(`warning: ${w}`));
  if (errors.length) return 1;
  for (const f of [...ENGINE_FILES, ...AUTHOR_FILES]) copy(f, a.dir);
  const saveName = a.saveName || path.basename(path.resolve(a.dir));
  const config = `// Paths are URLs relative to this page (or absolute from the server root, e.g. "/assets/...").
export default {
  storyboard: '${relUrl(a.dir, a.storyboard)}',
  sprites: '${relUrl(a.dir, a.sprites)}',
  saveName: '${saveName}',
};
`;
  fs.writeFileSync(path.join(a.dir, 'story.config.js'), config);
  io.out(`Created ${a.dir} for "${sb.title}" (${sb.scenes.length} scenes, ${(sprites.sprites || []).length} sprites).`);
  io.out('Next: serve the project root (the page, storyboard and sprites must all be under it) and open the page; scenes without code use the default animatic.');
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2), { out: (s) => console.log(s), err: (s) => console.error(s) });
}
