import {
  CHORD_STABS,
  LOG_DRUM_PATTERN,
  PENTATONIC,
  PLUCK_PATTERNS,
  PROGRESSION,
  SHAKER,
  STEPS_PER_BAR,
  layerGains,
} from './audioLogic';
import * as synth from './synth';

export type TrackName = 'menu' | 'run' | 'shop';
export type StingName = 'gameover' | 'record';

interface Layers {
  base: GainNode;
  mid: GainNode;
  high: GainNode;
}

interface TrackDef {
  bpm: number;
  /** Fixed layer mix for tracks that don't react to gameplay. */
  fixed?: { mid: number; high: number };
}

const TRACKS: Record<TrackName, TrackDef> = {
  menu: { bpm: 104, fixed: { mid: 1, high: 0 } },
  run: { bpm: 122 },
  shop: { bpm: 98, fixed: { mid: 0.6, high: 0 } },
};

/** How far ahead (seconds) notes are scheduled, and how often the scheduler wakes up. */
const LOOKAHEAD = 0.28;
const TICK_MS = 50;

/**
 * A small groove box that plays Amapiano-flavoured loops (log drum, shaker, piano stabs, plucks)
 * in A minor. Three layers (base / mid / high) fade in with `setIntensity`, so the in-run music
 * builds as Lazi speeds up and when the thief is close. Everything is synthesised live.
 */
export class MusicEngine {
  private timer = 0;
  private track: TrackName | null = null;
  private trackGain: GainNode | null = null;
  private layers: Layers | null = null;
  private step = 0;
  private stepDur = 0.125;
  private nextTime = 0;
  private intensity = 0;

  constructor(
    private readonly ctx: AudioContext,
    private readonly out: AudioNode,
  ) {}

  get current(): TrackName | null {
    return this.track;
  }

  /** Start (or crossfade to) a track. */
  play(track: TrackName, fade = 1.4): void {
    if (this.track === track) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Fade out the old track's gain; its already-scheduled notes ring out under the fade.
    if (this.trackGain) {
      this.trackGain.gain.cancelScheduledValues(now);
      this.trackGain.gain.setValueAtTime(this.trackGain.gain.value, now);
      this.trackGain.gain.linearRampToValueAtTime(0, now + fade);
      const old = this.trackGain;
      window.setTimeout(() => old.disconnect(), (fade + 1) * 1000);
    }

    const trackGain = ctx.createGain();
    trackGain.gain.setValueAtTime(0.0001, now);
    trackGain.gain.linearRampToValueAtTime(1, now + fade);
    trackGain.connect(this.out);
    const layers: Layers = {
      base: ctx.createGain(),
      mid: ctx.createGain(),
      high: ctx.createGain(),
    };
    for (const l of [layers.base, layers.mid, layers.high]) l.connect(trackGain);
    this.trackGain = trackGain;
    this.layers = layers;
    this.track = track;

    const def = TRACKS[track];
    this.stepDur = 60 / def.bpm / 4;
    this.step = 0;
    this.nextTime = now + 0.08;
    this.applyLayers(true);

    if (!this.timer) this.timer = window.setInterval(() => this.tick(), TICK_MS);
  }

  stop(fade = 1.2): void {
    const now = this.ctx.currentTime;
    if (this.trackGain) {
      this.trackGain.gain.cancelScheduledValues(now);
      this.trackGain.gain.setValueAtTime(this.trackGain.gain.value, now);
      this.trackGain.gain.linearRampToValueAtTime(0, now + fade);
    }
    this.track = null;
    window.clearInterval(this.timer);
    this.timer = 0;
  }

  /** 0..1: how much of the arrangement is playing (only affects the in-run track). */
  setIntensity(value: number): void {
    this.intensity = value;
    this.applyLayers(false);
  }

  /** Briefly lower the music (under a sting or a voice line). */
  duck(amount: number, seconds: number): void {
    if (!this.trackGain) return;
    const g = this.trackGain.gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(amount, now + 0.08);
    g.linearRampToValueAtTime(1, now + seconds);
  }

  /** A short musical phrase on top of everything (game over, new record). */
  sting(name: StingName): void {
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.05;
    const dest = this.out;
    if (name === 'gameover') {
      this.duck(0.15, 3);
      [69, 67, 64, 57].forEach((n, i) =>
        synth.piano(ctx, dest, t + i * 0.26, [n, n - 12], 0.09, 1.1),
      );
      synth.logDrum(ctx, dest, t + 0.78, 33, 0.6, 0.9);
      synth.pad(ctx, dest, t, [57, 60, 64], 2.6, 0.03);
    } else {
      this.duck(0.2, 3.2);
      [72, 76, 79, 84, 88, 91].forEach((n, i) => {
        synth.pluck(ctx, dest, t + i * 0.09, n, 0.12, 0.45);
        synth.piano(ctx, dest, t + i * 0.09, [n - 12], 0.06, 0.8);
      });
      for (let i = 0; i < 8; i++) synth.shaker(ctx, dest, t + 0.4 + i * 0.06, 0.09);
      synth.clap(ctx, dest, t + 0.95, 0.3);
      synth.piano(ctx, dest, t + 0.95, [72, 76, 79, 84], 0.1, 1.6);
    }
  }

