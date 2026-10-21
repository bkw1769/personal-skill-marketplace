#!/usr/bin/env node
// Fact and source ledgers for informational shorts: check the ledgers, trace every
// number a viewer reads (captions, overlays, title, description) back to a claim,
// and print the source list for the video description. Node built-ins only.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const SOURCES_SCHEMA = 'shorts-sources/1';
export const FACTS_SCHEMA = 'shorts-facts/1';
export const SOURCE_TYPES = ['law', 'official', 'standard', 'academic', 'company', 'news', 'encyclopedia', 'other'];
export const PRIMARY_TYPES = new Set(['law', 'official', 'standard', 'academic', 'company']);
export const STATUSES = ['verified', 'single-source', 'disputed', 'rejected'];
export const BLOCKED_STATUSES = new Set(['disputed', 'rejected']);
export const MAX_EXCERPT = 300;
export const DEFAULT_MAX_AGE = 3;
export const IN_FORCE_TYPES = new Set(['law', 'standard']);

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const PARTIAL_DATE_RE = /^\d{4}(-\d{2}(-\d{2})?)?$/;
const URL_RE = /^https?:\/\/\S+$/;

const SMALL_UNIT = { 십: 10, 백: 100, 천: 1000 };
const BIG_UNIT = { 만: 1e4, 억: 1e8, 조: 1e12 };
// A minus sign counts only at the start of a word ("-9mm", "(-5도)"), not in "3-4호기".
// 할 right after digits is tenths (9할 = 90, compared with a percent value).
const DIGIT_RE = /(?<![\d.])(?:(?<![\p{L}\p{N}])([-\u2212]))?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(?:(할)(?!인)|([십백천]?)([만억조]?))/gu;
// Full dates: 1992.10.26, 1992. 10. 26, 2026-10-06, 2026/10/06.
const DATE_RE = /(?<![\d.])(\d{4})(\.\s?|-|\/)(\d{1,2})\2(\d{1,2})(?![\d])/gu;
// Full-width digits and signs (１９９２, －５) read as ASCII; one code unit each, so indexes hold.
const FULL_WIDTH_RE = /[\uff10-\uff19\uff0b-\uff0e]/gu;
const NATIVE = { 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10, 스무: 20, 서른: 30, 마흔: 40, 쉰: 50 };
const COUNTERS = ['배', '번', '개', '명', '채', '곳', '칸', '대', '층', '마리', '가지', '시간', '살', '해', '달', '줄', '겹', '장', '척', '군데', '차례', '가구', '세대', '그루', '톤', '권', '쌍'];
const NATIVE_RE = new RegExp(`(?<![가-힣])(${Object.keys(NATIVE).join('|')}) (${COUNTERS.join('|')})(?![가-힣]*째)`, 'gu');
const HALF_RE = /(?<![가-힣])절반/gu;
const UNIT_TAIL_RE = /^[^\s\d,.!?·/()~\-\u2212]{0,3}/u;
// Particles trimmed from the unit shown in messages ("1978년에" -> "1978년"). 도 stays: 5도 is degrees.
const PARTICLE_RE = /(?:으로|에서|에게|까지|부터|처럼|보다|은|는|이|가|을|를|에|의|와|과|로|만|랑)$/u;

/**
 * Find the numbers a reader sees in a Korean or English text: digits (with thousands
 * commas, decimals, a leading minus sign and Korean units such as 천/만/억/조, so
 * "2조 5,000억" and "1천 2백" are one number each), 할 after digits (9할 = 90), full
 * dates (1992.10.26, 2026-10-06; value = the year, parts = [year, month, day]), native
 * Korean counts written with a space before a counter ("두 배", "세 번") and 절반.
 * Full-width digits (１９９２) count as digits.
 * @param {string} text
 * @returns {{value: number, raw: string, index: number, parts?: number[]}[]} in text order
 */
