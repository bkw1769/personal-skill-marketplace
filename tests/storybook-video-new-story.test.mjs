import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(ROOT, 'plugins/fairytale-studio/skills/storybook-video/scripts/new-story.mjs');
const { main, parseArgs, relUrl, checkInputs, TEMPLATE, ENGINE_FILES, AUTHOR_FILES } = await import(SCRIPT);

const io = () => { const out = [], err = []; return { out, err, io: { out: (s) => out.push(s), err: (s) => err.push(s) } }; };
const SB = { schema: 'storyboard/1', title: '토끼', scenes: [{ id: 'a', start: 0, end: 5 }], cast: [{ id: 'rabbit', sprites: ['rabbit'] }, { id: 'fox', sprites: ['fox-1'] }, { id: 'owl' }] };
const SPRITES = { schema: 'sprites/1', sprites: [{ name: 'rabbit' }, { name: 'fox-1', empty: true }] };

function project() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'story-'));
  fs.mkdirSync(path.join(root, 'stories', 'rabbit', 'sprites'), { recursive: true });
  fs.writeFileSync(path.join(root, 'stories', 'rabbit', 'storyboard.json'), JSON.stringify(SB));
  fs.writeFileSync(path.join(root, 'stories', 'rabbit', 'sprites', 'sprites.json'), JSON.stringify(SPRITES));
  return root;
}

describe('helpers', () => {
  test('template contains every engine and author file', () => {
    for (const f of [...ENGINE_FILES, ...AUTHOR_FILES, 'story.config.js']) assert.ok(fs.existsSync(path.join(TEMPLATE, f)), f);
  });
  test('relUrl makes posix relative URLs', () => {
    assert.equal(relUrl('/p/stories/a/video', '/p/stories/a/storyboard.json'), '../storyboard.json');
    assert.equal(relUrl('/p/stories/a', '/p/stories/a/sprites/sprites.json'), './sprites/sprites.json');
  });
  test('checkInputs reports schema problems and cast without sprites', () => {
    assert.deepEqual(checkInputs(SB, SPRITES), {
      errors: [],
      warnings: [
        'cast "fox" has no sprite in sprites.json (listed: fox-1); default scenes will skip it',
        'cast "owl" has no sprite in sprites.json (listed: none); default scenes will skip it',
      ],
    });
    const bad = checkInputs({ scenes: [] }, {});
    assert.equal(bad.errors.length, 3);
    assert.match(bad.errors[1], /no scenes/);
    assert.deepEqual(checkInputs({ schema: 'storyboard/1', scenes: [{}] }, { schema: 'sprites/1' }), { errors: [], warnings: [] });
  });
  test('parseArgs', () => {
    assert.deepEqual(parseArgs(['d', '--storyboard', 's', '--sprites', 'p', '--save-name', 'n', '--update-engine']), { update: true, dir: 'd', storyboard: 's', sprites: 'p', saveName: 'n' });
  });
});

describe('main', () => {
  test('creates the page with config, refuses to overwrite, then updates the engine only', () => {
    const root = project();
    const dir = path.join(root, 'stories', 'rabbit', 'video');
    let r = io();
    assert.equal(main([dir, '--storyboard', path.join(root, 'stories/rabbit/storyboard.json'), '--sprites', path.join(root, 'stories/rabbit/sprites/sprites.json')], r.io), 0);
    assert.match(r.out[0], /Created .* for "토끼" \(1 scenes, 2 sprites\)/);
    assert.equal(r.err.length, 2);
    const cfg = fs.readFileSync(path.join(dir, 'story.config.js'), 'utf8');
    assert.match(cfg, /storyboard: '\.\.\/storyboard\.json'/);
    assert.match(cfg, /sprites: '\.\.\/sprites\/sprites\.json'/);
    assert.match(cfg, /saveName: 'video'/);
    for (const f of [...ENGINE_FILES, ...AUTHOR_FILES]) assert.ok(fs.existsSync(path.join(dir, f)), f);

    r = io();
    assert.equal(main([dir, '--storyboard', 'x', '--sprites', 'y'], r.io), 1);
    assert.match(r.err[0], /already has a storybook page/);

    fs.writeFileSync(path.join(dir, 'js', 'scenes.js'), '// mine');
    fs.writeFileSync(path.join(dir, 'js', 'main.js'), '// stale');
    fs.rmSync(path.join(dir, 'js', 'score.js'));
    r = io();
    assert.equal(main([dir, '--update-engine'], r.io), 0);
    assert.equal(fs.readFileSync(path.join(dir, 'js', 'scenes.js'), 'utf8'), '// mine');
    assert.notEqual(fs.readFileSync(path.join(dir, 'js', 'main.js'), 'utf8'), '// stale');
    assert.ok(fs.existsSync(path.join(dir, 'js', 'score.js')));
    assert.match(fs.readFileSync(path.join(dir, 'story.config.js'), 'utf8'), /saveName: 'video'/);
  });

  test('save name option, usage errors, missing page, bad JSON and invalid inputs', () => {
    const root = project();
    const sbFile = path.join(root, 'stories/rabbit/storyboard.json');
    const spFile = path.join(root, 'stories/rabbit/sprites/sprites.json');
    let r = io();
    assert.equal(main([path.join(root, 'v2'), '--storyboard', sbFile, '--sprites', spFile, '--save-name', 'rabbit-final'], r.io), 0);
    assert.match(fs.readFileSync(path.join(root, 'v2', 'story.config.js'), 'utf8'), /saveName: 'rabbit-final'/);
    fs.writeFileSync(path.join(root, 'nosprites.json'), JSON.stringify({ schema: 'sprites/1' }));
    r = io();
    assert.equal(main([path.join(root, 'v6'), '--storyboard', sbFile, '--sprites', path.join(root, 'nosprites.json')], r.io), 0);
    assert.match(r.out[0], /\(1 scenes, 0 sprites\)/);
    r = io();
    assert.equal(main([], r.io), 1);
    assert.match(r.err[0], /^Usage/);
    assert.equal(main([path.join(root, 'v3')], io().io), 1);
    r = io();
    assert.equal(main([path.join(root, 'nothing'), '--update-engine'], r.io), 1);
    assert.match(r.err[0], /has no index.html/);
    fs.writeFileSync(path.join(root, 'bad.json'), '{');
    r = io();
    assert.equal(main([path.join(root, 'v4'), '--storyboard', path.join(root, 'bad.json'), '--sprites', spFile], r.io), 1);
    assert.match(r.err[0], /^error: /);
    fs.writeFileSync(path.join(root, 'old.json'), JSON.stringify({ scenes: [] }));
    r = io();
    assert.equal(main([path.join(root, 'v5'), '--storyboard', path.join(root, 'old.json'), '--sprites', spFile], r.io), 1);
    assert.equal(fs.existsSync(path.join(root, 'v5')), false);
  });

  test('runs as a script', () => {
    const res = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
    assert.equal(res.status, 1);
    const root = project();
    const ok = spawnSync(process.execPath, [SCRIPT, path.join(root, 'v'), '--storyboard', path.join(root, 'stories/rabbit/storyboard.json'), '--sprites', path.join(root, 'stories/rabbit/sprites/sprites.json')], { encoding: 'utf8' });
    assert.equal(ok.status, 0);
  });
});
