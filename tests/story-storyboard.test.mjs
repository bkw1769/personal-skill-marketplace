import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILL = path.join(ROOT, 'plugins/fairytale-studio/skills/story-storyboard');
const SCRIPT = path.join(SKILL, 'scripts/storyboard.mjs');
const { validate, render, main, readChars, fmt, bandFor, SCHEMA, AUDIENCE, DEFAULT_AUDIENCE } = await import(SCRIPT);

const base = () => ({
  schema: SCHEMA,
  title: 'T',
  duration: 20,
  cast: [{ id: 'girl', name: '소녀' }, { id: 'ody' }],
  scenes: [
    { id: 'a', start: 0, end: 10, title: '하나', location: '숲', action: 'walks', characters: ['girl'], music: { mood: 'calm', tempo: 80, instruments: ['harp'] } },
    { id: 'b', start: 10, end: 20, characters: ['ody'] },
  ],
  captions: [{ start: 1, end: 5, text: '안녕하세요' }],
  bubbles: [{ start: 12, end: 15, speaker: 'girl', text: '좋아!' }],
  cues: [{ t: 2, sound: 'boing' }, { t: 2.5, sound: 'pop' }, { t: 12, sound: 'boing' }],
});
// The 20 s fixture is far below every episode-length band; those warnings are tested separately.
const run = (patch, opt) => {
  const r = validate({ ...base(), ...patch }, opt);
  return { ...r, warnings: r.warnings.filter((w) => !w.startsWith('duration ')) };
};
const io = () => { const out = [], err = []; return { out, err, io: { out: (s) => out.push(s), err: (s) => err.push(s) } }; };

describe('helpers', () => {
  test('readChars ignores whitespace; fmt is m:ss.s', () => {
    assert.equal(readChars(' 가 나\n다 '), 3);
    assert.equal(fmt(0), '0:00.0');
    assert.equal(fmt(67.3), '1:07.3');
  });
});

