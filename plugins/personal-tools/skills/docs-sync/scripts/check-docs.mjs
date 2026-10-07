#!/usr/bin/env node
// Check that a project's documentation matches the files on disk:
//   - every path drawn or named in docs/STRUCTURE.md exists,
//   - every top-level folder/file (and second-level folder) is mentioned in STRUCTURE.md,
//   - relative Markdown links resolve, absolute paths named in docs still exist,
//   - the documents the personal AGENTS rules require are present,
//   - folders that look like sub-repos have a README.md.
//   node check-docs.mjs [project-root] [--structure docs/STRUCTURE.md] [--ignore name,name] [--json]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEFAULT_IGNORE = ['.git', 'node_modules', '.DS_Store', 'Thumbs.db', 'coverage', '__pycache__', '.venv', '.pytest_cache'];
export const REQUIRED_DOCS = ['README.md', 'AGENTS.md', 'docs/DECISIONS.md', 'docs/MEMORY.md', 'docs/STRUCTURE.md'];
const SUBREPO_MARKERS = ['package.json', 'pyproject.toml', 'go.mod', 'Cargo.toml', 'pom.xml', 'build.gradle'];

/**
 * Expand one level of brace alternatives: "js/{a,b}.js" -> ["js/a.js", "js/b.js"].
 * @param {string} s
 * @returns {string[]}
 */
export function expandBraces(s) {
  const m = /\{([^{}]*)\}/.exec(s);
  if (!m) return [s];
  return m[1].split(',').flatMap((alt) => expandBraces(s.slice(0, m.index) + alt.trim() + s.slice(m.index + m[0].length)));
}

/**
 * Paths named in a STRUCTURE.md: tree lines inside code fences, plus backticked paths in the first
 * column of tables (a bare file name after a path in the same cell is read relative to that path).
 * Directories end with "/". Placeholders (<...>, *, ...) are skipped.
 * @param {string} md
 * @returns {string[]}
 */
export function parseStructure(md) {
  const out = new Set();
  const usable = (/** @type {string} */ p) => p && !/[<>*]|\.\.\.|^\.{1,2}\/?$/.test(p) && !/\s/.test(p);
  let inFence = false;
  /** @type {string[]} */
  const stack = [];
  for (const line of md.split('\n')) {
    if (/^\s*```/.test(line)) { inFence = !inFence; stack.length = 0; continue; }
    if (inFence) {
      const m = /^([│ ]*)(├──|└──)\s+(.*)$/.exec(line);
      if (!m) continue;
      const depth = Math.round(m[1].length / 4);
      stack.length = depth;
      const body = m[3].replace(/\s+#.*$/, '').trim();
      const names = body.split(/,\s+(?![^{]*\})/).flatMap(expandBraces).map((n) => n.trim()).filter(usable);
      for (const n of names) out.add([...stack, n].join(''));
      const dirs = names.filter((n) => n.endsWith('/'));
      if (dirs.length === 1 && names.length === 1) stack.push(dirs[0]);
      else stack.push('\u0000');
      continue;
    }
    const cell = /^\|([^|]*)\|/.exec(line);
    if (!cell) continue;
    let base = '';
    for (const tick of cell[1].matchAll(/`([^`\s]+)`/g)) {
      let p = tick[1].replace(/^\.\//, '');
      if (!/^[\w.-]+(\/[\w.@-]*)*$/.test(p) || !usable(p)) continue;
      if (base && !p.includes('/')) p = base + p;            // `assets/catalog/index.json`, `INDEX.md`
      else base = p.includes('/') ? p.slice(0, p.lastIndexOf('/', p.length - 2) + 1) : '';
      out.add(p);
    }
  }
  return [...out].filter((p) => !p.includes('\u0000')).sort();
}

/**
 * Top-level files/folders and second-level folders of the project.
 * @param {string} root
 * @param {string[]} ignore
 * @returns {string[]}
 */
export function listTop(root, ignore) {
  const out = [];
  const skip = (/** @type {string} */ n) => ignore.includes(n);
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    if (skip(e.name)) continue;
    if (!e.isDirectory()) { out.push(e.name); continue; }
    out.push(`${e.name}/`);
    for (const k of fs.readdirSync(path.join(root, e.name), { withFileTypes: true })) if (k.isDirectory() && !skip(k.name)) out.push(`${e.name}/${k.name}/`);
  }
  return out.sort();
}

/**
 * Markdown files under root (ignored folders skipped).
 * @param {string} root
 * @param {string[]} ignore
 * @returns {string[]} paths relative to root
 */
export function listMarkdown(root, ignore) {
  const out = [];
  const walk = (/** @type {string} */ rel) => {
    for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
      if (ignore.includes(e.name)) continue;
      const p = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.md')) out.push(p);
    }
  };
  walk('');
  return out.sort();
}