export function extractNumbers(text) {
  const norm = text.replace(FULL_WIDTH_RE, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
  const found = [];
  let digits = norm;
  for (const m of norm.matchAll(DATE_RE)) {
    const parts = [m[1], m[3], m[4]].map(Number);
    if (parts[1] < 1 || parts[1] > 12 || parts[2] < 1 || parts[2] > 31) continue;
    found.push({ value: parts[0], raw: text.slice(m.index, m.index + m[0].length), index: m.index, parts });
    digits = digits.slice(0, m.index) + ' '.repeat(m[0].length) + digits.slice(m.index + m[0].length);
  }
  const groups = [];
  for (const m of digits.matchAll(DIGIT_RE)) {
    const [raw, sign, int, frac = '', tenth, small, big] = m;
    const unit = (SMALL_UNIT[small] || 1) * (BIG_UNIT[big] || 1);
    const value = (sign ? -1 : 1) * Number(int.replace(/,/g, '') + frac) * (tenth ? 10 : unit);
    const prev = groups[groups.length - 1];
    // "1만 5천" / "2조 5,000억" / "1천 2백": a smaller group right after a unit adds to it.
    if (prev && prev.unit > 1 && !sign && /^\s*$/.test(digits.slice(prev.end, m.index)) && value < prev.unit) {
      prev.value += prev.value < 0 ? -value : value;
      prev.end = m.index + raw.length;
      prev.unit = unit;
      continue;
    }
    groups.push({ value, index: m.index, end: m.index + raw.length, unit: tenth ? 1 : unit });
  }
  // Show digits with the unit that follows them ("68cm", "30%", "1978년"), without particles.
  for (const g of groups) {
    let tail = UNIT_TAIL_RE.exec(norm.slice(g.end))[0];
    while (PARTICLE_RE.test(tail)) tail = tail.replace(PARTICLE_RE, '');
    found.push({ value: g.value, raw: text.slice(g.index, g.end) + tail, index: g.index });
  }
  for (const m of norm.matchAll(NATIVE_RE)) found.push({ value: NATIVE[m[1]], raw: m[0], index: m.index });
  for (const m of norm.matchAll(HALF_RE)) found.push({ value: 0.5, raw: m[0], index: m.index });
  return found.sort((a, b) => a.index - b.index);
}

/**
 * Whether a number found in a text equals one of the given values; a date matches
 * when its year, month and day each do.
 * @param {{value: number, parts?: number[]}} found an entry from extractNumbers
 * @param {number[]} values
 * @returns {boolean}
 */
export function matchesValue(found, values) {
  return (found.parts || [found.value]).every((p) => values.some((v) => sameNumber(v, p)));
}

/**
 * Whether two numbers are the same within floating-point noise.
 * @param {number} a
 * @param {number} b
 * @returns {boolean}
 */
export function sameNumber(a, b) {
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

/**
 * Blank out every occurrence of the given phrases so they are not read as numbers.
 * @param {string} text
 * @param {string[]} phrases
 * @returns {{text: string, missing: string[]}} missing = phrases that did not occur
 */
export function blank(text, phrases) {
  const missing = [];
  for (const p of phrases) {
    if (!text.includes(p)) missing.push(p);
    else text = text.split(p).join(' '.repeat(p.length));
  }
  return { text, missing };
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => typeof v === 'string' && v.trim() !== '';
const validDay = (s) => DAY_RE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);

/**
 * Check the source ledger and the fact ledger together.
 * @param {any} sources parsed sources.json
 * @param {any} facts parsed facts.json
 * @param {{today?: string, maxAge?: number}} [opt] today = YYYY-MM-DD (default: now); maxAge = years before a figure counts as stale
 * @returns {{errors: string[], warnings: string[]}}
 */
export function checkLedgers(sources, facts, opt = {}) {
  const errors = [];
  const warnings = [];
  const today = opt.today || new Date().toISOString().slice(0, 10);
  const maxAge = opt.maxAge ?? DEFAULT_MAX_AGE;
  const byId = new Map();

  if (!isObj(sources) || sources.schema !== SOURCES_SCHEMA) errors.push(`sources: schema must be "${SOURCES_SCHEMA}"`);
  const srcList = isObj(sources) && Array.isArray(sources.sources) ? sources.sources : [];
  if (isObj(sources) && !Array.isArray(sources.sources)) errors.push('sources: "sources" must be a list');
  srcList.forEach((s, i) => {
    const at = `source ${isObj(s) && str(s.id) ? s.id : i}`;
    if (!isObj(s)) return errors.push(`${at}: must be an object`);
    if (!str(s.id) || !ID_RE.test(s.id)) errors.push(`${at}: id must be lower-case letters, digits and hyphens`);
    else if (byId.has(s.id)) errors.push(`${at}: duplicate id`);
    else byId.set(s.id, s);
    if (!str(s.title)) errors.push(`${at}: title is required`);
    if (!str(s.publisher)) errors.push(`${at}: publisher is required`);
    if (!str(s.url) || !URL_RE.test(s.url)) errors.push(`${at}: url must be an http(s) address`);
    if (!SOURCE_TYPES.includes(s.type)) errors.push(`${at}: type must be one of ${SOURCE_TYPES.join(', ')}`);
    if (!str(s.accessed) || !validDay(s.accessed)) errors.push(`${at}: accessed must be a YYYY-MM-DD date`);
    else if (s.accessed > today) warnings.push(`${at}: accessed ${s.accessed} is after today (${today})`);
    if (s.published !== undefined && !(str(s.published) && PARTIAL_DATE_RE.test(s.published))) errors.push(`${at}: published must be YYYY, YYYY-MM or YYYY-MM-DD`);
    if (s.archive_url === undefined) {
      if (s.archive_failed === undefined) warnings.push(`${at}: no archive_url (pages change; save a web.archive.org copy, or record the failed attempt in archive_failed)`);
    } else if (!str(s.archive_url) || !URL_RE.test(s.archive_url)) errors.push(`${at}: archive_url must be an http(s) address`);
    if (s.archive_failed !== undefined && !str(s.archive_failed)) errors.push(`${at}: archive_failed must say when and how saving failed`);
    if (s.in_force !== undefined) {
      if (!str(s.in_force) || !validDay(s.in_force)) errors.push(`${at}: in_force must be the YYYY-MM-DD day you confirmed the text is still in force`);
      else if (!IN_FORCE_TYPES.has(s.type)) errors.push(`${at}: in_force is only for ${[...IN_FORCE_TYPES].join(' and ')} sources`);
      else if (s.in_force > today) warnings.push(`${at}: in_force ${s.in_force} is after today (${today})`);
    }
  });

  if (!isObj(facts) || facts.schema !== FACTS_SCHEMA) errors.push(`facts: schema must be "${FACTS_SCHEMA}"`);
  const claims = isObj(facts) && Array.isArray(facts.claims) ? facts.claims : [];
  if (isObj(facts) && !Array.isArray(facts.claims)) errors.push('facts: "claims" must be a list');
  const seen = new Set();
  const cited = new Set();
  claims.forEach((c, i) => {
    const at = `claim ${isObj(c) && str(c.id) ? c.id : i}`;
    if (!isObj(c)) return errors.push(`${at}: must be an object`);
    if (!str(c.id) || !ID_RE.test(c.id)) errors.push(`${at}: id must be lower-case letters, digits and hyphens`);
    else if (seen.has(c.id)) errors.push(`${at}: duplicate id`);
    else seen.add(c.id);
    if (!str(c.text)) errors.push(`${at}: text is required`);
    if (!STATUSES.includes(c.status)) errors.push(`${at}: status must be one of ${STATUSES.join(', ')}`);

    const nums = c.numbers === undefined ? [] : c.numbers;
    const good = Array.isArray(nums) ? nums.filter((n) => isObj(n) && typeof n.value === 'number') : [];
    // Is n among the found numbers (a date counts by its year, month and day), or its say among the texts?
    const appears = (n, found, texts) => (str(n.say) && texts.some((t) => t.includes(n.say))) || found.some((t) => (t.parts || [t.value]).some((p) => sameNumber(p, n.value)));
    if (!Array.isArray(nums)) errors.push(`${at}: numbers must be a list`);
    else {
      nums.forEach((n, j) => {
        if (!isObj(n) || typeof n.value !== 'number' || !Number.isFinite(n.value)) errors.push(`${at}: numbers[${j}].value must be a number`);
        else if (n.say !== undefined && !str(n.say)) errors.push(`${at}: numbers[${j}].say must be text`);
      });
      if (str(c.text)) {
        const { text } = blank(c.text, good.map((n) => n.say).filter(str));
        const inText = extractNumbers(text);
        for (const n of good) if (!appears(n, inText, [c.text])) warnings.push(`${at}: number ${n.value} does not appear in its text`);
        for (const t of inText) {
          if (!matchesValue(t, good.map((n) => n.value))) warnings.push(`${at}: "${t.raw}" in the text is not listed in numbers`);
        }
      }
    }

    const refs = c.sources === undefined ? [] : c.sources;
    const forceYears = [];
    if (!Array.isArray(refs)) errors.push(`${at}: sources must be a list`);
    else {
      if (refs.length === 0 && c.status !== 'rejected') errors.push(`${at}: needs at least one source`);
      const types = [];
      const publishers = new Set();
      const excerpts = refs.filter((r) => isObj(r) && str(r.excerpt)).map((r) => r.excerpt);
      refs.forEach((r, j) => {
        if (!isObj(r) || !str(r.id)) return errors.push(`${at}: sources[${j}].id is required`);
        const s = byId.get(r.id);
        if (!s) return errors.push(`${at}: unknown source "${r.id}"`);
        cited.add(r.id);
        if (!str(r.locator)) warnings.push(`${at}: source ${r.id} has no locator (page, table, article or section)`);
        if (r.excerpt !== undefined && String(r.excerpt).length > MAX_EXCERPT) warnings.push(`${at}: excerpt from ${r.id} is longer than ${MAX_EXCERPT} characters (quote only the line you need)`);
        types.push(s.type);
        if (IN_FORCE_TYPES.has(s.type) && str(s.in_force) && validDay(s.in_force)) forceYears.push(Number(s.in_force.slice(0, 4)));
        if (!PRIMARY_TYPES.has(s.type) && s.type !== 'encyclopedia') publishers.add(String(s.publisher).trim());
      });
      const primary = types.some((t) => PRIMARY_TYPES.has(t));
      if (c.status === 'verified' && types.length && !primary && publishers.size < 2) {
        errors.push(`${at}: "verified" needs one primary source (${[...PRIMARY_TYPES].join('/')}) or secondary sources from two different publishers`);
      }
      if (types.length && types.every((t) => t === 'encyclopedia')) warnings.push(`${at}: only encyclopedia sources; find the source they cite`);
      if (excerpts.length) {
        const inExcerpts = excerpts.flatMap(extractNumbers);
        const missing = good.filter((n) => !appears(n, inExcerpts, excerpts)).map((n) => n.value);
        if (missing.length) warnings.push(`${at}: not in any excerpt: ${missing.join(', ')} (quote the line that gives each number)`);
      }
    }

    if (c.as_of !== undefined && !(str(c.as_of) && PARTIAL_DATE_RE.test(c.as_of))) errors.push(`${at}: as_of must be YYYY, YYYY-MM or YYYY-MM-DD`);
    else if (c.as_of === undefined && Array.isArray(nums) && nums.length) warnings.push(`${at}: has numbers but no as_of (the year the figure describes)`);
    // A rule confirmed in force (source in_force) is as new as that confirmation.
    else if (c.as_of !== undefined && !c.historical && Number(today.slice(0, 4)) - Math.max(Number(c.as_of.slice(0, 4)), ...forceYears) > maxAge) {
      warnings.push(`${at}: figure is from ${c.as_of}, more than ${maxAge} years old; look for a newer one, set "historical": true, or for a law or standard still in force record the day you checked as "in_force" on its source`);
    }
  });
  for (const id of byId.keys()) if (!cited.has(id)) warnings.push(`source ${id}: not cited by any claim`);
  return { errors, warnings };
}

/**
 * Every text an overlay draws on screen (scenes.js): its text, label, sub line, skin and flesh labels; a timer's
 * final count (`to`, default 10, plus unit, default 초); compare item labels and texts; stages title, row names
 * and row texts.
 * @param {any} o an overlay object
 * @returns {string[]}
 */
export function overlayText(o) {
  if (o.kind === 'timer') return [`${o.to ?? 10}${o.unit ?? '초'}`];
  const list = (v, fields) => (Array.isArray(v) ? v.filter(isObj).flatMap((it) => fields.map((f) => it[f])) : []);
  if (o.kind === 'compare') return list(o.items, ['label', 'text']).filter(str);
  if (o.kind === 'stages') return [o.title, ...list(o.rows, ['name', 'text'])].filter(str);
  return [o.text, o.label, o.sub, o.skin, o.flesh].filter(str);
}

/**
 * Collect the on-screen text items that must be traced: storyboard captions, bubbles
 * and overlays (top level, then nested in scenes[]), then the publish title,
 * description and hashtags. Publish items share publish.not_facts (shared: true).
 * @param {any} storyboard parsed storyboard.json or null
 * @param {any} publish parsed publish.json or null
 * @returns {{where: string, text: string, claims: any, notFacts: any, shared?: boolean}[]}
 */
export function screenItems(storyboard, publish, thumbnail = null) {
  const items = [];
  const sb = isObj(storyboard) ? storyboard : {};
  const collect = (holder, prefix) => {
    for (const kind of ['captions', 'bubbles', 'overlays']) {
      (Array.isArray(holder[kind]) ? holder[kind] : []).forEach((it, i) => {
        if (!isObj(it)) return;
        const text = (kind === 'overlays' ? overlayText(it) : [it.text, it.label].filter(str)).join(' / ');
        if (!text) return;
        const at = typeof it.start === 'number' ? ` @${it.start}s` : '';
        items.push({ where: `${prefix}${kind.slice(0, -1)} ${i}${at}`, text, claims: it.claims, notFacts: it.not_facts });
      });
    }
  };
  collect(sb, '');
  (Array.isArray(sb.scenes) ? sb.scenes : []).forEach((sc, k) => {
    if (isObj(sc)) collect(sc, `scene ${str(sc.id) ? sc.id : k} `);
  });
  if (isObj(publish)) {
    const lines = (v, sep) => (Array.isArray(v) ? v.filter(str).join(sep) : v);
    const add = (name, text, claims) => {
      if (str(text)) items.push({ where: `publish ${name}`, text, claims, notFacts: publish.not_facts, shared: true });
    };
    add('title', lines(publish.title, ' / '), publish.title_claims);
    add('description', lines(publish.description, '\n'), '*');
    add('hashtags', lines(publish.hashtags, ' '), '*');
  }
  if (isObj(thumbnail)) {
    // Thumbnail texts (shorts-thumbnail thumbnail.json) carry their own claims, like captions.
    for (const part of ['headline', 'caption']) {
      const t = thumbnail[part];
      if (isObj(t) && str(t.text)) items.push({ where: `thumbnail ${part}`, text: t.text, claims: t.claims, notFacts: thumbnail.not_facts });
    }
  }
  return items;
}

/**
 * Trace every number on screen to a claim listed on the same item. The description and
 * hashtags may use any claim that the storyboard or title already uses, plus
 * publish.description_claims.
 * @param {any} facts parsed facts.json
 * @param {any} storyboard parsed storyboard.json or null
 * @param {any} publish parsed publish.json or null
 * @param {any} [thumbnail] parsed thumbnail.json or null
 * @returns {{errors: string[], warnings: string[], used: string[]}} used = claim ids in order of first use
 */
export function trace(facts, storyboard, publish, thumbnail = null) {
  const errors = [];
  const warnings = [];
  const claims = new Map((isObj(facts) && Array.isArray(facts.claims) ? facts.claims : []).filter((c) => isObj(c) && str(c.id)).map((c) => [c.id, c]));
  const used = [];
  const warnedSingle = new Set();
  const items = screenItems(storyboard, publish, thumbnail);
  if (!items.length) warnings.push('nothing to trace: no captions, overlays, title or description found');
  if (!isObj(facts) || !isObj(facts.review) || !str(facts.review.by) || !str(facts.review.on)) {
    warnings.push('facts: no review {by, on}; a person must read the ledger before publishing');
  }

  let extra = [];
  if (isObj(publish) && publish.description_claims !== undefined) {
    if (Array.isArray(publish.description_claims)) extra = publish.description_claims;
    else errors.push('publish: description_claims must be a list of claim ids');
  }
  let sharedMissing = null;
  const once = (list, msg) => { if (!list.includes(msg)) list.push(msg); };

  const resolve = (ids, where) => {
    const out = [];
    for (const id of ids) {
      const c = claims.get(id);
      if (!c) { errors.push(`${where}: unknown claim "${id}"`); continue; }
      if (BLOCKED_STATUSES.has(c.status)) errors.push(`${where}: claim ${id} is ${c.status} and must not be used`);
      else if (c.status === 'single-source' && !warnedSingle.has(id)) { warnedSingle.add(id); warnings.push(`claim ${id}: used on screen with a single source`); }
      if (!used.includes(id)) used.push(id);
      out.push(c);
    }
    return out;
  };

  for (const it of items) {
    let ids;
    if (it.claims === '*') {
      // Blocked claims were already reported where they were used. description_claims
      // are resolved once; later items find them in used.
      ids = used.filter((id) => !BLOCKED_STATUSES.has(claims.get(id).status));
      ids.push(...extra.filter((id) => !ids.includes(id)));
      extra = [];
    } else if (it.claims === undefined) ids = [];
    else if (!Array.isArray(it.claims)) { errors.push(`${it.where}: claims must be a list of claim ids`); ids = []; }
    else ids = it.claims;
    const refs = resolve(ids, it.where);

    const nums = refs.flatMap((c) => (Array.isArray(c.numbers) ? c.numbers : [])).filter((n) => isObj(n) && typeof n.value === 'number');
    const values = nums.map((n) => n.value);
    let notFacts = [];
    if (it.notFacts !== undefined) {
      if (Array.isArray(it.notFacts) && it.notFacts.every(str)) notFacts = [...new Set(it.notFacts)];
      else once(errors, `${it.shared ? 'publish' : it.where}: not_facts must be a list of phrases`);
    }
    for (const p of notFacts) {
      if (nums.some((n) => n.say === p) || extractNumbers(p).some((t) => matchesValue(t, values))) {
        warnings.push(`${it.where}: not_facts phrase "${p}" is a number of its claims (${ids.join(', ')}); trace it instead of hiding it`);
      }
    }
    const nf = blank(it.text, notFacts);
    // A shared publish.not_facts phrase only needs to occur in one publish item.
    if (it.shared) sharedMissing = sharedMissing ? sharedMissing.filter((p) => nf.missing.includes(p)) : nf.missing;
    else nf.missing.forEach((p) => warnings.push(`${it.where}: not_facts phrase "${p}" is not in the text`));
    const said = blank(nf.text, nums.map((n) => n.say).filter(str)).text;
    for (const t of extractNumbers(said)) {
      if (matchesValue(t, values)) continue;
      const short = it.text.length > 40 ? `${it.text.slice(0, 40)}...` : it.text;
      errors.push(refs.length
        ? `${it.where} "${short}": "${t.raw}" is not a number of its claims (${ids.join(', ')})`
        : `${it.where} "${short}": "${t.raw}" has no claim; add the claim id to "claims" or the phrase to "not_facts"`);
    }
  }
  (sharedMissing || []).forEach((p) => warnings.push(`publish: not_facts phrase "${p}" is in none of the title, description or hashtags`));
  return { errors, warnings, used };
}

/**
 * Source list for the video description, in order of first use. Non-ASCII characters in
 * URLs are percent-encoded so the links work when pasted into YouTube.
 * @param {any} sources parsed sources.json
 * @param {any} facts parsed facts.json
 * @param {string[]|null} claimIds claims to cite; null = every claim that is not rejected
 * @param {{lang?: 'ko'|'en', urls?: boolean}} [opt] urls: false leaves the web addresses out (Shorts and Reels
 *   descriptions do not make links clickable; keep the addresses in the episode's sources.txt)
 * @returns {string}
 */
export function cite(sources, facts, claimIds, opt = {}) {
  const byId = new Map((sources.sources || []).map((s) => [s.id, s]));
  const claims = new Map((facts.claims || []).map((c) => [c.id, c]));
  const ids = claimIds || (facts.claims || []).filter((c) => c.status !== 'rejected').map((c) => c.id);
  const order = [];
  for (const id of ids) {
    for (const r of claims.get(id)?.sources || []) if (byId.has(r.id) && !order.includes(r.id)) order.push(r.id);
  }
  const lines = order.map((id) => {
    const s = byId.get(id);
    const date = s.published || s.accessed;
    const url = opt.urls === false ? '' : ` ${String(s.url).replace(/[^\x00-\x7f]+/gu, encodeURIComponent)}`;
    return opt.lang === 'en' ? `- ${s.publisher}, "${s.title}" (${date})${url}` : `- ${s.publisher}, 「${s.title}」 (${date})${url}`;
  });
  return [opt.lang === 'en' ? 'Sources' : '출처', ...lines].join('\n');
}

/**
 * Empty ledgers for a new episode. No review: the person who reads the ledger adds it.
 * @returns {{sources: object, facts: object}}
 */
export function templates() {
  return {
    sources: { schema: SOURCES_SCHEMA, sources: [] },
    facts: { schema: FACTS_SCHEMA, claims: [] },
  };
}

/**
 * Parse command-line options.
 * @param {string[]} argv
 * @returns {{cmd?: string, dir?: string, opts: Record<string,string>, bad?: string}}
 */
export function parseArgs(argv) {
  const opts = {};
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) return { opts, bad: `${a} needs a value` };
      opts[a.slice(2)] = v;
      i++;
    } else pos.push(a);
  }
  return { cmd: pos[0], dir: pos[1], opts };
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const firstExisting = (...files) => files.find((f) => fs.existsSync(f));