describe('validate', () => {
  test('a clean storyboard has no findings', () => {
    assert.deepEqual(run({}), { errors: [], warnings: [], audience: '6-8' });
  });

  test('header errors', () => {
    const r = validate({});
    assert.ok(r.errors.includes(`schema must be "${SCHEMA}"`));
    assert.ok(r.errors.includes('title is required'));
    assert.ok(r.errors.includes('duration must be a positive number of seconds'));
    assert.ok(r.errors.includes('at least one scene is required'));
    assert.ok(run({ duration: '20' }).errors.some((e) => /duration/.test(e)));
    assert.ok(run({ duration: 0 }).errors.some((e) => /duration/.test(e)));
  });

  test('scene tiling: ids, first start, gaps, overlaps, last end, span', () => {
    const e = (scenes, d = 20) => run({ scenes, duration: d }).errors.join('\n');
    assert.match(e([{ start: 0, end: 20 }]), /scene 0: id is required/);
    assert.match(e([{ id: 'a', start: 0, end: 10 }, { id: 'a', start: 10, end: 20 }]), /scene a: duplicate id/);
    assert.match(e([{ id: 'a', start: 1, end: 20 }]), /first scene must start at 0:00.0/);
    assert.match(e([{ id: 'a', start: 0, end: 9 }, { id: 'b', start: 10, end: 20 }]), /scene b: gap of 1.00s after a/);
    assert.match(e([{ id: 'a', start: 0, end: 11 }, { id: 'b', start: 10, end: 20 }]), /scene b: overlaps a by 1.00s/);
    assert.match(e([{ id: 'a', start: 0, end: 18 }]), /last scene ends at 0:18.0 but duration is 0:20.0/);
    assert.match(e([{ id: 'a', start: 5, end: 5 }]), /scene a: start must be a number below end/);
    assert.match(e([{ id: 'a', start: 0, end: 'x' }]), /start must be a number below end/);
    assert.match(e([{ id: 'a', start: 0, end: 25 }]), /0:00.0-0:25.0 is outside 0-0:20.0/);
    assert.match(e([{ id: 'a', start: -1, end: 20 }]), /is outside/);
    assert.equal(e([{ id: 'a', start: 0, end: 'x' }, { id: 'b', start: 10, end: 20 }]).includes('gap'), false);
    assert.match(e([{ id: 'a', start: 0, end: 20, characters: ['ghost'] }]), /character "ghost" is not in cast/);
    assert.equal(run({ cast: undefined, scenes: [{ id: 'a', start: 0, end: 20, characters: ['anyone'] }], bubbles: [] }).errors.length, 0);
  });

  test('captions: span, text, overlap, reading speed and lines', () => {
    const r = (captions, opt) => run({ captions }, opt);
    assert.match(r([{ start: 3, end: 2, text: 'x' }]).errors[0], /caption 1 \(0:03.0\): start must be a number below end/);
    assert.match(r([{ end: 2, text: 'x' }]).errors[0], /caption 1 \(0:00.0\)/);
    assert.match(r([{ start: 1, end: 2, text: '  ' }]).errors[0], /text is required/);
    assert.match(r([{ start: 1, end: 2 }]).errors[0], /text is required/);
    assert.match(r([{ start: 1, end: 5, text: 'a' }, { start: 4, end: 6, text: 'b' }]).errors[0], /caption 2 \(0:04.0\): overlaps the previous caption/);
    const fast = r([{ start: 1, end: 2, text: '가나다라마바사아자차' }]);
    assert.deepEqual(fast.errors, []);
    assert.match(fast.warnings[0], /10 chars in 1.0s reads at 10.0\/s; give it 2.0s or shorten it/);
    assert.equal(r([{ start: 1, end: 2, text: '가나다라마바사아자차' }], { maxCps: 12 }).warnings.length, 0);
    assert.match(r([{ start: 0, end: 10, text: 'a\nb\nc' }]).warnings[0], /3 lines \(max 2\)/);
    assert.equal(r([{ start: 0, end: 10, text: 'a\nb\nc' }], { maxLines: 3 }).warnings.length, 0);
  });

  test('bubbles need a known speaker', () => {
    const r = (bubbles) => run({ bubbles }).errors.join('\n');
    assert.match(r([{ start: 1, end: 3, text: 'hi' }]), /bubble 1 \(0:01.0\): speaker is required/);
    assert.match(r([{ start: 1, end: 3, text: 'hi', speaker: 'zed' }]), /speaker "zed" is not in cast/);
    assert.match(r([{ start: 3, end: 1, text: 'hi', speaker: 'girl' }]), /start must be a number below end/);
    assert.match(r([{ end: 1, text: 'hi', speaker: 'girl' }]), /bubble 1 \(0:00.0\)/);
  });

  test('cues need a time in range and a sound', () => {
    const r = (cues) => run({ cues }).errors.join('\n');
    assert.match(r([{ t: -1, sound: 'x' }]), /cue 1: t must be within 0-0:20.0/);
    assert.match(r([{ t: 21, sound: 'x' }]), /cue 1: t must be within/);
    assert.match(r([{ sound: 'x' }]), /cue 1: t must be within/);
    assert.match(r([{ t: 1 }]), /cue 1: sound is required/);
  });

  test('the bundled Troy example validates with exactly one reading-speed warning', () => {
    const sb = JSON.parse(fs.readFileSync(path.join(SKILL, 'references/example-troy-storyboard.json'), 'utf8'));
    const r = validate(sb);
    assert.deepEqual(r.errors, []);
    assert.equal(r.audience, '6-8');                  // audience_age "6-10" -> 6-8 band
    assert.equal(r.warnings.length, 9);               // 3:00 is short for 6-8, and 8 captions read faster than 5/s
  });
});

