import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(ROOT, 'plugins/personal-tools/skills/docs-sync/scripts/check-docs.mjs');
const { expandBraces, parseStructure, listTop, listMarkdown, localLinks, checkDocs, gitignored, main, DEFAULT_IGNORE, REQUIRED_DOCS } = await import(SCRIPT);

const io = () => { const out = [], err = []; return { out, err, io: { out: (s) => out.push(s), err: (s) => err.push(s) } }; };
function write(root, rel, text = '') {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), text);
}

const STRUCTURE = [
  '# Project structure',
  '',
  'Proposed `config/` is not created (prose is ignored).',
  '',
  '```text',
  'proj/',
  '├── README.md',
  '├── AGENTS.md',
  '├── docs/',
  '│   ├── DECISIONS.md, MEMORY.md, STRUCTURE.md',
  '│   └── research/            # evidence',
  '│       └── inventory.json',
  '├── web/',
  '│   ├── {a,b}.js',
  '│   └── js/{main,util}.js',
  '├── art/, sound/              # empty',
  '│   └── orphan.txt',
  '└── <story>/                  # placeholder',
  '```',
  '',
  '```js',
  'not a tree',
  '```',
  '',
  '| Path | Purpose |',
  '|---|---|',
  '| `docs/research/inventory.json`, `notes.md` | relative name after a path |',
  '| `./gone.md` | missing |',
  '| `web/` | web |',
  '| `*.log`, `has space`, `...` | skipped |',
  '| plain text | no backticks |',
].join('\n');

function project() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-'));
  write(root, 'README.md', '# P\n\n[docs](docs/STRUCTURE.md) [anchor](#x) [web](https://x.y) [mail](mailto:a@b) [line](docs/MEMORY.md:12) [with title](docs/MEMORY.md "t") [broken](missing.md)\n\n```md\n[in code](nowhere.md)\n```\n');
  write(root, 'AGENTS.md', 'rules');
  write(root, 'docs/STRUCTURE.md', STRUCTURE);
  write(root, 'docs/DECISIONS.md', 'Old path `/Users/nobody/project` and again `/Users/nobody/project`; `/tmp` exists; placeholder `/Users/someone/...`.');
  write(root, 'docs/MEMORY.md', '[abs](/nonexistent/abs.md) [abs ok](' + root + '/README.md) [space](sub%20dir/x.md)');
  write(root, 'docs/sub dir/x.md', 'x');
  write(root, 'docs/research/inventory.json', '{}');
  write(root, 'docs/research/notes.md', 'n');
  write(root, 'web/a.js'); write(root, 'web/b.js'); write(root, 'web/js/main.js'); write(root, 'web/js/util.js');
  write(root, 'extra.txt');
  write(root, 'art/.gitkeep'); write(root, 'sound/.gitkeep');
  write(root, 'api/package.json', '{}');
  write(root, 'lib/pyproject.toml', ''); write(root, 'lib/README.md', 'ok');
  write(root, 'node_modules/x/README.md', '[bad](nope.md)');
  write(root, '.DS_Store');
  return root;
}

describe('parsing helpers', () => {
  test('expandBraces handles none, one and nested groups', () => {
    assert.deepEqual(expandBraces('a.js'), ['a.js']);
    assert.deepEqual(expandBraces('js/{a, b}.js'), ['js/a.js', 'js/b.js']);
    assert.deepEqual(expandBraces('{x,y}/{1,2}'), ['x/1', 'x/2', 'y/1', 'y/2']);
  });

  test('parseStructure reads tree and first table column only', () => {
    const named = parseStructure(STRUCTURE);
    assert.deepEqual(named, [
      'AGENTS.md', 'README.md', 'art/', 'docs/', 'docs/DECISIONS.md', 'docs/MEMORY.md', 'docs/STRUCTURE.md',
      'docs/research/', 'docs/research/inventory.json', 'docs/research/notes.md', 'gone.md', 'sound/',
      'web/', 'web/a.js', 'web/b.js', 'web/js/main.js', 'web/js/util.js',
    ]);
  });

  test('localLinks skips urls, anchors and code blocks, strips anchors and line suffixes, decodes', () => {
    assert.deepEqual(localLinks('[a](x.md#h) [b](#top) [c](http://x) [d](y.md:3-9) [e](a%20b.md "T")\n```\n[f](z.md)\n```'), ['x.md', 'y.md', 'a b.md']);
  });

  test('listTop and listMarkdown honour the ignore list', () => {
    const root = project();
    assert.ok(listTop(root, DEFAULT_IGNORE).includes('docs/research/'));
    assert.ok(!listTop(root, DEFAULT_IGNORE).some((p) => p.startsWith('node_modules')));
    assert.ok(!listTop(root, DEFAULT_IGNORE).includes('.DS_Store'));
    assert.ok(listTop(root, []).includes('.DS_Store'));
    const mds = listMarkdown(root, DEFAULT_IGNORE);
    assert.ok(mds.includes('docs/sub dir/x.md'));
    assert.ok(!mds.some((m) => m.startsWith('node_modules')));
    assert.deepEqual(REQUIRED_DOCS.slice(0, 2), ['README.md', 'AGENTS.md']);
  });
});

