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
const { extractNumbers, matchesValue, sameNumber, blank, checkLedgers, screenItems, overlayText, trace, cite, templates, parseArgs, main, SOURCES_SCHEMA, FACTS_SCHEMA, USAGE } = F;

const TODAY = '2026-10-19';
const NOARCH = 'source molit: no archive_url (pages change; save a web.archive.org copy, or record the failed attempt in archive_failed)';
const src = (o = {}) => ({ id: 'molit', title: '하자 판정 현황', publisher: '국토교통부', url: 'https://example.go.kr/a', type: 'official', published: '2025-10', accessed: '2026-10-18', archive_url: 'https://web.archive.org/x', ...o });
const claim = (o = {}) => ({ id: 'c-rank', text: '결로 판정이 누수보다 두 배 많았다', numbers: [{ value: 2, say: '두 배' }], sources: [{ id: 'molit', locator: '표 3', excerpt: '결로가 누수보다 두 배' }], as_of: '2025', status: 'verified', ...o });
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
    assert.deepEqual(extractNumbers('68cm 강물, 30%, 1978년에, 3·4호기').map((n) => n.raw), ['68cm', '30%', '1978년', '3', '4호기']);
  });
  test('native counts with a space, 절반, ordinals and words skipped', () => {
    assert.deepEqual(vals('두 배, 세 번, 열 개, 스무 채'), [2, 3, 10, 20]);
    assert.deepEqual(vals('주민 절반은'), [0.5]);
    assert.deepEqual(vals('세 번째 집, 세대 갈등, 두배, 한 집만, 가세 번'), []);
    assert.deepEqual(extractNumbers('6층 두 배').map((n) => n.index), [0, 3]);
  });
  test('small units join, minus signs, full-width digits and 할', () => {
    assert.deepEqual(vals('1천 2백 명, 3백 50'), [1200, 350]);
    assert.deepEqual(vals('-9mm, (-5도), −3, 3-4호기, 10-20%, A-5'), [-9, -5, -3, 3, 4, 10, 20, 5]);
    assert.deepEqual(vals('-1만 5천, 1만 -5천'), [-15000, 10000, -5000]);
    assert.deepEqual(vals('１９９２년 －５도 １,０００명'), [1992, -5, 1000]);
    assert.equal(extractNumbers('１９９２년에')[0].raw, '１９９２년');
    assert.deepEqual(vals('타율 3할, 9할 5, 30% 할인, 3할인'), [30, 90, 5, 30, 3]);
  });
  test('full dates are one number with parts; impossible dates are not', () => {
    const d = extractNumbers('1992.10.26 시행, 2026-10-06, 1992. 7. 25., 2026/1/2');
    assert.deepEqual(d.map((n) => [n.raw, n.value, n.parts]), [
      ['1992.10.26', 1992, [1992, 10, 26]], ['2026-10-06', 2026, [2026, 10, 6]], ['1992. 7. 25', 1992, [1992, 7, 25]], ['2026/1/2', 2026, [2026, 1, 2]],
    ]);
    assert.deepEqual(vals('2014.12 개정, 2026.13.01, 2026.00.10, 2026.01.00, 2026.01.32'), [2014.12, 2026.13, 2026, 2026.01, 2026.01]);
    assert.deepEqual(vals('2026-10.06'), [2026, 10.06]);
  });
  test('particles are trimmed from the unit shown', () => {
    assert.deepEqual(extractNumbers('1978년에서 2곳을 4층만을 3배로 5도 2이').map((n) => n.raw), ['1978년', '2곳', '4층', '3배', '5도', '2']);
  });
  test('matchesValue compares plain numbers and every part of a date', () => {
    const [date] = extractNumbers('1992.10.26');
    assert.ok(matchesValue(date, [26, 10, 1992]));
    assert.ok(!matchesValue(date, [1992, 10]));
    assert.ok(matchesValue({ value: 3 }, [1, 3]));
    assert.ok(!matchesValue({ value: 3 }, []));
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
      NOARCH,
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
    assert.deepEqual(w, ['claim c-rank: number 9 does not appear in its text', 'claim c-rank: "68cm" in the text is not listed in numbers', 'claim c-rank: not in any excerpt: 76, 9 (quote the line that gives each number)']);
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
      'claim c-rank: not in any excerpt: 2 (quote the line that gives each number)',
    ]);
  });
  test('every number must be in some excerpt (value, date part or say form)', () => {
    const ex = (excerpts, numbers, text = '1992년 10월 26일 3층') => check(undefined, [claim({ text, numbers, sources: excerpts.map((e) => ({ id: 'molit', locator: 'p', excerpt: e })) })]).warnings;
    const n = [{ value: 1992 }, { value: 10 }, { value: 26 }, { value: 3 }];
    assert.deepEqual(ex(['1992.10.26 시행', '3층 이상'], n), []);
    assert.deepEqual(ex(['3층 이상', undefined], n), ['claim c-rank: not in any excerpt: 1992, 10, 26 (quote the line that gives each number)']);
    assert.deepEqual(ex(['결로가 누수보다 두 배'], [{ value: 2, say: '두 배' }], '두 배'), []);
    assert.deepEqual(ex(['결로가 누수의 2배'], [{ value: 2, say: '두 배' }], '두 배'), []);
    assert.deepEqual(ex([undefined], n), [], 'no excerpt, nothing to compare');
    assert.deepEqual(check(undefined, [claim({ numbers: 'x', sources: [{ id: 'molit', locator: 'p', excerpt: '1' }] })]).warnings, [], 'bad numbers list');
  });
  test('archive_failed records a failed save; in_force is for laws and standards', () => {
    assert.deepEqual(check([src({ archive_url: undefined, archive_failed: '2026-10-19 web.archive.org HTTP 523' })], [claim()]), { errors: [], warnings: [] });
    assert.deepEqual(check([src({ archive_failed: '' })], [claim()]).errors, ['source molit: archive_failed must say when and how saving failed']);
    const law = (o) => src({ type: 'law', ...o });
    assert.deepEqual(check([law({ in_force: '2026-10-19' })], [claim()]), { errors: [], warnings: [] });
    assert.deepEqual(check([law({ in_force: '2026-1-1' })], [claim()]).errors, ['source molit: in_force must be the YYYY-MM-DD day you confirmed the text is still in force']);
    assert.deepEqual(check([law({ in_force: 7 })], [claim()]).errors, ['source molit: in_force must be the YYYY-MM-DD day you confirmed the text is still in force']);
    assert.deepEqual(check([src({ in_force: '2026-10-19' })], [claim()]).errors, ['source molit: in_force is only for law and standard sources']);
    assert.deepEqual(check([law({ in_force: '2026-12-01' })], [claim()]).warnings, ['source molit: in_force 2026-12-01 is after today (2026-10-19)']);
  });
  test('as_of and stale figures', () => {
    assert.deepEqual(check(undefined, [claim({ as_of: undefined })]).warnings, ['claim c-rank: has numbers but no as_of (the year the figure describes)']);
    assert.match(check(undefined, [claim({ as_of: '2020' })]).warnings[0], /from 2020, more than 3 years old/);
    assert.deepEqual(check(undefined, [claim({ as_of: '2020', historical: true })]).warnings, []);
    assert.deepEqual(check(undefined, [claim({ as_of: '2020' })], { today: TODAY, maxAge: 10 }).warnings, []);
  });
  test('a law or standard confirmed in force is not stale', () => {
    const cites = ['molit', 'std', 'news'].map((id) => ({ id, locator: 'p', excerpt: '두 배' }));
    const old = check([src({ type: 'law' }), src({ id: 'std', type: 'standard', in_force: '2026-10-01' }), src({ id: 'news', type: 'news', publisher: '연합뉴스' })], [claim({ as_of: '2020', sources: cites })]);
    assert.deepEqual(old, { errors: [], warnings: [] });
    assert.match(check([src({ type: 'law', in_force: '2021-01-01' })], [claim({ as_of: '2020' })]).warnings[0], /from 2020, more than 3 years old; .*"in_force" on its source/);
    assert.match(check([src({ type: 'law', in_force: 'bad' })], [claim({ as_of: '2020' })]).warnings[0], /more than 3 years old/);
    assert.match(check([src({ in_force: '2026-10-19' })], [claim({ as_of: '2020' })]).warnings[0], /more than 3 years old/, 'in_force on an official source does not count');
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
      { where: 'publish title', text: '줄1 / 줄2', claims: ['t'], notFacts: ['n'], shared: true },
      { where: 'publish description', text: 'd1\nd2', claims: '*', notFacts: ['n'], shared: true },
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

  test('overlayText reads every field an overlay draws', () => {
    assert.deepEqual(overlayText({ kind: 'timer', to: 27 }), ['27초']);
    assert.deepEqual(overlayText({ kind: 'timer', unit: '분' }), ['10분']);
    assert.deepEqual(overlayText({ kind: 'compare', items: [{ label: '그대로', value: 1 }, null, { label: '매일 교체', value: 2, text: '-87%' }] }), ['그대로', '매일 교체', '-87%']);
    assert.deepEqual(overlayText({ kind: 'compare', items: 'x' }), []);
    assert.deepEqual(overlayText({ kind: 'stages', title: '일 최저기온', rows: [{ name: '관심', text: '영하 5도 위' }, { name: '주의' }] }), ['일 최저기온', '관심', '영하 5도 위', '주의']);
    assert.deepEqual(overlayText({ kind: 'stages' }), []);
    assert.deepEqual(overlayText({ kind: 'number', text: '36개', sub: '점 6×6' }), ['36개', '점 6×6']);
    assert.deepEqual(overlayText({ kind: 'buckle', skin: '피부', flesh: '속살' }), ['피부', '속살']);
    assert.deepEqual(overlayText({ kind: 'label', label: '수압' }), ['수압']);
  });
  test('trace refuses an unsourced number in an overlay field it did not read before', () => {
    const facts = { claims: [{ id: 'c-87', text: '87% 적었다', numbers: [{ value: 87 }], sources: [{ id: 's', locator: 'p', excerpt: '87%' }], status: 'verified', as_of: '2026' }] };
    const sb = { overlays: [
      { start: 1, kind: 'compare', items: [{ label: '물', value: 1, text: '78%' }, { label: '얼음', value: 2 }], claims: ['c-87'] },
      { start: 2, kind: 'stages', rows: [{ name: '관심', text: '999도' }, { name: '주의', text: '87%' }], claims: ['c-87'] },
    ] };
    const r = trace(facts, sb, null);
    assert.deepEqual(r.errors.map((e) => e.replace(/ \(.*$/, '')), [
      'overlay 0 @1s "물 / 78% / 얼음": "78%" is not a number of its claims',
      'overlay 1 @2s "관심 / 999도 / 주의 / 87%": "999도" is not a number of its claims',
    ]);
  });
  test('screenItems reads captions nested in scenes and publish hashtags', () => {
    const items = screenItems({ scenes: [{ id: 's1', captions: [{ start: 2, text: '76cm', claims: ['c-tube'] }], overlays: [{ label: '2배' }] }, null, { bubbles: [{ text: '말' }] }] }, { hashtags: ['#1978년', '', '#건축'] });
    assert.deepEqual(items.map((i) => [i.where, i.text, i.claims]), [
      ['scene s1 caption 0 @2s', '76cm', ['c-tube']],
      ['scene s1 overlay 0', '2배', undefined],
      ['scene 2 bubble 0', '말', undefined],
      ['publish hashtags', '#1978년 #건축', '*'],
    ]);
    assert.deepEqual(screenItems({ scenes: 'x' }, { hashtags: '#쇼츠' }).map((i) => i.where), ['publish hashtags']);
  });

  test('nested captions and hashtags are traced; hashtags share the description claims', () => {
    const sb = { scenes: [{ id: 's1', captions: [{ start: 0, text: '76cm 튜브', claims: ['c-tube'] }, { start: 1, text: '99m' }] }] };
    const r = trace(facts(), sb, { hashtags: ['#76cm', '#두배', '#1978년', '#30년'], description_claims: ['c-one', 'c-none'], description: '1978년' });
    assert.deepEqual(r.errors, [
      'scene s1 caption 1 @1s "99m": "99m" has no claim; add the claim id to "claims" or the phrase to "not_facts"',
      'publish description: unknown claim "c-none"',
      'publish hashtags "#76cm #두배 #1978년 #30년": "30년" is not a number of its claims (c-tube, c-one)',
    ]);
    assert.deepEqual(r.used, ['c-tube', 'c-one']);
    assert.deepEqual(trace(facts(), null, { hashtags: '#1978년', description_claims: ['c-one'] }).errors, []);
  });

  test('dates, negatives and full-width digits on screen match claim numbers', () => {
    const f = ledgers(undefined, [claim({ id: 'c-date', text: '1992년 10월 26일 시행, -5도', numbers: [{ value: 1992 }, { value: 10 }, { value: 26 }, { value: -5 }] })]).facts;
    const r = trace(f, { captions: [{ text: '1992.10.26 시행', claims: ['c-date'] }, { text: '１９９２년 -5도', claims: ['c-date'] }, { text: '1992.10.27', claims: ['c-date'] }, { text: '5도', claims: ['c-date'] }] }, null);
    assert.deepEqual(r.errors, [
      'caption 2 "1992.10.27": "1992.10.27" is not a number of its claims (c-date)',
      'caption 3 "5도": "5도" is not a number of its claims (c-date)',
    ]);
  });

  test('not_facts: a hidden claim number warns; publish not_facts need only occur once', () => {
    const sb = { captions: [
      { text: '76cm 튜브, 1층', claims: ['c-tube'], not_facts: ['76cm 튜브', '1층'] },
      { text: '결로가 두 배', claims: ['c-rank'], not_facts: ['두 배', '두 배'] },
    ] };
    const pub = { title: '1층 거실', title_claims: ['c-tube'], description: '두 배, 3층', hashtags: ['#3층'], not_facts: ['1층', '3층', '9층', '76cm'] };
    const r = trace(facts(), sb, pub);
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.warnings, [
      'caption 0: not_facts phrase "76cm 튜브" is a number of its claims (c-tube); trace it instead of hiding it',
      'caption 1: not_facts phrase "두 배" is a number of its claims (c-rank); trace it instead of hiding it',
      'publish title: not_facts phrase "76cm" is a number of its claims (c-tube); trace it instead of hiding it',
      'publish description: not_facts phrase "76cm" is a number of its claims (c-tube, c-rank); trace it instead of hiding it',
      'publish hashtags: not_facts phrase "76cm" is a number of its claims (c-tube, c-rank); trace it instead of hiding it',
      'publish: not_facts phrase "9층" is in none of the title, description or hashtags',
      'publish: not_facts phrase "76cm" is in none of the title, description or hashtags',
    ]);
    const bad = trace(facts(), null, { title: '제목', description: '설명', not_facts: '1층' });
    assert.deepEqual(bad.errors, ['publish: not_facts must be a list of phrases']);
    assert.deepEqual(bad.warnings, []);
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
    assert.equal(cite(l.sources, l.facts, ['c2'], { urls: false }), '출처\n- 연합뉴스, 「기사」 (2026-10-18)\n- 국토교통부, 「하자 판정 현황」 (2025-10)');
  });
  test('cite percent-encodes non-ASCII in URLs and leaves existing escapes alone', () => {
    const l = ledgers([src({ url: 'https://www.law.go.kr/법령/건축법시행령/제46조?a=%20&b=ㆍ' })]);
    assert.equal(cite(l.sources, l.facts, null), '출처\n- 국토교통부, 「하자 판정 현황」 (2025-10) https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EA%B1%B4%EC%B6%95%EB%B2%95%EC%8B%9C%ED%96%89%EB%A0%B9/%EC%A0%9C46%EC%A1%B0?a=%20&b=%E3%86%8D');
  });
  test('templates are valid empty ledgers without a placeholder review', () => {
    const t = templates();
    assert.deepEqual(checkLedgers(t.sources, t.facts, { today: TODAY }), { errors: [], warnings: [] });
    assert.equal('review' in t.facts, false);
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
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(d, 'research/facts.json'), 'utf8')), { schema: FACTS_SCHEMA, claims: [] });
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
    assert.deepEqual(o.err, ['error: nothing to trace: no storyboard.json, storyboard.estimate.json, publish.json or thumbnail.json']);
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
    o = io();
    assert.equal(main(['cite', d, '--today', TODAY, '--storyboard', path.join(d, 'storyboard.estimate.json'), '--urls', 'off'], o.io), 0);
    assert.doesNotMatch(o.out[0], /https?:/);
    o = io();
    assert.equal(main(['cite', d, '--urls', 'no'], o.io), 2);
    assert.deepEqual(o.err, ['error: --urls must be on or off']);
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
    assert.deepEqual(o.err, [`warning: ${NOARCH}`]);
  });
});

