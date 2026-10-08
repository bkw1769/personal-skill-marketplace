// Web Audio synthesizer: every note and sound effect is generated in code and
// scheduled on the same clock that drives the animation.

const NOTE_IDX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function nf(n) {
  const m = n.match(/^([A-G])(#|b)?(-?\d)$/);
  if (!m) throw new Error('bad note ' + n);
  const k = NOTE_IDX[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  const midi = (Number(m[3]) + 1) * 12 + k;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export class Synth {
  /**
   * @param {BaseAudioContext} [context] Pass an OfflineAudioContext to render offline (see renderRange).
   * @param {{music?: number, duck?: number, voice?: number, master?: number, dynamics?: boolean}} [mix] Levels:
   *   music bed (music + effects) gain, factor on the bed while a recorded line plays, recorded voice gain,
   *   master gain; dynamics: false skips the master compressor and limiter (raw balance checks).
   */
  constructor(context, mix = {}) {
    const ctx = (this.ctx = context || new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'playback' }));
    this.mix = { music: 1, duck: 0.3, voice: 1, master: 0.85, ...mix };
    this.master = ctx.createGain();
    this.master.gain.value = this.mix.master;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;
    // Peak limiter so a loud line or effect never clips at the output. Web Audio compressors add
    // automatic makeup gain (about +2.3 dB at these settings); the trim after it takes that back so
    // peaks stay near -1 dBFS. mix.dynamics === false bypasses both (level checks of the raw balance).
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -4; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.12;
    const trim = ctx.createGain();
    trim.gain.value = 0.86;
    if (this.mix.dynamics === false) {
      this.master.connect(ctx.destination);
      this.out = this.master;
    } else {
      this.master.connect(comp);
      comp.connect(lim);
      lim.connect(trim);
      trim.connect(ctx.destination);
      this.out = trim;
    }
    this.verb = ctx.createConvolver();
    this.verb.buffer = this.makeIR(2.6);
    const vg = ctx.createGain();
    vg.gain.value = 0.32;
    this.verb.connect(vg);
    vg.connect(this.master);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) nd[i] = Math.random() * 2 - 1;
    this.voiceOut = ctx.createGain();
    this.voiceOut.gain.value = this.mix.voice;
    this.voiceOut.connect(this.master);
    this.voiceBuf = null;
    this.session = null;
    this.events = [];
    this.idx = 0;
    this.anchor = 0;
    this.active = false;
    this.newSession();
  }

  makeIR(sec) {
    const sr = this.ctx.sampleRate, n = Math.floor(sr * sec);
    const b = this.ctx.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.2);
    }
    return b;
  }

  newSession() {
    const now = this.ctx.currentTime;
    if (this.session) {
      const old = this.session;
      for (const n of [old.dry, old.wet, old.voice]) {
        n.gain.cancelScheduledValues(now);
        n.gain.setTargetAtTime(0, now, 0.03);
      }
      setTimeout(() => { old.dry.disconnect(); old.wet.disconnect(); old.voice.disconnect(); }, 600);
    }
    const dry = this.ctx.createGain();
    dry.gain.value = this.mix.music;
    dry.connect(this.master);
    const wet = this.ctx.createGain();
    wet.gain.value = this.mix.music;
    wet.connect(this.verb);
    const voice = this.ctx.createGain();
    voice.connect(this.voiceOut);
    this.session = { dry, wet, voice };
  }

  start(events, fromT, anchor) {
    this.events = events;
    this.anchor = anchor;
    this.newSession();
    this.idx = events.findIndex((e) => e.t >= fromT - 0.02);
    if (this.idx < 0) this.idx = events.length;
    // A recorded line or a duck window already under way at the seek point resumes mid-way.
    const at = this.ctx.currentTime + 0.03;
    for (let k = 0; k < this.idx; k++) {
      const e = events[k];
      if (e.fn === 'voice' && e.t + e.a[1] > fromT + 0.05) this.voice(at, e.a[0] + (fromT - e.t), e.a[1] - (fromT - e.t));
      if (e.fn === 'duck' && e.t + e.a[0] > fromT) this.duck(at, e.a[0] - (fromT - e.t));
    }
    this.active = true;
  }

  /** Use a decoded recording (the narration's full.wav) for 'voice' events. */
  setVoice(buffer) {
    this.voiceBuf = buffer;
  }

  /** Recorded narration: play `dur` seconds of the voice buffer from `offset`. No reverb. */
  voice(t, offset, dur) {
    if (!this.voiceBuf || dur <= 0) return;
    const s = this.ctx.createBufferSource();
    s.buffer = this.voiceBuf;
    s.connect(this.session.voice);
    s.start(t, Math.max(0, offset), dur);
  }

  /** Lower music and effects to mix.duck for `dur` seconds (side-chain style), then recover. */
  duck(t, dur) {
    const low = this.mix.music * this.mix.duck;
    for (const n of [this.session.dry, this.session.wet]) {
      n.gain.setTargetAtTime(low, t, 0.06);
      n.gain.setTargetAtTime(this.mix.music, t + Math.max(0.05, dur), 0.3);
    }
  }

  /** Mute or unmute the recorded voice (the narration button). */
  setVoiceOn(on) {
    this.voiceOut.gain.setTargetAtTime(on ? this.mix.voice : 0, this.ctx.currentTime, 0.02);
  }

  stop() {
    this.active = false;
    this.newSession();
  }

  pump() {
    if (!this.active) return;
    const now = this.ctx.currentTime;
    const T = now - this.anchor;
    while (this.idx < this.events.length && this.events[this.idx].t < T + 0.4) {
      const e = this.events[this.idx++];
      const at = Math.max(now + 0.005, this.anchor + e.t);
      const fn = this[e.fn];
      if (typeof fn === 'function') fn.call(this, at, ...(e.a || []));
    }
  }

  // ---- building blocks ----
  o(node, rev = 0.2) {
    node.connect(this.session.dry);
    if (rev > 0) {
      const g = this.ctx.createGain();
      g.gain.value = rev;
      node.connect(g);
      g.connect(this.session.wet);
    }
  }
  osc(type, f, t, stop) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.start(t);
    o.stop(stop);
    return o;
  }
  g(v = 0) {
    const g = this.ctx.createGain();
    g.gain.value = v;
    return g;
  }
  filt(type, f, q = 1) {
    const b = this.ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    return b;
  }
  nz(t, dur) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
    return s;
  }
  perc(g, t, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
  }
  adsr(g, t, a, peak, hold, rel) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + a + Math.max(0, hold));
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + Math.max(0, hold) + rel);
  }

  // ---- instruments: (t, freq, velocity, duration) ----
  marimba(t, f, v = 0.3) {
    const g = this.g();
    this.perc(g, t, v, 0.75);
    this.osc('sine', f, t, t + 0.8).connect(g);
    const g2 = this.g();
    this.perc(g2, t, v * 0.4, 0.1);
    this.osc('sine', f * 4, t, t + 0.15).connect(g2);
    g2.connect(g);
    this.o(g, 0.18);
  }
  pluck(t, f, v = 0.25, dur = 0.4) {
    const g = this.g();
    this.perc(g, t, v, Math.max(0.22, Math.min(dur, 0.9)));
    const o = this.osc('triangle', f, t, t + 1);
    const lp = this.filt('lowpass', f * 8, 0.8);
    lp.frequency.setValueAtTime(f * 8, t);
    lp.frequency.exponentialRampToValueAtTime(f * 1.4, t + 0.25);
    o.connect(lp);
    lp.connect(g);
    this.o(g, 0.14);
  }
  pizz(t, f, v = 0.25) {
    this.pluck(t, f, v, 0.2);
  }
  harp(t, f, v = 0.18) {
    const g = this.g();
    this.perc(g, t, v, 1.8);
    this.osc('sine', f, t, t + 1.9).connect(g);
    const g2 = this.g(0.35);
    this.osc('triangle', f, t, t + 1.9).connect(g2);
    g2.connect(g);
    this.o(g, 0.45);
  }
  flute(t, f, v = 0.14, dur = 0.5) {
    const g = this.g();
    this.adsr(g, t, 0.06, v, dur - 0.1, 0.18);
    const o = this.osc('sine', f, t, t + dur + 0.4);
    const vib = this.osc('sine', 5.4, t, t + dur + 0.4);
    const vg = this.g(0);
    vg.gain.setValueAtTime(0, t);
    vg.gain.linearRampToValueAtTime(f * 0.007, t + 0.3);
    vib.connect(vg);
    vg.connect(o.frequency);
    o.connect(g);
    const h = this.g(0.12);
    this.osc('sine', f * 2, t, t + dur + 0.4).connect(h);
    h.connect(g);
    const bn = this.nz(t, dur + 0.3);
    const bp = this.filt('bandpass', f * 2, 2);
    const bg = this.g(0.18);
    bn.connect(bp); bp.connect(bg); bg.connect(g);
    this.o(g, 0.4);
  }
  bell(t, f, v = 0.2, dur = 1.6) {
    const parts = [[1, 1, 1], [2.756, 0.3, 0.5], [5.404, 0.12, 0.25]];
    const g = this.g(1);
    for (const [m, a, d] of parts) {
      const pg = this.g();
      this.perc(pg, t, v * a, dur * d);
      this.osc('sine', f * m, t, t + dur + 0.1).connect(pg);
      pg.connect(g);
    }
    this.o(g, 0.4);
  }
  box(t, f, v = 0.16) {
    this.bell(t, f, v, 1.2);
  }
  pad(t, f, v = 0.05, dur = 2) {
    const g = this.g();
    this.adsr(g, t, Math.min(0.6, dur * 0.3), v, dur * 0.7, 1.0);
    const lp = this.filt('lowpass', 1100, 0.4);
    for (const det of [-8, 8]) {
      const o = this.osc('sawtooth', f, t, t + dur + 1.2);
      o.detune.value = det;
      o.connect(lp);
    }
    lp.connect(g);
    this.o(g, 0.55);
  }
  bass(t, f, v = 0.28, dur = 0.4) {
    const g = this.g();
    this.adsr(g, t, 0.01, v, dur * 0.6, 0.15);
    const lp = this.filt('lowpass', 650, 0.7);
    this.osc('triangle', f, t, t + dur + 0.3).connect(lp);
    const sg = this.g(0.6);
    this.osc('sine', f, t, t + dur + 0.3).connect(sg);
    sg.connect(lp);
    lp.connect(g);
    this.o(g, 0.04);
  }
  kick(t, f = 0, v = 0.5) {
    const g = this.g();
    this.perc(g, t, v, 0.32);
    const o = this.osc('sine', 130, t, t + 0.35);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.14);
    o.connect(g);
    this.o(g, 0);
  }
  tom(t, f = 110, v = 0.4) {
    f = f || 110;
    const g = this.g();
    this.perc(g, t, v, 0.45);
    const o = this.osc('sine', f * 1.6, t, t + 0.5);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.15);
    o.connect(g);
    const n = this.nz(t, 0.08);
    const bp = this.filt('bandpass', 900, 1);
    const ng = this.g();
    this.perc(ng, t, v * 0.3, 0.07);
    n.connect(bp); bp.connect(ng); ng.connect(g);
    this.o(g, 0.12);
  }
  shaker(t, f = 0, v = 0.06) {
    const n = this.nz(t, 0.08);
    const hp = this.filt('highpass', 7000, 0.7);
    const g = this.g();
    this.perc(g, t, v, 0.06);
    n.connect(hp); hp.connect(g);
    this.o(g, 0.05);
  }
  tamb(t, f = 0, v = 0.12) {
    const n = this.nz(t, 0.2);
    const bp = this.filt('bandpass', 9000, 1.5);
    const g = this.g();
    this.perc(g, t, v, 0.18);
    n.connect(bp); bp.connect(g);
    for (const jf of [6100, 7300, 8200]) {
      const jg = this.g();
      this.perc(jg, t + Math.random() * 0.02, v * 0.08, 0.14);
      this.osc('sine', jf, t, t + 0.2).connect(jg);
      jg.connect(g);
    }
    this.o(g, 0.12);
  }

  // ---- sound effects ----
  boing(t, v = 0.32) {
    const g = this.g();
    this.perc(g, t, v, 0.6);
    const o = this.osc('sine', 140, t, t + 0.65);
    o.frequency.exponentialRampToValueAtTime(560, t + 0.1);
    o.frequency.exponentialRampToValueAtTime(240, t + 0.55);
    const l = this.osc('sine', 24, t, t + 0.65);
    const lg = this.g(45);
    l.connect(lg); lg.connect(o.frequency);
    o.connect(g);
    this.o(g, 0.1);
  }
  hammer(t, v = 0.4) {
    const n = this.nz(t, 0.08);
    const bp = this.filt('bandpass', 1700, 2.5);
    const g = this.g();
    this.perc(g, t, v, 0.07);
    n.connect(bp); bp.connect(g);
    const tg = this.g();
    this.perc(tg, t, v * 0.9, 0.18);
    const o = this.osc('sine', 240, t, t + 0.2);
    o.frequency.exponentialRampToValueAtTime(90, t + 0.12);
    o.connect(tg);
    tg.connect(g);
    const wg = this.g();
    this.perc(wg, t, v * 0.25, 0.06);
    this.osc('triangle', 560 + Math.random() * 80, t, t + 0.08).connect(wg);
    wg.connect(g);
    this.o(g, 0.12);
  }
  ding(t, v = 0.32) {
    this.bell(t, 1568, v, 2.4);
    this.bell(t + 0.01, 2093, v * 0.6, 2.4);
  }
  sparkle(t, v = 0.12, n = 7, base = 1760) {
    const steps = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
    for (let i = 0; i < n; i++) this.bell(t + i * 0.045, base * Math.pow(2, steps[i % steps.length] / 12), v * (1 - (i / n) * 0.5), 0.6);
  }
  whoosh(t, v = 0.2, dur = 0.7) {
    const n = this.nz(t, dur);
    const bp = this.filt('bandpass', 300, 1.2);
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + dur * 0.5);
    bp.frequency.exponentialRampToValueAtTime(500, t + dur);
    const g = this.g();
    this.adsr(g, t, dur * 0.45, v, 0, dur * 0.55);
    n.connect(bp); bp.connect(g);
    this.o(g, 0.2);
  }
  pop(t, v = 0.25, f = 520) {
    const g = this.g();
    this.perc(g, t, v, 0.12);
    const o = this.osc('sine', f * 2.2, t, t + 0.14);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.07);
    o.connect(g);
    this.o(g, 0.15);
  }
  bloop(t, f = 400, v = 0.2) {
    const g = this.g();
    this.perc(g, t, v, 0.3);
    const o = this.osc('sine', f, t, t + 0.32);
    o.frequency.exponentialRampToValueAtTime(f * 2.2, t + 0.12);
    o.connect(g);
    this.o(g, 0.3);
  }
  slide(t, f0, f1, dur, v = 0.16) {
    const g = this.g();
    this.adsr(g, t, 0.05, v, dur - 0.12, 0.1);
    const o = this.osc('sine', f0, t, t + dur + 0.1);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const l = this.osc('sine', 6, t, t + dur + 0.1);
    const lg = this.g(f0 * 0.02);
    l.connect(lg); lg.connect(o.frequency);
    o.connect(g);
    this.o(g, 0.2);
  }
  waves(t, dur = 4, v = 0.1) {
    const n = this.nz(t, dur);
    const lp = this.filt('lowpass', 650, 0.5);
    const g = this.g();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + dur * 0.45);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    n.connect(lp); lp.connect(g);
    this.o(g, 0.25);
  }
  gull(t, v = 0.08) {
    for (let k = 0; k < 2; k++) {
      const tt = t + k * 0.3;
      const o = this.osc('sawtooth', 1500, tt, tt + 0.3);
      o.frequency.linearRampToValueAtTime(2150, tt + 0.07);
      o.frequency.linearRampToValueAtTime(1300, tt + 0.24);
      const bp = this.filt('bandpass', 2000, 3);
      const g = this.g();
      this.adsr(g, tt, 0.02, v, 0.15, 0.08);
      o.connect(bp); bp.connect(g);
      this.o(g, 0.3);
    }
  }
  bird(t, v = 0.06) {
    for (let k = 0; k < 3; k++) {
      const tt = t + k * 0.13;
      const o = this.osc('sine', 3200, tt, tt + 0.12);
      o.frequency.linearRampToValueAtTime(4300, tt + 0.04);
      o.frequency.linearRampToValueAtTime(2900, tt + 0.1);
      const g = this.g();
      this.perc(g, tt, v, 0.1);
      o.connect(g);
      this.o(g, 0.3);
    }
  }
  thunder(t, v = 0.55) {
    const n = this.nz(t, 3.2);
    const lp = this.filt('lowpass', 500, 0.6);
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(140, t + 2.8);
    const g = this.g();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + 0.03);
    g.gain.exponentialRampToValueAtTime(v * 0.4, t + 0.5);
    g.gain.linearRampToValueAtTime(v * 0.55, t + 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.1);
    n.connect(lp); lp.connect(g);
    this.o(g, 0.4);
    this.kick(t, 0, v);
  }
  cheer(t, dur = 2, v = 0.12) {
    const n = this.nz(t, dur);
    const bp = this.filt('bandpass', 1100, 0.8);
    const g = this.g();
    this.adsr(g, t, 0.25, v, dur - 0.7, 0.45);
    n.connect(bp); bp.connect(g);
    this.o(g, 0.3);
    for (let i = 0; i < Math.round(dur * 6); i++) {
      const tt = t + Math.random() * (dur - 0.3);
      const f = 380 + Math.random() * 380;
      const o = this.osc('triangle', f, tt, tt + 0.35);
      o.frequency.exponentialRampToValueAtTime(f * 1.5, tt + 0.12);
      o.frequency.exponentialRampToValueAtTime(f * 1.2, tt + 0.3);
      const fm = this.filt('bandpass', 1300, 2);
      const yg = this.g();
      this.adsr(yg, tt, 0.03, v * 0.35, 0.15, 0.12);
      o.connect(fm); fm.connect(yg);
      this.o(yg, 0.3);
    }
  }
  creak(t, dur = 1, v = 0.14) {
    const o = this.osc('sawtooth', 70, t, t + dur + 0.2);
    o.frequency.linearRampToValueAtTime(115, t + dur);
    const l = this.osc('sine', 9, t, t + dur + 0.2);
    const lg = this.g(22);
    l.connect(lg); lg.connect(o.frequency);
    const bp = this.filt('bandpass', 950, 7);
    const g = this.g();
    this.adsr(g, t, 0.08, v, dur - 0.2, 0.12);
    o.connect(bp); bp.connect(g);
    this.o(g, 0.25);
  }
  step(t, v = 0.12) {
    const n = this.nz(t, 0.1);
    const lp = this.filt('lowpass', 380, 0.8);
    const g = this.g();
    this.perc(g, t, v, 0.09);
    n.connect(lp); lp.connect(g);
    this.o(g, 0.05);
  }
  tick(t, v = 0.08, f = 2600) {
    const g = this.g();
    this.perc(g, t, v, 0.03);
    this.osc('square', f, t, t + 0.04).connect(g);
    const lp = this.filt('lowpass', 4000, 0.7);
    g.connect(lp);
    this.o(lp, 0.15);
  }
  yawn(t, v = 0.12) {
    const o = this.osc('sawtooth', 330, t, t + 1.6);
    o.frequency.exponentialRampToValueAtTime(150, t + 1.3);
    const lp = this.filt('lowpass', 1100, 3);
    lp.frequency.setValueAtTime(700, t);
    lp.frequency.linearRampToValueAtTime(1300, t + 0.4);
    lp.frequency.linearRampToValueAtTime(500, t + 1.3);
    const g = this.g();
    this.adsr(g, t, 0.25, v, 0.85, 0.35);
    o.connect(lp); lp.connect(g);
    this.o(g, 0.25);
  }
  owl(t, v = 0.12) {
    for (let k = 0; k < 2; k++) {
      const tt = t + k * 0.55;
      const o = this.osc('sine', 420 - k * 35, tt, tt + 0.6);
      o.frequency.linearRampToValueAtTime(380 - k * 35, tt + 0.4);
      const g = this.g();
      this.adsr(g, tt, 0.07, v, 0.22, 0.2);
      o.connect(g);
      this.o(g, 0.5);
    }
  }
  crickets(t, dur = 3, v = 0.025) {
    const g = this.g(0);
    const o = this.osc('sine', 4700, t, t + dur);
    o.connect(g);
    for (let c = t; c < t + dur - 0.2; c += 0.55 + Math.random() * 0.2) {
      for (let p = 0; p < 3; p++) {
        const pt = c + p * 0.045;
        g.gain.setValueAtTime(0, pt);
        g.gain.linearRampToValueAtTime(v, pt + 0.01);
        g.gain.linearRampToValueAtTime(0, pt + 0.03);
      }
    }
    this.o(g, 0.3);
  }
  rooster(t, v = 0.13) {
    const o = this.osc('sawtooth', 450, t, t + 1.6);
    o.frequency.linearRampToValueAtTime(840, t + 0.15);
    o.frequency.linearRampToValueAtTime(780, t + 0.65);
    o.frequency.linearRampToValueAtTime(880, t + 0.8);
    o.frequency.linearRampToValueAtTime(420, t + 1.35);
    const f1 = this.filt('bandpass', 1400, 2.5);
    const f2 = this.filt('bandpass', 2700, 3);
    const g = this.g();
    this.adsr(g, t, 0.05, v, 1.1, 0.25);
    o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g);
    this.o(g, 0.35);
  }
  rumble(t, dur = 2, v = 0.25) {
    const n = this.nz(t, dur);
    const lp = this.filt('lowpass', 150, 0.7);
    const g = this.g();
    this.adsr(g, t, 0.3, v, dur - 0.7, 0.4);
    n.connect(lp); lp.connect(g);
    this.o(g, 0.1);
    for (let k = t; k < t + dur - 0.2; k += 0.36) this.kick(k, 0, v * 0.25);
  }
  zzz(t, v = 0.06) {
    const o = this.osc('sine', 330, t, t + 0.7);
    o.frequency.linearRampToValueAtTime(230, t + 0.6);
    const g = this.g();
    this.adsr(g, t, 0.15, v, 0.25, 0.2);
    o.connect(g);
    this.o(g, 0.3);
  }
  heart(t, v = 0.14) {
    this.pop(t, v, 600);
    this.bell(t + 0.02, 1318, v * 0.6, 0.6);
  }
  horn(t, v = 0.1, f = 147, dur = 1.3) {
    const lp = this.filt('lowpass', 750, 0.7);
    for (const m of [1, 1.5]) this.osc('sawtooth', f * m, t, t + dur + 0.4).connect(lp);
    const g = this.g();
    this.adsr(g, t, 0.18, v, dur - 0.2, 0.3);
    lp.connect(g);
    this.o(g, 0.4);
  }
  squeak(t, v = 0.05) {
    const o = this.osc('sine', 1300, t, t + 0.16);
    o.frequency.linearRampToValueAtTime(1650, t + 0.05);
    o.frequency.linearRampToValueAtTime(1200, t + 0.14);
    const g = this.g();
    this.perc(g, t, v, 0.15);
    o.connect(g);
    this.o(g, 0.2);
  }
  scratch(t, dur = 0.3, v = 0.07) {
    const n = this.nz(t, dur);
    const bp = this.filt('bandpass', 3400, 1);
    const g = this.g(0);
    for (let k = 0; k < dur; k += 0.025) g.gain.setValueAtTime(v * (0.3 + Math.random() * 0.7), t + k);
    g.gain.setValueAtTime(0, t + dur);
    n.connect(bp); bp.connect(g);
    this.o(g, 0.1);
  }
  clank(t, v = 0.1) {
    this.bell(t, 2400, v, 0.4);
    this.bell(t + 0.005, 3150, v * 0.6, 0.3);
  }
  hmm(t, v = 0.1) {
    const o = this.osc('triangle', 196, t, t + 1.3);
    o.frequency.linearRampToValueAtTime(185, t + 0.5);
    o.frequency.linearRampToValueAtTime(205, t + 1.1);
    const lp = this.filt('lowpass', 700, 1);
    const g = this.g();
    this.adsr(g, t, 0.15, v, 0.8, 0.25);
    o.connect(lp); lp.connect(g);
    this.o(g, 0.3);
  }
}

