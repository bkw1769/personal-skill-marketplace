#!/usr/bin/env node
// Asset catalog command line. Run from anywhere:
//   node scripts/assets/cli.mjs <validate|build|fill|find|help> [options]
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import { loadCatalog, buildIndex, renderIndexMd, renderCredits, findManifests, readJson, writeJson, fillManifest, findItems, toPosix } from './lib.mjs';

/** Project root when --root is not given: the current working directory (npm scripts run at the root). */
export const DEFAULT_ROOT = process.cwd();

const HELP = `Usage: node scripts/assets/cli.mjs <command> [options]

Commands:
  validate            Check every manifest against taxonomy.json and sources.json.
  build               validate, then write assets/catalog/index.json, assets/catalog/INDEX.md, assets/licenses/CREDITS.md.
  fill                Compute sha256, bytes and WAV duration for file items (run after adding or replacing files).
  find [filters]      Search the built index.
     --kind <k> --category <c> --status <s> --scope <s> --tag <facet:value> (repeatable) --text <words> --json
  help                Show this message.

Options:
  --root <dir>        Project root (default: the repository containing this script).`;

/**
 * Parse argv into a command and options. Repeated --tag values accumulate.
 * @param {string[]} argv
 * @returns {{cmd: string, opts: Record<string, any>}}
 */
export function parseArgs(argv) {
  const [cmd = 'help', ...rest] = argv;
  /** @type {Record<string, any>} */
  const opts = { tags: [] };
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i].replace(/^--/, '');
    if (key === 'json') opts.json = true;
    else if (key === 'tag') opts.tags.push(rest[++i]);
    else opts[key] = rest[++i];
  }
  return { cmd, opts };
}

/**
 * Run one command.
 * @param {string[]} argv
 * @param {{out: (s: string) => void, err: (s: string) => void}} io
 * @returns {number} Process exit code.
 */
export function main(argv, io) {
  const { cmd, opts } = parseArgs(argv);
  const projectRoot = path.resolve(opts.root || DEFAULT_ROOT);
  const catalogDir = path.join(projectRoot, 'assets', 'catalog');

  if (cmd === 'validate' || cmd === 'build') {
    const { items, errors, sources } = loadCatalog({ projectRoot });
    if (errors.length) {
      errors.forEach((e) => io.err(e));
      io.err(`${errors.length} error(s) in ${items.length} item(s).`);
      return 1;
    }
    if (cmd === 'validate') {
      io.out(`OK: ${items.length} item(s) valid.`);
      return 0;
    }
    const index = buildIndex(items, sources);
    writeJson(path.join(catalogDir, 'index.json'), { schema: 'fairytale-asset-index/1', count: index.length, items: index });
    fs.writeFileSync(path.join(catalogDir, 'INDEX.md'), renderIndexMd(index));
    fs.mkdirSync(path.join(projectRoot, 'assets', 'licenses'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'assets', 'licenses', 'CREDITS.md'), renderCredits(index));
    io.out(`Built index of ${index.length} item(s).`);
    return 0;
  }

  if (cmd === 'fill') {
    let total = 0;
    for (const mf of findManifests(path.join(projectRoot, 'assets'))) {
      const manifest = readJson(mf);
      const changed = fillManifest(manifest, path.dirname(mf));
      if (changed) {
        writeJson(mf, manifest);
        io.out(`${toPosix(path.relative(projectRoot, mf))}: ${changed} item(s) updated`);
      }
      total += changed;
    }
    io.out(`Filled ${total} item(s).`);
    return 0;
  }

  if (cmd === 'find') {
    const file = path.join(catalogDir, 'index.json');
    if (!fs.existsSync(file)) {
      io.err('No index yet. Run: node scripts/assets/cli.mjs build');
      return 1;
    }
    const hits = findItems(readJson(file).items, opts);
    if (opts.json) io.out(JSON.stringify(hits, null, 2));
    else hits.forEach((e) => io.out(`${e.id}\t${e.status}\t${e.path || e.impl}\t${e.title}`));
    io.err(`${hits.length} match(es).`);
    return 0;
  }

  io.out(HELP);
  return cmd === 'help' ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2), { out: (s) => console.log(s), err: (s) => console.error(s) });
}
