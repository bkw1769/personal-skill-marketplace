#!/usr/bin/env node
// Find the image one `codex exec` run produced, from that run's own log.
//   node codex-image.mjs <codex-log.txt> [--images-root ~/.codex/generated_images]
// Prints the PNG path and exits 0, or explains and exits 1. Never falls back to "the newest PNG":
// every Codex session writes into the same generated_images folder, so a parallel session's image
// would be taken (golden-axe 2026-10-14: another project's channel banner became plate-pond-day).
// Order: the last generated_images/*.png path the log names (Codex reports its final image last),
// else the newest PNG in the folder of the log's own "session id".
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Pick the run's image from its log text.
 * @param {string} log full text of the codex exec output
 * @param {string} root the generated_images folder
 * @param {{exists?: (p: string) => boolean, list?: (dir: string) => {file: string, mtime: number}[]}} [fsx] file system hooks
 * @returns {{path: string, how: 'reported' | 'session'} | {error: string}}
 */
export function imageFromLog(log, root, fsx = {}) {
  const exists = fsx.exists ?? ((p) => fs.existsSync(p));
  const list = fsx.list ?? ((dir) => fs.readdirSync(dir).map((f) => ({ file: path.join(dir, f), mtime: fs.statSync(path.join(dir, f)).mtimeMs })));
  const esc = root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const reported = [...log.matchAll(new RegExp(`${esc}/[^\\s)\\]"'<>]+?\\.png`, 'g'))].map((m) => m[0]);
  const last = reported.reverse().find((p) => exists(p));
  if (last) return { path: last, how: 'reported' };
  const sess = /session id: ([0-9a-f-]+)/.exec(log)?.[1];
  if (!sess) return { error: 'the log names no image and no session id (did codex exec start?)' };
  const dir = path.join(root, sess);
  if (!exists(dir)) return { error: `the session folder ${dir} does not exist (no image was generated)` };
  const pngs = list(dir).filter((f) => f.file.endsWith('.png')).sort((a, b) => b.mtime - a.mtime);
  if (!pngs.length) return { error: `the session folder ${dir} has no PNG` };
  return { path: pngs[0].file, how: 'session' };
}

/**
 * Run the CLI.
 * @param {string[]} argv
 * @param {{out: (s: string) => void, err: (s: string) => void}} io
 * @returns {number} exit code
 */
export function main(argv, io) {
  let root = path.join(os.homedir(), '.codex', 'generated_images');
  /** @type {string | undefined} */
  let logFile;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--images-root') root = argv[++i];
    else logFile = argv[i];
  }
  if (!logFile) {
    io.err('Usage: node codex-image.mjs <codex-log.txt> [--images-root ~/.codex/generated_images]');
    return 1;
  }
  try {
    const res = imageFromLog(fs.readFileSync(logFile, 'utf8'), path.resolve(root));
    if ('error' in res) { io.err(`error: ${res.error}`); return 1; }
    io.out(res.path);
    return 0;
  } catch (e) {
    io.err(`error: ${/** @type {Error} */ (e).message}`);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2), { out: (s) => console.log(s), err: (s) => console.error(s) });
}
