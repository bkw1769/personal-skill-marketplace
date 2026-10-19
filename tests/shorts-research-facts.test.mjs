import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(ROOT, 'plugins/shortform-studio/skills/shorts-research/scripts/facts.mjs');
const F = await import(SCRIPT);
const { extractNumbers, sameNumber, blank, checkLedgers, screenItems, trace, cite, templates, parseArgs, main, SOURCES_SCHEMA, FACTS_SCHEMA, USAGE } = F;

const TODAY = '2026-10-19';
const src = (o = {}) => ({ id: 'molit', title: '하자 판정 현황', publisher: '국토교통부', url: 'https://example.go.kr/a', type: 'official', published: '2025-10', accessed: '2026-10-18', archive_url: 'https://web.archive.org/x', ...o });
const claim = (o = {}) => ({ id: 'c-rank', text: '결로 판정이 누수보다 두 배 많았다', numbers: [{ value: 2, say: '두 배' }], sources: [{ id: 'molit', locator: '표 3', excerpt: '결로' }], as_of: '2025', status: 'verified', ...o });
const ledgers = (s = [src()], c = [claim()]) => ({ sources: { schema: SOURCES_SCHEMA, sources: s }, facts: { schema: FACTS_SCHEMA, review: { by: 'ian', on: TODAY }, claims: c } });
const check = (s, c, opt = { today: TODAY }) => { const l = ledgers(s, c); return checkLedgers(l.sources, l.facts, opt); };
const io = () => { const out = [], err = []; return { out, err, io: { out: (s) => out.push(s), err: (s) => err.push(s) } }; };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'facts-'));
const write = (dir, rel, obj) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), typeof obj === 'string' ? obj : JSON.stringify(obj)); };

describe('extractNumbers', () => {
  const vals = (t) => extractNumbers(t).map((n) => n.value);
  test('digits, commas, decimals and units', () => {
    assert.deepEqual(vals('76cm 튜브가 68cm 강물을'), [76, 68]);
    assert.deepEqual(vals('하루 2,700만 톤, 15.5m, 0.01개, 42%'), [27000000, 15.5, 0.01, 42]);
    assert.deepEqual(vals('2천억 원, 3백 명, 5천만'), [2e11, 300, 5e7]);
    assert.deepEqual(vals('3·4호기'), [3, 4]);
  });
  test('compound Korean groups join; separate numbers do not', () => {
    assert.deepEqual(vals('1만 5천 개'), [15000]);
    assert.deepEqual(vals('2조 5,000억 사업'), [2.5e12]);
    assert.deepEqual(vals('1억 2천만 3천'), [120003000]);
    assert.deepEqual(vals('1만 2만'), [10000, 20000]);
    assert.deepEqual(vals('1만, 5천'), [10000, 5000]);
    assert.deepEqual(vals('30 40'), [30, 40]);
    assert.equal(extractNumbers('1만 5천 개')[0].raw, '1만 5천');
    assert.deepEqual(extractNumbers('68cm 강물, 30%, 1978년에, 3·4호기').map((n) => n.raw), ['68cm', '30%', '1978년에', '3', '4호기']);
  });
  test('native counts with a space, 절반, ordinals and words skipped', () => {
    assert.deepEqual(vals('두 배, 세 번, 열 개, 스무 채'), [2, 3, 10, 20]);
    assert.deepEqual(vals('주민 절반은'), [0.5]);
    assert.deepEqual(vals('세 번째 집, 세대 갈등, 두배, 한 집만, 가세 번'), []);
    assert.deepEqual(extractNumbers('6층 두 배').map((n) => n.index), [0, 3]);
  });
  test('sameNumber tolerates float noise only', () => {
    assert.ok(sameNumber(0.1 + 0.2, 0.3));
    assert.ok(!sameNumber(76, 68));
  });
  test('blank removes phrases and reports missing ones', () => {
    assert.deepEqual(blank('1층 두 배', ['1층', '세 번']), { text: '   두 배', missing: ['세 번'] });
  });
});

