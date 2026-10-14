import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILL = path.join(ROOT, 'plugins/fairytale-studio/skills/fairytale-art-prompts');
const SCRIPT = path.join(SKILL, 'scripts/assemble-prompts.mjs');
const { block, roleTable, loadModules, paperTone, assemble, main, SKILL_DIR } = await import(SCRIPT);

const SPEC = {
  title: 'The Golden Axe and the Silver Axe', subtitle: 'a Korean folktale', audience: '3-5',
  style: 'watercolor-ink', era: 'joseon', paper: '#f4efe2', anchor: 'golden-axe-cast-v1.png',
  sheets: [
    { kind: 'plate', name: 'plate-pond-day', location: 'mountain pond', time: 'day', sky: 'a clear sky', far: 'two slopes', ground: 'a green meadow', horizon: 56 },
    { kind: 'plate', name: 'plate-pond-mist', location: 'mountain pond', time: 'mist', sky: 'misty sky', far: 'slopes in mist', ground: 'veiled meadow', base: 'plate-pond-day', lower: 'Custom lower part.', extra: 'Magical and calm.' },
    { kind: 'kit', name: 'big-gate-dori', label: 'near: gate states', layer: 'near', arrange: 'in three rows', scale: 'one scale.', big: true, backing: true, allowHole: 'the one empty gateway opening of the gateway wall', refs: ['creature-4.jpg', 'nature-2.jpg'],
      pieces: [['wall-dori-closed', 'a wall with the gate closed'], ['wall-dori-gateway', 'the same wall with an empty gateway.']] },
    { kind: 'kit', name: 'kit-tree', pieces: [['woodcutter-tree-whole', 'a big pine']], backing: true },
    { kind: 'cut', name: 'cut-dori', who: 'Dori', identity: 'kind young woodcutter', refs: [['golden-axe-dori-poses-v1.png', 'Image {n} golden-axe-dori-poses-v1.png is the approved pose sheet.']],
      pieces: [['dori-walk', 'walking right'], ['dori-chop', 'chopping']] },
  ],
};

describe('module blocks', () => {
  test('block, roleTable and the real skill modules', () => {
    assert.equal(block('x\n## A\n```text\nhello\n```\n## B\n```text\nb\n```', '## A'), 'hello');
    assert.throws(() => block('x\n## A\ntext', '## B'), /heading "## B" not found/);
    assert.throws(() => block('x\n## A\nno fence\n## B\n```text\nb\n```', '## A'), /no text block under "## A"/);
    assert.deepEqual(roleTable('| `a.jpg` | role a | use |\n| `b.jpg` | role b | use |'), { 'a.jpg': 'role a', 'b.jpg': 'role b' });
    const mod = loadModules(SPEC);
    assert.match(mod.style, /^Translate exactly this handmade/);
    assert.match(mod.collage, /^Each element is its own/);
    assert.match(mod.backdrop, /^Backdrop: the whole sheet is one flat/);
    assert.match(mod.era, /^Setting: storybook Joseon-era Korea/);
    assert.match(mod.audience, /^Audience ages 3-5/);
    assert.match(mod.cutFinish, /^Each figure is drawn on its own piece/);
    assert.doesNotMatch(mod.styleNeg, /cut-paper collage/);
    assert.equal(mod.roles['nature.jpg'].startsWith('small landscape vignettes'), true);
    assert.equal(SKILL_DIR, SKILL);
    // A last section without a following heading, and a template file without a cut-out paragraph.
    assert.equal(block('x\n## Last\n```text\nend\n```', '## Last'), 'end');
    const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-'));
    fs.cpSync(path.join(SKILL, 'references'), path.join(copy, 'references'), { recursive: true });
    fs.writeFileSync(path.join(copy, 'references', 'sheet-templates.md'), '# no templates');
    assert.equal(loadModules(SPEC, copy).cutFinish, '');
  });

  test('audience bands: 6-8 by default, 9-10 has no prompt line, unknown bands fail', () => {
    assert.match(loadModules({ ...SPEC, audience: undefined }).audience, /^Audience ages 6-8/);
    assert.equal(loadModules({ ...SPEC, audience: '9-10' }).audience, '');
    assert.throws(() => loadModules({ ...SPEC, audience: '2' }), /unknown audience "2"/);
  });

  test('paperTone names one paper', () => {
    assert.equal(paperTone('visible off-white cold-press paper texture, close to #f4efe2', '#eeeeee'), 'visible warm cream cold-press paper texture, close to #eeeeee');
    assert.equal(paperTone('off-white cold-press paper texture'), 'off-white cold-press paper texture');
  });
});