  private applyLayers(instant: boolean): void {
    if (!this.layers || !this.track) return;
    const def = TRACKS[this.track];
    const mix = def.fixed ? { base: 1, ...def.fixed } : layerGains(this.intensity);
    const now = this.ctx.currentTime;
    const tc = instant ? 0.001 : 0.6;
    this.layers.base.gain.setTargetAtTime(mix.base, now, tc);
    this.layers.mid.gain.setTargetAtTime(mix.mid, now, tc);
    this.layers.high.gain.setTargetAtTime(mix.high, now, tc);
  }

  private tick(): void {
    if (!this.track || !this.layers) return;
    const horizon = this.ctx.currentTime + LOOKAHEAD;
    // If the tab was throttled and we fell behind, skip ahead instead of firing a burst of old notes.
    if (this.nextTime < this.ctx.currentTime - 0.3) this.nextTime = this.ctx.currentTime + 0.05;
    while (this.nextTime < horizon) {
      this.scheduleStep(this.track, this.layers, this.step, this.nextTime);
      this.nextTime += this.stepDur;
      this.step++;
    }
  }

  private scheduleStep(track: TrackName, L: Layers, stepIndex: number, t: number): void {
    const bar = Math.floor(stepIndex / STEPS_PER_BAR);
    const s = stepIndex % STEPS_PER_BAR;
    const chord = PROGRESSION[bar % PROGRESSION.length] as (typeof PROGRESSION)[number];
    if (track === 'run') this.runStep(L, bar, s, t, chord);
    else if (track === 'menu') this.menuStep(L, bar, s, t, chord);
    else this.shopStep(L, s, t, chord);
  }

  private runStep(
    L: Layers,
    bar: number,
    s: number,
    t: number,
    chord: (typeof PROGRESSION)[number],
  ): void {
    const c = this.ctx;
    // ---- base: always on
    for (const [step, semis] of LOG_DRUM_PATTERN) {
      if (step === s) synth.logDrum(c, L.base, t, chord.root + semis, semis === 0 ? 0.5 : 0.36);
    }
    synth.shaker(c, L.base, t, 0.06 + (SHAKER[s] as number) * 0.1);
    if (s === 0 || s === 8) synth.kick(c, L.base, t, 0.42);
    if (CHORD_STABS.includes(s)) synth.piano(c, L.base, t, chord.notes, s === 0 ? 0.075 : 0.055);

    // ---- mid: percussion, ghost notes and a sparse pluck melody
    if (s === 2 || s === 6 || s === 10 || s === 14) synth.hat(c, L.mid, t, s === 14, 0.1);
    if (s === 4 || s === 12) synth.clap(c, L.mid, t, 0.26);
    if (s === 11) synth.logDrum(c, L.mid, t, chord.root + 12, 0.22, 0.25);
    const degree = (PLUCK_PATTERNS[bar % PLUCK_PATTERNS.length] as readonly number[])[s] as number;
    if (degree >= 0) synth.pluck(c, L.mid, t, (PENTATONIC[degree] as number) + 12, 0.075);

    // ---- high: busy arpeggios, driving kick, sub, snare fill every fourth bar
    if (s % 2 === 0) {
      const n = chord.notes[(s / 2) % chord.notes.length] as number;
      synth.pluck(c, L.high, t, n + 12, 0.06, 0.18);
    }
    if (s === 4 || s === 12) synth.kick(c, L.high, t, 0.4);
    if (s % 4 === 0) synth.logDrum(c, L.high, t, chord.root - 12, 0.4, 0.3);
    if (bar % 4 === 3 && s >= 12) synth.clap(c, L.high, t, 0.18 + (s - 12) * 0.05);
    if (s === 0 && bar % 4 === 0) synth.hat(c, L.high, t, true, 0.14);
  }

  private menuStep(
    L: Layers,
    bar: number,
    s: number,
    t: number,
    chord: (typeof PROGRESSION)[number],
  ): void {
    const c = this.ctx;
    if (s === 0) synth.pad(c, L.base, t, chord.notes, this.stepDur * STEPS_PER_BAR * 1.05, 0.04);
    if (s === 0 || s === 6 || s === 10)
      synth.logDrum(c, L.base, t, chord.root + (s === 6 ? 12 : 0), 0.34, 0.5);
    if (s % 2 === 0) synth.shaker(c, L.base, t, 0.05 + (SHAKER[s] as number) * 0.06);
    if (s === 0 || s === 8) synth.piano(c, L.base, t, chord.notes, 0.05, 0.9);
    const degree = (PLUCK_PATTERNS[bar % PLUCK_PATTERNS.length] as readonly number[])[s] as number;
    if (degree >= 0) synth.pluck(c, L.mid, t, (PENTATONIC[degree] as number) + 12, 0.055, 0.4);
  }

  private shopStep(L: Layers, s: number, t: number, chord: (typeof PROGRESSION)[number]): void {
    const c = this.ctx;
    if (s % 4 === 0) synth.piano(c, L.base, t, chord.notes.slice(0, 4), 0.045, 0.8);
    if (s === 0 || s === 8) synth.logDrum(c, L.base, t, chord.root, 0.3, 0.5);
    if (s % 2 === 0) synth.shaker(c, L.base, t, 0.05);
    if (s === 6 || s === 14) synth.pluck(c, L.mid, t, chord.notes[2] as number, 0.05, 0.4);
  }

  dispose(): void {
    this.stop(0.05);
    this.trackGain?.disconnect();
  }
}
