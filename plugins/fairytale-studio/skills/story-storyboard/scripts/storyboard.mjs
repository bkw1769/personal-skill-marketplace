#!/usr/bin/env node
// Validate a storyboard.json and render it as a readable Markdown table.
//   node storyboard.mjs validate <storyboard.json> [--audience 3-5|6-8|9-10] [--max-cps n] [--max-wpm n]
//   node storyboard.mjs render   <storyboard.json> [--out storyboard.md]
//   node storyboard.mjs retime   <storyboard.json> --timeline <timeline.json> --out <storyboard.json> [--min-gap 0.3] [--tail 0.8] [--keep-length yes]
// Reading-speed, episode-length and scene-length checks follow the audience band
// (see references/audience-profiles.md). Korean text is measured in syllables per second,
// English ("language": "en...") in words per minute. `retime` moves captions, bubbles, cues and scene
// boundaries to the real length of recorded narration (timeline.json from the storybook-narration tts tool).
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export const SCHEMA = 'storyboard/1';
export const EPS = 0.05;

/**
 * Audience bands. maxCps = Korean narration/caption syllables per second (1 character = 1 syllable),
 * maxWpm = English words per minute,
 * episode = recommended single-story length in seconds, minScene = shortest comfortable scene.
 * Values come from docs research (2026-10-08); most are inferences to recalibrate with retention data.
 */
export const AUDIENCE = {
  '3-5': { label: '만 3~5세', maxCps: 4, maxWpm: 120, episode: [180, 420], minScene: 8 },
  '6-8': { label: '만 6~8세', maxCps: 5, maxWpm: 135, episode: [360, 720], minScene: 5 },
  '9-10': { label: '만 9~10세', maxCps: 5.5, maxWpm: 150, episode: [600, 1080], minScene: 4 },
};
export const DEFAULT_AUDIENCE = '6-8';

/**
 * Words a viewer hears or reads (whitespace-separated tokens).
 * @param {string} text
 * @returns {number}
 */
