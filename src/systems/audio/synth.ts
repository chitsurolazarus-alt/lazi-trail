import { midiToFreq } from './audioLogic';

/**
 * Small synthesiser for the sounds that are built in code (so they can change pitch, layer and
 * pan freely): coin, jump, whooshes, fanfares, horns, the dog's pant and the thief's shouts.
 * Every function schedules its nodes to start at `t` on `dest` and cleans up after itself.
 */

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

/** Two seconds of white noise, generated once per context and shared. */
export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buffer = noiseBuffers.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ctx, buffer);
  }
  return buffer;
}

export function noiseSource(ctx: BaseAudioContext, loop = false): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = loop;
  return src;
}

/** Gain envelope: fast attack to `peak`, exponential decay to silence over `dur`. */
function envelope(
  ctx: BaseAudioContext,
  t: number,
  peak: number,
  attack: number,
  dur: number,
): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  return g;
}

function tone(
  ctx: BaseAudioContext,
  dest: AudioNode,
  t: number,
  type: OscillatorType,
  freq: number,
  peak: number,
  dur: number,
  attack = 0.005,
): OscillatorNode {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  const g = envelope(ctx, t, peak, attack, dur);
  osc.connect(g).connect(dest);
  osc.start(t);
  osc.stop(t + dur + 0.05);
  return osc;
}