describe('audience bands', () => {
  test('bandFor: explicit audience, audience_age lower bound, default', () => {
    assert.equal(DEFAULT_AUDIENCE, '6-8');
    assert.deepEqual(Object.keys(AUDIENCE), ['3-5', '6-8', '9-10']);
    assert.equal(bandFor({ audience: '9-10', audience_age: '3-4' }), '9-10');
    assert.equal(bandFor({ audience: 'toddlers', audience_age: '4-6' }), '3-5');
    assert.equal(bandFor({ audience_age: '6-10' }), '6-8');
    assert.equal(bandFor({ audience_age: '9-12' }), '9-10');
    assert.equal(bandFor({ audience_age: 'all ages' }), '6-8');
    assert.equal(bandFor({}), '6-8');
  });

  test('reading speed limit follows the band unless maxCps is given', () => {
    const cap = [{ start: 1, end: 3, text: '가나다라마바사아자차' }];   // 5 chars/s
    const w = (patch, opt) => run({ captions: cap, ...patch }, opt).warnings.length;
    assert.equal(w({ audience: '3-5' }), 1);
    assert.equal(w({ audience: '6-8' }), 0);
    assert.equal(w({ audience: '3-5' }, { maxCps: 6 }), 0);
    assert.equal(w({}, { audience: '3-5' }), 1);
  });

  test('episode length outside the band range is a warning; unknown --audience is an error', () => {
    const scenes = (d) => [{ id: 'a', start: 0, end: d }];
    const dur = (d, audience) => validate({ schema: SCHEMA, title: 'T', duration: d, scenes: scenes(d), audience }).warnings.filter((x) => x.startsWith('duration '));
    assert.match(dur(100, '3-5')[0], /duration 1:40.0 is outside the 만 3~5세 single-episode range 3:00.0-7:00.0/);
    assert.deepEqual(dur(300, '3-5'), []);
    assert.match(dur(800, '6-8')[0], /6:00.0-12:00.0/);
    assert.deepEqual(dur(800, '9-10'), []);
    const bad = validate({ schema: SCHEMA, title: 'T', duration: 300, scenes: scenes(300) }, { audience: 'baby' });
    assert.match(bad.errors[0], /unknown audience "baby" \(use 3-5, 6-8, 9-10\)/);
    assert.equal(bad.audience, '6-8');
  });

  test('scenes shorter than the band minimum warn, except the closing scene', () => {
    const sb = { schema: SCHEMA, title: 'T', duration: 240, audience: '3-5', scenes: [
      { id: 'a', start: 0, end: 6 }, { id: 'b', start: 6, end: 236 }, { id: 'end', start: 236, end: 240 },
    ] };
    const w = validate(sb).warnings;
    assert.equal(w.length, 1);
    assert.match(w[0], /scene a: 6.0s is short for 만 3~5세 \(min 8s; do not cut mid-sentence\)/);
    assert.equal(validate({ ...sb, audience: '6-8' }).warnings.filter((x) => x.startsWith('scene')).length, 0);
  });
});

