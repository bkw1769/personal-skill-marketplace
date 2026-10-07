#!/usr/bin/env node
// Validate a storyboard.json and render it as a readable Markdown table.
//   node storyboard.mjs validate <storyboard.json> [--audience 3-5|6-8|9-10] [--max-cps n] [--max-wpm n]
//   node storyboard.mjs render   <storyboard.json> [--out storyboard.md]
// Reading-speed, episode-length and scene-length checks follow the audience band
// (see references/audience-profiles.md). Korean text is measured in syllables per second,
// English ("language": "en...") in words per minute.
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
      ...(sb.captions || []).filter((c) => inScene(s, c.start)).map((c) => c.text),
      ...(sb.bubbles || []).filter((b) => inScene(s, b.start)).map((b) => `${names.get(b.speaker) || b.speaker}: "${b.text}"`),
    ].map((t) => t.replace(/\n/g, ' ')).join('<br>');
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
  if (!['validate', 'render'].includes(cmd) || !file) {
    io.err('Usage: node storyboard.mjs <validate|render> <storyboard.json> [--audience 3-5|6-8|9-10] [--max-cps n] [--max-wpm n] [--out file.md]');
    return 1;
  }
  let sb;
  try {
    sb = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    io.err(`error: cannot read ${file}: ${/** @type {Error} */ (e).message}`);
    return 1;
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
  const md = render(sb);
  if (o.out) {
    fs.writeFileSync(o.out, md);
    io.out(`Wrote ${o.out}`);
  } else io.out(md);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2), { out: (s) => console.log(s), err: (s) => console.error(s) });
}