export function countWords(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Audience band of a storyboard: explicit `audience`, else the lower bound of `audience_age`
 * ("6-10" -> 6-8), else the default band.
 * @param {any} sb
 * @returns {string}
 */
export function bandFor(sb) {
  if (sb.audience in AUDIENCE) return sb.audience;
  const m = /^(\d+)/.exec(String(sb.audience_age || ''));
  if (!m) return DEFAULT_AUDIENCE;
  const low = Number(m[1]);
  return low <= 5 ? '3-5' : low <= 8 ? '6-8' : '9-10';
}

/**
 * Visible characters a viewer has to read (whitespace excluded).
 * @param {string} text
 * @returns {number}
 */
export function readChars(text) {
  return text.replace(/\s/g, '').length;
}

/**
 * Format seconds as m:ss.s
 * @param {number} t
 * @returns {string}
 */
export function fmt(t) {
  const m = Math.floor(t / 60);
  const s = (t - m * 60).toFixed(1).padStart(4, '0');
  return `${m}:${s}`;
}

/**
 * Check a storyboard. Errors break playback or sync; warnings are craft problems (reading speed, layout).
 * @param {any} sb
 * @param {{maxCps?: number, maxWpm?: number, maxLines?: number, audience?: string}} [opt]
 * @returns {{errors: string[], warnings: string[], audience: string}}
 */
export function validate(sb, opt = {}) {
  const audience = opt.audience && opt.audience in AUDIENCE ? opt.audience : bandFor(sb);
  const band = AUDIENCE[audience];
  const maxCps = opt.maxCps ?? band.maxCps;
  const maxWpm = opt.maxWpm ?? band.maxWpm;
  const english = /^en/i.test(String(sb.language || ''));
  const maxLines = opt.maxLines ?? 2;
  const errors = [];
  const warnings = [];
  if (sb.schema !== SCHEMA) errors.push(`schema must be "${SCHEMA}"`);
  if (!sb.title) errors.push('title is required');
  const dur = sb.duration;
  if (!(typeof dur === 'number' && dur > 0)) errors.push('duration must be a positive number of seconds');
  else if (dur < band.episode[0] || dur > band.episode[1]) warnings.push(`duration ${fmt(dur)} is outside the ${band.label} single-episode range ${fmt(band.episode[0])}-${fmt(band.episode[1])} (split, extend, or set "audience")`);
  if (opt.audience && !(opt.audience in AUDIENCE)) errors.push(`unknown audience "${opt.audience}" (use ${Object.keys(AUDIENCE).join(', ')})`);
  const castIds = new Set((sb.cast || []).map((c) => c.id));
  const hasCast = castIds.size > 0;

  /** Shared checks for anything with start/end. */
  const span = (/** @type {string} */ where, /** @type {any} */ x) => {
    if (typeof x.start !== 'number' || typeof x.end !== 'number' || !(x.start < x.end)) {
      errors.push(`${where}: start must be a number below end`);
      return false;
    }
    if (x.start < 0 || x.end > dur + EPS) errors.push(`${where}: ${fmt(x.start)}-${fmt(x.end)} is outside 0-${fmt(dur)}`);
    return true;
  };
  const reading = (/** @type {string} */ where, /** @type {any} */ x) => {
    if (typeof x.text !== 'string' || !x.text.trim()) {
      errors.push(`${where}: text is required`);
      return;
    }
    const secs = x.end - x.start;
    if (english) {
      const words = countWords(x.text);
      const need = (words / maxWpm) * 60;
      if (need > secs + EPS) warnings.push(`${where}: ${words} words in ${secs.toFixed(1)}s reads at ${Math.round((words / secs) * 60)} wpm (max ${maxWpm}); give it ${need.toFixed(1)}s or shorten it`);
    } else {
      const need = readChars(x.text) / maxCps;
      if (need > secs + EPS) warnings.push(`${where}: ${readChars(x.text)} chars in ${secs.toFixed(1)}s reads at ${(readChars(x.text) / secs).toFixed(1)}/s; give it ${need.toFixed(1)}s or shorten it`);
    }
    const lines = x.text.split('\n');
    if (lines.length > maxLines) warnings.push(`${where}: ${lines.length} lines (max ${maxLines})`);
  };

  const scenes = sb.scenes || [];
  if (!scenes.length) errors.push('at least one scene is required');
  const sceneIds = new Set();
  scenes.forEach((s, i) => {
    const where = `scene ${s.id || i}`;
    if (!s.id) errors.push(`scene ${i}: id is required`);
    else if (sceneIds.has(s.id)) errors.push(`${where}: duplicate id`);
    sceneIds.add(s.id);
    if (!span(where, s)) return;
    if (s.end - s.start < band.minScene - EPS && i < scenes.length - 1) warnings.push(`${where}: ${(s.end - s.start).toFixed(1)}s is short for ${band.label} (min ${band.minScene}s; do not cut mid-sentence)`);
    const prev = scenes[i - 1];
    if (i === 0 && Math.abs(s.start) > EPS) errors.push(`${where}: first scene must start at 0:00.0`);
    if (prev && typeof prev.end === 'number') {
      if (s.start > prev.end + EPS) errors.push(`${where}: gap of ${(s.start - prev.end).toFixed(2)}s after ${prev.id}`);
      if (s.start < prev.end - EPS) errors.push(`${where}: overlaps ${prev.id} by ${(prev.end - s.start).toFixed(2)}s`);
    }
    for (const c of s.characters || []) if (hasCast && !castIds.has(c)) errors.push(`${where}: character "${c}" is not in cast`);
  });
  const last = scenes[scenes.length - 1];
  if (last && typeof last.end === 'number' && Math.abs(last.end - dur) > EPS) errors.push(`last scene ends at ${fmt(last.end)} but duration is ${fmt(dur)}`);

  const caps = sb.captions || [];
  caps.forEach((c, i) => {
    const where = `caption ${i + 1} (${fmt(c.start ?? 0)})`;
    if (!span(where, c)) return;
    reading(where, c);
    const prev = caps[i - 1];
    if (prev && c.start < prev.end - EPS) errors.push(`${where}: overlaps the previous caption`);
  });

  (sb.bubbles || []).forEach((b, i) => {
    const where = `bubble ${i + 1} (${fmt(b.start ?? 0)})`;
    if (!span(where, b)) return;
    reading(where, b);
    if (!b.speaker) errors.push(`${where}: speaker is required`);
    else if (hasCast && !castIds.has(b.speaker)) errors.push(`${where}: speaker "${b.speaker}" is not in cast`);
  });

  (sb.cues || []).forEach((c, i) => {
    const where = `cue ${i + 1}`;
    if (typeof c.t !== 'number' || c.t < 0 || c.t > dur + EPS) errors.push(`${where}: t must be within 0-${fmt(dur)}`);
    if (!c.sound) errors.push(`${where}: sound is required`);
  });
  return { errors, warnings, audience };
}

/**
 * Markdown view: one table of scenes, each followed by the captions, bubbles and cue counts inside it.
 * @param {any} sb
 * @returns {string}
 */
export function render(sb) {
  const out = [`# ${sb.title}`, ''];
  const meta = [['Duration', fmt(sb.duration)], ['Audience', `${AUDIENCE[bandFor(sb)].label}${sb.audience_age ? ` (${sb.audience_age})` : ''}`], ['Style', sb.style], ['Era', sb.era]].filter(([, v]) => v);
  out.push(meta.map(([k, v]) => `${k}: ${v}`).join(' · '), '');
  if ((sb.cast || []).length) {
    out.push('## Cast', '', '| ID | Name | Notes |', '|---|---|---|');
    for (const c of sb.cast) out.push(`| ${c.id} | ${c.name || ''} | ${c.notes || ''} |`);
    out.push('');
  }
  out.push('## Scenes', '', '| # | Time | Scene | Action | Words on screen | Sound |', '|---:|---|---|---|---|---|');
  const inScene = (/** @type {any} */ s, /** @type {number} */ t) => t >= s.start - EPS && t < s.end - EPS;
  const names = new Map((sb.cast || []).map((/** @type {any} */ c) => [c.id, c.name || c.id]));
  (sb.scenes || []).forEach((s, i) => {
    const words = [
      ...(sb.captions || []).filter((c) => inScene(s, c.start)).map((c) => ({ t: c.start, text: c.text })),
      ...(sb.bubbles || []).filter((b) => inScene(s, b.start)).map((b) => ({ t: b.start, text: `${names.get(b.speaker) || b.speaker}: "${b.text}"` })),
    ].sort((a, b) => a.t - b.t).map((w) => w.text.replace(/\n/g, ' ')).join('<br>');
    const cues = (sb.cues || []).filter((c) => inScene(s, c.t));
    const kinds = [...new Set(cues.map((c) => c.sound))].join(', ');
    const music = s.music ? [s.music.mood, s.music.tempo && `${s.music.tempo} bpm`, s.music.instruments && s.music.instruments.join('/')].filter(Boolean).join(' ') : '';
    const sound = [music && `music: ${music}`, cues.length && `${cues.length} cues (${kinds})`].filter(Boolean).join('<br>');
    out.push(`| ${i + 1} | ${fmt(s.start)}-${fmt(s.end)} | **${s.title || s.id}** ${s.location ? `(${s.location})` : ''} | ${s.action || ''} | ${words} | ${sound} |`);
  });
  if (sb.notes) {
    out.push('', '## Notes', '');
    for (const [k, list] of Object.entries(sb.notes)) for (const n of /** @type {string[]} */ (list)) out.push(`- ${k}: ${n}`);
  }
  return out.join('\n') + '\n';
}

/**
 * Text reduced to letters and digits, lower case, for matching narration lines to captions.
 * @param {string} text
 * @returns {string}
 */
export function norm(text) {
  return String(text).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/**
 * Spoken items of a storyboard in time order, as the narration converter reads them:
 * every caption, and every bubble unless `narrate: false`.
 * @param {any} sb
 * @returns {any[]} the caption and bubble objects themselves
 */
export function spokenItems(sb) {
  return [...(sb.captions || []), ...(sb.bubbles || []).filter((b) => b.narrate !== false)].sort((a, b) => a.start - b.start);
}

/**
 * Match recorded lines to spoken items by text. One item may span several lines (the converter
 * splits long captions) and one line may cover several items (it merges very short ones); a shared
 * line is divided by text length.
 * @param {any[]} items
 * @param {{id: string, text: string, start: number, end: number}[]} lines
 * @returns {{start: number, end: number, ids: string[]}[]} speech span per item in timeline seconds
 */
export function matchSpeech(items, lines) {
  const spans = [];
  let j = 0, used = 0;
  for (const item of items) {
    let rem = norm(item.text);
    /** @type {{start: number, end: number, ids: string[]} | null} */
    let span = null;
    while (rem.length) {
      if (j >= lines.length) throw new Error(`no recorded line left for "${item.text}"`);
      const line = lines[j], full = norm(line.text);
      const left = full.slice(used);
      const at = (/** @type {number} */ k) => line.start + ((line.end - line.start) * k) / full.length;
      const take = left.startsWith(rem) ? rem.length : rem.startsWith(left) ? left.length : -1;
      if (take < 0) throw new Error(`recorded line ${line.id} "${line.text}" does not match "${item.text}"`);
      if (!span) span = { start: at(used), end: 0, ids: [] };
      if (!span.ids.includes(line.id)) span.ids.push(line.id);
      used += take;
      span.end = at(used);
      rem = rem.slice(take);
      if (used >= full.length) { j++; used = 0; }
    }
    spans.push(span || { start: 0, end: 0, ids: [] });
  }
  if (j < lines.length) throw new Error(`${lines.length - j} recorded line(s) left over, starting with ${lines[j].id}`);
  return spans;
}

/**
 * Re-time a storyboard to recorded narration (voice first, picture follows). Each scene keeps its
 * lead-in before the first spoken item and the original pause after every item (so question pauses
 * survive); captions stay up at least their reading time; a scene lasts as long as its speech plus a
 * tail, never shorter than the audience band's minimum (or its old length with keepLength). Cues and
 * unspoken bubbles keep their offset from the spoken item before them. Items get `voice_lines`.
 * @param {any} sb
 * @param {{lines: {id: string, text: string, start: number, end: number}[]}} timeline
 * @param {{minGap?: number, tail?: number, keepLength?: boolean}} [opt]
 * @returns {{storyboard: any, changes: string[]}}
 */
export function retime(sb, timeline, opt = {}) {
  const minGap = opt.minGap ?? 0.3, tail = opt.tail ?? 0.8;
  const out = JSON.parse(JSON.stringify(sb));
  const band = AUDIENCE[bandFor(sb)];
  const english = /^en/i.test(String(sb.language || ''));
  const readNeed = (/** @type {string} */ t) => (english ? (countWords(t) / band.maxWpm) * 60 : readChars(t) / band.maxCps);
  const items = spokenItems(out);
  const speech = matchSpeech(items, timeline.lines);
  const spokenSet = new Set(items);
  const origStart = new Map(items.map((it) => [it, it.start]));
  const origEnd = new Map(items.map((it) => [it, it.end]));
  const inScene = (/** @type {any} */ s, /** @type {number} */ t, /** @type {boolean} */ last) => t >= s.start - EPS && (t < s.end - EPS || last);
  const changes = [];
  let cursor = 0;
  out.scenes.forEach((/** @type {any} */ s, /** @type {number} */ si) => {
    const last = si === out.scenes.length - 1;
    const oldStart = s.start, oldLen = s.end - s.start;
    const mine = items.filter((it) => inScene(s, origStart.get(it), last));
    /** Old time -> new time, anchored on the last spoken item that started at or before it. */
    const anchors = [{ old: oldStart, now: cursor }];
    let t = cursor + (mine.length ? Math.max(0, origStart.get(mine[0]) - oldStart) : 0);
    let speechEnd = cursor;
    mine.forEach((it, k) => {
      const sp = speech[items.indexOf(it)];
      const len = sp.end - sp.start;
      anchors.push({ old: origStart.get(it), now: t });
      it.start = round(t);
      it.end = round(t + Math.max(len, readNeed(it.text)));
      it.voice_lines = sp.ids;
      speechEnd = t + len;
      const next = mine[k + 1];
      const gap = next ? Math.max(minGap, origStart.get(next) - origEnd.get(it)) : 0;
      t = speechEnd + gap;
      if (next) it.end = round(Math.min(it.end, t - 0.05));
    });
    const keepTail = mine.length ? Math.max(tail, s.end - origEnd.get(mine[mine.length - 1])) : 0;
    const need = mine.length ? speechEnd + keepTail - cursor : oldLen;
    const len = Math.max(need, opt.keepLength ? oldLen : Math.min(oldLen, band.minScene));
    const moveOld = (/** @type {number} */ x) => {
      let a = anchors[0];
      for (const b of anchors) if (b.old <= x + EPS) a = b;
      return round(Math.min(a.now + (x - a.old), cursor + len - 0.05));
    };
    for (const c of out.cues || []) if (inScene({ start: oldStart, end: oldStart + oldLen }, c.t, last) && c._done !== true) { c.t = moveOld(c.t); c._done = true; }
    for (const b of out.bubbles || []) {
      if (spokenSet.has(b) || b._done || !inScene({ start: oldStart, end: oldStart + oldLen }, b.start, last)) continue;
      const blen = b.end - b.start;
      b.start = moveOld(b.start);
      b.end = round(Math.min(b.start + blen, cursor + len));
      b._done = true;
    }
    s.start = round(cursor);
    s.end = round(cursor + len);
    if (Math.abs(s.start - oldStart) > EPS || Math.abs(len - oldLen) > EPS) changes.push(`${s.id}: ${fmt(oldStart)} ${oldLen.toFixed(1)}s -> ${fmt(s.start)} ${len.toFixed(1)}s`);
    cursor = s.end;
  });
  for (const x of [...(out.cues || []), ...(out.bubbles || [])]) delete x._done;
  if (out.captions) {
    out.captions.sort((/** @type {any} */ a, /** @type {any} */ b) => a.start - b.start);
    // A caption held for reading time must not run into the next one, even across a scene boundary.
    out.captions.forEach((/** @type {any} */ c, /** @type {number} */ i) => {
      const next = out.captions[i + 1];
      if (next && c.end > next.start - 0.05) c.end = round(Math.max(c.start + 0.1, next.start - 0.05));
    });
  }
  out.duration = round(cursor);
  return { storyboard: out, changes };
}

/** @param {number} x @returns {number} */
const round = (x) => Math.round(x * 100) / 100;

/**
 * SubRip time stamp: HH:MM:SS,mmm.
 * @param {number} t seconds
 * @returns {string}
 */
export function srtTime(t) {
  const ms = Math.max(0, Math.round(t * 1000));
  const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
}

/**
 * Subtitles (SubRip) from the words on screen: captions and bubbles in time order. A line that runs into the
 * next one ends `gap` seconds before it starts (video players show one cue at a time more cleanly), but never
 * shorter than 0.3 s. With `speakers`, bubble lines get the speaker's cast name in front ("Dori: ...").
 * @param {any} sb storyboard
 * @param {{gap?: number, speakers?: boolean}} [opt]
 * @returns {string}
 */
export function srt(sb, opt = {}) {
  const gap = opt.gap ?? 0.05;
  const names = new Map((sb.cast || []).map((c) => [c.id, c.name || c.id]));
  const items = [
    ...(sb.captions || []).map((c) => ({ start: c.start, end: c.end, text: c.text })),
    ...(sb.bubbles || []).map((b) => ({ start: b.start, end: b.end, text: opt.speakers ? `${names.get(b.speaker) ?? b.speaker}: ${b.text}` : b.text })),
  ].sort((a, b) => a.start - b.start);
  return items.map((it, i) => {
    const next = items[i + 1];
    const end = next && next.start < it.end ? Math.max(it.start + 0.3, next.start - gap) : it.end;
    const text = String(it.text).split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
    return `${i + 1}\n${srtTime(it.start)} --> ${srtTime(end)}\n${text}\n`;
  }).join('\n');
}

/**
 * CLI entry.
 * @param {string[]} argv
 * @param {{out: (s: string) => void, err: (s: string) => void}} io
 * @returns {number}
 */
export function main(argv, io) {
  const [cmd, file, ...rest] = argv;
  /** @type {Record<string, string>} */
  const o = {};
  for (let i = 0; i < rest.length; i += 2) o[rest[i].replace(/^--/, '')] = rest[i + 1];
  if (!['validate', 'render', 'retime', 'srt'].includes(cmd) || !file || (cmd === 'retime' && (!o.timeline || !o.out))) {
    io.err('Usage: node storyboard.mjs <validate|render> <storyboard.json> [--audience 3-5|6-8|9-10] [--max-cps n] [--max-wpm n] [--out file.md]\n       node storyboard.mjs srt <storyboard.json> [--out file.srt] [--speakers yes]\n       node storyboard.mjs retime <storyboard.json> --timeline <timeline.json> --out <storyboard.json> [--min-gap 0.3] [--tail 0.8] [--keep-length yes]');
    return 1;
  }
  let sb;
  try {
    sb = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    io.err(`error: cannot read ${file}: ${/** @type {Error} */ (e).message}`);
    return 1;
  }
  if (cmd === 'retime') {
    try {
      const timeline = JSON.parse(fs.readFileSync(o.timeline, 'utf8'));
      const res = retime(sb, timeline, { minGap: o['min-gap'] ? Number(o['min-gap']) : undefined, tail: o.tail ? Number(o.tail) : undefined, keepLength: o['keep-length'] === 'yes' });
      fs.writeFileSync(o.out, JSON.stringify(res.storyboard, null, 2) + '\n');
      res.changes.forEach((c) => io.out(`  ${c}`));
      io.out(`Retimed ${fmt(sb.duration)} -> ${fmt(res.storyboard.duration)}; ${res.changes.length} scene(s) moved or resized; wrote ${o.out}. Run validate next.`);
      return 0;
    } catch (e) {
      io.err(`error: ${/** @type {Error} */ (e).message}`);
      return 1;
    }
  }
  const { errors, warnings, audience } = validate(sb, {
    maxCps: o['max-cps'] ? Number(o['max-cps']) : undefined,
    maxWpm: o['max-wpm'] ? Number(o['max-wpm']) : undefined,
    audience: o.audience,
  });
  errors.forEach((e) => io.err(`error: ${e}`));
  warnings.forEach((w) => io.err(`warning: ${w}`));
  if (cmd === 'validate') {
    io.out(`${errors.length} error(s), ${warnings.length} warning(s) for ${AUDIENCE[audience].label}; ${(sb.scenes || []).length} scenes, ${(sb.captions || []).length} captions, ${(sb.bubbles || []).length} bubbles, ${(sb.cues || []).length} cues.`);
    return errors.length ? 1 : 0;
  }
  if (errors.length) return 1;
  const md = cmd === 'srt' ? srt(sb, { speakers: o.speakers === 'yes' }) : render(sb);
  if (o.out) {
    fs.writeFileSync(o.out, md);
    io.out(`Wrote ${o.out}`);
  } else io.out(md);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2), { out: (s) => console.log(s), err: (s) => console.error(s) });
}
