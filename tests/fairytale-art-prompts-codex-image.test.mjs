import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(ROOT, 'plugins/fairytale-studio/skills/fairytale-art-prompts/scripts/codex-image.mjs');
const { imageFromLog, main } = await import(SCRIPT);
const io = () => { const out = [], err = []; return { out, err, io: { out: (s) => out.push(s), err: (s) => err.push(s) } }; };

/** A generated_images folder with two sessions: ours (two takes) and a parallel one. */
function images() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-'));
  const mine = path.join(root, 'aaaa-1111');
  const other = path.join(root, 'bbbb-2222');
  fs.mkdirSync(mine); fs.mkdirSync(other);
  for (const [dir, name, t] of [[mine, 'exec-first.png', 1000], [mine, 'exec-final.png', 2000], [other, 'exec-banner.png', 3000]]) {
    const f = path.join(dir, name);
    fs.writeFileSync(f, 'png');
    fs.utimesSync(f, t, t);
  }
  fs.writeFileSync(path.join(mine, 'notes.txt'), 'x');
  return { root, mine, other };
}

describe('codex-image', () => {
  test('takes the last reported image that exists, never another session', () => {
    const { root, mine } = images();
    const log = `session id: aaaa-1111\n[draft](${root}/aaaa-1111/exec-first.png)\n[final](${root}/aaaa-1111/exec-final.png)\n[gone](${root}/aaaa-1111/exec-missing.png)`;
    assert.deepEqual(imageFromLog(log, root), { path: path.join(mine, 'exec-final.png'), how: 'reported' });
  });

  test('falls back to the newest PNG of the log\'s own session folder', () => {
    const { root, mine } = images();
    assert.deepEqual(imageFromLog('session id: aaaa-1111\nsaved nothing', root), { path: path.join(mine, 'exec-final.png'), how: 'session' });
  });

  test('explains when nothing can be found', () => {
    const { root } = images();
    assert.match(imageFromLog('no header', root).error, /no image and no session id/);
    assert.match(imageFromLog('session id: cccc-3333', root).error, /does not exist/);
    fs.mkdirSync(path.join(root, 'dddd-4444'));
    assert.match(imageFromLog('session id: dddd-4444', root).error, /has no PNG/);
  });

  test('file system hooks are used when given', () => {
    const res = imageFromLog('session id: eeee', '/r', { exists: () => true, list: () => [{ file: '/r/eeee/a.png', mtime: 1 }, { file: '/r/eeee/b.png', mtime: 5 }] });
    assert.deepEqual(res, { path: '/r/eeee/b.png', how: 'session' });
  });

  test('CLI prints the path, reports errors and usage', () => {
    const { root, mine } = images();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'log-'));
    fs.writeFileSync(path.join(dir, 'ok.txt'), `session id: aaaa-1111\n${root}/aaaa-1111/exec-final.png`);
    fs.writeFileSync(path.join(dir, 'bad.txt'), 'nothing');
    let r = io();
    assert.equal(main([path.join(dir, 'ok.txt'), '--images-root', root], r.io), 0);
    assert.deepEqual(r.out, [path.join(mine, 'exec-final.png')]);
    r = io();
    assert.equal(main([path.join(dir, 'bad.txt'), '--images-root', root], r.io), 1);
    assert.match(r.err[0], /^error: the log names no image/);
    r = io();
    assert.equal(main([path.join(dir, 'missing.txt')], r.io), 1);
    assert.match(r.err[0], /^error: /);
    r = io();
    assert.equal(main([], r.io), 1);
    assert.match(r.err[0], /Usage/);
  });

  test('runs as a script', () => {
    const { root } = images();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'log-'));
    fs.writeFileSync(path.join(dir, 'ok.txt'), 'session id: aaaa-1111');
    const ok = spawnSync(process.execPath, [SCRIPT, path.join(dir, 'ok.txt'), '--images-root', root], { encoding: 'utf8' });
    assert.equal(ok.status, 0);
    assert.match(ok.stdout, /exec-final\.png/);
    assert.equal(spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' }).status, 1);
  });
});
