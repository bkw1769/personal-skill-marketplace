import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as lib from '../lib.mjs';
import { main, parseArgs, DEFAULT_ROOT } from '../cli.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, '..', 'cli.mjs');

const TAXONOMY = {
  kinds: {
    sfx: { folder: 'audio/sfx', categories: ['cartoon', 'nature'] },
    character: { folder: 'art/characters', categories: ['cast-lineup'] },
    voice: { folder: 'audio/voices', categories: ['narrator'], approval_requires: ['model', 'model_license'] },
  },
  facets: { mood: ['playful', 'calm'], story: 'free' },
  statuses: { approved: '', candidate: '', 'reference-only': '', rejected: '' },
  scopes: { shared: '', story: '' },
};
const SOURCES = [
  { id: 'cc0', name: 'CC0 Lib', license: 'CC0-1.0', commercial_ok: true, attribution_required: false, redistribute_ok: true, policy: 'allowed' },
  { id: 'byl', name: 'BY Lib', license: 'CC-BY-4.0', commercial_ok: true, attribution_required: true, redistribute_ok: true, policy: 'restricted' },
  { id: 'bad', name: 'Blocked Lib', license: 'NC', commercial_ok: false, attribution_required: false, redistribute_ok: false, policy: 'blocked' },
  { id: 'refs', name: 'User refs', license: 'unknown', commercial_ok: false, attribution_required: false, redistribute_ok: false, policy: 'restricted' },
  { id: 'rec', name: 'Consented recording', license: 'per consent', commercial_ok: true, attribution_required: false, redistribute_ok: false, policy: 'restricted', requires_consent: true },
];

/** Build a minimal WAV buffer: mono 16-bit at `rate` Hz with `samples` samples, plus optional extra chunk before data. */
function wav(samples, rate = 8000, extra = null) {
  const fmt = Buffer.alloc(24);
  fmt.write('fmt ', 0); fmt.writeUInt32LE(16, 4); fmt.writeUInt16LE(1, 8); fmt.writeUInt16LE(1, 10);
  fmt.writeUInt32LE(rate, 12); fmt.writeUInt32LE(rate * 2, 16); fmt.writeUInt16LE(2, 20); fmt.writeUInt16LE(16, 22);
  const dataHdr = Buffer.alloc(8); dataHdr.write('data', 0); dataHdr.writeUInt32LE(samples * 2, 4);
  const parts = [fmt];
  if (extra) parts.push(extra);
  parts.push(dataHdr, Buffer.alloc(samples * 2));
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(12); head.write('RIFF', 0); head.writeUInt32LE(body.length + 4, 4); head.write('WAVE', 8);
  return Buffer.concat([head, body]);
}

let root;
function write(rel, content) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, typeof content === 'string' || Buffer.isBuffer(content) ? content : JSON.stringify(content, null, 2));
  return abs;
}
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
function io() {
  const out = [], err = [];
  return { out, err, io: { out: (s) => out.push(s), err: (s) => err.push(s) } };
}