describe('checkLedgers', () => {
  test('a clean ledger has no findings', () => {
    assert.deepEqual(check(), { errors: [], warnings: [] });
  });
  test('defaults: today = now, maxAge = 3', () => {
    const l = ledgers();
    assert.deepEqual(checkLedgers(l.sources, l.facts).errors, []);
  });
  test('bad top level', () => {
    const r = checkLedgers(null, null, { today: TODAY });
    assert.deepEqual(r.errors, [`sources: schema must be "${SOURCES_SCHEMA}"`, `facts: schema must be "${FACTS_SCHEMA}"`]);
    const r2 = checkLedgers({ schema: SOURCES_SCHEMA }, { schema: FACTS_SCHEMA }, { today: TODAY });
    assert.deepEqual(r2.errors, ['sources: "sources" must be a list', 'facts: "claims" must be a list']);
  });
  test('source field errors', () => {
    const e = check([src({ id: 'Bad Id', title: '', publisher: ' ', url: 'ftp://x', type: 'blog', accessed: '2026-02-30', published: '2025/01', archive_url: 'nope' })], []).errors;
    assert.deepEqual(e, [
      'source Bad Id: id must be lower-case letters, digits and hyphens',
      'source Bad Id: title is required',
      'source Bad Id: publisher is required',
      'source Bad Id: url must be an http(s) address',
      `source Bad Id: type must be one of ${F.SOURCE_TYPES.join(', ')}`,
      'source Bad Id: accessed must be a YYYY-MM-DD date',
      'source Bad Id: published must be YYYY, YYYY-MM or YYYY-MM-DD',
      'source Bad Id: archive_url must be an http(s) address',
    ]);
    const e2 = check(['x', src({ id: undefined, accessed: undefined, published: 2025, url: undefined })], []).errors;
    assert.ok(e2.includes('source 0: must be an object'));
    assert.ok(e2.includes('source 1: id must be lower-case letters, digits and hyphens'));
    assert.ok(e2.includes('source 1: accessed must be a YYYY-MM-DD date'));
    assert.ok(e2.includes('source 1: published must be YYYY, YYYY-MM or YYYY-MM-DD'));
    assert.ok(e2.includes('source 1: url must be an http(s) address'));
    assert.ok(check([src({ accessed: '2026-13-01' })], [claim()]).errors.includes('source molit: accessed must be a YYYY-MM-DD date'));
  });
  test('source warnings and duplicates', () => {
    const r = check([src({ accessed: '2026-12-01', archive_url: undefined, published: undefined }), src(), src({ id: 'unused' })], [claim()]);
    assert.deepEqual(r.errors, ['source molit: duplicate id']);
    assert.deepEqual(r.warnings, [
      'source molit: accessed 2026-12-01 is after today (2026-10-19)',
      'source molit: no archive_url (pages change; save a web.archive.org copy)',
      'source unused: not cited by any claim',
    ]);
  });
  test('claim field errors', () => {
    const e = check(undefined, [7, claim({ id: 'C 1', text: '', status: 'maybe', numbers: 'x', sources: 'y', as_of: '25' })]).errors;
    assert.deepEqual(e, [
      'claim 0: must be an object',
      'claim C 1: id must be lower-case letters, digits and hyphens',
      'claim C 1: text is required',
      `claim C 1: status must be one of ${F.STATUSES.join(', ')}`,
      'claim C 1: numbers must be a list',
      'claim C 1: sources must be a list',
      'claim C 1: as_of must be YYYY, YYYY-MM or YYYY-MM-DD',
    ]);
    const e2 = check(undefined, [claim(), claim({ id: undefined, numbers: [{ value: 'x' }, null, { value: 2, say: '' }], sources: [null, { id: 'nope' }] })]).errors;
    assert.deepEqual(e2, [
      'claim 1: id must be lower-case letters, digits and hyphens',
      'claim 1: numbers[0].value must be a number',
      'claim 1: numbers[1].value must be a number',
      'claim 1: numbers[2].say must be text',
      'claim 1: sources[0].id is required',
      'claim 1: unknown source "nope"',
    ]);
    assert.deepEqual(check(undefined, [claim(), claim()]).errors, ['claim c-rank: duplicate id']);
    assert.deepEqual(check(undefined, [claim({ numbers: [{ value: Infinity }] })]).errors, ['claim c-rank: numbers[0].value must be a number']);
  });
  test('numbers must match the claim text', () => {
    const w = check(undefined, [claim({ text: '튜브 높이 76cm, 강물 68cm', numbers: [{ value: 76 }, { value: 9 }] })]).warnings;
    assert.deepEqual(w, ['claim c-rank: number 9 does not appear in its text', 'claim c-rank: "68cm" in the text is not listed in numbers']);
    assert.deepEqual(check(undefined, [claim({ numbers: undefined, as_of: undefined, text: '결로가 많다' })]).warnings, []);
    assert.deepEqual(check(undefined, [claim({ text: '' })]).warnings, []);
  });
  test('sources required, verified rule, encyclopedia, locator, excerpt', () => {
    assert.deepEqual(check(undefined, [claim({ sources: [] })]).errors, ['claim c-rank: needs at least one source']);
    assert.deepEqual(check(undefined, [claim({ sources: undefined, status: 'rejected' })]).errors, []);
    const news = (id, publisher) => src({ id, type: 'news', publisher });
    const twoSame = check([news('a', '한겨레'), news('b', '한겨레 ')], [claim({ sources: [{ id: 'a', locator: 'p' }, { id: 'b', locator: 'p' }] })]);
    assert.match(twoSame.errors[0], /"verified" needs one primary source/);
    assert.deepEqual(check([news('a', '한겨레'), news('b', '조선일보')], [claim({ sources: [{ id: 'a', locator: 'p' }, { id: 'b', locator: 'p' }] })]).errors, []);
    assert.deepEqual(check([news('a', '한겨레')], [claim({ status: 'single-source', sources: [{ id: 'a', locator: 'p' }] })]).errors, []);
    const wiki = check([src({ id: 'w', type: 'encyclopedia' }), src({ id: 'w2', type: 'encyclopedia', publisher: 'Britannica' })], [claim({ sources: [{ id: 'w' }, { id: 'w2', locator: 'x', excerpt: 'x'.repeat(301) }] })]);
    assert.match(wiki.errors[0], /"verified" needs/);
    assert.deepEqual(wiki.warnings, [
      'claim c-rank: source w has no locator (page, table, article or section)',
      'claim c-rank: excerpt from w2 is longer than 300 characters (quote only the line you need)',
      'claim c-rank: only encyclopedia sources; find the source they cite',
    ]);
  });
  test('as_of and stale figures', () => {
    assert.deepEqual(check(undefined, [claim({ as_of: undefined })]).warnings, ['claim c-rank: has numbers but no as_of (the year the figure describes)']);
    assert.match(check(undefined, [claim({ as_of: '2020' })]).warnings[0], /from 2020, more than 3 years old/);
    assert.deepEqual(check(undefined, [claim({ as_of: '2020', historical: true })]).warnings, []);
    assert.deepEqual(check(undefined, [claim({ as_of: '2020' })], { today: TODAY, maxAge: 10 }).warnings, []);
  });
});

