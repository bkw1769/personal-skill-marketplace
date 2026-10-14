import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(ROOT, 'plugins/fairytale-studio/skills/storybook-narration/scripts/narration-lines.mjs');
const m = await import(SCRIPT);

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'narration-'));
const io = () => { const out = [], err = []; return { out, err, io: { out: (s) => out.push(s), err: (s) => err.push(s) } }; };

describe('sentences and chunk', () => {
  test('splits at sentence ends and keeps closing quotes', () => {
    assert.deepEqual(m.sentences('  하나요.  "둘이에요!"  셋?\n넷… 다섯~ 여섯'), ['하나요.', '"둘이에요!"', '셋?', '넷…', '다섯~', '여섯']);
    assert.deepEqual(m.sentences(''), []);
  });
  test('one sentence per line, merging short ones within max', () => {
    assert.deepEqual(m.chunk(['aaaaaa.', 'bbbbbb.', 'cccccccccc.'], 20, 5), ['aaaaaa.', 'bbbbbb.', 'cccccccccc.']);
    assert.deepEqual(m.chunk(['aaaaaa.', 'b.', 'cccccc.'], 20, 5), ['aaaaaa. b.', 'cccccc.']);
    assert.deepEqual(m.chunk(['a.', 'bbbbbb.'], 20, 5), ['a. bbbbbb.']);
    assert.deepEqual(m.chunk(['aaaaaaaaaa.', 'b.'], 11, 5), ['aaaaaaaaaa.', 'b.']);
    assert.deepEqual(m.chunk([], 9, 5), []);
  });
  test('stripQuotes removes dialogue quotes but keeps apostrophes', () => {
    assert.equal(m.stripQuotes('"나무꾼님, 숨겨 주세요!" 사슴이 말했어요.'), '나무꾼님, 숨겨 주세요! 사슴이 말했어요.');
    assert.equal(m.stripQuotes("“Don't go,” said the fox. 'Fine.'"), "Don't go, said the fox. Fine.");
    assert.equal(m.stripQuotes('「안녕」'), '안녕');
  });
});

describe('parseScript', () => {
  test('tags, continuation, paragraphs and comments', () => {
    const src = '# c\n첫 줄.\n이어서.\n\n[fox] 안녕!\n[fox]\n둘째.\n[narrator] 끝.\r\n';
    assert.deepEqual(m.parseScript(src), [
      { speaker: 'narrator', text: '첫 줄. 이어서.' },
      { speaker: 'fox', text: '안녕!' },
      { speaker: 'fox', text: '둘째.' },
      { speaker: 'narrator', text: '끝.' },
    ]);
  });
});

describe('buildLines', () => {
  test('ids, voices and pauses', () => {
    const paras = [
      { speaker: 'narrator', text: '하나. 둘.' },
      { speaker: 'narrator', text: '셋.' },
      { speaker: 'fox', text: '넷!' },
    ];
    const { lines, errors } = m.buildLines(paras, { lang: 'ko', voices: { narrator: 'n-ko', fox: 'f-ko' }, prefix: 's01', maxChars: 5 });
    assert.deepEqual(errors, []);
    assert.deepEqual(lines.map((l) => [l.id, l.voice, l.text, l.pause_after]), [
      ['s01-001', 'n-ko', '하나.', m.PAUSES.sentence],
      ['s01-002', 'n-ko', '둘.', m.PAUSES.paragraph],
      ['s01-003', 'n-ko', '셋.', m.PAUSES.speaker],
      ['s01-004', 'f-ko', '넷!', m.PAUSES.paragraph],
    ]);
  });
  test('warns when quoted dialogue is mixed into narration', () => {
    assert.equal(m.mixedDialogue('사슴이 뛰어왔어요. "숨겨 주세요!"'), true);
    assert.equal(m.mixedDialogue('"숨겨 주세요!"'), false);
    assert.equal(m.mixedDialogue('「안녕」 하고 말했어요.'), true);
    assert.equal(m.mixedDialogue('그냥 내레이션이에요.'), false);
    const { warnings } = m.buildLines([{ speaker: 'narrator', text: '사슴이 뛰어왔어요. "숨겨 주세요!"' }], { lang: 'ko', voices: { narrator: 'n-ko' } });
    assert.match(warnings[0], /^paragraph 1 \[narrator\]: quoted dialogue mixed with narration/);
  });
  test('reports unmapped speakers once and defaults prefix/max', () => {
    const { lines, errors } = m.buildLines([{ speaker: 'owl', text: 'a.' }, { speaker: 'owl', text: 'b.' }, { speaker: 'n', text: 'c.' }], { lang: 'en', voices: { n: 'n-en' } });
    assert.deepEqual(errors, ['no --voice mapping for speaker "owl"']);
    assert.equal(lines[0].id, 'en-001');
  });
});