/** A burst of filtered noise. */
export function noiseBurst(
  ctx: BaseAudioContext,
  dest: AudioNode,
  t: number,
  opts: {
    freq: number;
    freqEnd?: number;
    q?: number;
    dur: number;
    peak: number;
    type?: BiquadFilterType;
    attack?: number;
  },
): void {
  const src = noiseSource(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = opts.type ?? 'bandpass';
  filter.Q.value = opts.q ?? 1;
  filter.frequency.setValueAtTime(opts.freq, t);
  if (opts.freqEnd) filter.frequency.exponentialRampToValueAtTime(opts.freqEnd, t + opts.dur);
  const g = envelope(ctx, t, opts.peak, opts.attack ?? 0.01, opts.dur);
  src.connect(filter).connect(g).connect(dest);
  src.start(t, Math.random() * 1.5);
  src.stop(t + opts.dur + 0.05);
}

/* ------------------------------------------------------------------ movement */

export function jump(ctx: BaseAudioContext, dest: AudioNode, t: number): void {
  const osc = tone(ctx, dest, t, 'sine', 300, 0.22, 0.2);
  osc.frequency.exponentialRampToValueAtTime(680, t + 0.16);
  noiseBurst(ctx, dest, t, { freq: 1500, freqEnd: 3200, q: 0.8, dur: 0.16, peak: 0.08 });
}

export function slide(ctx: BaseAudioContext, dest: AudioNode, t: number): void {
  noiseBurst(ctx, dest, t, {
    freq: 2200,
    freqEnd: 450,
    q: 0.9,
    dur: 0.55,
    peak: 0.2,
    attack: 0.03,
  });
  noiseBurst(ctx, dest, t + 0.02, { freq: 180, q: 0.7, dur: 0.4, peak: 0.12, type: 'lowpass' });
}

export function whoosh(ctx: BaseAudioContext, dest: AudioNode, t: number, strength = 1): void {
  noiseBurst(ctx, dest, t, {
    freq: 500 + 400 * strength,
    freqEnd: 2600,
    q: 0.7,
    dur: 0.22 + 0.12 * strength,
    peak: 0.1 + 0.12 * strength,
    attack: 0.06,
  });
}

/** Big low-frequency air push as a vehicle passes close. */
export function nearMiss(ctx: BaseAudioContext, dest: AudioNode, t: number): void {
  noiseBurst(ctx, dest, t, {
    freq: 350,
    freqEnd: 1800,
    q: 0.6,
    dur: 0.45,
    peak: 0.28,
    attack: 0.1,
  });
  noiseBurst(ctx, dest, t + 0.05, { freq: 120, q: 0.7, dur: 0.4, peak: 0.2, type: 'lowpass' });
}

/* -------------------------------------------------------------------- coins */

/** Bright "ching": two inharmonic sines. `semitones` shifts pitch (streaks climb a scale). */
export function coin(
  ctx: BaseAudioContext,
  dest: AudioNode,
  t: number,
  semitones: number,
  gold = false,
): void {
  const f = midiToFreq(83 + semitones); // B5 upward
  tone(ctx, dest, t, 'sine', f, 0.2, 0.28);
  tone(ctx, dest, t, 'sine', f * 2.01, 0.09, 0.2);
  tone(ctx, dest, t + 0.055, 'triangle', f * (gold ? 1.5 : 1.25), 0.11, 0.22);
  noiseBurst(ctx, dest, t, { freq: 6000, q: 1, dur: 0.03, peak: 0.05, type: 'highpass' });
}

/** A rising or falling little arpeggio (power-up pickup / expiry, unlocks, purchases). */
export function arpeggio(
  ctx: BaseAudioContext,
  dest: AudioNode,
  t: number,
  notes: readonly number[],
  step = 0.07,
  peak = 0.16,
): void {
  notes.forEach((n, i) => {
    const at = t + i * step;
    tone(ctx, dest, at, 'triangle', midiToFreq(n), peak, 0.3);
    tone(ctx, dest, at, 'sine', midiToFreq(n + 12), peak * 0.4, 0.22);
  });
}

export const powerUp = (ctx: BaseAudioContext, dest: AudioNode, t: number): void =>
  arpeggio(ctx, dest, t, [72, 76, 79, 84, 88], 0.06);
export const powerDown = (ctx: BaseAudioContext, dest: AudioNode, t: number): void =>
  arpeggio(ctx, dest, t, [84, 79, 76, 72], 0.08, 0.12);
export const unlockFanfare = (ctx: BaseAudioContext, dest: AudioNode, t: number): void => {
  arpeggio(ctx, dest, t, [72, 76, 79, 84], 0.09, 0.18);
  arpeggio(ctx, dest, t + 0.42, [79, 83, 86, 91], 0.07, 0.2);
};

/** "Cha-ching": a bell pair on top of the chip samples. */
export function chaChing(ctx: BaseAudioContext, dest: AudioNode, t: number): void {
  tone(ctx, dest, t, 'sine', 1568, 0.2, 0.35);
  tone(ctx, dest, t + 0.09, 'sine', 2093, 0.22, 0.5);
  tone(ctx, dest, t + 0.09, 'sine', 4200, 0.06, 0.3);
}

export function zoneSwoosh(ctx: BaseAudioContext, dest: AudioNode, t: number): void {
  noiseBurst(ctx, dest, t, {
    freq: 300,
    freqEnd: 4200,
    q: 0.8,
    dur: 0.9,
    peak: 0.24,
    attack: 0.35,
  });
  for (const n of [57, 64, 69, 76]) {
    const osc = tone(ctx, dest, t + 0.5, 'sawtooth', midiToFreq(n), 0.05, 1.0, 0.08);
    osc.detune.value = (Math.random() - 0.5) * 12;
  }
}

/* ------------------------------------------------------------------- vehicles */

/** Taxi hooter: two short honks, the kind every minibus taxi has. */
export function taxiHooter(ctx: BaseAudioContext, dest: AudioNode, t: number): void {
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2200;
  lp.connect(dest);
  for (const start of [0, 0.24]) {
    tone(ctx, lp, t + start, 'square', 415, 0.16, 0.17, 0.008);
    tone(ctx, lp, t + start, 'square', 522, 0.13, 0.17, 0.008);
  }
}

/** Metrorail-style horn: a three-note chord with a slow swell. */
export function trainHorn(ctx: BaseAudioContext, dest: AudioNode, t: number): void {
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1400;
  lp.connect(dest);
  for (const f of [233, 293.7, 349.2]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.13, t + 0.07);
    g.gain.setValueAtTime(0.13, t + 1.0);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    osc.connect(g).connect(lp);
    osc.start(t);
    osc.stop(t + 1.55);
  }
}

/* --------------------------------------------------------------- chasers */