describe('screenItems and trace', () => {
  const facts = () => ledgers(undefined, [
    claim(),
    claim({ id: 'c-tube', text: '76cm 튜브가 68cm 강물을 버텼다', numbers: [{ value: 76 }, { value: 68 }] }),
    claim({ id: 'c-one', status: 'single-source', text: '1978년 시작', numbers: [{ value: 1978 }] }),
    claim({ id: 'c-bad', status: 'disputed' }),
  ]).facts;

  test('screenItems gathers captions, bubbles, overlays, title and description', () => {
    const items = screenItems({ captions: [{ start: 1, text: 'a', claims: ['x'] }, null, { text: '' }], bubbles: 'no', overlays: [{ label: '수압' }] }, { title: ['줄1', '', '줄2'], description: ['d1', 'd2'], title_claims: ['t'], not_facts: ['n'] });
    assert.deepEqual(items, [
      { where: 'caption 0 @1s', text: 'a', claims: ['x'], notFacts: undefined },
      { where: 'overlay 0', text: '수압', claims: undefined, notFacts: undefined },
      { where: 'publish title', text: '줄1 / 줄2', claims: ['t'], notFacts: ['n'] },
      { where: 'publish description', text: 'd1\nd2', claims: '*', notFacts: ['n'] },
    ]);
    assert.deepEqual(screenItems(null, { title: '제목', description: 'd' }).map((i) => i.text), ['제목', 'd']);
    assert.deepEqual(screenItems(null, { title: '' }), []);
    assert.deepEqual(screenItems(null, 'x'), []);
  });

  test('clean trace records claim use in order', () => {
    const sb = { captions: [
      { start: 0, text: '76cm 튜브가', claims: ['c-tube'] },
      { start: 1, text: '68cm 강물을 버텼습니다', claims: ['c-tube'] },
      { start: 2, text: '결로가 두 배', claims: ['c-rank'] },
      { start: 3, text: '1층 거실', not_facts: ['1층'] },
    ], overlays: [{ start: 4, kind: 'number', text: '76cm', claims: ['c-tube'] }] };
    const pub = { title: ['홍수를 막은 벽', '76cm 튜브가 68cm 강물을 버텼습니다'], title_claims: ['c-tube'], description: ['결로가 누수보다 두 배'] };
    assert.deepEqual(trace(facts(), sb, pub), { errors: [], warnings: [], used: ['c-tube', 'c-rank'] });
  });

  test('unsourced, wrong-claim, unknown, blocked and single-source numbers', () => {
    const long = '이 문장은 마흔 글자를 넘어서 잘려야 하는 아주 긴 자막입니다 그래서 끝에 99m';
    const sb = { captions: [
      { start: 0, text: '30% 줄었다' },
      { start: 1, text: '76cm와 99m', claims: ['c-tube'] },
      { start: 2, text: '없는 주장', claims: ['c-none'] },
      { start: 3, text: '논란', claims: ['c-bad'] },
      { start: 4, text: '1978년', claims: ['c-one'] },
      { start: 5, text: '1978년 다시', claims: ['c-one'] },
      { start: 6, text: long, claims: ['c-tube'] },
      { start: 7, text: '틀린 목록', claims: 'c-tube' },
      { start: 8, text: '1층', not_facts: '1층' },
      { start: 9, text: '2층', not_facts: ['3층'] },
    ] };
    const r = trace(facts(), sb, { description: '1978년, 5배', description_claims: ['c-rank'] });
    assert.deepEqual(r.errors, [
      'caption 0 @0s "30% 줄었다": "30%" has no claim; add the claim id to "claims" or the phrase to "not_facts"',
      'caption 1 @1s "76cm와 99m": "99m" is not a number of its claims (c-tube)',
      'caption 2 @2s: unknown claim "c-none"',
      'caption 3 @3s: claim c-bad is disputed and must not be used',
      `caption 6 @6s "${long.slice(0, 40)}...": "99m" is not a number of its claims (c-tube)`,
      'caption 7 @7s: claims must be a list of claim ids',
      'caption 8 @8s: not_facts must be a list of phrases',
      'caption 8 @8s "1층": "1층" has no claim; add the claim id to "claims" or the phrase to "not_facts"',
      'caption 9 @9s "2층": "2층" has no claim; add the claim id to "claims" or the phrase to "not_facts"',
      'publish description "1978년, 5배": "5배" is not a number of its claims (c-tube, c-one, c-rank)',
    ]);
    assert.deepEqual(r.warnings, ['claim c-one: used on screen with a single source', 'caption 9 @9s: not_facts phrase "3층" is not in the text']);
    assert.deepEqual(r.used, ['c-tube', 'c-bad', 'c-one', 'c-rank']);
  });

  test('description_claims must be a list; missing review and empty input warn', () => {
    const r = trace(facts(), null, { description: '설명', description_claims: 'c-rank' });
    assert.deepEqual(r.errors, ['publish: description_claims must be a list of claim ids']);
    const f = facts();
    delete f.review;
    assert.deepEqual(trace(f, null, null).warnings, ['nothing to trace: no captions, overlays, title or description found', 'facts: no review {by, on}; a person must read the ledger before publishing']);
    assert.ok(trace(null, null, null).warnings.length === 2);
    assert.ok(trace({ review: { by: 'x', on: '' }, claims: [null, { id: 'k', text: '6', numbers: 'no', status: 'verified' }] }, { captions: [{ text: '6개', claims: ['k'] }] }, null).errors[0].includes('"6개" is not a number'));
  });
});