/**
 * Link targets in Markdown that point at local files (anchors, URLs and mail links excluded).
 * @param {string} md
 * @returns {string[]}
 */
export function localLinks(md) {
  const out = [];
  const text = md.replace(/```[\s\S]*?```/g, '');
  for (const m of text.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const t = m[1];
    if (/^(https?:|mailto:|#)/.test(t)) continue;
    out.push(decodeURI(t.replace(/#.*$/, '').replace(/:\d+(-\d+)?$/, '')));
  }
  return out;
}

/**
 * Run every check.
 * @param {string} root
 * @param {{structure?: string, ignore?: string[]}} [opt]
 * @returns {{errors: string[], warnings: string[]}}
 */
export function checkDocs(root, opt = {}) {
  const ignore = [...DEFAULT_IGNORE, ...(opt.ignore || [])];
  const errors = [];
  const warnings = [];
  const exists = (/** @type {string} */ rel) => fs.existsSync(path.join(root, rel));

  for (const d of REQUIRED_DOCS) if (!exists(d)) (d === 'README.md' ? errors : warnings).push(`missing ${d}`);

  const structFile = opt.structure || 'docs/STRUCTURE.md';
  if (exists(structFile)) {
    const named = parseStructure(fs.readFileSync(path.join(root, structFile), 'utf8'));
    for (const p of named) if (!exists(p)) errors.push(`${structFile}: names "${p}" but it does not exist`);
    const covered = (/** @type {string} */ p) => named.some((n) => n === p || n === p.replace(/\/$/, '') || n.startsWith(p.endsWith('/') ? p : `${p}/`));
    for (const p of listTop(root, ignore)) if (!covered(p)) warnings.push(`${structFile}: "${p}" exists but is not described`);
  } else errors.push(`missing ${structFile}; cannot compare the tree`);

  for (const md of listMarkdown(root, ignore)) {
    const text = fs.readFileSync(path.join(root, md), 'utf8');
    for (const target of localLinks(text)) {
      const abs = path.isAbsolute(target) ? target : path.resolve(root, path.dirname(md), target);
      if (fs.existsSync(abs)) continue;
      if (path.isAbsolute(target)) warnings.push(`${md}: link to absolute path "${target}" does not exist on this machine`);
      else errors.push(`${md}: broken link "${target}"`);
    }
    const seen = new Set();
    for (const m of text.matchAll(/`(\/(?:Users|Volumes|home|opt|var|tmp)\/[^`<>*]+)`/g)) {
      if (seen.has(m[1]) || m[1].includes('...')) continue;   // already reported, or a placeholder
      seen.add(m[1]);
      if (!fs.existsSync(m[1])) warnings.push(`${md}: absolute path "${m[1]}" does not exist on this machine`);
    }
  }

  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    if (!e.isDirectory() || ignore.includes(e.name)) continue;
    const marker = SUBREPO_MARKERS.find((f) => fs.existsSync(path.join(root, e.name, f)));
    if (marker && !fs.existsSync(path.join(root, e.name, 'README.md'))) warnings.push(`${e.name}/ has ${marker} but no README.md (sub-repos need one)`);
  }
  return { errors, warnings };
}

/**
 * CLI.
 * @param {string[]} argv
 * @param {{out: (s: string) => void, err: (s: string) => void}} io
 * @returns {number}
 */
export function main(argv, io) {
  let root = '.', structure, json = false;
  /** @type {string[]} */
  let ignore = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--structure') structure = argv[++i];
    else if (argv[i] === '--ignore') ignore = argv[++i].split(',').filter(Boolean);
    else if (argv[i] === '--json') json = true;
    else root = argv[i];
  }
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    io.err(`error: ${root} is not a directory`);
    return 1;
  }
  const res = checkDocs(path.resolve(root), { structure, ignore });
  if (json) io.out(JSON.stringify(res, null, 2));
  else {
    res.errors.forEach((e) => io.out(`ERROR   ${e}`));
    res.warnings.forEach((w) => io.out(`WARNING ${w}`));
    io.out(`${res.errors.length} error(s), ${res.warnings.length} warning(s).`);
  }
  return res.errors.length ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2), { out: (s) => console.log(s), err: (s) => console.error(s) });
}
