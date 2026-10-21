import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(ROOT, 'plugins/shortform-studio/skills/shorts-publish/scripts/upload.mjs');
const U = await import(SCRIPT);
const { lines, mmss, pickHashtags, numberRows, handCheckRows, build, parseArgs, main, MARK, CHANNEL_SCHEMA, LIMITS, USAGE } = U;

const sources = () => ({
  schema: 'shorts-sources/1',
  sources: [
    { id: 'law', type: 'law', publisher: '법제처', title: '시행규칙', url: 'https://law.go.kr/a', published: '2026-04-01' },
    { id: 'news', type: 'news', publisher: '신문', title: '기사', url: 'https://news.example/a', published: '2025-01-02' },
  ],
});
const facts = (o = {}) => ({
  schema: 'shorts-facts/1',
  claims: [
    { id: 'c-size', text: '한 장은 30cm', numbers: [{ value: 30, unit: 'cm' }], status: 'verified', sources: [{ id: 'law', locator: '별표 1', excerpt: '0.3미터' }] },
    { id: 'c-survey', text: '41%', numbers: [{ value: 41 }], status: 'single-source', sources: [{ id: 'news', excerpt: '41%' }, { id: 'ghost', locator: 'p.2', excerpt: 'x' }] },
  ],
  ...o,
});
const storyboard = (o = {}) => ({
  duration: 65.03,
  captions: [
    { start: 1.2, text: '노란 블록', claims: [] },
    { start: 27.8, text: '가로세로 30cm', claims: ['c-size'] },
    { start: 28.5, text: '가로세로 30cm', claims: ['c-size'] },
    { start: 52.7, text: '41%', claims: ['c-survey'] },
    { start: 53, text: '30', claims: ['c-ghost'] },
  ],
  ...o,
});
const publish = (o = {}) => ({
  name: '점자블록',
  title: ['노란 블록은 장식이 아닙니다', '30cm의 비밀'],
  title_claims: ['c-size'],
  description: ['한 장은 30cm입니다.', '41%만 제대로 깔렸습니다.'],
  hashtags: ['#궁금인간', '#점자블록', '#쇼츠', '#궁금인간', '#보행', '#도시', '#생활', '#안전'],
  disclosure: 'AI로 만들었습니다.',
  made_for_kids: false,
  cover: { at: 30.5, note: '점은 36개' },
  tags: ['점자블록', '보도'],
  playlist: '길 위의 비밀',
  ...o,
});
const input = (o = {}) => ({
  id: 'tactile', publish: publish(), facts: facts(), sources: sources(), storyboard: storyboard(),
  channel: { schema: CHANNEL_SCHEMA, name: '궁금인간', first_comment: '다음엔 뭐가 궁금하세요?' },
  video: 'out/tactile/tactile.mp4', cover: 'out/tactile/tactile-thumbnail.png', videoExists: true, coverExists: true, urlsFile: 'ep/sources.txt',
  ...o,
});
const io = () => { const out = [], err = []; return { out, err, io: { out: (s) => out.push(s), err: (s) => err.push(s) } }; };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'upload-'));
const write = (d, f, v) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), typeof v === 'string' ? v : JSON.stringify(v)); };
const episode = (pub = publish()) => {
  const base = tmp();
  const d = path.join(base, 'tactile');
  write(d, 'publish.json', pub);
  write(d, 'research/facts.json', facts({ claims: facts().claims.filter((c) => c.id !== 'c-ghost') }));
  write(d, 'research/sources.json', sources());
  write(d, 'storyboard.json', storyboard({ captions: storyboard().captions.slice(0, 4) }));
  return { base, d, out: path.join(base, 'out', 'tactile', 'upload') };
};

