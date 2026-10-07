// Optional written score. While this file exports no buildScore, the player uses autoScore()
// from audio.js (pad + arpeggio per scene from the storyboard's music blocks).
//
// To write music by hand, uncomment and edit. Events are { t, fn, a }: at t seconds the player
// calls synth[fn](time, ...a). Helpers: seq(ev, t0, bpm, 'C5 E5 G5/2 R/1', 'marimba', 0.3),
// chords(ev, t0, bpm, beatsEach, ['C4+E4+G4', ...], 'pad', 0.04),
// arps(ev, t0, bpm, ['C3+G3+C4+E4', ...], beatsEach, 'harp', 0.1), perc(ev, t0, t1, every, 'shaker', 0.05).
// See references/sound-design.md for the instrument list and mood recipes.
//
// import { seq, chords, arps, perc, autoScore } from './audio.js';
//
// export function buildScore(sb) {
//   const ev = autoScore({ ...sb, scenes: sb.scenes.filter((s) => s.id !== 'title') }); // keep auto music elsewhere
//   const title = sb.scenes.find((s) => s.id === 'title');
//   seq(ev, title.start + 0.5, 112, 'C5 E5 G5 E5 | F5 A5 G5/2', 'marimba', 0.3);
//   chords(ev, title.start + 0.5, 112, 4, ['C4+E4+G4', 'F3+A3+C4'], 'pad', 0.03);
//   return ev;
// }
export {};