export function pant(ctx: BaseAudioContext, dest: AudioNode, t: number, strength = 1): void {
  noiseBurst(ctx, dest, t, { freq: 2600, q: 1.4, dur: 0.11, peak: 0.3 * strength, attack: 0.02 });
  noiseBurst(ctx, dest, t + 0.16, {
    freq: 1900,
    q: 1.2,
    dur: 0.09,
    peak: 0.2 * strength,
    attack: 0.02,
  });
}

interface Vowel {
  f1: number;
  f2: number;
}
const VOWELS = {
  a: { f1: 730, f2: 1090 },
  e: { f1: 530, f2: 1840 },
  i: { f1: 300, f2: 2290 },
  o: { f1: 570, f2: 840 },
  u: { f1: 320, f2: 800 },
} as const satisfies Record<string, Vowel>;

/**
 * A voiced vocal sound (sawtooth source through two formant filters). Non-verbal: it makes
 * "hey!" / "oi!" / "ha ha" shapes without saying anything.
 */
export function voice(
  ctx: BaseAudioContext,
  dest: AudioNode,
  t: number,
  opts: { f0: number; f0End?: number; from: Vowel; to?: Vowel; dur: number; peak: number },
): void {
  const src = ctx.createOscillator();
  src.type = 'sawtooth';
  src.frequency.setValueAtTime(opts.f0, t);
  if (opts.f0End) src.frequency.linearRampToValueAtTime(opts.f0End, t + opts.dur);
  const vibrato = ctx.createOscillator();
  vibrato.frequency.value = 6;
  const vibratoGain = ctx.createGain();
  vibratoGain.gain.value = opts.f0 * 0.012;
  vibrato.connect(vibratoGain).connect(src.frequency);

  const g = envelope(ctx, t, opts.peak, 0.025, opts.dur);
  for (const [key, gain] of [
    ['f1', 1],
    ['f2', 0.55],
  ] as const) {
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = key === 'f1' ? 7 : 9;
    f.frequency.setValueAtTime(opts.from[key], t);
    if (opts.to) f.frequency.linearRampToValueAtTime(opts.to[key], t + opts.dur);
    const stage = ctx.createGain();
    stage.gain.value = gain;
    src.connect(f).connect(stage).connect(g);
  }
  g.connect(dest);
  // a little breath noise on the attack
  noiseBurst(ctx, dest, t, { freq: 2500, q: 0.8, dur: 0.05, peak: opts.peak * 0.25 });
  src.start(t);
  vibrato.start(t);
  src.stop(t + opts.dur + 0.05);
  vibrato.stop(t + opts.dur + 0.05);
}

export function thiefShout(
  ctx: BaseAudioContext,
  dest: AudioNode,
  t: number,
  kind: 'hey' | 'oi',
): void {
  if (kind === 'hey') {
    voice(ctx, dest, t, {
      f0: 150,
      f0End: 190,
      from: VOWELS.e,
      to: VOWELS.i,
      dur: 0.32,
      peak: 0.95,
    });
  } else {
    voice(ctx, dest, t, {
      f0: 190,
      f0End: 150,
      from: VOWELS.o,
      to: VOWELS.i,
      dur: 0.3,
      peak: 0.95,
    });
  }
}

/** "Ha-ha-ha": pulsed open vowels sinking in pitch. */
export function thiefLaugh(ctx: BaseAudioContext, dest: AudioNode, t: number): void {
  for (let i = 0; i < 4; i++) {
    voice(ctx, dest, t + i * 0.17, {
      f0: 175 - i * 12,
      from: VOWELS.a,
      dur: 0.11,
      peak: 0.85 - i * 0.08,
    });
  }
}

/** Lazi's grunt when she stumbles or falls. */
export function oof(ctx: BaseAudioContext, dest: AudioNode, t: number): void {
  voice(ctx, dest, t, { f0: 210, f0End: 120, from: VOWELS.o, to: VOWELS.u, dur: 0.22, peak: 0.75 });
}

/** Crowd-like babble syllable, for the market ambience. */
export function babble(ctx: BaseAudioContext, dest: AudioNode, t: number, pitch: number): void {
  const v = [VOWELS.a, VOWELS.e, VOWELS.o, VOWELS.i, VOWELS.u][
    Math.floor(Math.random() * 5)
  ] as Vowel;
  voice(ctx, dest, t, {
    f0: pitch,
    f0End: pitch * (0.9 + Math.random() * 0.2),
    from: v,
    dur: 0.09 + Math.random() * 0.14,
    peak: 0.5,
  });
}