// ---- score ----
export function seq(ev, t0, bpm, str, fn, v) {
  const b = 60 / bpm;
  let t = t0;
  for (const tok of str.trim().split(/\s+/)) {
    if (tok === '|') continue;
    const [n, d = '1'] = tok.split('/');
    const dur = parseFloat(d) * b;
    if (n !== 'R') for (const nn of n.split('+')) ev.push({ t, fn, a: [nf(nn), v, dur] });
    t += dur;
  }
  return t;
}
export function chords(ev, t0, bpm, beatsEach, list, fn = 'pad', v = 0.045) {
  const b = 60 / bpm;
  list.forEach((ch, i) => {
    for (const n of ch.split('+')) ev.push({ t: t0 + i * beatsEach * b, fn, a: [nf(n), v, beatsEach * b] });
  });
}
export function arps(ev, t0, bpm, list, beatsEach = 4, fn = 'harp', v = 0.11, div = 2) {
  const b = 60 / bpm / div;
  list.forEach((ch, i) => {
    const ns = ch.split('+');
    const pat = [...ns, ...ns.slice(1, -1).reverse()];
    for (let k = 0; k < beatsEach * div; k++) ev.push({ t: t0 + (i * beatsEach * div + k) * b, fn, a: [nf(pat[k % pat.length]), v] });
  });
}
export function perc(ev, t0, t1, every, fn, v, off = 0) {
  for (let t = t0 + off; t < t1; t += every) ev.push({ t, fn, a: [0, v] });
}