describe('assemble', () => {
  const mod = loadModules(SPEC);
  test('plates, kits and cut sheets with module blocks, references and records', () => {
    const { items, texts } = assemble(SPEC, mod);
    assert.deepEqual(items.map((i) => [i.name, i.sheet]), [['plate-pond-day', 'plate'], ['plate-pond-mist', 'plate'], ['big-gate-dori', 'element-kit'], ['kit-tree', 'element-kit'], ['cut-dori', 'character-cutout']]);
    assert.deepEqual(items[0].refs, ['golden-axe-cast-v1.png', 'nature.jpg', 'nature-2.jpg']);
    assert.deepEqual(items[1].refs, ['golden-axe-cast-v1.png', 'nature.jpg', 'nature-2.jpg', '@plate-pond-day']);
    assert.match(texts['plate-pond-day'], /audience ages 3-5\. This is the far painted backdrop/);
    assert.match(texts['plate-pond-day'], /horizon sits at about 56 percent.*The lower 40 percent is a calm ground field/s);
    assert.match(texts['plate-pond-day'], /warm cream cold-press paper texture/);
    assert.match(texts['plate-pond-mist'], /Image 4 plate-pond-day\.png is the approved day plate/);
    assert.match(texts['plate-pond-mist'], /Custom lower part\. Balanced and unfocused.*Magical and calm\./s);
    assert.match(texts['big-gate-dori'], /exactly 2 separate pieces arranged in three rows/);
    assert.match(texts['big-gate-dori'], /drawn very large/);
    assert.match(texts['big-gate-dori'], /The only magenta inside any piece is the one empty gateway opening/);
    assert.match(texts['big-gate-dori'], /1 wall-dori-closed: a wall with the gate closed\.\n2 wall-dori-gateway: the same wall with an empty gateway\.\n/);
    assert.deepEqual(items[2].pieces, ['wall-dori-closed', 'wall-dori-gateway']);
    assert.equal(items[2].layer, 'near');
    assert.match(texts['kit-tree'], /exactly one single piece arranged in two rows of four/);
    assert.match(texts['kit-tree'], /No magenta and no holes anywhere inside a piece/);
    assert.deepEqual(items[3].refs, ['golden-axe-cast-v1.png', 'nature.jpg', 'creature-4.jpg']);
    assert.match(texts['cut-dori'], /character cut-out sheet for Dori/);
    assert.match(texts['cut-dori'], /Image 2 golden-axe-dori-poses-v1\.png is the approved pose sheet\./);
    assert.match(texts['cut-dori'], /STRICT CHARACTER IDENTITY/);
    assert.match(texts['cut-dori'], /Preserve face.*exactly: kind young woodcutter/);
    assert.doesNotMatch(texts['cut-dori'], /Architecture, when present/);
  });

  test('defaults without anchor, paper, subtitle or audience; custom land, palette, roles and safety', () => {
    const spec = { style: 'watercolor-ink', era: 'joseon', title: 'T', land: 'Custom land.', palette: 'Palette: red.', roles: { 'x.png': 'custom role' }, safety: 'Axes are tools.',
      sheets: [{ kind: 'plate', name: 'p', sky: 's', far: 'f', ground: 'g', refs: ['x.png'] }, { kind: 'kit', name: 'k', pieces: [['a', 'b']] }, { kind: 'kit', name: 'k2', layer: 'front', label: 'front set', pieces: [['a', 'b'], ['c', 'd']] },
        { kind: 'cut', name: 'c', who: 'W', identity: 'i', pieces: [['a', 'b']], arrange: 'in one row', framing: 'head and shoulders' }] };
    const { items, texts } = assemble(spec, loadModules(spec));
    assert.deepEqual(items[0].refs, ['x.png']);
    assert.match(texts.p, /^Use case.*"T", audience ages 6-8/);
    assert.match(texts.p, /Image 1 x\.png: custom role\./);
    assert.match(texts.p, /Custom land\./);
    assert.match(texts.p, /painted directly on cold-press watercolor paper/);
    assert.match(texts.p, /Palette: red\. Overall lighter/);
    assert.match(texts.k, /sheet \(near\)/);
    assert.match(texts.k2, /sheet \(front set\).*exactly 2 separate pieces/s);
    assert.equal(items[2].layer, 'front');
    assert.equal(items[1].scale_ref, '');
    assert.match(texts.c, /figures in one row.*head and shoulders/s);
    assert.match(texts.c, /Axes are tools\./);
  });

  test('errors: names, duplicates, unknown kinds and references, missing pieces or identity', () => {
    const run = (sheets) => () => assemble({ ...SPEC, sheets }, mod);
    assert.throws(run([{ kind: 'kit', name: 'Bad Name', pieces: [['a', 'b']] }]), /must be kebab-case/);
    assert.throws(run([{ kind: 'kit', pieces: [['a', 'b']] }]), /sheet name "undefined"/);
    assert.throws(run([{ kind: 'kit', name: 'a', pieces: [['a', 'b']] }, { kind: 'kit', name: 'a', pieces: [['a', 'b']] }]), /duplicate sheet name "a"/);
    assert.throws(run([{ kind: 'scene', name: 's' }]), /unknown kind "scene"/);
    assert.throws(run([{ kind: 'kit', name: 'k', refs: ['missing.jpg'], pieces: [['a', 'b']] }]), /no role sentence for reference "missing\.jpg"/);
    assert.throws(run([{ kind: 'kit', name: 'k', pieces: [] }]), /needs pieces/);
    assert.throws(run([{ kind: 'kit', name: 'k' }]), /needs pieces/);
    assert.throws(run([{ kind: 'cut', name: 'c', who: 'W', pieces: [['a', 'b']] }]), /needs the character's identity/);
    assert.deepEqual(assemble({ ...SPEC, sheets: undefined }, mod).items, []);
  });
});

describe('cli', () => {
  const io = () => { const out = [], err = []; return { out, err, io: { out: (s) => out.push(s), err: (s) => err.push(s) } }; };
  test('writes prompts and batch.json, merges re-runs, honours --only and --out', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'assemble-'));
    const specFile = path.join(d, 'art.json');
    fs.writeFileSync(specFile, JSON.stringify({ ...SPEC, out: 'sheets', refsDirs: ['refs'] }));
    let r = io();
    assert.equal(main([specFile], r.io), 0);
    assert.match(r.out[0], /Wrote 5 prompt\(s\)/);
    const batch = JSON.parse(fs.readFileSync(path.join(d, 'sheets', 'batch.json'), 'utf8'));
    assert.deepEqual(batch.refs_dirs, [path.join(d, 'refs'), path.join(d, 'sheets')]);
    assert.equal(batch.items.length, 5);
    assert.ok(fs.readFileSync(path.join(d, 'sheets', 'prompts', 'cut-dori.txt'), 'utf8').endsWith('around.\n'));
    fs.writeFileSync(path.join(d, 'sheets', 'prompts', 'kit-tree.txt'), 'old');
    r = io();
    assert.equal(main([specFile, '--only', 'cut-dori'], r.io), 0);
    assert.equal(fs.readFileSync(path.join(d, 'sheets', 'prompts', 'kit-tree.txt'), 'utf8'), 'old');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(d, 'sheets', 'batch.json'), 'utf8')).items.map((i) => i.name), ['plate-pond-day', 'plate-pond-mist', 'big-gate-dori', 'kit-tree', 'cut-dori']);
    r = io();
    assert.equal(main([specFile, '--out', 'elsewhere', '--only', 'kit-tree'], r.io), 0);
    assert.ok(fs.existsSync(path.join(d, 'elsewhere', 'prompts', 'kit-tree.txt')));
    fs.writeFileSync(path.join(d, 'bare.json'), JSON.stringify({ style: 'watercolor-ink', era: 'joseon', title: 'T', sheets: [] }));
    r = io();
    assert.equal(main([path.join(d, 'bare.json')], r.io), 0);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(d, 'batch.json'), 'utf8')), { refs_dirs: [d], items: [] });
  });
  test('usage and errors', () => {
    let r = io();
    assert.equal(main([], r.io), 1);
    assert.match(r.err[0], /^Usage/);
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'assemble-'));
    fs.writeFileSync(path.join(d, 'a.json'), JSON.stringify(SPEC));
    r = io();
    assert.equal(main([path.join(d, 'a.json'), '--only', 'nope'], r.io), 1);
    assert.match(r.err[0], /--only names not in the spec: nope/);
    r = io();
    assert.equal(main([path.join(d, 'missing.json')], r.io), 1);
    assert.match(r.err[0], /^error:/);
  });
  test('runs as a script', () => {
    const r = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
    assert.equal(r.status, 1);
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'assemble-'));
    fs.writeFileSync(path.join(d, 'a.json'), JSON.stringify({ ...SPEC, sheets: SPEC.sheets.slice(0, 1) }));
    const ok = spawnSync(process.execPath, [SCRIPT, path.join(d, 'a.json')], { encoding: 'utf8' });
    assert.equal(ok.status, 0);
  });
});