/** A valid project: one cartoon sfx file, one procedural sfx, one story character sheet. */
function seedValidProject() {
  write('assets/catalog/taxonomy.json', TAXONOMY);
  write('assets/catalog/sources.json', { sources: SOURCES });
  const boing = wav(8000);
  write('assets/audio/sfx/cartoon/boing.wav', boing);
  write('assets/audio/sfx/cartoon/manifest.json', {
    schema: lib.MANIFEST_SCHEMA,
    defaults: { kind: 'sfx', category: 'cartoon', status: 'approved', scope: 'shared', source: 'cc0', tags: ['mood:playful'] },
    items: [{ id: 'sfx.cartoon.boing-01', title: 'Boing', file: 'boing.wav', sha256: sha(boing) }],
  });
  write('code/synth.js', 'class Synth { waves() {} }');
  write('assets/audio/sfx/nature/manifest.json', {
    schema: lib.MANIFEST_SCHEMA,
    items: [{ id: 'sfx.nature.waves', kind: 'sfx', category: 'nature', title: 'Waves', status: 'candidate', scope: 'shared', source: 'byl', impl: 'code/synth.js#Synth.waves', attribution: 'Waves by Someone (CC-BY-4.0)', notes: 'sea shore' }],
  });
  write('assets/art/characters/troy/v1/sheet.png', 'png');
  write('assets/art/characters/troy/v1/manifest.json', {
    schema: lib.MANIFEST_SCHEMA,
    items: [{ id: 'character.cast-lineup.troy-v1', kind: 'character', category: 'cast-lineup', title: 'Troy cast', status: 'approved', scope: 'story', source: 'cc0', tags: ['story:troy'], file: 'sheet.png' }],
  });
  write('assets/_vendor/ignored/manifest.json', { schema: 'nope' });
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'assets-test-'));
});

describe('small helpers', () => {
  test('readJson and writeJson round-trip with trailing newline', () => {
    const f = path.join(root, 'x.json');
    lib.writeJson(f, { a: 1 });
    assert.equal(fs.readFileSync(f, 'utf8'), '{\n  "a": 1\n}\n');
    assert.deepEqual(lib.readJson(f), { a: 1 });
  });

  test('toPosix converts separators', () => {
    assert.equal(lib.toPosix(['a', 'b', 'c'].join(path.sep)), 'a/b/c');
  });

  test('hashFile matches crypto sha256', () => {
    const f = write('h.bin', 'hello');
    assert.equal(lib.hashFile(f), sha(Buffer.from('hello')));
  });

  test('findManifests skips vendor/catalog/licenses and sorts', () => {
    write('assets/b/manifest.json', '{}');
    write('assets/a/deep/manifest.json', '{}');
    write('assets/a/other.json', '{}');
    for (const d of ['_vendor', 'catalog', 'licenses', 'node_modules']) write(`assets/${d}/manifest.json`, '{}');
    const found = lib.findManifests(path.join(root, 'assets')).map((p) => lib.toPosix(path.relative(root, p)));
    assert.deepEqual(found, ['assets/a/deep/manifest.json', 'assets/b/manifest.json']);
  });
});

describe('wavDurationSeconds', () => {
  test('reads duration from fmt and data chunks', () => {
    assert.equal(lib.wavDurationSeconds(wav(8000, 8000)), 1);
  });
  test('skips unknown chunks, including odd-sized ones with padding', () => {
    const odd = Buffer.alloc(8 + 3 + 1); odd.write('LIST', 0); odd.writeUInt32LE(3, 4);
    assert.equal(lib.wavDurationSeconds(wav(4000, 8000, odd)), 0.5);
  });
  test('returns null for non-WAV, short, missing data, or missing fmt', () => {
    assert.equal(lib.wavDurationSeconds(Buffer.from('short')), null);
    assert.equal(lib.wavDurationSeconds(Buffer.from('RIFF0000AVI xxxxxxxx')), null);
    assert.equal(lib.wavDurationSeconds(Buffer.from('XXXX0000WAVExxxxxxxx')), null);
    const noData = wav(10).subarray(0, 36);
    assert.equal(lib.wavDurationSeconds(noData), null);
    const dataOnly = Buffer.alloc(20); dataOnly.write('RIFF', 0); dataOnly.write('WAVE', 8); dataOnly.write('data', 12); dataOnly.writeUInt32LE(4, 16);
    assert.equal(lib.wavDurationSeconds(dataOnly), null);
  });
  test('truncated fmt chunk leaves byte rate unknown', () => {
    const b = Buffer.alloc(24); b.write('RIFF', 0); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(0, 16);
    const withData = Buffer.concat([b.subarray(0, 20), Buffer.from('data'), Buffer.from([4, 0, 0, 0])]);
    assert.equal(lib.wavDurationSeconds(withData), null);
  });
});