export const USAGE = `usage: facts.mjs <init|check|trace|cite> <episode-dir> [options]
  init   write empty research/sources.json and research/facts.json
  check  check both ledgers
  trace  check, then trace every on-screen number to a claim
  cite   print the source list for the description
options: --storyboard <file> (default storyboard.json, then storyboard.estimate.json)
         --publish <file> (default publish.json)  --thumbnail <file> (default thumbnail.json)
         --today YYYY-MM-DD  --max-age <years>
         --lang ko|en  --urls on|off (cite; off for Shorts, Reels and TikTok)  --out <file>`;

/**
 * Command-line entry point.
 * @param {string[]} argv
 * @param {{out: (s: string) => void, err: (s: string) => void}} io
 * @returns {number} exit code (0 ok, 1 findings or bad files, 2 usage)
 */
export function main(argv, io) {
  const { cmd, dir, opts, bad } = parseArgs(argv);
  if (bad || !['init', 'check', 'trace', 'cite'].includes(cmd) || !dir) {
    io.err(bad ? `error: ${bad}\n${USAGE}` : USAGE);
    return 2;
  }
  if (opts.lang !== undefined && !['ko', 'en'].includes(opts.lang)) { io.err('error: --lang must be ko or en'); return 2; }
  if (opts.urls !== undefined && !['on', 'off'].includes(opts.urls)) { io.err('error: --urls must be on or off'); return 2; }
  if (opts.today !== undefined && !validDay(opts.today)) { io.err('error: --today must be YYYY-MM-DD'); return 2; }
  const maxAge = opts['max-age'] === undefined ? undefined : Number(opts['max-age']);
  if (maxAge !== undefined && !(maxAge >= 0)) { io.err('error: --max-age must be a number of years'); return 2; }

  const research = path.join(dir, 'research');
  const srcFile = path.join(research, 'sources.json');
  const factFile = path.join(research, 'facts.json');

  if (cmd === 'init') {
    const existing = [srcFile, factFile].filter((f) => fs.existsSync(f));
    if (existing.length) { io.err(`error: already exists: ${existing.join(', ')}`); return 1; }
    fs.mkdirSync(research, { recursive: true });
    const t = templates();
    fs.writeFileSync(srcFile, `${JSON.stringify(t.sources, null, 2)}\n`);
    fs.writeFileSync(factFile, `${JSON.stringify(t.facts, null, 2)}\n`);
    io.out(`Wrote ${srcFile} and ${factFile}`);
    return 0;
  }

  let sources, facts, storyboard = null, publish = null, thumbnail = null;
  try {
    sources = readJson(srcFile);
    facts = readJson(factFile);
    const sbFile = opts.storyboard || firstExisting(path.join(dir, 'storyboard.json'), path.join(dir, 'storyboard.estimate.json'));
    if (sbFile) storyboard = readJson(sbFile);
    const pubFile = opts.publish || firstExisting(path.join(dir, 'publish.json'));
    if (pubFile) publish = readJson(pubFile);
    const thumbFile = opts.thumbnail || firstExisting(path.join(dir, 'thumbnail.json'));
    if (thumbFile) thumbnail = readJson(thumbFile);
  } catch (e) {
    io.err(`error: ${e.message}`);
    return 1;
  }

  const checked = checkLedgers(sources, facts, { today: opts.today, maxAge });
  const errors = [...checked.errors];
  const warnings = [...checked.warnings];
  let used = null;
  if (cmd !== 'check' && (storyboard || publish || thumbnail)) {
    const t = trace(facts, storyboard, publish, thumbnail);
    errors.push(...t.errors);
    warnings.push(...t.warnings);
    used = t.used;
  } else if (cmd === 'trace') errors.push('nothing to trace: no storyboard.json, storyboard.estimate.json, publish.json or thumbnail.json');

  errors.forEach((e) => io.err(`error: ${e}`));
  warnings.forEach((w) => io.err(`warning: ${w}`));
  const nSrc = Array.isArray(sources.sources) ? sources.sources.length : 0;
  const nClaims = Array.isArray(facts.claims) ? facts.claims.length : 0;
  if (cmd !== 'cite') {
    io.out(`${errors.length} error(s), ${warnings.length} warning(s); ${nSrc} sources, ${nClaims} claims${used ? `, ${used.length} used on screen` : ''}.`);
    return errors.length ? 1 : 0;
  }
  if (errors.length) return 1;
  const text = cite(sources, facts, used, { lang: opts.lang, urls: opts.urls !== 'off' });
  if (opts.out) {
    fs.writeFileSync(opts.out, `${text}\n`);
    io.out(`Wrote ${opts.out}`);
  } else io.out(text);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2), { out: (s) => console.log(s), err: (s) => console.error(s) });
}