describe('helpers', () => {
  test('lines, mmss, pickHashtags', () => {
    assert.deepEqual(lines(['a', '', 1, 'b']), ['a', 'b']);
    assert.deepEqual(lines('a'), ['a']);
    assert.deepEqual(lines(''), []);
    assert.deepEqual(lines(undefined), []);
    assert.equal(mmss(30.5), '0:30');
    assert.equal(mmss(65.9), '1:05');
    assert.deepEqual(pickHashtags(['#a', '#Shorts', '#a', '#b', '#c'], ['#shorts'], 2), ['#a', '#b']);
  });
  test('numberRows keeps distinct numeric captions with evidence, sorted by time', () => {
    const rows = numberRows(storyboard({ overlays: [{ text: '36개', claims: ['c-size'] }] }), facts(), sources());
    assert.deepEqual(rows, [
      { at: 27.8, text: '가로세로 30cm', claims: ['c-size'], basis: ['법제처 별표 1'] },
      { at: 52.7, text: '41%', claims: ['c-survey'], basis: ['신문', 'ghost p.2'] },
      { at: 53, text: '30', claims: ['c-ghost'], basis: [] },
      { at: null, text: '36개', claims: ['c-size'], basis: ['법제처 별표 1'] },
    ]);
    assert.deepEqual(numberRows({ captions: [{ start: 1, text: '2층', claims: ['x'] }] }, {}, {}), [{ at: 1, text: '2층', claims: ['x'], basis: [] }]);
    const merged = numberRows({ captions: [{ start: 10, text: '점은 36개', claims: ['c-size'] }, { start: 10.5, text: '36개', claims: ['c-size'] }, { start: 11, text: '41%', claims: ['c-survey'] }, { start: 20, text: '30cm', claims: ['c-size'] }] }, facts(), sources());
    assert.deepEqual(merged.map((r) => r.text), ['점은 36개 / 36개', '41%', '30cm']);
    const many = { sources: Array.from({ length: 5 }, (_, i) => ({ id: `s${i}`, locator: `p${i}` })) };
    const r = build(input({ facts: facts({ claims: [{ ...facts().claims[0], sources: many.sources }] }), storyboard: { duration: 65, captions: [{ start: 2, text: '30cm', claims: ['c-size'] }] }, publish: publish({ description: ['한 장은 30cm입니다.'] }) }));
    assert.match(r.files['youtube.md'], /\| 30cm \| 0:02 \| s0 p0; s1 p1; s2 p2 외 2곳 \|/);
  });
  test('handCheckRows lists numbers trace cannot read', () => {
    const sb = { overlays: [
      null,
      { kind: 'stages', start: 21.35, title: '일 최저기온 기준', rows: [{ name: '관심', text: '영하 5도 위' }, null, { name: '주의' }], claims: ['c-stages'] },
      { kind: 'compare', start: 14.48, items: [{ label: '물', value: 100 }, { label: '얼음', text: '+9%' }, 7] },
      { kind: 'timer', start: 3, to: 27 },
      { kind: 'timer', to: 36, unit: 's', claims: ['c-36'] },
      { kind: 'timer' },
      { kind: 'number', start: 5, text: '41%', sub: '공공병원 111곳 조사' },
      { kind: 'buckle', skin: '피부 2층', flesh: '속살' },
      { kind: 'keyword', text: '동파', sub: '겨울' },
    ] };
    assert.deepEqual(handCheckRows(sb), [
      { at: 21.35, kind: 'stages', texts: ['관심 영하 5도 위'], claims: ['c-stages'] },
      { at: 14.48, kind: 'compare', texts: ['+9%'], claims: [] },
      { at: 3, kind: 'timer', texts: ['27초'], claims: [] },
      { at: null, kind: 'timer', texts: ['36s'], claims: ['c-36'] },
      { at: 5, kind: 'number', texts: ['공공병원 111곳 조사'], claims: [] },
      { at: null, kind: 'buckle', texts: ['피부 2층'], claims: [] },
    ]);
    assert.deepEqual(handCheckRows({}), []);
    const r = build(input({ storyboard: { duration: 65, captions: storyboard().captions.slice(0, 4), overlays: [sb.overlays[1], sb.overlays[3], sb.overlays[4]] } }));
    assert.deepEqual(r.errors, []);
    assert.match(r.files['youtube.md'], /- \[ \] 화면 숫자 3곳은 추적 검사가 읽지 못한다.*아래 "직접 대조할 화면 숫자" 표를/);
    assert.match(r.files['youtube.md'], /\| 관심 영하 5도 위 \| 0:21 \| stages \| c-stages \|\n\| 27초 \| 0:03 \| timer \| \*\*없음\*\* \|\n\| 36s \| - \| timer \| c-36 \|/);
    assert.match(r.files['tiktok.md'], /youtube\.md의 "직접 대조할 화면 숫자" 표를/);
    assert.doesNotMatch(build(input({ storyboard: storyboard({ captions: storyboard().captions.slice(0, 4) }) })).files['youtube.md'], /직접 대조/);
  });
  test('parseArgs', () => {
    assert.deepEqual(parseArgs(['ep', '--out', 'o', '--force']), { dir: 'ep', opts: { out: 'o', force: true } });
    assert.deepEqual(parseArgs(['ep', '--out']), { opts: {}, bad: '--out needs a value' });
    assert.deepEqual(parseArgs(['ep', '--out', '--force']), { opts: {}, bad: '--out needs a value' });
  });
});