// ---- storyboard -> events ----
// Events are { t, fn, a }: at time t (s) the player calls synth[fn](audioTime, ...a).

const MOOD_TEMPO = { playful: 112, calm: 76, warm: 84, tense: 100, sad: 66, mysterious: 96, sleepy: 70, festive: 128, wonder: 72, triumphant: 110, 'spooky-mild': 80 };
const MINOR_MOODS = new Set(['tense', 'sad', 'mysterious', 'spooky-mild']);
const LEADS = { marimba: 'marimba', flute: 'flute', harp: 'harp', 'music box': 'box', box: 'box', pizz: 'pizz', pizzicato: 'pizz', pluck: 'pluck', bell: 'bell' };
const DRUMS = { kick: 'kick', tom: 'tom', shaker: 'shaker', tambourine: 'tamb', tamb: 'tamb' };
const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

/** Parse "C major", "A minor", "B-flat major", "F# minor" into a MIDI root (octave 4) and mode. */
export function parseKey(key, mood) {
  const m = /^([A-G])\s*(#|b|-?sharp|-?flat)?\s*(major|minor)?/i.exec(key || '');
  const minorByMood = MINOR_MOODS.has(mood);
  if (!m) return { root: minorByMood ? 57 : 60, minor: minorByMood };
  const base = { C: 60, D: 62, E: 64, F: 65, G: 67, A: 69, B: 71 }[m[1].toUpperCase()];
  const acc = m[2] ? (/#|sharp/i.test(m[2]) ? 1 : -1) : 0;
  const root = base + acc > 66 ? base + acc - 12 : base + acc;
  return { root, minor: m[3] ? /minor/i.test(m[3]) : minorByMood };
}

/**
 * A simple background score from each scene's music block: pad chords, an arpeggio on the
 * lead instrument, bass on strong beats and listed percussion. Good enough to judge timing;
 * replace scene by scene with a written score (see references/sound-design.md).
 */
export function autoScore(sb) {
  const ev = [];
  for (const sc of sb.scenes || []) {
    const mu = sc.music;
    if (!mu || mu.mood === 'silence') continue;
    const bpm = mu.tempo || MOOD_TEMPO[mu.mood] || 96;
    const beat = 60 / bpm;
    const { root, minor } = parseKey(mu.key, mu.mood);
    const names = (mu.instruments || []).map((s) => String(s).toLowerCase());
    const lead = LEADS[names.find((n) => LEADS[n])] || 'marimba';
    const drums = names.filter((n) => DRUMS[n]).map((n) => DRUMS[n]);
    const third = minor ? 3 : 4;
    const prog = minor ? [0, 8, 5, 7] : [0, 5, 7, 0];
    const bar = 4 * beat;
    let i = 0;
    for (let t = sc.start; t < sc.end - beat; t += bar, i++) {
      const r = root + prog[i % prog.length] - (prog[i % prog.length] > 6 ? 12 : 0);
      const triad = [r, r + (prog[i % prog.length] === 7 && minor ? 4 : third), r + 7];
      const len = Math.min(bar, sc.end - t);
      for (const n of triad) ev.push({ t, fn: 'pad', a: [hz(n - 12), 0.03, len] });
      const pat = [triad[0], triad[1], triad[2], triad[1], triad[0] + 12, triad[2], triad[1], triad[2]];
      for (let k = 0; k < 8 && t + k * beat / 2 < sc.end - 0.1; k++) ev.push({ t: t + k * beat / 2, fn: lead, a: [hz(pat[k] + 12), lead === 'pad' ? 0.03 : 0.12, beat / 2] });
      if (names.includes('bass') || bpm >= 100) for (const k of [0, 2]) if (t + k * beat < sc.end - 0.1) ev.push({ t: t + k * beat, fn: 'bass', a: [hz(r - 24), 0.2, beat] });
      for (const d of drums) for (let k = 0; k < 4; k++) if (t + k * beat < sc.end - 0.1 && (d !== 'kick' || k % 2 === 0)) ev.push({ t: t + k * beat, fn: d, a: [d === 'tom' ? 110 : 0, d === 'kick' ? 0.3 : d === 'tom' ? 0.25 : 0.06] });
    }
  }
  return ev;
}

/** Storyboard cues -> player events. Unknown sound names are reported by the player. */
export function cuesToEvents(sb) {
  return (sb.cues || []).map((c) => ({ t: c.t, fn: c.sound, a: c.args || [] }));
}

/**
 * Recorded narration -> player events. Every caption or bubble with `voice_lines` (added by the
 * story-storyboard retime step) plays its span of the narration's full.wav at its start time, found
 * through timeline.json. Duck windows cover each line plus a short lead-in and are merged across
 * pauses shorter than mergeGap so the music does not pump between sentences.
 * @returns {{events: {t: number, fn: string, a: number[]}[], missing: string[]}}
 */
export function narrationEvents(sb, timeline, mergeGap = 1.6) {
  const byId = new Map((timeline.lines || []).map((l) => [l.id, l]));
  const voice = [];
  const missing = [];
  for (const it of [...(sb.captions || []), ...(sb.bubbles || [])]) {
    const ids = it.voice_lines || [];
    const ls = ids.map((id) => byId.get(id)).filter(Boolean);
    for (const id of ids) if (!byId.has(id)) missing.push(id);
    if (!ls.length) continue;
    const off = Math.min(...ls.map((l) => l.start));
    const end = Math.max(...ls.map((l) => l.end));
    voice.push({ t: it.start, fn: 'voice', a: [off, end - off] });
  }
  voice.sort((a, b) => a.t - b.t);
  const ducks = [];
  for (const v of voice) {
    const s = Math.max(0, v.t - 0.25), e = v.t + v.a[1] + 0.1;
    const last = ducks[ducks.length - 1];
    if (last && s - (last.t + last.a[0]) < mergeGap) last.a[0] = Math.max(last.a[0], e - last.t);
    else ducks.push({ t: s, fn: 'duck', a: [e - s] });
  }
  return { events: [...voice, ...ducks], missing };
}

/**
 * Render the events between t0 and t1 offline (no real-time playback), for level checks.
 * part: 'all' (the mix as recorded), 'voice' (recorded narration only), 'bed' (music and
 * effects, ducked as in the mix, without the voice).
 * @returns {Promise<AudioBuffer>}
 */
export async function renderRange(events, t0, t1, { voiceBuf = null, mix = {}, part = 'all', rate = 48000 } = {}) {
  const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil((t1 - t0) * rate)), rate);
  const synth = new Synth(ctx, mix);
  if (voiceBuf) synth.setVoice(voiceBuf);
  if (part === 'bed') synth.voiceOut.gain.value = 0;
  for (const e of events) {
    if (part === 'voice' && e.fn !== 'voice') continue;
    if (part === 'bed' && e.fn === 'voice') continue;
    const at = e.t - t0;
    // A line or duck window already under way at t0 (windows merge across short pauses, so one can
    // span a whole scene) continues from t0, as it does when the player seeks.
    if (at < 0 && e.fn === 'duck' && e.t + e.a[0] > t0) { synth.duck(0, e.a[0] + at); continue; }
    if (at < 0 && e.fn === 'voice' && e.t + e.a[1] > t0) { synth.voice(0, e.a[0] - at, e.a[1] + at); continue; }
    if (at < 0 || e.t >= t1) continue;
    const fn = synth[e.fn];
    if (typeof fn === 'function') fn.call(synth, at, ...(e.a || []));
  }
  return ctx.startRendering();
}

