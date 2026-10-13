#!/usr/bin/env node
// Turn a story script or storyboard.json into TTS lines (JSON Lines) and lint
// the text for things Qwen3-TTS reads badly. Node >= 22.8, built-ins only.
//
//   node narration-lines.mjs from-text story.txt --lang ko --voice narrator=narrator-ko --voice grandma=grandma-ko --out lines.jsonl
//   node narration-lines.mjs from-storyboard storyboard.json --lang ko --voice narrator=narrator-ko --voice fox=fox-ko --out lines.jsonl
//   node narration-lines.mjs lint lines.jsonl --lang ko [--voices-dir assets/audio/voices]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Max characters per generated line (about 20-25 s of speech); lint warns above it. */
export const MAX_CHARS = { ko: 100, en: 220 };
/** Sentences shorter than this (under about 1.5 s) are merged with a neighbour: very short inputs loop or extend. */
export const MIN_CHARS = { ko: 12, en: 25 };
/** Default pauses (seconds) after a line, for children's stories; join adds about 0.1 s of trimmed pad. */
export const PAUSES = { sentence: 0.6, paragraph: 1.1, speaker: 0.6 };

const SENTENCE_END = /([.!?…。~]+["'”’」』)]*)\s+/u;

/**
 * Split text into sentences, keeping end punctuation and closing quotes.
 * @param {string} text
 * @returns {string[]}
 */
export function sentences(text) {
  const out = [];
  let rest = text.replace(/\s+/g, ' ').trim();
  while (rest) {
    const m = SENTENCE_END.exec(rest);
    if (!m) { out.push(rest); break; }
    const cut = m.index + m[1].length;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  return out;
}

/**
 * One sentence per line (the model is most reliable that way), except that a
 * sentence shorter than `min` is merged with its neighbour when the result
 * stays within `max`. An oversize sentence stays whole and is reported by lint.
 * @param {string[]} list
 * @param {number} max
 * @param {number} min
 * @returns {string[]}
 */
export function chunk(list, max, min) {
  const out = [];
  for (const s of list) {
    const prev = out.at(-1);
    const short = s.length < min || (prev !== undefined && prev.length < min);
    if (prev !== undefined && short && prev.length + 1 + s.length <= max) out[out.length - 1] = `${prev} ${s}`;
    else out.push(s);
  }
  return out;
}

/**
 * Parse a tagged script. `[speaker] text` starts a block; untagged lines
 * continue the current speaker (default `narrator`); a blank line ends a
 * paragraph; `#` lines are comments.
 * @param {string} source
 * @returns {{speaker: string, text: string}[]} paragraphs in order
 */
export function parseScript(source) {
  /** @type {{speaker: string, text: string}[]} */
  const paras = [];
  let speaker = 'narrator';
  let open = false;
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('#')) continue;
    if (!line) { open = false; continue; }
    const m = /^\[([A-Za-z0-9_-]+)\]\s*(.*)$/.exec(line);
    if (m) { speaker = m[1]; open = false; if (!m[2]) continue; }
    const text = m ? m[2] : line;
    if (open) paras[paras.length - 1].text += ` ${text}`;
    else paras.push({ speaker, text });
    open = true;
  }
  return paras;
}

/**
 * Build TTS lines from paragraphs.
 * @param {{speaker: string, text: string}[]} paras
 * @param {{lang: 'ko'|'en', voices: Record<string,string>, prefix?: string, maxChars?: number}} opt
 * @returns {{lines: {id: string, voice: string, text: string, pause_after: number, speaker: string}[], errors: string[], warnings: string[]}}
 */
export function buildLines(paras, opt) {
  const max = opt.maxChars || MAX_CHARS[opt.lang];
  const min = MIN_CHARS[opt.lang];
  const prefix = opt.prefix || opt.lang;
  const lines = [];
  const errors = [];
  const warnings = [];
  for (const [p, para] of paras.entries()) {
    if (mixedDialogue(para.text)) warnings.push(`paragraph ${p + 1} [${para.speaker}]: quoted dialogue mixed with narration; put the dialogue on its own [speaker] line (map it to the same voice if one voice reads everything)`);
    const voice = opt.voices[para.speaker];
    if (!voice) { errors.push(`no --voice mapping for speaker "${para.speaker}"`); continue; }
    const parts = chunk(sentences(stripQuotes(para.text)), max, min);
    const next = paras[p + 1];
    for (const [i, text] of parts.entries()) {
      const last = i === parts.length - 1;
      let pause = PAUSES.sentence;
      if (last) pause = next && next.speaker !== para.speaker ? PAUSES.speaker : PAUSES.paragraph;
      lines.push({ id: `${prefix}-${String(lines.length + 1).padStart(3, '0')}`, voice, text, pause_after: pause, speaker: para.speaker });
    }
  }
  return { lines, errors: [...new Set(errors)], warnings };
}

/**
 * True when a paragraph has a quoted part and also text outside the quotes,
 * i.e. narration and dialogue that would end up in one voice and one line.
 * @param {string} text
 * @returns {boolean}
 */
export function mixedDialogue(text) {
  const quoted = /["“][^"“”]+["”]|「[^」]+」|『[^』]+』/gu;
  if (!quoted.test(text)) return false;
  return text.replace(quoted, '').replace(/[\s.,!?…~]/gu, '').length > 0;
}

/**
 * Remove quotation marks around dialogue: the speaker is already set by the
 * voice, and lines that start with a quote can make the model switch voices.
 * @param {string} text
 * @returns {string}
 */
export function stripQuotes(text) {
  return text.replace(/["“”«»「」『』]/gu, '').replace(/(^|\s)'|'(?=\s|$|[.!?,…])/gu, '$1').replace(/\s+/g, ' ').trim();
}

/**
 * Turn a storyboard (story-storyboard skill) into paragraphs in time order:
 * captions are spoken by `narrator`, bubbles by their speaker unless `narrate: false`.
 * @param {any} sb
 * @returns {{speaker: string, text: string}[]}
 */
export function fromStoryboard(sb) {
  const items = [
    ...(sb.captions || []).map((c) => ({ t: c.start, speaker: 'narrator', text: c.text })),
    ...(sb.bubbles || []).filter((b) => b.narrate !== false).map((b) => ({ t: b.start, speaker: b.speaker, text: b.text })),
  ];
  items.sort((a, b) => a.t - b.t);
  return items.map(({ speaker, text }) => ({ speaker, text: String(text).replace(/\n/g, ' ') }));
}

const CHECKS = [
  { re: /\d/u, msg: 'digits: write how the number is read (e.g. "세 마리", "삼 년", "three")' },
  { re: /[%&@#+=/*_<>|^$~]/u, msg: 'symbol: replace with words' },
  { re: /\p{Extended_Pictographic}/u, msg: 'emoji: remove' },
  { re: /[()[\]{}]/u, msg: 'brackets: rewrite as plain sentence (brackets are not read naturally)' },
  { re: /\.{2,}|…{2,}/u, msg: 'ellipsis: use a single "…" or a comma; long dots cause odd pauses' },
  { re: /[!?]{2,}/u, msg: 'repeated !/?: keep one' },
  { re: /["“”«»「」『』]/u, msg: 'quotation marks: remove (dialogue already has its own voice; quotes can switch the voice)' },
  { re: /^[A-Za-z가-힣]{1,12}\s?:/u, msg: 'speaker label: remove (labels are read aloud)' },
];

/**
 * Lint lines for text the model reads badly.
 * @param {{id: string, voice: string, text: string}[]} lines
 * @param {{lang: 'ko'|'en', maxChars?: number, knownVoices?: Set<string>}} opt
 * @returns {{errors: string[], warnings: string[]}}
 */
export function lint(lines, opt) {
  const max = opt.maxChars || MAX_CHARS[opt.lang];
  const errors = [];
  const warnings = [];
  const ids = new Set();
  for (const l of lines) {
    const at = `${l.id}`;
    if (ids.has(l.id)) errors.push(`${at}: duplicate id`);
    ids.add(l.id);
    if (!l.text || !l.text.trim()) { errors.push(`${at}: empty text`); continue; }
    if (opt.knownVoices && !opt.knownVoices.has(l.voice)) errors.push(`${at}: voice "${l.voice}" is not frozen (design + pick it first)`);
    for (const c of CHECKS) if (c.re.test(l.text)) warnings.push(`${at}: ${c.msg}`);
    if (opt.lang === 'ko' && /[A-Za-z]/.test(l.text)) warnings.push(`${at}: Latin letters in Korean: write in Hangul (e.g. "티라노사우루스")`);
    if (opt.lang === 'en' && /[가-힣]/u.test(l.text)) warnings.push(`${at}: Hangul in English line`);
    if (l.text.length > max) warnings.push(`${at}: ${l.text.length} chars > ${max}; split it (long inputs skip or repeat words)`);
    if (l.text.length < MIN_CHARS[opt.lang]) warnings.push(`${at}: very short line; lengthen it or merge with a neighbour (short inputs can loop or ramble)`);
    if (!/[.!?…。]["'”’」』)]*$/u.test(l.text.trim())) warnings.push(`${at}: no final punctuation; end with . ! ? (helps the last word land)`);
  }
  return { errors, warnings };
}

/**
 * Read JSON Lines.
 * @param {string} text
 * @returns {any[]}
 */
export function parseJsonl(text) {
  return text.split(/\r?\n/).filter((l) => l.trim()).map((l, i) => {
    try { return JSON.parse(l); } catch { throw new Error(`line ${i + 1}: invalid JSON`); }
  });
}

/**
 * List frozen voice ids (folders holding voice.json).
 * @param {string} dir
 * @returns {Set<string>}
 */
export function frozenVoices(dir) {
  if (!fs.existsSync(dir)) return new Set();
  return new Set(fs.readdirSync(dir).filter((d) => fs.existsSync(path.join(dir, d, 'voice.json'))));
}

/**
 * @param {string[]} argv
 * @returns {{cmd: string, file: string, lang: string, out?: string, prefix?: string, voicesDir?: string, maxChars?: number, voices: Record<string,string>}}
 */
export function parseArgs(argv) {
  const [cmd, file, ...rest] = argv;
  /** @type {any} */
  const o = { cmd, file, lang: 'ko', voices: {} };
  for (let i = 0; i < rest.length; i += 2) {
    const [k, v] = [rest[i], rest[i + 1]];
    if (v === undefined) throw new Error(`missing value for ${k}`);
    if (k === '--voice') {
      const [speaker, voice] = v.split('=');
      if (!speaker || !voice) throw new Error(`--voice needs speaker=voice-id, got "${v}"`);
      o.voices[speaker] = voice;
    } else if (k === '--lang') o.lang = v;
    else if (k === '--out') o.out = v;
    else if (k === '--prefix') o.prefix = v;
    else if (k === '--voices-dir') o.voicesDir = v;
    else if (k === '--max-chars') o.maxChars = Number(v);
    else throw new Error(`unknown option ${k}`);
  }
  if (!['ko', 'en'].includes(o.lang)) throw new Error(`--lang must be ko or en, got "${o.lang}"`);
  return o;
}

const USAGE = 'Usage: node narration-lines.mjs <from-text|from-storyboard|lint> <file> --lang ko|en [--voice speaker=voice-id ...] [--out lines.jsonl] [--prefix id] [--voices-dir dir] [--max-chars n]';

/**
 * @param {string[]} argv
 * @param {{out: (s: string) => void, err: (s: string) => void}} io
 * @returns {number} exit code
 */
export function main(argv, io) {
  let o;
  try { o = parseArgs(argv); } catch (e) { io.err(`error: ${/** @type {Error} */ (e).message}`); io.err(USAGE); return 2; }
  if (!['from-text', 'from-storyboard', 'lint'].includes(o.cmd) || !o.file) { io.err(USAGE); return 2; }
  let source;
  try { source = fs.readFileSync(o.file, 'utf8'); } catch (e) { io.err(`error: cannot read ${o.file}: ${/** @type {Error} */ (e).message}`); return 2; }
  const lang = /** @type {'ko'|'en'} */ (o.lang);
  const knownVoices = o.voicesDir ? frozenVoices(o.voicesDir) : undefined;
  let lines;
  let errors = [];
  let warnings = [];
  try {
    if (o.cmd === 'lint') lines = parseJsonl(source);
    else {
      const paras = o.cmd === 'from-text' ? parseScript(source) : fromStoryboard(JSON.parse(source));
      ({ lines, errors, warnings } = buildLines(paras, { lang, voices: o.voices, prefix: o.prefix, maxChars: o.maxChars }));
    }
  } catch (e) { io.err(`error: ${/** @type {Error} */ (e).message}`); return 2; }
  const report = lint(lines, { lang, maxChars: o.maxChars, knownVoices });
  errors = [...errors, ...report.errors];
  warnings = [...warnings, ...report.warnings];
  errors.forEach((e) => io.err(`error: ${e}`));
  warnings.forEach((w) => io.err(`warning: ${w}`));
  if (o.cmd !== 'lint' && !errors.length) {
    const body = lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
    if (o.out) { fs.writeFileSync(o.out, body); io.out(`Wrote ${o.out}`); } else io.out(body.trimEnd());
  }
  io.out(`${lines.length} line(s), ${errors.length} error(s), ${warnings.length} warning(s).`);
  return errors.length ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2), { out: (s) => console.log(s), err: (s) => console.error(s) });
}