/* ------------------------------------------------------------------ instruments */

/** Amapiano log drum: a pitched sine "boom" with a fast downward chirp and soft saturation. */
export function logDrum(
  ctx: BaseAudioContext,
  dest: AudioNode,
  t: number,
  note: number,
  peak = 0.5,
  dur = 0.42,
): void {
  const f = midiToFreq(note);
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(f * 2.4, t);
  osc.frequency.exponentialRampToValueAtTime(f, t + 0.06);
  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const x = (i / 255) * 2 - 1;
    curve[i] = Math.tanh(x * 2.2);
  }
  shaper.curve = curve;
  const g = envelope(ctx, t, peak, 0.004, dur);
  osc.connect(shaper).connect(g).connect(dest);
  osc.start(t);
  osc.stop(t + dur + 0.05);
  // the characteristic wooden "tok"
  noiseBurst(ctx, dest, t, { freq: 900, q: 3, dur: 0.03, peak: peak * 0.18 });
}

export function kick(ctx: BaseAudioContext, dest: AudioNode, t: number, peak = 0.55): void {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  const g = envelope(ctx, t, peak, 0.003, 0.28);
  osc.connect(g).connect(dest);
  osc.start(t);
  osc.stop(t + 0.32);
}

export function shaker(ctx: BaseAudioContext, dest: AudioNode, t: number, peak = 0.1): void {
  noiseBurst(ctx, dest, t, {
    freq: 7500,
    q: 0.6,
    dur: 0.05,
    peak,
    type: 'highpass',
    attack: 0.004,
  });
}

export function hat(
  ctx: BaseAudioContext,
  dest: AudioNode,
  t: number,
  open = false,
  peak = 0.12,
): void {
  noiseBurst(ctx, dest, t, {
    freq: 8500,
    q: 0.5,
    dur: open ? 0.22 : 0.06,
    peak,
    type: 'highpass',
    attack: 0.003,
  });
}

export function clap(ctx: BaseAudioContext, dest: AudioNode, t: number, peak = 0.3): void {
  for (const d of [0, 0.012, 0.026])
    noiseBurst(ctx, dest, t + d, { freq: 1700, q: 1.4, dur: 0.09, peak: peak / 2, attack: 0.002 });
}

/** Electric-piano-ish chord stab: layered decaying sine + triangle with a soft low-pass. */
export function piano(
  ctx: BaseAudioContext,
  dest: AudioNode,
  t: number,
  notes: readonly number[],
  peak = 0.07,
  dur = 0.55,
): void {
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(3200, t);
  lp.frequency.exponentialRampToValueAtTime(900, t + dur);
  lp.connect(dest);
  for (const n of notes) {
    tone(ctx, lp, t, 'triangle', midiToFreq(n), peak, dur);
    tone(ctx, lp, t, 'sine', midiToFreq(n + 12), peak * 0.35, dur * 0.7);
  }
}

export function pluck(
  ctx: BaseAudioContext,
  dest: AudioNode,
  t: number,
  note: number,
  peak = 0.09,
  dur = 0.3,
): void {
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(4200, t);
  lp.frequency.exponentialRampToValueAtTime(700, t + dur);
  lp.connect(dest);
  tone(ctx, lp, t, 'square', midiToFreq(note), peak, dur, 0.004);
  tone(ctx, lp, t, 'triangle', midiToFreq(note) * 2, peak * 0.4, dur * 0.6, 0.004);
}

export function pad(
  ctx: BaseAudioContext,
  dest: AudioNode,
  t: number,
  notes: readonly number[],
  dur: number,
  peak = 0.035,
): void {
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1100;
  lp.connect(dest);
  for (const n of notes) {
    for (const detune of [-6, 6]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = midiToFreq(n);
      osc.detune.value = detune;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + dur * 0.35);
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      osc.connect(g).connect(lp);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    }
  }
}