describe('cite and templates', () => {
  test('cite lists sources in order of first use, ko and en', () => {
    const l = ledgers([src(), src({ id: 'news', type: 'news', publisher: '연합뉴스', title: '기사', published: undefined })], [
      claim(),
      claim({ id: 'c2', sources: [{ id: 'news' }, { id: 'molit' }, { id: 'gone' }] }),
      claim({ id: 'c3', status: 'rejected', sources: [{ id: 'news' }] }),
      claim({ id: 'c4', sources: undefined }),
    ]);
    assert.equal(cite(l.sources, l.facts, ['c2', 'missing']), '출처\n- 연합뉴스, 「기사」 (2026-10-18) https://example.go.kr/a\n- 국토교통부, 「하자 판정 현황」 (2025-10) https://example.go.kr/a');
    assert.equal(cite(l.sources, l.facts, null, { lang: 'en' }), 'Sources\n- 국토교통부, "하자 판정 현황" (2025-10) https://example.go.kr/a\n- 연합뉴스, "기사" (2026-10-18) https://example.go.kr/a');
    assert.equal(cite({}, {}, null), '출처');
  });
  test('templates are valid empty ledgers', () => {
    const t = templates();
    assert.deepEqual(checkLedgers(t.sources, t.facts, { today: TODAY }), { errors: [], warnings: [] });
  });
});

