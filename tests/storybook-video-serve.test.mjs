import { test, describe, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(ROOT, 'plugins/fairytale-studio/skills/storybook-video/scripts/serve.mjs');
const { parseRange, resolveServed, parseArgs, start, DEFAULT_ROOT, SERVED_DIRS, SAVE_NAME, createHandler, loadInfo } = await import(SCRIPT);


/** Raw HTTP request so tests control method, path bytes, headers and chunked bodies. */
function request(port, { method = 'GET', path: p = '/', headers = {}, chunks = [] } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers }, (res) => {
      const parts = [];
      res.on('data', (c) => parts.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(parts).toString('latin1') }));
    });
    req.on('error', reject);
    // Write chunks with small gaps so the server sees separate 'data' events.
    const writeNext = (i) => (i < chunks.length ? req.write(chunks[i], () => setTimeout(() => writeNext(i + 1), 15)) : req.end());
    writeNext(0);
  });
}

describe('parseRange', () => {
  test('no or unusable header', () => {
    assert.equal(parseRange(undefined, 10), null);
    assert.equal(parseRange('items=0-1', 10), null);
    assert.equal(parseRange('bytes=-', 10), null);
  });
  test('start-end, open end, suffix, clamping', () => {
    assert.deepEqual(parseRange('bytes=2-5', 10), { start: 2, end: 5 });
    assert.deepEqual(parseRange('bytes=2-', 10), { start: 2, end: 9 });
    assert.deepEqual(parseRange('bytes=-3', 10), { start: 7, end: 9 });
    assert.deepEqual(parseRange('bytes=-30', 10), { start: 0, end: 9 });
    assert.deepEqual(parseRange('bytes=8-99', 10), { start: 8, end: 9 });
  });
  test('unsatisfiable ranges', () => {
    assert.equal(parseRange('bytes=5-2', 10), 'invalid');
    assert.equal(parseRange('bytes=10-', 10), 'invalid');
  });
});

describe('resolveServed', () => {
  const root = path.resolve('/proj');
  test('allows only listed top-level folders and maps trailing slash to index.html', () => {
    assert.deepEqual(SERVED_DIRS, ['src', 'prototypes', 'stories', 'assets', 'out']);
    assert.equal(resolveServed(root, '/prototypes/a/'), path.join(root, 'prototypes', 'a', 'index.html'));
    assert.equal(resolveServed(root, '/assets/x.png'), path.join(root, 'assets', 'x.png'));
    assert.equal(resolveServed(root, '/docs/MEMORY.md'), null);
    assert.equal(resolveServed(root, '/package.json'), null);
    assert.equal(resolveServed(root, '/../etc/passwd'), null);
    assert.equal(resolveServed(root, '/assets/../docs/x'), null);
  });
  test('custom serve list and "*" for everything under root', () => {
    assert.equal(resolveServed(root, '/stories/a.json', ['stories']), path.join(root, 'stories', 'a.json'));
    assert.equal(resolveServed(root, '/assets/x.png', ['stories']), null);
    assert.equal(resolveServed(root, '/docs/x.md', ['*']), path.join(root, 'docs', 'x.md'));
    assert.equal(resolveServed(root, '/../x', ['*']), null);
  });
});

describe('parseArgs', () => {
  test('defaults', () => {
    const { port, host, opts } = parseArgs([]);
    assert.equal(port, 8765);
    assert.equal(host, '127.0.0.1');
    assert.equal(opts.root, DEFAULT_ROOT);
    assert.equal(opts.saveDir, path.join(DEFAULT_ROOT, 'out'));
    assert.equal(opts.home, '/src/');
    assert.deepEqual(opts.serve, SERVED_DIRS);
  });
  test('overrides', () => {
    const { port, host, opts } = parseArgs(['--port', '0', '--host', 'localhost', '--root', '/r', '--save-dir', 'rec', '--home', '/x/', '--serve', 'stories,,out']);
    assert.deepEqual(opts.serve, ['stories', 'out']);
    assert.equal(port, 0);
    assert.equal(host, 'localhost');
    assert.equal(opts.root, path.resolve('/r'));
    assert.equal(opts.saveDir, path.resolve('/r', 'rec'));
    assert.equal(opts.home, '/x/');
  });
  test('DEFAULT_ROOT is the working directory', () => {
    assert.equal(DEFAULT_ROOT, process.cwd());
  });
});