/** ITU-R BS.1770 K-weighting (pre-filter shelf + RLB high-pass) of a buffer, offline. */
export async function kWeight(buffer) {
  const ctx = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const shelf = ctx.createBiquadFilter();
  shelf.type = 'highshelf'; shelf.frequency.value = 1681; shelf.gain.value = 4;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 38; hp.Q.value = 0.5;
  src.connect(shelf).connect(hp).connect(ctx.destination);
  src.start();
  return ctx.startRendering();
}

/** Gated integrated loudness (LUFS) of a K-weighted buffer: 400 ms blocks, -70 LUFS and -10 LU gates. */
export function integratedLoudness(kbuf) {
  const sr = kbuf.sampleRate, block = Math.round(0.4 * sr), hop = Math.round(0.1 * sr);
  const chans = Array.from({ length: kbuf.numberOfChannels }, (_, i) => kbuf.getChannelData(i));
  const sq = new Float64Array(kbuf.length + 1);
  for (let i = 0; i < kbuf.length; i++) { let a = 0; for (const d of chans) a += d[i] * d[i]; sq[i + 1] = sq[i] + a; }
  const z = [];
  for (let s = 0; s + block <= kbuf.length; s += hop) z.push((sq[s + block] - sq[s]) / block);
  const L = (p) => -0.691 + 10 * Math.log10(p);
  const abs = z.filter((p) => p > 0 && L(p) > -70);
  if (!abs.length) return -Infinity;
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const rel = L(mean(abs)) - 10;
  return L(mean(abs.filter((p) => L(p) > rel)));
}

/** Sample peak (linear) over all channels. */
export function peakOf(buffer) {
  let p = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) for (const x of buffer.getChannelData(c)) if (Math.abs(x) > p) p = Math.abs(x);
  return p;
}

/**
 * How far the voice sits above the music bed while someone speaks (dB): energy of the voice
 * render against the bed render over the 50 ms windows where the voice is active.
 */
export function speechToBedDb(voice, bed, activeDb = -45) {
  const v = voice.getChannelData(0), b = bed.getChannelData(0);
  const win = Math.round(0.05 * voice.sampleRate);
  let vs = 0, bs = 0;
  for (let s = 0; s + win <= v.length; s += win) {
    let a = 0, c = 0;
    for (let i = s; i < s + win; i++) { a += v[i] * v[i]; c += b[i] * b[i]; }
    if (10 * Math.log10(a / win + 1e-12) < activeDb) continue;
    vs += a; bs += c;
  }
  return vs ? 10 * Math.log10(vs / Math.max(bs, 1e-12)) : null;
}
