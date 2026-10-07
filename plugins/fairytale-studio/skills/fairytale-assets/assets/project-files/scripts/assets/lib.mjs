// Asset catalog library: reads per-folder manifest.json files under assets/,
// validates labels against catalog/taxonomy.json and catalog/sources.json,
// and builds the flat index that people and agents query.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const MANIFEST_NAME = 'manifest.json';
export const MANIFEST_SCHEMA = 'fairytale-asset-manifest/1';
const SKIP_DIRS = new Set(['_vendor', 'catalog', 'licenses', 'node_modules']);
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ID = /^([a-z0-9-]+)\.([a-z0-9-]+)\.([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const LICENSE_FIELDS = ['license', 'commercial_ok', 'attribution_required', 'redistribute_ok'];

/**
 * @typedef {Object} Item
 * @property {string} id
 * @property {string} kind
 * @property {string} category
 * @property {string} title
 * @property {string[]} tags
 * @property {string} status
 * @property {string} scope
 * @property {string} source
 * @property {string} [file]
 * @property {string} [impl]
 * @property {string} [sha256]
 * @property {number} [bytes]
 * @property {number} [duration_s]
 * @property {string} [license]
 * @property {string} [attribution]
 * @property {string} [origin_url]
 * @property {string} manifest  Manifest path relative to the project root.
 * @property {string} dir       Folder of the manifest relative to the assets root.
 */

/**
 * Read and parse a JSON file.
 * @param {string} file
 * @returns {any}
 */
export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * Write a value as pretty JSON with a trailing newline.
 * @param {string} file
 * @param {any} value
 * @returns {void}
 */
export function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

/**
 * Find every manifest.json below the assets root, skipping vendor, catalog and license folders.
 * @param {string} assetsRoot
 * @returns {string[]} Absolute paths, sorted.
 */
export function findManifests(assetsRoot) {
  /** @type {string[]} */
  const found = [];
  /** @param {string} dir */
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name));
      } else if (entry.name === MANIFEST_NAME) {
        found.push(path.join(dir, entry.name));
      }
    }
  };
  walk(assetsRoot);
  return found.sort();
}

/**
 * Merge manifest defaults into each item and attach location fields.
 * @param {{defaults?: Object, items?: Object[]}} manifest
 * @param {string} manifestPath Absolute path of the manifest.
 * @param {string} assetsRoot
 * @param {string} projectRoot
 * @returns {Item[]}
 */
export function expandManifest(manifest, manifestPath, assetsRoot, projectRoot) {
  const defaults = manifest.defaults || {};
  const dir = toPosix(path.relative(assetsRoot, path.dirname(manifestPath)));
  const rel = toPosix(path.relative(projectRoot, manifestPath));
  return (manifest.items || []).map((raw) => {
    const item = { ...defaults, ...raw, manifest: rel, dir };
    item.tags = [...new Set([...(defaults.tags || []), ...(raw.tags || [])])];
    return /** @type {Item} */ (item);
  });
}

/**
 * Convert a platform path to forward slashes.
 * @param {string} p
 * @returns {string}
 */
export function toPosix(p) {
  return p.split(path.sep).join('/');
}

/**
 * SHA-256 of a file as hex.
 * @param {string} file
 * @returns {string}
 */
export function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/**
 * Duration of a PCM WAV buffer in seconds, or null when the buffer is not a readable WAV.
 * @param {Buffer} buf
 * @returns {number | null}
 */
export function wavDurationSeconds(buf) {
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null;
  let byteRate = 0;
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === 'fmt ' && off + 20 <= buf.length) byteRate = buf.readUInt32LE(off + 16);
    if (id === 'data') return byteRate > 0 ? Math.round((size / byteRate) * 1000) / 1000 : null;
    off += 8 + size + (size % 2);
  }
  return null;
}

/**
 * Validate one item. Returns human-readable error strings (empty when valid).
 * @param {Item} item
 * @param {{taxonomy: any, sources: Map<string, any>, assetsRoot: string, projectRoot: string, checkHash?: boolean}} ctx
 * @returns {string[]}
 */