describe('render', () => {
  test('cast, scenes with words and sounds, notes', () => {
    const md = render({ ...base(), audience_age: '6-10', notes: { fact_checks: ['fixed a name'] } });
    assert.match(md, /^# T\n\nDuration: 0:20.0 · Audience: 만 6~8세 \(6-10\)\n/);
    assert.match(md, /\| girl \| 소녀 \|  \|/);
    assert.match(md, /\| ody \|  \|  \|/);
    assert.match(md, /\| 1 \| 0:00.0-0:10.0 \| \*\*하나\*\* \(숲\) \| walks \| 안녕하세요 \| music: calm 80 bpm harp<br>2 cues \(boing, pop\) \|/);
    assert.match(md, /\| 2 \| 0:10.0-0:20.0 \| \*\*b\*\*  \|  \| 소녀: "좋아!" \| 1 cues \(boing\) \|/);
    assert.match(md, /- fact_checks: fixed a name/);
  });
  test('minimal storyboard without cast, captions, bubbles, cues or notes', () => {
    const md = render({ title: 'M', duration: 5, scenes: [{ id: 'x', start: 0, end: 5, music: { mood: 'sad' } }] });
    assert.doesNotMatch(md, /## Cast/);
    assert.match(md, /\| 1 \| 0:00.0-0:05.0 \| \*\*x\*\*  \|  \|  \| music: sad \|/);
    assert.match(render({ title: 'E', duration: 1 }), /## Scenes/);
    assert.match(render({ title: 'S', duration: 5, cast: [{ id: 'q', name: 'Q' }], scenes: [{ id: 'x', start: 0, end: 5 }], bubbles: [{ start: 1, end: 2, speaker: 'zz', text: 'hey' }] }), /zz: "hey"/);
  });
});

describe('cli', () => {
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sb-'));
  test('validate returns 0 for clean, 1 for errors, prints summary and findings', () => {
    const d = tmp();
    fs.writeFileSync(path.join(d, 'ok.json'), JSON.stringify(base()));
    let r = io();
    assert.equal(main(['validate', path.join(d, 'ok.json')], r.io), 0);
    assert.equal(r.out[0], '0 error(s), 1 warning(s) for 만 6~8세; 2 scenes, 1 captions, 1 bubbles, 3 cues.');
    fs.writeFileSync(path.join(d, 'warn.json'), JSON.stringify({ ...base(), captions: [{ start: 1, end: 2, text: '가나다라마바사아' }] }));
    r = io();
    assert.equal(main(['validate', path.join(d, 'warn.json'), '--max-cps', '7'], r.io), 0);
    assert.match(r.err[0], /^warning: /);
    fs.writeFileSync(path.join(d, 'bad.json'), JSON.stringify({ title: 'x' }));
    r = io();
    assert.equal(main(['validate', path.join(d, 'bad.json')], r.io), 1);
    assert.match(r.err[0], /^error: /);
    assert.match(r.out[0], /0 scenes, 0 captions, 0 bubbles, 0 cues/);
  });
  test('render writes a file or prints; refuses invalid input', () => {
    const d = tmp();
    fs.writeFileSync(path.join(d, 'ok.json'), JSON.stringify(base()));
    let r = io();
    assert.equal(main(['render', path.join(d, 'ok.json'), '--out', path.join(d, 'sb.md')], r.io), 0);
    assert.match(fs.readFileSync(path.join(d, 'sb.md'), 'utf8'), /^# T/);
    r = io();
    assert.equal(main(['render', path.join(d, 'ok.json')], r.io), 0);
    assert.match(r.out[0], /^# T/);
    fs.writeFileSync(path.join(d, 'bad.json'), '{}');
    assert.equal(main(['render', path.join(d, 'bad.json')], io().io), 1);
  });
  test('usage and unreadable files', () => {
    let r = io();
    assert.equal(main([], r.io), 1);
    assert.match(r.err[0], /^Usage/);
    assert.equal(main(['lint', 'x.json'], io().io), 1);
    r = io();
    assert.equal(main(['validate', '/nonexistent/sb.json'], r.io), 1);
    assert.match(r.err[0], /cannot read/);
  });
  test('runs as a script', () => {
    const res = spawnSync(process.execPath, [SCRIPT, 'validate', path.join(SKILL, 'references/example-troy-storyboard.json')], { encoding: 'utf8' });
    assert.equal(res.status, 0);
    assert.match(res.stdout, /0 error\(s\), 9 warning\(s\) for 만 6~8세/);
    const young = spawnSync(process.execPath, [SCRIPT, 'validate', path.join(SKILL, 'references/example-troy-storyboard.json'), '--audience', '3-5'], { encoding: 'utf8' });
    assert.match(young.stdout, /for 만 3~5세/);
  });
});