describe('cli', () => {
  test('parseArgs', () => {
    assert.deepEqual(parseArgs(['trace', 'd', '--lang', 'en']), { cmd: 'trace', dir: 'd', opts: { lang: 'en' } });
    assert.equal(parseArgs(['trace', '--out']).bad, '--out needs a value');
    assert.equal(parseArgs(['trace', '--out', '--lang']).bad, '--out needs a value');
  });
  test('usage and option errors', () => {
    for (const [argv, msg] of [[[], USAGE], [['nope', 'd'], USAGE], [['check'], USAGE], [['check', 'd', '--out'], `error: --out needs a value\n${USAGE}`],
      [['check', 'd', '--lang', 'fr'], 'error: --lang must be ko or en'], [['check', 'd', '--today', '2026-1-1'], 'error: --today must be YYYY-MM-DD'],
      [['check', 'd', '--max-age', 'x'], 'error: --max-age must be a number of years']]) {
      const o = io();
      assert.equal(main(argv, o.io), 2);
      assert.deepEqual(o.err, [msg]);
    }
  });
  test('init writes templates once', () => {
    const d = tmp();
    const o = io();
    assert.equal(main(['init', d], o.io), 0);
    assert.match(o.out[0], /Wrote .*sources\.json and .*facts\.json/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(d, 'research/facts.json'), 'utf8')).schema, FACTS_SCHEMA);
    const o2 = io();
    assert.equal(main(['init', d], o2.io), 1);
    assert.match(o2.err[0], /already exists/);
  });
  test('check, trace, cite on an episode folder', () => {
    const d = tmp();
    const l = ledgers();
    write(d, 'research/sources.json', l.sources);
    write(d, 'research/facts.json', l.facts);
    let o = io();
    assert.equal(main(['check', d, '--today', TODAY], o.io), 0);
    assert.deepEqual(o.out, ['0 error(s), 0 warning(s); 1 sources, 1 claims.']);
    o = io();
    assert.equal(main(['trace', d, '--today', TODAY], o.io), 1);
    assert.deepEqual(o.err, ['error: nothing to trace: no storyboard.json, storyboard.estimate.json or publish.json']);
    o = io();
    assert.equal(main(['cite', d, '--today', TODAY], o.io), 0);
    assert.match(o.out[0], /^출처\n- 국토교통부/);

    write(d, 'storyboard.estimate.json', { captions: [{ start: 0, text: '두 배', claims: ['c-rank'] }] });
    o = io();
    assert.equal(main(['trace', d, '--today', TODAY, '--max-age', '5'], o.io), 0);
    assert.deepEqual(o.out, ['0 error(s), 0 warning(s); 1 sources, 1 claims, 1 used on screen.']);
    write(d, 'storyboard.json', { captions: [{ start: 0, text: '3배' }] });
    write(d, 'publish.json', { title: '제목' });
    o = io();
    assert.equal(main(['trace', d, '--today', TODAY], o.io), 1);
    assert.match(o.err[0], /^error: caption 0 @0s "3배"/);
    o = io();
    assert.equal(main(['cite', d, '--today', TODAY], o.io), 1);
    o = io();
    assert.equal(main(['check', d, '--today', TODAY], o.io), 0);
    const out = path.join(d, 'cite.txt');
    o = io();
    assert.equal(main(['cite', d, '--today', TODAY, '--storyboard', path.join(d, 'storyboard.estimate.json'), '--publish', path.join(d, 'publish.json'), '--lang', 'en', '--out', out], o.io), 0);
    assert.deepEqual(o.out, [`Wrote ${out}`]);
    assert.match(fs.readFileSync(out, 'utf8'), /^Sources\n- 국토교통부/);
  });
  test('bad files and non-list ledgers', () => {
    const d = tmp();
    let o = io();
    assert.equal(main(['check', d], o.io), 1);
    assert.match(o.err[0], /^error: ENOENT/);
    write(d, 'research/sources.json', { schema: SOURCES_SCHEMA });
    write(d, 'research/facts.json', { schema: FACTS_SCHEMA });
    o = io();
    assert.equal(main(['check', d], o.io), 1);
    assert.deepEqual(o.out, ['2 error(s), 0 warning(s); 0 sources, 0 claims.']);
    write(d, 'research/facts.json', '{bad');
    o = io();
    assert.equal(main(['check', d], o.io), 1);
    assert.match(o.err[0], /JSON/);
  });
  test('runs as a script', () => {
    const r = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /usage: facts\.mjs/);
    const d = tmp();
    const ok = spawnSync(process.execPath, [SCRIPT, 'init', d], { encoding: 'utf8' });
    assert.equal(ok.status, 0);
    assert.match(ok.stdout, /^Wrote /);
  });
  test('warnings are printed but do not fail', () => {
    const d = tmp();
    const l = ledgers([src({ archive_url: undefined })]);
    write(d, 'research/sources.json', l.sources);
    write(d, 'research/facts.json', l.facts);
    const o = io();
    assert.equal(main(['check', d, '--today', TODAY], o.io), 0);
    assert.deepEqual(o.err, ['warning: source molit: no archive_url (pages change; save a web.archive.org copy)']);
  });
});