export function validateItem(item, ctx) {
  const where = `${item.manifest}: ${item.id || '(no id)'}`;
  const errors = [];
  const err = (/** @type {string} */ m) => errors.push(`${where}: ${m}`);
  const { taxonomy } = ctx;

  const m = ID.exec(item.id || '');
  if (!m) err('id must look like <kind>.<category>.<slug>');
  else if (m[1] !== item.kind || m[2] !== item.category) err(`id prefix must be ${item.kind}.${item.category}`);
  if (!item.title) err('title is required');

  const kind = taxonomy.kinds[item.kind];
  if (!kind) err(`unknown kind "${item.kind}"`);
  else {
    if (!kind.categories.includes(item.category)) err(`unknown category "${item.category}" for kind ${item.kind}`);
    if (item.dir !== kind.folder && !item.dir.startsWith(kind.folder + '/')) err(`kind ${item.kind} belongs under assets/${kind.folder}/`);
  }
  if (!(item.status in taxonomy.statuses)) err(`unknown status "${item.status}"`);
  if (!(item.scope in taxonomy.scopes)) err(`unknown scope "${item.scope}"`);
  if (item.scope === 'story' && !item.tags.some((t) => t.startsWith('story:'))) err('scope story needs a story:<slug> tag');

  for (const tag of item.tags) {
    const [facet, value, extra] = tag.split(':');
    const allowed = taxonomy.facets[facet];
    if (extra !== undefined || value === undefined) err(`tag "${tag}" must be facet:value`);
    else if (allowed === undefined) err(`unknown tag facet "${facet}"`);
    else if (Array.isArray(allowed) ? !allowed.includes(value) : !SLUG.test(value)) err(`tag value "${tag}" is not allowed`);
  }

  const source = ctx.sources.get(item.source);
  if (!source) err(`unknown source "${item.source}"`);
  else if (item.status === 'approved' && source.policy === 'blocked') err(`source ${item.source} is blocked; cannot approve`);
  if (/\bNC\b/.test(item.license || '') && item.status === 'approved') err('non-commercial (NC) license cannot be approved');

  if (Boolean(item.file) === Boolean(item.impl)) err('exactly one of file or impl is required');
  if (item.file) {
    const abs = path.join(ctx.assetsRoot, item.dir, item.file);
    if (!fs.existsSync(abs)) err(`file not found: ${item.file}`);
    else if (ctx.checkHash && item.sha256 && hashFile(abs) !== item.sha256) err('sha256 mismatch (file changed; run fill after review)');
  }
  if (item.impl) {
    const [file, symbol] = item.impl.split('#');
    const abs = path.join(ctx.projectRoot, file);
    if (!symbol) err('impl must look like <path>#<symbol>');
    else if (!fs.existsSync(abs)) err(`impl file not found: ${file}`);
    else if (!fs.readFileSync(abs, 'utf8').includes(symbol.split('.').pop())) err(`impl symbol not found: ${symbol}`);
  }
  return errors;
}

/**
 * Load every item and validate the whole catalog.
 * @param {{projectRoot: string, checkHash?: boolean}} opts
 * @returns {{items: Item[], errors: string[], sources: Map<string, any>}}
 */
export function loadCatalog({ projectRoot, checkHash = true }) {
  const assetsRoot = path.join(projectRoot, 'assets');
  const taxonomy = readJson(path.join(assetsRoot, 'catalog', 'taxonomy.json'));
  const sources = new Map(readJson(path.join(assetsRoot, 'catalog', 'sources.json')).sources.map((s) => [s.id, s]));
  /** @type {Item[]} */
  const items = [];
  const errors = [];
  for (const mf of findManifests(assetsRoot)) {
    const manifest = readJson(mf);
    if (manifest.schema !== MANIFEST_SCHEMA) errors.push(`${toPosix(path.relative(projectRoot, mf))}: schema must be ${MANIFEST_SCHEMA}`);
    items.push(...expandManifest(manifest, mf, assetsRoot, projectRoot));
  }
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item.id)) errors.push(`${item.manifest}: duplicate id ${item.id}`);
    seen.add(item.id);
    errors.push(...validateItem(item, { taxonomy, sources, assetsRoot, projectRoot, checkHash }));
  }
  return { items, errors, sources };
}