describe('expandManifest', () => {
  test('merges defaults, unions tags and records location', () => {
    const assetsRoot = path.join(root, 'assets');
    const mf = path.join(assetsRoot, 'audio', 'sfx', 'cartoon', 'manifest.json');
    const items = lib.expandManifest(
      { defaults: { kind: 'sfx', tags: ['mood:playful'] }, items: [{ id: 'a', tags: ['mood:playful', 'mood:calm'] }, { id: 'b' }] },
      mf, assetsRoot, root,
    );
    assert.deepEqual(items[0].tags, ['mood:playful', 'mood:calm']);
    assert.equal(items[1].kind, 'sfx');
    assert.equal(items[1].dir, 'audio/sfx/cartoon');
    assert.equal(items[1].manifest, 'assets/audio/sfx/cartoon/manifest.json');
    assert.equal(items[1].root, 'assets');
  });
  test('handles a manifest with neither defaults nor items', () => {
    assert.deepEqual(lib.expandManifest({}, path.join(root, 'assets', 'manifest.json'), path.join(root, 'assets'), root), []);
  });
});

describe('validateItem', () => {
  const sources = new Map(SOURCES.map((s) => [s.id, s]));
  const ctx = () => ({ taxonomy: TAXONOMY, sources, assetsRoot: path.join(root, 'assets'), projectRoot: root, checkHash: true });
  const base = () => ({ id: 'sfx.cartoon.pop', kind: 'sfx', category: 'cartoon', title: 'Pop', tags: [], status: 'approved', scope: 'shared', source: 'cc0', file: 'pop.wav', manifest: 'm', dir: 'audio/sfx/cartoon' });
  const errs = (patch) => lib.validateItem({ ...base(), ...patch }, ctx()).join('\n');

  beforeEach(() => write('assets/audio/sfx/cartoon/pop.wav', 'pop'));

  test('valid item has no errors', () => {
    assert.equal(errs({}), '');
  });
  test('id shape and prefix', () => {
    assert.match(errs({ id: 'bad' }), /id must look like/);
    assert.match(errs({ id: undefined }), /\(no id\).*id must look like/);
    assert.match(errs({ id: 'sfx.nature.pop' }), /id prefix must be sfx\.cartoon/);
  });
  test('title required', () => {
    assert.match(errs({ title: '' }), /title is required/);
  });
  test('kind, category and folder', () => {
    assert.match(errs({ kind: 'nope', id: 'nope.cartoon.pop' }), /unknown kind "nope"/);
    assert.match(errs({ category: 'zzz', id: 'sfx.zzz.pop' }), /unknown category "zzz"/);
    assert.match(errs({ dir: 'art/elsewhere' }), /belongs under assets\/audio\/sfx\//);
    assert.match(errs({ dir: 'audio/sfx-other' }), /belongs under/);
    write('assets/audio/sfx/pop.wav', 'pop');
    assert.equal(errs({ dir: 'audio/sfx' }), '');
  });
  test('status, scope and story tag', () => {
    assert.match(errs({ status: 'maybe' }), /unknown status/);
    assert.match(errs({ scope: 'global' }), /unknown scope/);
    assert.match(errs({ scope: 'story' }), /needs a story:<slug> tag/);
    assert.equal(errs({ scope: 'story', tags: ['story:troy'] }), '');
  });
  test('tags: shape, facet, controlled and free values', () => {
    assert.match(errs({ tags: ['playful'] }), /must be facet:value/);
    assert.match(errs({ tags: ['a:b:c'] }), /must be facet:value/);
    assert.match(errs({ tags: ['color:red'] }), /unknown tag facet "color"/);
    assert.match(errs({ tags: ['mood:angry'] }), /tag value "mood:angry" is not allowed/);
    assert.match(errs({ tags: ['story:Troy Story'] }), /tag value "story:Troy Story" is not allowed/);
    assert.equal(errs({ tags: ['mood:calm', 'story:hansel-gretel'] }), '');
  });
  test('sources and license gates', () => {
    assert.match(errs({ source: 'ghost' }), /unknown source "ghost"/);
    assert.match(errs({ source: 'bad' }), /source bad is blocked/);
    assert.equal(errs({ source: 'bad', status: 'rejected' }), '');
    assert.match(errs({ license: 'CC-BY-NC-4.0' }), /non-commercial/);
    assert.equal(errs({ license: 'CC-BY-NC-4.0', status: 'candidate' }), '');
  });
  test('commercial and consent gates on approval', () => {
    assert.match(errs({ source: 'refs' }), /not cleared for commercial use/);
    assert.equal(errs({ source: 'refs', status: 'reference-only' }), '');
    assert.equal(errs({ source: 'refs', commercial_ok: true }), '');
    assert.match(errs({ source: 'rec' }), /needs a consent record/);
    assert.match(errs({ source: 'rec', consent: 'docs/consent/none.pdf' }), /consent record not found: docs\/consent\/none\.pdf/);
    write('docs/consent/actor.pdf', 'signed');
    assert.equal(errs({ source: 'rec', consent: 'docs/consent/actor.pdf' }), '');
    assert.equal(errs({ source: 'rec', status: 'candidate' }), '');
  });
  test('voice provenance required for approval', () => {
    write('assets/audio/voices/narrator-ko/ref.wav', 'ref');
    const voice = { id: 'voice.narrator.narrator-ko', kind: 'voice', category: 'narrator', dir: 'audio/voices/narrator-ko', file: 'ref.wav' };
    assert.match(errs(voice), /approval needs provenance\.model\n.*approval needs provenance\.model_license/);
    assert.match(errs({ ...voice, provenance: { model: 'm', model_license: '' } }), /provenance\.model_license/);
    assert.match(errs({ ...voice, provenance: { model: 'm', model_license: 'CC-BY-NC-4.0' } }), /model license "CC-BY-NC-4\.0" is not commercial/);
    assert.match(errs({ ...voice, provenance: { model: 'm', model_license: 'research-only' } }), /is not commercial/);
    assert.equal(errs({ ...voice, provenance: { model: 'm', model_license: 'apache-2.0' } }), '');
    assert.equal(errs({ ...voice, status: 'candidate' }), '');
    assert.match(errs({ ...voice, kind: 'nope', id: 'nope.narrator.narrator-ko' }), /unknown kind/);
  });
  test('file vs impl', () => {
    assert.match(errs({ file: undefined }), /exactly one of file or impl/);
    assert.match(errs({ impl: 'x.js#y' }), /exactly one of file or impl/);
    assert.match(errs({ file: 'missing.wav' }), /file not found: missing\.wav/);
  });
  test('a file under a project assets root is looked up there', () => {
    write('src/fairy/assets/audio/sfx/cartoon/zip.wav', 'zip');
    assert.equal(errs({ file: 'zip.wav', root: 'src/fairy/assets' }), '');
    assert.match(errs({ file: 'zip.wav' }), /file not found: zip\.wav/);
  });
  test('sha256 checked only when present and checkHash is on', () => {
    assert.match(errs({ sha256: 'deadbeef' }), /sha256 mismatch/);
    assert.equal(errs({ sha256: sha(Buffer.from('pop')) }), '');
    assert.equal(lib.validateItem({ ...base(), sha256: 'deadbeef' }, { ...ctx(), checkHash: false }).length, 0);
  });
  test('impl path and symbol', () => {
    write('code/s.js', 'function boing() {}');
    const impl = (v) => errs({ file: undefined, impl: v });
    assert.equal(impl('code/s.js#Synth.boing'), '');
    assert.match(impl('code/s.js'), /impl must look like <path>#<symbol>/);
    assert.match(impl('code/none.js#x'), /impl file not found: code\/none\.js/);
    assert.match(impl('code/s.js#Synth.thunder'), /impl symbol not found: Synth\.thunder/);
  });
});

describe('assetRoots', () => {
  test('shared assets only when there is no src folder', () => {
    assert.deepEqual(lib.assetRoots(root), [path.join(root, 'assets')]);
  });
  test('adds src/<project>/assets for projects that have one, sorted', () => {
    write('src/zeta/assets/x.txt', 'x');
    write('src/alpha/assets/x.txt', 'x');
    write('src/noassets/readme.md', 'x');
    write('src/file.txt', 'x');
    assert.deepEqual(lib.assetRoots(root), [path.join(root, 'assets'), path.join(root, 'src/alpha/assets'), path.join(root, 'src/zeta/assets')]);
  });
});

describe('loadCatalog', () => {
  test('project assets roots are catalogued with the shared ones', () => {
    seedValidProject();
    write('src/fairy/assets/art/characters/dori/sheet.png', 'png');
    write('src/fairy/assets/art/characters/dori/manifest.json', {
      schema: lib.MANIFEST_SCHEMA,
      items: [{ id: 'character.cast-lineup.dori', kind: 'character', category: 'cast-lineup', title: 'Dori', status: 'candidate', scope: 'story', source: 'cc0', tags: ['story:golden-axe'], file: 'sheet.png' }],
    });
    const { items, errors, sources } = lib.loadCatalog({ projectRoot: root });
    assert.deepEqual(errors, []);
    assert.equal(items.length, 4);
    const dori = lib.buildIndex(items, sources).find((e) => e.id === 'character.cast-lineup.dori');
    assert.equal(dori.path, 'src/fairy/assets/art/characters/dori/sheet.png');
    assert.equal(dori.manifest, 'src/fairy/assets/art/characters/dori/manifest.json');
    assert.equal(dori.root, undefined);
  });
  test('valid project loads with no errors and skips vendor manifests', () => {
    seedValidProject();
    const { items, errors } = lib.loadCatalog({ projectRoot: root });
    assert.deepEqual(errors, []);
    assert.equal(items.length, 3);
  });
  test('reports bad schema and duplicate ids; checkHash defaults on', () => {
    seedValidProject();
    write('assets/audio/sfx/cartoon/x/manifest.json', {
      schema: 'wrong',
      items: [{ id: 'sfx.cartoon.boing-01', kind: 'sfx', category: 'cartoon', title: 'Dup', status: 'candidate', scope: 'shared', source: 'cc0', impl: 'code/synth.js#Synth.waves' }],
    });
    fs.writeFileSync(path.join(root, 'assets/audio/sfx/cartoon/boing.wav'), 'changed');
    const { errors } = lib.loadCatalog({ projectRoot: root });
    assert.ok(errors.some((e) => /schema must be/.test(e)));
    assert.ok(errors.some((e) => /duplicate id sfx\.cartoon\.boing-01/.test(e)));
    assert.ok(errors.some((e) => /sha256 mismatch/.test(e)));
    assert.equal(lib.loadCatalog({ projectRoot: root, checkHash: false }).errors.some((e) => /sha256/.test(e)), false);
  });
});

describe('index, find and rendering', () => {
  let index;
  beforeEach(() => {
    seedValidProject();
    const { items, sources } = lib.loadCatalog({ projectRoot: root });
    index = lib.buildIndex(items, sources);
  });

  test('buildIndex merges source license fields, item overrides win, sorted by id', () => {
    assert.deepEqual(index.map((e) => e.id), ['character.cast-lineup.troy-v1', 'sfx.cartoon.boing-01', 'sfx.nature.waves']);
    const boing = index[1];
    assert.equal(boing.license, 'CC0-1.0');
    assert.equal(boing.path, 'assets/audio/sfx/cartoon/boing.wav');
    assert.equal(boing.source_name, 'CC0 Lib');
    assert.equal(boing.dir, undefined);
    assert.equal(index[2].path, undefined);
    assert.equal(index[2].attribution_required, true);
    const sources = new Map(SOURCES.map((s) => [s.id, s]));
    const [over] = lib.buildIndex([{ id: 'a', source: 'cc0', license: 'custom', dir: 'd', file: 'f.wav' }], sources);
    assert.equal(over.license, 'custom');
    assert.equal(over.path, 'assets/d/f.wav');
  });

  test('findItems filters by every criterion', () => {
    const ids = (q) => lib.findItems(index, q).map((e) => e.id);
    assert.equal(ids({}).length, 3);
    assert.deepEqual(ids({ kind: 'sfx', category: 'nature' }), ['sfx.nature.waves']);
    assert.deepEqual(ids({ status: 'approved', scope: 'story' }), ['character.cast-lineup.troy-v1']);
    assert.deepEqual(ids({ tags: ['mood:playful'] }), ['sfx.cartoon.boing-01']);
    assert.deepEqual(ids({ text: 'SEA' }), ['sfx.nature.waves']);
    assert.deepEqual(ids({ text: 'boing' }), ['sfx.cartoon.boing-01']);
    assert.deepEqual(ids({ kind: 'music' }), []);
  });

  test('renderIndexMd summarises counts and lists every item', () => {
    const md = lib.renderIndexMd(index);
    assert.match(md, /\| sfx \| 2 \| 1 \| 1 \| 0 \| 0 \|/);
    assert.match(md, /## character/);
    assert.match(md, /`code\/synth\.js#Synth\.waves`/);
    assert.match(md, /`assets\/audio\/sfx\/cartoon\/boing\.wav`/);
  });

  test('renderCredits lists attribution, falls back to a generated line, skips rejected', () => {
    const md = lib.renderCredits(index);
    assert.match(md, /sfx\.nature\.waves`: Waves by Someone/);
    const fallback = lib.renderCredits([{ id: 'x', title: 'T', source_name: 'S', license: 'L', attribution_required: true, status: 'candidate' }]);
    assert.match(fallback, /`x`: T, S \(L\)/);
    const none = lib.renderCredits([{ id: 'x', attribution_required: true, status: 'rejected' }]);
    assert.match(none, /No registered asset currently requires attribution/);
  });
});

describe('fillManifest', () => {
  test('fills hash, bytes and WAV duration; skips impl, missing files and unchanged items', () => {
    const w = wav(8000, 8000);
    write('d/a.wav', w);
    write('d/b.png', 'png');
    const m = { items: [{ file: 'a.wav' }, { file: 'b.png' }, { impl: 'x#y' }, { file: 'gone.wav' }, { file: 'b.png', sha256: sha(Buffer.from('png')), bytes: 3 }] };
    assert.equal(lib.fillManifest(m, path.join(root, 'd')), 2);
    assert.equal(m.items[0].duration_s, 1);
    assert.equal(m.items[0].bytes, w.length);
    assert.equal(m.items[1].duration_s, undefined);
    assert.equal(m.items[1].sha256, sha(Buffer.from('png')));
    assert.equal(lib.fillManifest(m, path.join(root, 'd')), 0);
    assert.equal(lib.fillManifest({}, root), 0);
  });
  test('non-readable WAV gets no duration', () => {
    write('d/bad.wav', 'not a wav');
    const m = { items: [{ file: 'bad.wav' }] };
    lib.fillManifest(m, path.join(root, 'd'));
    assert.equal(m.items[0].duration_s, undefined);
  });
});

describe('cli', () => {
  test('parseArgs collects options and repeated tags', () => {
    assert.deepEqual(parseArgs([]), { cmd: 'help', opts: { tags: [] } });
    assert.deepEqual(parseArgs(['find', '--kind', 'sfx', '--tag', 'a:b', '--tag', 'c:d', '--json']), { cmd: 'find', opts: { tags: ['a:b', 'c:d'], kind: 'sfx', json: true } });
  });

  test('DEFAULT_ROOT is the working directory', () => {
    assert.equal(DEFAULT_ROOT, process.cwd());
  });

  test('validate ok, then build writes index, INDEX.md and CREDITS.md', () => {
    seedValidProject();
    let r = io();
    assert.equal(main(['validate', '--root', root], r.io), 0);
    assert.match(r.out[0], /OK: 3 item/);
    r = io();
    assert.equal(main(['build', '--root', root], r.io), 0);
    const idx = lib.readJson(path.join(root, 'assets/catalog/index.json'));
    assert.equal(idx.count, 3);
    assert.ok(fs.existsSync(path.join(root, 'assets/catalog/INDEX.md')));
    assert.match(fs.readFileSync(path.join(root, 'assets/licenses/CREDITS.md'), 'utf8'), /Waves by Someone/);
  });

  test('validate and build fail on errors', () => {
    seedValidProject();
    write('assets/audio/sfx/cartoon/manifest.json', { schema: lib.MANIFEST_SCHEMA, items: [{ id: 'bad' }] });
    for (const cmd of ['validate', 'build']) {
      const r = io();
      assert.equal(main([cmd, '--root', root], r.io), 1);
      assert.match(r.err.at(-1), /error\(s\) in 3 item/);
    }
    assert.equal(fs.existsSync(path.join(root, 'assets/catalog/index.json')), false);
  });

  test('fill updates manifests and reports counts', () => {
    seedValidProject();
    write('assets/audio/sfx/cartoon/manifest.json', {
      schema: lib.MANIFEST_SCHEMA,
      defaults: { kind: 'sfx', category: 'cartoon', status: 'approved', scope: 'shared', source: 'cc0' },
      items: [{ id: 'sfx.cartoon.boing-01', title: 'Boing', file: 'boing.wav' }],
    });
    const r = io();
    assert.equal(main(['fill', '--root', root], r.io), 0);
    assert.deepEqual(r.out, [
      'assets/art/characters/troy/v1/manifest.json: 1 item(s) updated',
      'assets/audio/sfx/cartoon/manifest.json: 1 item(s) updated',
      'Filled 2 item(s).',
    ]);
    assert.equal(lib.readJson(path.join(root, 'assets/audio/sfx/cartoon/manifest.json')).items[0].duration_s, 1);
  });

  test('find needs a built index, then prints tab rows or JSON', () => {
    seedValidProject();
    let r = io();
    assert.equal(main(['find', '--root', root], r.io), 1);
    assert.match(r.err[0], /No index yet/);
    main(['build', '--root', root], io().io);
    r = io();
    assert.equal(main(['find', '--root', root, '--kind', 'sfx'], r.io), 0);
    assert.equal(r.out.length, 2);
    assert.match(r.out[0], /^sfx\.cartoon\.boing-01\tapproved\tassets\/audio\/sfx\/cartoon\/boing\.wav\tBoing$/);
    assert.match(r.out[1], /code\/synth\.js#Synth\.waves/);
    assert.equal(r.err[0], '2 match(es).');
    r = io();
    main(['find', '--root', root, '--tag', 'story:troy', '--json'], r.io);
    assert.equal(JSON.parse(r.out[0])[0].id, 'character.cast-lineup.troy-v1');
  });

  test('register adds new sprites of a sprites.json to its manifest, refresh fills and builds', () => {
    seedValidProject();
    write('assets/catalog/taxonomy.json', { ...TAXONOMY, kinds: { ...TAXONOMY.kinds, prop: { folder: 'art/props', categories: ['nature'] } } });
    const sp = 'assets/art/props/kit/sprites';
    write(`${sp}/gate.png`, 'g'); write(`${sp}/tree.png`, 't');
    write(`${sp}/sprites.json`, { schema: 'sprites/1', sprites: [{ name: 'gate', file: 'gate.png' }, { name: 'tree', file: 'tree.png' }, { name: 'blank', file: 'blank.png', empty: true }] });
    let r = io();
    assert.equal(main(['register', `${sp}/sprites.json`, '--root', root, '--kind', 'prop', '--category', 'nature', '--prefix', 'joseon-', '--story', 'axe', '--source', 'cc0', '--tag', 'story:axe', '--note', 'kit pieces'], r.io), 0);
    assert.match(r.out[0], /manifest\.json: 2 sprite\(s\) registered \(2 in total\)/);
    let m = lib.readJson(path.join(root, sp, 'manifest.json'));
    assert.deepEqual(m.defaults, { kind: 'prop', status: 'candidate', scope: 'story', source: 'cc0', tags: ['story:axe'], notes: 'kit pieces' });
    assert.deepEqual(m.items[0], { id: 'prop.nature.joseon-gate', category: 'nature', title: 'gate (paper piece)', file: 'gate.png', used_in: ['axe'], status: 'candidate' });
    write(`${sp}/door.png`, 'd');
    write(`${sp}/sprites.json`, { schema: 'sprites/1', sprites: [{ name: 'gate', file: 'gate.png' }, { name: 'door', file: 'door.png' }] });
    r = io();
    assert.equal(main(['register', `${sp}/sprites.json`, '--root', root, '--kind', 'prop', '--category', 'nature', '--status', 'approved'], r.io), 0);
    m = lib.readJson(path.join(root, sp, 'manifest.json'));
    assert.deepEqual(m.items.map((i) => [i.id, i.status, i.used_in]), [['prop.nature.joseon-gate', 'candidate', ['axe']], ['prop.nature.joseon-tree', 'candidate', ['axe']], ['prop.nature.door', 'approved', undefined]]);
    const sp2 = 'assets/art/characters/c/sprites';
    write(`${sp2}/hero.png`, 'h');
    write(`${sp2}/sprites.json`, { schema: 'sprites/1' });
    r = io();
    assert.equal(main(['register', `${sp2}/sprites.json`, '--root', root, '--kind', 'character', '--category', 'cast-lineup'], r.io), 0);
    assert.deepEqual(lib.readJson(path.join(root, sp2, 'manifest.json')).defaults, { kind: 'character', status: 'candidate', scope: 'shared', source: 'project-image-gen', tags: [] });
    r = io();
    assert.equal(main(['register', '--root', root, '--kind', 'prop'], r.io), 1);
    assert.match(r.err[0], /register needs/);
    r = io();
    assert.equal(main(['refresh', '--root', root], r.io), 0);
    assert.match(r.out.find((l) => l.startsWith('Filled')), /Filled 5 item/);
    assert.match(r.out.at(-1), /Built index of 6 item/); // 3 seeded + gate, tree, door
    write(`${sp2}/manifest.json`, { schema: lib.MANIFEST_SCHEMA, items: [{ id: 'bad' }] });
    r = io();
    assert.equal(main(['refresh', '--root', root], r.io), 1);
    assert.match(r.err.at(-1), /error\(s\)/);
  });

  test('help and unknown commands print usage', () => {
    let r = io();
    assert.equal(main(['help'], r.io), 0);
    assert.match(r.out[0], /Usage:/);
    r = io();
    assert.equal(main(['frobnicate'], r.io), 1);
    assert.match(r.out[0], /Usage:/);
  });

  test('runs as a script and sets the exit code', () => {
    const ok = spawnSync(process.execPath, [CLI, 'help'], { encoding: 'utf8' });
    assert.equal(ok.status, 0);
    assert.match(ok.stdout, /Usage:/);
    const bad = spawnSync(process.execPath, [CLI, 'find', '--root', root], { encoding: 'utf8' });
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /No index yet/);
  });
});