test('fromStoryboard orders captions and narrated bubbles by time', () => {
  const sb = {
    captions: [{ start: 5, text: '둘째\n줄' }, { start: 0, text: '첫째' }],
    bubbles: [{ start: 3, speaker: 'fox', text: '안녕' }, { start: 4, speaker: 'fox', text: '쉿', narrate: false }],
  };
  assert.deepEqual(m.fromStoryboard(sb), [
    { speaker: 'narrator', text: '첫째' },
    { speaker: 'fox', text: '안녕' },
    { speaker: 'narrator', text: '둘째 줄' },
  ]);
  assert.deepEqual(m.fromStoryboard({}), []);
});

describe('lint', () => {
  test('flags text the model reads badly', () => {
    const lines = [
      { id: 'a', voice: 'v', text: '나레이션: 사슴 3마리 & 🦌 (몰래)... "정말?!"' },
      { id: 'a', voice: 'w', text: 'T렉스가 나타났어요' },
      { id: 'b', voice: 'v', text: '  ' },
      { id: 'c', voice: 'v', text: '가'.repeat(10) + '.' },
    ];
    const { errors, warnings } = m.lint(lines, { lang: 'ko', maxChars: 5, knownVoices: new Set(['v']) });
    assert.deepEqual(errors, ['a: duplicate id', 'a: voice "w" is not frozen (design + pick it first)', 'b: empty text']);
    for (const word of ['digits', 'symbol', 'emoji', 'brackets', 'ellipsis', 'repeated', 'quotation marks', 'speaker label', 'Latin letters', 'no final punctuation', '11 chars > 5'])
      assert.ok(warnings.some((w) => w.includes(word)), word);
  });
  test('english checks and clean lines', () => {
    const { errors, warnings } = m.lint([{ id: 'e', voice: 'v', text: '여우 said hi to everyone today' }, { id: 'f', voice: 'v', text: 'All good, the little fox said.' }, { id: 'g', voice: 'v', text: 'Hi.' }], { lang: 'en' });
    assert.deepEqual(errors, []);
    assert.deepEqual(warnings, ['e: Hangul in English line', 'e: no final punctuation; end with . ! ? (helps the last word land)', 'g: very short line; lengthen it or merge with a neighbour (short inputs can loop or ramble)']);
  });
});

test('parseJsonl and frozenVoices', () => {
  assert.deepEqual(m.parseJsonl('{"a":1}\n\n{"a":2}\n'), [{ a: 1 }, { a: 2 }]);
  assert.throws(() => m.parseJsonl('{"a":1}\n{bad'), /line 2: invalid JSON/);
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'n-ko'));
  fs.writeFileSync(path.join(dir, 'n-ko', 'voice.json'), '{}');
  fs.mkdirSync(path.join(dir, 'draft-ko'));
  assert.deepEqual([...m.frozenVoices(dir)], ['n-ko']);
  assert.equal(m.frozenVoices(path.join(dir, 'missing')).size, 0);
});

describe('parseArgs', () => {
  test('options', () => {
    const o = m.parseArgs(['lint', 'f', '--lang', 'en', '--voice', 'a=b', '--out', 'o', '--prefix', 'p', '--voices-dir', 'd', '--max-chars', '9']);
    assert.deepEqual(o, { cmd: 'lint', file: 'f', lang: 'en', voices: { a: 'b' }, out: 'o', prefix: 'p', voicesDir: 'd', maxChars: 9 });
  });
  test('errors', () => {
    assert.throws(() => m.parseArgs(['lint', 'f', '--out']), /missing value for --out/);
    assert.throws(() => m.parseArgs(['lint', 'f', '--voice', 'a']), /speaker=voice-id/);
    assert.throws(() => m.parseArgs(['lint', 'f', '--bogus', '1']), /unknown option/);
    assert.throws(() => m.parseArgs(['lint', 'f', '--lang', 'ja']), /ko or en/);
  });
});