/**
 * Flatten items into index entries with license fields merged from the source (item values win).
 * @param {Item[]} items
 * @param {Map<string, any>} sources
 * @returns {Object[]}
 */
export function buildIndex(items, sources) {
  return items
    .map((item) => {
      const src = sources.get(item.source);
      const entry = { ...item, source_name: src.name, source_policy: src.policy };
      for (const f of LICENSE_FIELDS) if (entry[f] === undefined) entry[f] = src[f];
      if (item.file) entry.path = `assets/${item.dir}/${item.file}`;
      delete entry.dir;
      return entry;
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Filter index entries. Every given criterion must match; tags must all be present.
 * @param {Object[]} index
 * @param {{kind?: string, category?: string, status?: string, scope?: string, tags?: string[], text?: string}} q
 * @returns {Object[]}
 */
export function findItems(index, q) {
  const text = (q.text || '').toLowerCase();
  return index.filter(
    (e) =>
      (!q.kind || e.kind === q.kind) &&
      (!q.category || e.category === q.category) &&
      (!q.status || e.status === q.status) &&
      (!q.scope || e.scope === q.scope) &&
      (q.tags || []).every((t) => e.tags.includes(t)) &&
      (!text || `${e.id} ${e.title} ${e.notes || ''}`.toLowerCase().includes(text)),
  );
}

/**
 * Human-readable index: counts per kind and status, then one table per kind.
 * @param {Object[]} index
 * @returns {string}
 */
export function renderIndexMd(index) {
  const lines = ['# Asset index', '', 'Generated by `node scripts/assets/cli.mjs build`. Do not edit by hand; edit the manifest.json next to the files.', ''];
  const kinds = [...new Set(index.map((e) => e.kind))].sort();
  lines.push('| Kind | Total | approved | candidate | reference-only | rejected |', '|---|---:|---:|---:|---:|---:|');
  for (const k of kinds) {
    const of = index.filter((e) => e.kind === k);
    const n = (/** @type {string} */ s) => of.filter((e) => e.status === s).length;
    lines.push(`| ${k} | ${of.length} | ${n('approved')} | ${n('candidate')} | ${n('reference-only')} | ${n('rejected')} |`);
  }
  for (const k of kinds) {
    lines.push('', `## ${k}`, '', '| ID | Title | Tags | Status | License | Where |', '|---|---|---|---|---|---|');
    for (const e of index.filter((x) => x.kind === k)) {
      lines.push(`| \`${e.id}\` | ${e.title} | ${e.tags.join(' ')} | ${e.status} | ${e.license} | \`${e.path || e.impl}\` |`);
    }
  }
  return lines.join('\n') + '\n';
}

/**
 * Credits list for every non-rejected item whose license needs attribution.
 * @param {Object[]} index
 * @returns {string}
 */
export function renderCredits(index) {
  const due = index.filter((e) => e.attribution_required && e.status !== 'rejected');
  const lines = ['# Credits', '', 'Generated. Copy the lines for the assets a published work actually uses into its end card or description.', ''];
  if (due.length === 0) lines.push('No registered asset currently requires attribution.');
  for (const e of due) lines.push(`- \`${e.id}\`: ${e.attribution || `${e.title}, ${e.source_name} (${e.license})`}`);
  return lines.join('\n') + '\n';
}

/**
 * Fill sha256, bytes and (for WAV) duration_s on file items that lack them.
 * @param {{items?: Object[]}} manifest
 * @param {string} dir Absolute folder of the manifest.
 * @returns {number} Number of items changed.
 */
export function fillManifest(manifest, dir) {
  let changed = 0;
  for (const item of manifest.items || []) {
    const abs = item.file ? path.join(dir, item.file) : '';
    if (!abs || !fs.existsSync(abs)) continue;
    const before = JSON.stringify(item);
    const buf = fs.readFileSync(abs);
    item.sha256 = crypto.createHash('sha256').update(buf).digest('hex');
    item.bytes = buf.length;
    const dur = /\.wav$/i.test(item.file) ? wavDurationSeconds(buf) : null;
    if (dur !== null) item.duration_s = dur;
    if (JSON.stringify(item) !== before) changed++;
  }
  return changed;
}