describe('server', () => {
  let root, server, port, logged;
  before(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'serve-test-'));
    fs.mkdirSync(path.join(root, 'prototypes', 'demo'), { recursive: true });
    fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(root, 'prototypes', 'demo', 'index.html'), '<h1>hi</h1>');
    fs.writeFileSync(path.join(root, 'assets', 'data.bin'), '0123456789');
    fs.writeFileSync(path.join(root, 'assets', 'pic.PNG'), 'png');
    fs.writeFileSync(path.join(root, 'docs', 'secret.md'), 'secret');
    logged = [];
    server = await start(['--port', '0', '--root', root, '--save-dir', 'out/rec', '--home', '/prototypes/demo/'], (l) => logged.push(l));
    port = server.address().port;
  });
  after(() => server.close());

  test('logs its URL bound to loopback', () => {
    assert.equal(logged[0], `http://127.0.0.1:${port}/prototypes/demo/`);
    assert.equal(server.address().address, '127.0.0.1');
  });
  test('redirects / to home', async () => {
    const r = await request(port, { path: '/' });
    assert.equal(r.status, 302);
    assert.equal(r.headers.location, '/prototypes/demo/');
  });
  test('serves index.html for folders with type and no-store', async () => {
    const r = await request(port, { path: '/prototypes/demo/' });
    assert.equal(r.status, 200);
    assert.equal(r.body, '<h1>hi</h1>');
    assert.equal(r.headers['content-type'], 'text/html; charset=utf-8');
    assert.equal(r.headers['cache-control'], 'no-store');
  });
  test('type lookup is case-insensitive; unknown types are octet-stream', async () => {
    assert.equal((await request(port, { path: '/assets/pic.PNG' })).headers['content-type'], 'image/png');
    assert.equal((await request(port, { path: '/assets/data.bin' })).headers['content-type'], 'application/octet-stream');
  });
  test('range requests', async () => {
    const r = await request(port, { path: '/assets/data.bin', headers: { range: 'bytes=2-4' } });
    assert.equal(r.status, 206);
    assert.equal(r.body, '234');
    assert.equal(r.headers['content-range'], 'bytes 2-4/10');
    const bad = await request(port, { path: '/assets/data.bin', headers: { range: 'bytes=20-' } });
    assert.equal(bad.status, 416);
    assert.equal(bad.headers['content-range'], 'bytes */10');
  });
  test('forbidden, missing, directory and malformed paths', async () => {
    assert.equal((await request(port, { path: '/docs/secret.md' })).status, 403);
    assert.equal((await request(port, { path: '/%2e%2e/%2e%2e/etc/passwd' })).status, 403);
    assert.equal((await request(port, { path: '/assets/none.png' })).status, 404);
    assert.equal((await request(port, { path: '/assets' })).status, 404);
    assert.equal((await request(port, { path: '/assets/%E0%A4%A' })).status, 400);
  });
  test('other methods are rejected', async () => {
    const r = await request(port, { method: 'DELETE', path: '/assets/data.bin' });
    assert.equal(r.status, 405);
    assert.equal(r.headers.allow, 'GET, HEAD, POST');
  });
  test('POST /save stores a valid recording atomically', async () => {
    const r = await request(port, { method: 'POST', path: '/save?name=clip.webm', chunks: ['abc', 'def'] });
    assert.equal(r.status, 200);
    assert.equal(r.body, 'saved clip.webm');
    assert.equal(fs.readFileSync(path.join(root, 'out', 'rec', 'clip.webm'), 'utf8'), 'abcdef');
    assert.equal(fs.existsSync(path.join(root, 'out', 'rec', 'clip.webm.part')), false);
  });
  test('GET /__load reports load averages, CPU count and a busy flag', async () => {
    const r = await request(port, { path: '/__load' });
    assert.equal(r.status, 200);
    assert.equal(r.headers['content-type'], 'application/json');
    const j = JSON.parse(r.body);
    assert.equal(j.load.length, 3);
    assert.ok(j.cpus >= 1);
    assert.equal(typeof j.busy, 'boolean');
  });
  test('loadInfo: busy above 60 % of the CPUs; a machine reporting no CPUs counts as one', () => {
    const avg = mock.method(os, 'loadavg', () => [3.333, 1, 1]);
    const cpus = mock.method(os, 'cpus', () => [{}, {}, {}, {}]);
    assert.deepEqual(loadInfo(), { load: [3.33, 1, 1], cpus: 4, busy: true });
    cpus.mock.mockImplementation(() => []);
    assert.deepEqual(loadInfo(), { load: [3.33, 1, 1], cpus: 1, busy: true });
    avg.mock.mockImplementation(() => [0.2, 0.2, 0.2]);
    assert.equal(loadInfo().busy, false);
    avg.mock.restore(); cpus.mock.restore();
  });
  test('POST /save accepts review stills (png, jpg)', async () => {
    const r = await request(port, { method: 'POST', path: '/save?name=review-13.0s.png', chunks: ['png'] });
    assert.equal(r.status, 200);
    assert.equal(fs.readFileSync(path.join(root, 'out', 'rec', 'review-13.0s.png'), 'utf8'), 'png');
    assert.ok(SAVE_NAME.test('a.JPG'));
    assert.equal(SAVE_NAME.test('a.gif'), false);
  });
  test('POST /save rejects missing or unsafe names', async () => {
    for (const q of ['', '?name=', '?name=index.html', '?name=..%2Fx.mp4', '?name=.hidden.mp4']) {
      const r = await request(port, { method: 'POST', path: '/save' + q, chunks: ['x'] });
      assert.equal(r.status, 400, q);
    }
    assert.ok(SAVE_NAME.test('troy-horse.MP4'));
  });
  test('POST /save reports write errors and cleans up', async () => {
    fs.mkdirSync(path.join(root, 'out', 'rec', 'busy.mp4.part'), { recursive: true });
    const r = await request(port, { method: 'POST', path: '/save?name=busy.mp4', chunks: ['x'] });
    assert.equal(r.status, 500);
    assert.equal(fs.existsSync(path.join(root, 'out', 'rec', 'busy.mp4')), false);
  });
});

describe('size limit', () => {
  test('POST /save over the cap returns 413 once and leaves no file', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'serve-cap-'));
    const server = http.createServer(createHandler({ root, saveDir: path.join(root, 'rec'), home: '/', maxSaveBytes: 4 }));
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address();
    const r = await request(port, { method: 'POST', path: '/save?name=big.mp4', chunks: ['12345', '67890', 'abcde'] });
    assert.equal(r.status, 413);
    assert.equal(fs.existsSync(path.join(root, 'rec', 'big.mp4')), false);
    assert.equal(fs.existsSync(path.join(root, 'rec', 'big.mp4.part')), false);
    server.close();
  });
});

describe('script entry', () => {
  test('starts when run directly and prints its URL', async () => {
    const child = spawn(process.execPath, [SCRIPT, '--port', '0', '--home', '/h/'], { stdio: ['ignore', 'pipe', 'inherit'] });
    const line = await new Promise((resolve) => child.stdout.once('data', (d) => resolve(String(d).trim())));
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill('SIGTERM');
    assert.equal(await exited, 0);
    assert.match(line, /^http:\/\/127\.0\.0\.1:\d+\/h\/$/);
  });
});
