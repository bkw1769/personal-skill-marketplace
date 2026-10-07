#!/usr/bin/env node
// Local static server for browser prototypes and storybook videos. Serves only allow-listed
// top-level folders of the project, supports HTTP Range (needed for <video> seeking), and
// accepts recorded videos on POST /save into one output folder. Loopback only.
//   node serve.mjs [--port 8765] [--host 127.0.0.1] [--root <dir>] [--serve prototypes,stories,assets,out]
//                  [--save-dir out] [--home /stories/]
// --serve lists the top-level folders under root that may be read; "*" serves everything under root.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Project root when --root is not given: the current working directory (npm scripts run at the root). */
export const DEFAULT_ROOT = process.cwd();
export const SERVED_DIRS = ['prototypes', 'stories', 'assets', 'out'];
export const SAVE_NAME = /^[a-z0-9][a-z0-9._-]*\.(mp4|webm)$/i;
export const MAX_SAVE_BYTES = 1024 * 1024 * 1024;
export const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

/**
 * @typedef {Object} ServerOptions
 * @property {string} root      Project root; only `serve` folders below it are readable.
 * @property {string[]} [serve] Top-level folders that may be read (default SERVED_DIRS; ['*'] = all).
 * @property {string} saveDir   Absolute folder that POST /save writes into.
 * @property {string} home      Path that "/" redirects to.
 * @property {number} [maxSaveBytes]
 */

/**
 * Parse a single-range "bytes=a-b" header against a file size.
 * @param {string | undefined} header
 * @param {number} size
 * @returns {{start: number, end: number} | 'invalid' | null} null when there is no usable Range header.
 */
export function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header || '');
  if (!m || (m[1] === '' && m[2] === '')) return null;
  const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
  const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  return start > end || start >= size ? 'invalid' : { start, end };
}

/**
 * Map a URL path to a file under an allow-listed folder, or null when it is not servable.
 * @param {string} root
 * @param {string} urlPath Decoded URL path starting with "/".
 * @param {string[]} [serve] Allowed top-level folders; ['*'] allows everything under root.
 * @returns {string | null}
 */
export function resolveServed(root, urlPath, serve = SERVED_DIRS) {
  const p = urlPath.endsWith('/') ? urlPath + 'index.html' : urlPath;
  const file = path.resolve(root, '.' + p);
  const rel = path.relative(root, file);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return serve.includes('*') || serve.includes(rel.split(path.sep)[0]) ? file : null;
}

/**
 * Handle POST /save: stream the body to saveDir/<name>, enforcing the name pattern and size cap.
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {string | null} name
 * @param {ServerOptions} opts
 * @returns {void}
 */
export function handleSave(req, res, name, opts) {
  if (!name || !SAVE_NAME.test(name)) {
    res.writeHead(400).end('name must match ' + SAVE_NAME);
    req.resume();
    return;
  }
  const limit = opts.maxSaveBytes ?? MAX_SAVE_BYTES;
  const dest = path.join(opts.saveDir, name);
  const tmp = dest + '.part';
  let received = 0;
  let failed = false;
  const fail = (/** @type {number} */ code, /** @type {string} */ msg) => {
    if (failed) return;
    failed = true;
    req.unpipe();
    req.resume();
    ws.destroy();
    fs.rm(tmp, { force: true }, () => res.writeHead(code).end(msg));
  };
  fs.mkdirSync(opts.saveDir, { recursive: true });
  const ws = fs.createWriteStream(tmp);
  req.on('data', (chunk) => {
    received += chunk.length;
    if (received > limit) fail(413, 'too large');
  });
  ws.on('error', () => fail(500, 'write error'));
  ws.on('finish', () => {
    fs.renameSync(tmp, dest);
    res.writeHead(200).end('saved ' + name);
  });
  req.pipe(ws);
}

/**
 * Serve one file, honouring Range.
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {string} file
 * @param {number} size
 * @returns {void}
 */
export function sendFile(req, res, file, size) {
  const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const base = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
  const range = parseRange(req.headers.range, size);
  if (range === 'invalid') {
    res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end();
    return;
  }
  if (range) {
    res.writeHead(206, { ...base, 'Content-Range': `bytes ${range.start}-${range.end}/${size}`, 'Content-Length': range.end - range.start + 1 });
    fs.createReadStream(file, { start: range.start, end: range.end }).pipe(res);
    return;
  }
  res.writeHead(200, { ...base, 'Content-Length': size });
  fs.createReadStream(file).pipe(res);
}

/**
 * Build the request handler.
 * @param {ServerOptions} opts
 * @returns {http.RequestListener}
 */
export function createHandler(opts) {
  return (req, res) => {
    const url = new URL(/** @type {string} */ (req.url), 'http://localhost');
    if (req.method === 'POST' && url.pathname === '/save') {
      handleSave(req, res, url.searchParams.get('name'), opts);
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD, POST' }).end();
      return;
    }
    if (url.pathname === '/') {
      res.writeHead(302, { Location: opts.home }).end();
      return;
    }
    let decoded;
    try {
      decoded = decodeURIComponent(url.pathname);
    } catch {
      res.writeHead(400).end('bad path');
      return;
    }
    const file = resolveServed(opts.root, decoded, opts.serve);
    if (!file) {
      res.writeHead(403).end('forbidden');
      return;
    }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) res.writeHead(404).end('not found');
      else sendFile(req, res, file, st.size);
    });
  };
}

/**
 * Parse CLI flags into server options.
 * @param {string[]} argv
 * @returns {{port: number, host: string, opts: ServerOptions}}
 */
export function parseArgs(argv) {
  /** @type {Record<string, string>} */
  const a = {};
  for (let i = 0; i < argv.length; i += 2) a[argv[i].replace(/^--/, '')] = argv[i + 1];
  const root = path.resolve(a.root || DEFAULT_ROOT);
  return {
    port: Number(a.port ?? 8765),
    host: a.host || '127.0.0.1',
    opts: {
      root,
      serve: a.serve ? a.serve.split(',').filter(Boolean) : SERVED_DIRS,
      saveDir: path.resolve(root, a['save-dir'] || 'out'),
      home: a.home || '/stories/',
    },
  };
}

/**
 * Start listening. Resolves with the server once it is bound.
 * @param {string[]} argv
 * @param {(line: string) => void} log
 * @returns {Promise<http.Server>}
 */
export function start(argv, log) {
  const { port, host, opts } = parseArgs(argv);
  const server = http.createServer(createHandler(opts));
  return new Promise((resolve) => {
    server.listen(port, host, () => {
      const addr = /** @type {import('node:net').AddressInfo} */ (server.address());
      log(`http://${host}:${addr.port}${opts.home}`);
      resolve(server);
    });
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Register the shutdown handler before listening so an early SIGTERM still closes cleanly.
  const ready = start(process.argv.slice(2), (line) => console.log(line));
  process.once('SIGTERM', () => ready.then((server) => server.close()));
}