describe('thumbnail tracing', () => {
  const F2 = F;
  test('screenItems reads headline and caption with their own claims', () => {
    const items = F2.screenItems(null, null, { headline: { text: '9mm', claims: ['c-a'] }, caption: { text: '1층 벽' }, not_facts: ['1층'] });
    assert.deepEqual(items, [
      { where: 'thumbnail headline', text: '9mm', claims: ['c-a'], notFacts: ['1층'] },
      { where: 'thumbnail caption', text: '1층 벽', claims: undefined, notFacts: ['1층'] },
    ]);
    assert.deepEqual(F2.screenItems(null, null, { headline: 'x', caption: { text: '' } }), []);
    assert.deepEqual(F2.screenItems(null, null, 'x'), []);
  });
  test('trace checks thumbnail numbers', () => {
    const facts = { review: { by: 'a', on: '2026-10-19' }, claims: [{ id: 'c-a', text: '9mm 판', numbers: [{ value: 9 }], status: 'verified' }] };
    assert.deepEqual(F2.trace(facts, null, null, { headline: { text: '9mm', claims: ['c-a'] } }).errors, []);
    assert.match(F2.trace(facts, null, null, { headline: { text: '12mm', claims: ['c-a'] } }).errors[0], /^thumbnail headline "12mm": "12mm" is not a number of its claims/);
  });
  test('cli picks up thumbnail.json and --thumbnail', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'facts-th-'));
    const l = ledgers();
    fs.mkdirSync(path.join(d, 'research'));
    fs.writeFileSync(path.join(d, 'research/sources.json'), JSON.stringify(l.sources));
    fs.writeFileSync(path.join(d, 'research/facts.json'), JSON.stringify(l.facts));
    fs.writeFileSync(path.join(d, 'thumbnail.json'), JSON.stringify({ headline: { text: '두 배', claims: ['c-rank'] } }));
    let o = io();
    assert.equal(main(['trace', d, '--today', TODAY], o.io), 0);
    assert.match(o.out[0], /1 used on screen/);
    fs.writeFileSync(path.join(d, 'other.json'), JSON.stringify({ headline: { text: '3배' } }));
    o = io();
    assert.equal(main(['trace', d, '--today', TODAY, '--thumbnail', path.join(d, 'other.json')], o.io), 1);
    assert.match(o.err.join('\n'), /thumbnail headline "3배"/);
  });
});