describe('gitignore rules', () => {
  test('gitignored splits any-depth names from anchored paths and skips globs, negations, comments', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-gi-'));
    assert.deepEqual(gitignored(root), { names: [], paths: [] });
    write(root, '.gitignore', '# comment\n\n!keep.md\ncache/\n.venv\nbuild/*\n/top\nassets/_vendor/*\n*.log\ndocs/[ab]/\n');
    assert.deepEqual(gitignored(root), { names: ['cache', '.venv'], paths: ['build', 'top', 'assets/_vendor'] });
  });

  test('checkDocs skips gitignored folders when listing and scanning Markdown', () => {
    const root = project();
    write(root, '.gitignore', 'cache/\nbuild/*\nweb/js/\napi/\n');
    write(root, 'cache/pkg/README.md', '[bad](../../nowhere.md)');
    write(root, 'docs/cache/x.md', '[bad](nowhere.md)');
    write(root, 'build/out/README.md', '[bad](nowhere.md)');
    write(root, 'build/package.json', '{}');
    const { errors, warnings } = checkDocs(root);
    assert.ok(!errors.some((e) => /cache|build/.test(e)), errors.join('\n'));
    assert.ok(!warnings.some((w) => /"cache\/"|"build\/"|build\/ has|api\//.test(w)), warnings.join('\n'));
    assert.ok(listTop(root, [], ['web/js']).every((p) => p !== 'web/js/'));
    assert.ok(!listMarkdown(root, [], ['docs/sub dir']).some((m) => m.startsWith('docs/sub dir')));
  });
});

describe('checkDocs', () => {
  test('finds missing paths, undescribed entries, broken links, stale absolute paths, sub-repos without README', () => {
    const root = project();
    const { errors, warnings } = checkDocs(root);
    assert.deepEqual(errors, [
      'docs/STRUCTURE.md: names "gone.md" but it does not exist',
      'README.md: broken link "missing.md"',
    ]);
    const w = warnings.join('\n');
    assert.match(w, /"api\/" exists but is not described/);
    assert.match(w, /"extra.txt" exists but is not described/);
    assert.match(w, /"package.json"|api\/ has package.json but no README.md/);
    assert.doesNotMatch(w, /lib\/ has/);
    assert.match(w, /docs\/DECISIONS.md: absolute path "\/Users\/nobody\/project" does not exist/);
    assert.equal(warnings.filter((x) => x.includes('/Users/nobody/project')).length, 1);
    assert.match(w, /docs\/MEMORY.md: link to absolute path "\/nonexistent\/abs.md" does not exist/);
    assert.doesNotMatch(w, /"web\/"|"docs\/"|"art\/"/);
    assert.doesNotMatch(w, /\/tmp/);
    assert.doesNotMatch(w, /someone/);
  });

  test('missing documents: README is an error, the rest warnings; no STRUCTURE means no tree check', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-empty-'));
    const r = checkDocs(root);
    assert.deepEqual(r.errors, ['missing README.md', 'missing docs/STRUCTURE.md; cannot compare the tree']);
    assert.equal(r.warnings.length, 4);
  });

  test('custom structure file and extra ignores', () => {
    const root = project();
    write(root, 'TREE.md', '```\n├── README.md\n```\n');
    const r = checkDocs(root, { structure: 'TREE.md', ignore: ['api', 'lib', 'web', 'docs', 'art', 'sound', 'extra.txt', 'AGENTS.md', 'TREE.md'] });
    assert.deepEqual(r.errors, ['README.md: broken link "missing.md"']);
    assert.ok(r.warnings.every((x) => /missing docs\//.test(x)));
  });
});

describe('cli', () => {
  test('text and json output, exit codes, bad root', () => {
    const root = project();
    let r = io();
    assert.equal(main([root], r.io), 1);
    assert.match(r.out[0], /^ERROR   docs\/STRUCTURE.md: names "gone.md"/);
    assert.match(r.out.at(-1), /^2 error\(s\), \d+ warning\(s\)\.$/);
    assert.ok(r.out.some((l) => l.startsWith('WARNING ')));
    r = io();
    assert.equal(main([root, '--json', '--ignore', 'api,,lib', '--structure', 'docs/STRUCTURE.md'], r.io), 1);
    assert.equal(JSON.parse(r.out[0]).errors.length, 2);
    const clean = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-clean-'));
    for (const d of REQUIRED_DOCS) write(clean, d, d === 'docs/STRUCTURE.md' ? '```\n├── README.md\n├── AGENTS.md\n└── docs/\n```\n' : 'x');
    r = io();
    assert.equal(main([clean], r.io), 0);
    assert.deepEqual(r.out, ['0 error(s), 0 warning(s).']);
    r = io();
    assert.equal(main(['/nonexistent/dir'], r.io), 1);
    assert.match(r.err[0], /is not a directory/);
    assert.equal(main([path.join(root, 'README.md')], io().io), 1);
  });

  test('defaults to the current directory and runs as a script', () => {
    const clean = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-cwd-'));
    for (const d of REQUIRED_DOCS) write(clean, d, d === 'docs/STRUCTURE.md' ? '```\n├── README.md\n├── AGENTS.md\n└── docs/\n```\n' : 'x');
    const ok = spawnSync(process.execPath, [SCRIPT], { cwd: clean, encoding: 'utf8' });
    assert.equal(ok.status, 0);
    assert.match(ok.stdout, /0 error\(s\)/);
    const bad = spawnSync(process.execPath, [SCRIPT, '/nonexistent'], { encoding: 'utf8' });
    assert.equal(bad.status, 1);
  });
});
