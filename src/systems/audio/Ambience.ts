import { ambienceWeights } from './audioLogic';
import type { SampleBank } from './SampleBank';
import * as synth from './synth';

/**
 * Four continuous ambience beds (township, city, train yard, stadium) crossfaded by the zone
 * blend. Each bed is a few looping filtered-noise layers plus randomly timed one-shots.
 * They are built once and run for the whole session; inactive beds are simply silent.
 */
export class Ambience {
  private readonly beds: GainNode[] = [];
  private readonly timers: number[] = [];
  private running = false;
  private lastWeights: number[] = [1, 0, 0, 0];

  constructor(
    private readonly ctx: AudioContext,
    out: AudioNode,
    private readonly samples: SampleBank,
  ) {
    for (let i = 0; i < 4; i++) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(out);
      this.beds.push(g);
    }
    this.buildTownship(this.beds[0] as GainNode);
    this.buildCity(this.beds[1] as GainNode);
    this.buildTrainYard(this.beds[2] as GainNode);
    this.buildStadium(this.beds[3] as GainNode);
  }

  start(): void {
    this.running = true;
  }

  stop(): void {
    this.running = false;
    for (const g of this.beds) g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
  }

  /** Follow the distance run: fade the matching beds in and out. */
  update(distance: number): void {
    if (!this.running) return;
    const w = ambienceWeights(distance);
    const now = this.ctx.currentTime;
    for (let i = 0; i < 4; i++) {
      if (
        Math.abs((w[i] as number) - (this.lastWeights[i] as number)) < 0.004 &&
        (w[i] as number) !== 0 &&
        (w[i] as number) !== 1
      )
        continue;
      (this.beds[i] as GainNode).gain.setTargetAtTime(w[i] as number, now, 0.5);
    }
    this.lastWeights = w;
  }

  /* ---------------------------------------------------------------- helpers */

  private loopNoise(
    dest: AudioNode,
    opts: {
      type: BiquadFilterType;
      freq: number;
      q?: number;
      gain: number;
      lfoRate?: number;
      lfoDepth?: number;
    },
  ): void {
    const ctx = this.ctx;
    const src = synth.noiseSource(ctx, true);
    const filter = ctx.createBiquadFilter();
    filter.type = opts.type;
    filter.frequency.value = opts.freq;
    filter.Q.value = opts.q ?? 0.7;
    const g = ctx.createGain();
    g.gain.value = opts.gain;
    src.connect(filter).connect(g).connect(dest);
    if (opts.lfoRate) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = opts.lfoRate;
      const depth = ctx.createGain();
      depth.gain.value = opts.gain * (opts.lfoDepth ?? 0.5);
      lfo.connect(depth).connect(g.gain);
      lfo.start();
    }
    src.start(0, Math.random() * 1.5);
  }

  /** Call `fn` at random intervals while the game is running. */
  private every(minSec: number, maxSec: number, fn: (t: number) => void): void {
    const loop = (): void => {
      if (this.running) fn(this.ctx.currentTime + 0.02);
      this.timers.push(
        window.setTimeout(loop, (minSec + Math.random() * (maxSec - minSec)) * 1000),
      );
    };
    this.timers.push(window.setTimeout(loop, Math.random() * maxSec * 1000));
  }

  private panned(dest: AudioNode): { node: AudioNode; set(p: number): void } {
    const pan = this.ctx.createStereoPanner();
    pan.connect(dest);
    return { node: pan, set: (p) => (pan.pan.value = p) };
  }

  /* -------------------------------------------------------------------- beds */

  /** Township market: chatter, a distant radio hum, dogs and the odd bird. */
  private buildTownship(bed: GainNode): void {
    this.loopNoise(bed, {
      type: 'bandpass',
      freq: 650,
      q: 0.5,
      gain: 0.05,
      lfoRate: 0.3,
      lfoDepth: 0.6,
    });
    this.loopNoise(bed, { type: 'highpass', freq: 5200, gain: 0.006, lfoRate: 0.11 });
    const chat = this.panned(bed);
    this.every(0.35, 1.1, (t) => {
      chat.set(Math.random() * 1.6 - 0.8);
      const n = 2 + Math.floor(Math.random() * 3);
      const pitch = 110 + Math.random() * 110;
      for (let i = 0; i < n; i++) synth.babble(this.ctx, chat.node, t + i * 0.13, pitch);
    });
    this.every(6, 14, (t) => {
      // a bird: two quick chirps
      const p = this.panned(bed);
      p.set(Math.random() * 2 - 1);
      for (const off of [0, 0.11])
        synth.noiseBurst(this.ctx, p.node, t + off, {
          freq: 3800 + Math.random() * 900,
          freqEnd: 5200,
          q: 6,
          dur: 0.07,
          peak: 0.05,
        });
    });
  }

  /** City streets: traffic rumble, passing cars, distant hooters. */
  private buildCity(bed: GainNode): void {
    this.loopNoise(bed, { type: 'lowpass', freq: 200, gain: 0.16, lfoRate: 0.17, lfoDepth: 0.3 });
    this.loopNoise(bed, { type: 'bandpass', freq: 1100, q: 0.4, gain: 0.014, lfoRate: 0.23 });
    const pass = this.panned(bed);
    this.every(2.5, 6, (t) => {
      const side = Math.random() < 0.5 ? -1 : 1;
      pass.set(side * 0.9);
      synth.noiseBurst(this.ctx, pass.node, t, {
        freq: 350,
        freqEnd: 1300,
        q: 0.9,
        dur: 1.4,
        peak: 0.07,
        attack: 0.5,
      });
    });
    this.every(9, 20, (t) => {
      pass.set(Math.random() * 1.6 - 0.8);
      synth.taxiHooter(this.ctx, pass.node, t);
    });
  }

  /** Train yard: wind, metallic clanks, a far-off train horn. */
  private buildTrainYard(bed: GainNode): void {
    this.loopNoise(bed, {
      type: 'bandpass',
      freq: 380,
      q: 0.6,
      gain: 0.055,
      lfoRate: 0.09,
      lfoDepth: 0.7,
    });
    this.loopNoise(bed, { type: 'lowpass', freq: 140, gain: 0.07 });
    const clank = this.panned(bed);
    this.every(3.5, 8, (t) => {
      clank.set(Math.random() * 2 - 1);
      this.samples.play(Math.random() < 0.5 ? 'clank_0' : 'clank_1', clank.node, {
        volume: 0.18 + Math.random() * 0.15,
        rate: 0.85 + Math.random() * 0.3,
        when: t,
      });
    });
    this.every(18, 34, (t) => {
      const far = this.panned(bed);
      far.set(Math.random() * 1.6 - 0.8);
      const quiet = this.ctx.createGain();
      quiet.gain.value = 0.3;
      quiet.connect(far.node);
      synth.trainHorn(this.ctx, quiet, t);
    });
  }

  /** Stadium approach: a big crowd with swelling cheers. */
  private buildStadium(bed: GainNode): void {
    this.loopNoise(bed, {
      type: 'bandpass',
      freq: 520,
      q: 0.4,
      gain: 0.09,
      lfoRate: 0.13,
      lfoDepth: 0.55,
    });
    this.loopNoise(bed, {
      type: 'bandpass',
      freq: 1700,
      q: 0.5,
      gain: 0.05,
      lfoRate: 0.19,
      lfoDepth: 0.6,
    });
    this.loopNoise(bed, { type: 'lowpass', freq: 120, gain: 0.05 });
    this.every(7, 15, (t) => {
      // a cheer swelling and fading
      synth.noiseBurst(this.ctx, bed, t, {
        freq: 900,
        freqEnd: 1600,
        q: 0.5,
        dur: 3.2,
        peak: 0.16,
        attack: 1.1,
      });
    });
    const whistle = this.panned(bed);
    this.every(14, 30, (t) => {
      whistle.set(Math.random() * 1.6 - 0.8);
      synth.noiseBurst(this.ctx, whistle.node, t, {
        freq: 3200,
        q: 14,
        dur: 0.5,
        peak: 0.05,
        attack: 0.05,
      });
    });
  }

  dispose(): void {
    for (const id of this.timers) window.clearTimeout(id);
    this.timers.length = 0;
    for (const g of this.beds) g.disconnect();
  }
}