describe('main', () => {
  test('from-text writes lines and lint passes them', () => {
    const dir = tmp();
    const story = path.join(dir, 's.txt');
    const out = path.join(dir, 'out', 'tts', 'story-ko', 'lines.jsonl'); // folder does not exist yet
    fs.writeFileSync(story, '옛날 옛적에 마을이 있었어요.\n\n[fox] "안녕! 나는 숲속의 여우야."\n');
    const a = io();
    assert.equal(m.main(['from-text', story, '--voice', 'narrator=n-ko', '--voice', 'fox=f-ko', '--out', out], a.io), 0);
    assert.match(a.out[0], /Wrote/);
    const b = io();
    assert.equal(m.main(['lint', out], b.io), 0);
    assert.match(b.out.at(-1), /2 line\(s\), 0 error\(s\), 0 warning\(s\)/);
  });
  test('from-storyboard prints to stdout; unmapped speaker fails', () => {
    const dir = tmp();
    const sb = path.join(dir, 'sb.json');
    fs.writeFileSync(sb, JSON.stringify({ captions: [{ start: 0, text: 'Once upon a time, there was a fox.' }], bubbles: [{ start: 1, speaker: 'fox', text: 'Hi! I am the fox of the forest.' }] }));
    const a = io();
    assert.equal(m.main(['from-storyboard', sb, '--lang', 'en', '--voice', 'narrator=n-en', '--voice', 'fox=f-en'], a.io), 0);
    assert.match(a.out[0], /"voice":"n-en"/);
    const b = io();
    assert.equal(m.main(['from-storyboard', sb, '--lang', 'en', '--voice', 'narrator=n-en'], b.io), 1);
    assert.match(b.err[0], /no --voice mapping for speaker "fox"/);
  });
  test('from-text surfaces the mixed-dialogue warning', () => {
    const dir = tmp();
    const story = path.join(dir, 's.txt');
    fs.writeFileSync(story, '사슴이 헐레벌떡 뛰어왔어요. "나무꾼님, 저 좀 숨겨 주세요!"\n');
    const a = io();
    assert.equal(m.main(['from-text', story, '--voice', 'narrator=n-ko'], a.io), 0);
    assert.match(a.err[0], /quoted dialogue mixed with narration/);
    assert.match(a.out.at(-1), /1 warning\(s\)/);
  });
  test('lint with voices-dir reports unfrozen voices', () => {
    const dir = tmp();
    const f = path.join(dir, 'l.jsonl');
    fs.writeFileSync(f, '{"id":"a","voice":"ghost","text":"숲속에 사슴 3마리가 살았어요."}\n');
    const a = io();
    assert.equal(m.main(['lint', f, '--voices-dir', dir], a.io), 1);
    assert.match(a.err[0], /not frozen/);
    assert.match(a.err[1], /^warning: a: digits/);
  });
  test('usage and read errors', () => {
    const a = io();
    assert.equal(m.main(['nope', 'x'], a.io), 2);
    assert.equal(m.main(['lint'], a.io), 2);
    assert.equal(m.main(['lint', 'x', '--lang', 'zz'], a.io), 2);
    assert.equal(m.main(['lint', '/no/such/file'], a.io), 2);
    const dir = tmp();
    const bad = path.join(dir, 'bad.json');
    fs.writeFileSync(bad, '{bad');
    assert.equal(m.main(['from-storyboard', bad], a.io), 2);
    assert.ok(a.err.some((e) => e.startsWith('Usage')));
  });
  test('runs as a CLI', () => {
    const r = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /Usage/);
    const f = path.join(tmp(), 'l.jsonl');
    fs.writeFileSync(f, '{"id":"a","voice":"v","text":"안녕, 나는 숲속의 여우야."}\n');
    const ok = spawnSync(process.execPath, [SCRIPT, 'lint', f], { encoding: 'utf8' });
    assert.equal(ok.status, 0);
    assert.match(ok.stdout, /1 line\(s\)/);
  });
});