describe('build', () => {
  test('three sheets from one publish.json', () => {
    const r = build(input({ storyboard: storyboard({ captions: storyboard().captions.slice(0, 4) }) }));
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.warnings, [
      'facts: no review {by, on}; a person must read the ledger before publishing',
      'claim c-survey: used on screen with a single source',
    ]);
    const yt = r.files['youtube.md'];
    assert.ok(yt.startsWith(`${MARK}\n# 유튜브 업로드 정보: 점자블록 (궁금인간)`));
    assert.match(yt, /노란 블록은 장식이 아닙니다\n```\n\n다른 안: `30cm의 비밀`/);
    assert.match(yt, /- 법제처, 「시행규칙」 \(2026-04-01\)\n- 신문, 「기사」 \(2025-01-02\)\n\nAI로 만들었습니다\.\n틀린 내용/);
    assert.doesNotMatch(yt, /https?:/);
    assert.match(yt, /#궁금인간 #점자블록 #쇼츠 #보행 #도시 #생활 #안전\n```/);
    assert.match(yt, /\*\*0:30 프레임\*\*\(점은 36개\)을 고른다\. 맞춤 썸네일이 열리면 `out\/tactile\/tactile-thumbnail\.png`를 쓴다/);
    assert.match(yt, /\| 시청자층 \| 아동용 아님 \|/);
    assert.match(yt, /\| 변경되거나 합성된 콘텐츠 \| 아니요/);
    assert.match(yt, /\| 태그 \| 점자블록, 보도 \|\n\| 재생목록 \| 길 위의 비밀 \|/);
    assert.match(yt, /## 4\. 첫 고정 댓글 \(선택\)\n\n```text\n다음엔 뭐가 궁금하세요\?/);
    assert.match(yt, /- \[ \] \*\*사실 장부 검토 기록이 없다/);
    assert.match(yt, /- \[ \] `c-survey`는 출처가 하나뿐이다/);
    assert.match(yt, /주소는 `ep\/sources\.txt`에 있다/);
    assert.match(yt, /\| 가로세로 30cm \| 0:27 \| 법제처 별표 1 \|\n\| 41% \| 0:52 \| 신문; ghost p\.2 \|/);
    assert.doesNotMatch(yt, /틱톡 수익화/);
    const tt = r.files['tiktok.md'];
    assert.match(tt, /```text\n노란 블록은 장식이 아닙니다\n\n한 장은 30cm입니다\./);
    assert.match(tt, /#궁금인간 #점자블록 #보행 #도시 #생활\n```/);
    assert.match(tt, /`out\/tactile\/tactile-thumbnail\.png`를 올린다\. 이미지를 올릴 수 없으면 \*\*0:30 프레임\*\*/);
    assert.match(tt, /- \[x\] 길이 65\.0초: 틱톡 수익화/);
    assert.match(tt, /## 3\. 첫 댓글 \(올린 직후, 선택\)/);
    const ig = r.files['instagram.md'];
    assert.match(ig, /# 인스타그램 릴스 업로드 정보/);
    assert.match(ig, /카메라 롤에서 `out\/tactile\/tactile-thumbnail\.png`를 고른다\. 없으면 \*\*0:30 프레임\*\*/);
    assert.match(ig, /#궁금인간 #점자블록 #보행 #도시 #생활\n```/);
  });
  test('defaults, missing parts and a reviewed ledger', () => {
    const r = build(input({
      publish: publish({ name: '', title: '한 장 30cm', title_claims: ['c-size'], description: ['한 장은 30cm입니다.'], disclosure: '', cover: { at: 12 }, tags: [], playlist: '', made_for_kids: true, altered_content: true, first_comment: '에피소드 댓글' }),
      facts: facts({ review: { by: '배', on: '2026-10-20' }, claims: [facts().claims[0]] }),
      storyboard: { duration: 59.7, captions: [{ start: 2, text: '30cm', claims: ['c-size'] }] },
      channel: null, videoExists: false, coverExists: false, urlsFile: null,
    }));
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.warnings, ['publish: no disclosure line (AI picture and voice notice)', 'video not found: out/tactile/tactile.mp4']);
    const yt = r.files['youtube.md'];
    assert.match(yt, /# 유튜브 업로드 정보: tactile\n/);
    assert.match(yt, /한 장 30cm\n```\n\n## 2/);
    assert.match(yt, /링크는 눌리지 않는다\)\.\n/);
    assert.match(yt, /\*\*0:12 프레임\*\*을 고른다\.( |\|)/);
    assert.match(yt, /\| 시청자층 \| 아동용 \|/);
    assert.match(yt, /\| 변경되거나 합성된 콘텐츠 \| 예 \|/);
    assert.match(yt, /\| 태그 \| \(없음\) \|\n\| 재생목록 \| \(없음\) \|/);
    assert.match(yt, /에피소드 댓글/);
    assert.match(yt, /- \[x\] 사실 장부 검토: 배, 2026-10-20/);
    assert.match(yt, /- \[ \] \*\*영상 파일이 없다:\*\*/);
    assert.match(yt, /- 법제처, 「시행규칙」 \(2026-04-01\)\n\n틀린 내용/);
    assert.match(r.files['tiktok.md'], /\| 커버 \| \*\*0:12 프레임\*\*을 고른다 \|/);
    assert.match(r.files['tiktok.md'], /- \[ \] 길이 59\.7초: 1분 이하라/);
    assert.match(r.files['instagram.md'], /\| 커버 \| \*\*0:12 프레임\*\*을 고른다\. 프로필 격자/);
  });
  test('no first comment, no cover, no duration, no rows', () => {
    const r = build(input({
      publish: publish({ cover: undefined, title: ['제목'], description: ['설명'], hashtags: [] }),
      storyboard: { captions: [] }, channel: { schema: CHANNEL_SCHEMA, correction: '' },
    }));
    assert.deepEqual(r.errors, []);
    assert.ok(r.warnings.includes('storyboard: no duration; check the video length by hand'));
    assert.ok(r.warnings.includes('publish: no cover {at, note}; pick the cover frame by hand'));
    const yt = r.files['youtube.md'];
    assert.match(yt, /길이 미확인/);
    assert.match(yt, /제목의 주제가 가장 잘 보이는 프레임을 고른다/);
    assert.doesNotMatch(yt, /첫 고정 댓글/);
    assert.doesNotMatch(yt, /화면에 나오는 숫자/);
    assert.doesNotMatch(r.files['tiktok.md'], /틱톡 수익화/);
    assert.match(yt, /설명\n\n출처\n- 법제처, 「시행규칙」 \(2026-04-01\)\n\nAI로 만들었습니다\.\n```/);
  });
  test('youtube refuses angle brackets in title, description and tags', () => {
    const msg = (w) => `youtube: ${w} contains "<" or ">", which YouTube does not allow; write "→" or words instead (publish.json, or a source title in research/sources.json)`;
    let r = build(input({ publish: publish({ title: ['노란 블록은 장식이 아닙니다', '<30cm> 비밀'], title_claims: ['c-size'], description: ['한 장은 30cm입니다 (설정 > 배터리).'], tags: ['a<b'] }), storyboard: storyboard({ captions: storyboard().captions.slice(0, 4) }) }));
    assert.deepEqual(r.errors, [msg('title'), msg('description'), msg('tags')]);
    r = build(input({ sources: { sources: [{ ...sources().sources[0], title: '시행규칙 <별표 1>' }, sources().sources[1]] }, storyboard: storyboard({ captions: storyboard().captions.slice(0, 4) }) }));
    assert.deepEqual(r.errors, [msg('description')]);
    r = build(input({ publish: publish({ description: ['한 장은 30cm입니다 (설정 → 배터리).', '41%만 제대로 깔렸습니다.'] }), storyboard: storyboard({ captions: storyboard().captions.slice(0, 4) }) }));
    assert.deepEqual(r.errors, []);
  });
  test('errors: channel schema, empty publish, limits', () => {
    let r = build(input({ publish: { hashtags: [] }, channel: { schema: 'x' }, storyboard: { duration: 200, captions: [] } }));
    assert.deepEqual(r.errors, [
      `channel: schema must be "${CHANNEL_SCHEMA}"`,
      'publish: title is missing',
      'publish: description is missing',
      `video is 200 s; Shorts and Reels allow ${LIMITS.maxSeconds} s`,
    ]);
    const long = '가'.repeat(130);
    const many = Array.from({ length: 16 }, (_, i) => `#t${String.fromCharCode(97 + i)}`);
    r = build(input({ publish: publish({ title: long, title_claims: [], description: ['나'.repeat(5100)], hashtags: many }), storyboard: { duration: 30, captions: [] } }));
    assert.equal(r.errors.length, 5);
    assert.equal(r.errors[0], 'youtube: title is 130 characters (max 100)');
    assert.equal(r.errors[2], 'youtube: 16 hashtags; over 15 YouTube ignores them all');
    assert.match(r.errors[1], /^youtube: description is \d+ characters \(max 5000\)$/);
    assert.match(r.errors[3], /^tiktok: caption is \d+ characters \(max 4000\)$/);
    assert.match(r.errors[4], /^instagram: caption is \d+ characters \(max 2200\)$/);
    assert.ok(r.warnings.includes('instagram: the first line is over 125 characters and is cut before "more"'));
    r = build(input({ storyboard: storyboard({ overlays: [{ text: '30cm', claims: ['c-size'] }, { text: '30 cm', claims: ['c-size'] }] }) }));
    assert.match(r.files['youtube.md'], /\| 30cm \| - \| 법제처 별표 1 \|/);
    assert.deepEqual(r.errors, ['caption 4 @53s: unknown claim "c-ghost"', 'caption 4 @53s "30": "30" has no claim; add the claim id to "claims" or the phrase to "not_facts"']);
  });
});

describe('main', () => {
  test('usage', () => {
    for (const argv of [[], ['ep'], ['ep', '--out']]) {
      const o = io();
      assert.equal(main(argv, o.io), 2);
    }
    const o = io();
    main(['ep', '--channel'], o.io);
    assert.equal(o.err[0], `error: --channel needs a value\n${USAGE}`);
  });
  test('writes the sheets, refuses hand-written ones, --force replaces them', () => {
    const { base, d, out } = episode();
    write(base, 'channel.json', { schema: CHANNEL_SCHEMA, name: '궁금인간' });
    write(path.dirname(out), 'tactile.mp4', 'v');
    let o = io();
    assert.equal(main([d, '--out', out, '--channel', path.join(base, 'channel.json')], o.io), 0);
    assert.match(o.out[0], /^Wrote .*youtube\.md, .*tiktok\.md, .*instagram\.md \(2 warning\(s\)\)\.$/);
    const yt = fs.readFileSync(path.join(out, 'youtube.md'), 'utf8');
    assert.match(yt, /\(궁금인간\)/);
    assert.match(yt, /- \[x\] 영상 파일 있음/);
    assert.doesNotMatch(yt, /주소는 `/);
    o = io();
    assert.equal(main([d, '--out', out], o.io), 0);
    fs.writeFileSync(path.join(out, 'tiktok.md'), '# hand-written');
    o = io();
    assert.equal(main([d, '--out', out], o.io), 1);
    assert.match(o.err[0], /^error: .*tiktok\.md was written by hand; move it away or pass --force to replace it$/);
    assert.match(o.out[0], /^1 error\(s\), \d+ warning\(s\); nothing written\.$/);
    assert.equal(fs.readFileSync(path.join(out, 'tiktok.md'), 'utf8'), '# hand-written');
    o = io();
    assert.equal(main([d, '--out', out, '--force'], o.io), 0);
    assert.ok(fs.readFileSync(path.join(out, 'tiktok.md'), 'utf8').startsWith(MARK));
  });
  test('optional files: thumbnail.json, sources.txt, --video, --thumbnail', () => {
    const { base, d, out } = episode();
    write(d, 'thumbnail.json', { headline: { text: '30cm', claims: ['c-size'] } });
    write(d, 'sources.txt', 'https://law.go.kr/a');
    write(base, 'v.mp4', 'v');
    write(base, 'c.png', 'c');
    const o = io();
    assert.equal(main([d, '--out', out, '--video', path.join(base, 'v.mp4'), '--thumbnail', path.join(base, 'c.png')], o.io), 0);
    const tt = fs.readFileSync(path.join(out, 'tiktok.md'), 'utf8');
    assert.match(tt, /v\.mp4`/);
    assert.match(tt, /c\.png`를 올린다/);
    assert.match(tt, /sources\.txt`에 있다/);
  });
  test('bad files', () => {
    const { d, out } = episode();
    fs.writeFileSync(path.join(d, 'storyboard.json'), '{');
    const o = io();
    assert.equal(main([d, '--out', out], o.io), 1);
    assert.match(o.err[0], /^error: /);
    assert.equal(fs.existsSync(out), false);
  });
  test('runs as a script', () => {
    const r = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
    assert.equal(r.status, 2);
    const { d, out } = episode();
    const ok = spawnSync(process.execPath, [SCRIPT, d, '--out', out], { encoding: 'utf8' });
    assert.equal(ok.status, 0);
    assert.match(ok.stdout, /^Wrote /);
  });
});
