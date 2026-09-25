import { describe, expect, it } from 'vitest';
import { ZONES } from '../src/config/zones';
import {
  CHORD_STABS,
  COIN_STREAK_WINDOW,
  HONK_RANGE,
  LOG_DRUM_PATTERN,
  PENTATONIC,
  PLUCK_PATTERNS,
  PROGRESSION,
  SHAKER,
  STEPS_PER_BAR,
  ambienceWeights,
  coinPitchSemitones,
  crossedThreshold,
  footstepSurface,
  layerGains,
  midiToFreq,
  musicIntensity,
  nextStreak,
  stepInterval,
  volumeToGain,
} from '../src/systems/audio/audioLogic';

describe('midiToFreq', () => {
  it('maps A4 to 440 Hz and octaves double', () => {
    expect(midiToFreq(69)).toBeCloseTo(440);
    expect(midiToFreq(81)).toBeCloseTo(880);
    expect(midiToFreq(57)).toBeCloseTo(220);
  });
});

describe('volumeToGain', () => {
  it('is 0 at 0, 1 at 1, quieter than linear in between, and clamped', () => {
    expect(volumeToGain(0)).toBe(0);
    expect(volumeToGain(1)).toBe(1);
    expect(volumeToGain(0.5)).toBeCloseTo(0.25);
    expect(volumeToGain(2)).toBe(1);
    expect(volumeToGain(-1)).toBe(0);
  });
});

describe('coin streak', () => {
  it('climbs a scale and never goes down or beyond two octaves', () => {
    let prev = -1;
    for (let i = 0; i < 30; i++) {
      const p = coinPitchSemitones(i);
      expect(p).toBeGreaterThanOrEqual(prev);
      expect(p).toBeLessThanOrEqual(24);
      prev = p;
    }
    expect(coinPitchSemitones(0)).toBe(0);
  });

  it('continues quickly-collected coins and resets after a pause', () => {
    expect(nextStreak(3, 0.3)).toBe(4);
    expect(nextStreak(3, COIN_STREAK_WINDOW)).toBe(4);
    expect(nextStreak(3, COIN_STREAK_WINDOW + 0.1)).toBe(0);
  });
});

describe('music intensity and layers', () => {
  it('rises with speed and with the thief being close, within 0..1', () => {
    const calm = musicIntensity({ speedNorm: 0, chase: 0 });
    const fast = musicIntensity({ speedNorm: 1, chase: 0 });
    const chased = musicIntensity({ speedNorm: 0.3, chase: 1 });
    expect(fast).toBeGreaterThan(calm);
    expect(chased).toBeGreaterThan(musicIntensity({ speedNorm: 0.3, chase: 0 }));
    for (const v of [calm, fast, chased, musicIntensity({ speedNorm: 5, chase: 5 })]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('always plays the base layer and brings the others in one after another', () => {
    for (let i = 0; i <= 10; i++) expect(layerGains(i / 10).base).toBe(1);
    expect(layerGains(0.1)).toEqual({ base: 1, mid: 0, high: 0 });
    const mid = layerGains(0.55);
    expect(mid.mid).toBe(1);
    expect(mid.high).toBe(0);
    expect(layerGains(1).high).toBe(1);
  });

  it('gentle early running keeps the intense layers off', () => {
    const early = layerGains(musicIntensity({ speedNorm: 0, chase: 0 }));
    expect(early.high).toBe(0);
    expect(early.mid).toBe(0);
  });

  it('a close thief at top speed brings the full arrangement in', () => {
    const g = layerGains(musicIntensity({ speedNorm: 1, chase: 1 }));
    expect(g.mid).toBe(1);
    expect(g.high).toBe(1);
  });
});

describe('ambienceWeights', () => {
  it('is fully one bed inside a zone and always sums to 1', () => {
    expect(ambienceWeights(300)).toEqual([1, 0, 0, 0]);
    expect(ambienceWeights(1800)).toEqual([0, 1, 0, 0]);
    for (let d = 0; d < 6000; d += 37) {
      const w = ambienceWeights(d);
      expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
      for (const x of w) expect(x).toBeGreaterThanOrEqual(0);
    }
  });

  it('crossfades between neighbouring beds at a boundary', () => {
    const b = ZONES[1]?.startDistance ?? 1000;
    const w = ambienceWeights(b - 60);
    expect(w[0]).toBeGreaterThan(0);
    expect(w[1]).toBeGreaterThan(0);
    expect(w[2] + w[3]).toBe(0);
  });
});

describe('footstepSurface', () => {
  it('picks tar on roads, gravel on the rails, wood on ramps, metal on roofs', () => {
    expect(footstepSurface('asphalt', 0, false)).toBe('tar');
    expect(footstepSurface('plaza', 0, false)).toBe('tar');
    expect(footstepSurface('rails', 0, false)).toBe('gravel');
    expect(footstepSurface('asphalt', 1.2, false)).toBe('wood');
    expect(footstepSurface('rails', 3.6, true)).toBe('metal');
  });

  it('steps get quicker with speed', () => {
    expect(stepInterval(1)).toBeLessThan(stepInterval(0));
    expect(stepInterval(5)).toBe(stepInterval(1));
  });
});

describe('crossedThreshold', () => {
  it('fires once as a distance drops through the threshold', () => {
    expect(crossedThreshold(80, 70, HONK_RANGE.taxiMoving)).toBe(true);
    expect(crossedThreshold(70, 60, HONK_RANGE.taxiMoving)).toBe(false);
    expect(crossedThreshold(90, 80, HONK_RANGE.taxiMoving)).toBe(false);
  });
});

describe('music data', () => {
  it('has a four-bar progression with roots below their voicings', () => {
    expect(PROGRESSION).toHaveLength(4);
    for (const chord of PROGRESSION) {
      expect(chord.notes.length).toBeGreaterThanOrEqual(4);
      expect(Math.min(...chord.notes)).toBeGreaterThan(chord.root);
    }
  });

  it('keeps every pattern within one 16-step bar', () => {
    for (const [step] of LOG_DRUM_PATTERN) expect(step).toBeGreaterThanOrEqual(0);
    for (const [step] of LOG_DRUM_PATTERN) expect(step).toBeLessThan(STEPS_PER_BAR);
    for (const step of CHORD_STABS) expect(step).toBeLessThan(STEPS_PER_BAR);
    expect(SHAKER).toHaveLength(STEPS_PER_BAR);
    expect(PLUCK_PATTERNS).toHaveLength(PROGRESSION.length);
    for (const bar of PLUCK_PATTERNS) {
      expect(bar).toHaveLength(STEPS_PER_BAR);
      for (const deg of bar) expect(deg).toBeLessThan(PENTATONIC.length);
    }
  });

  it('log-drum hits fall on the syncopated Amapiano steps, not just the downbeats', () => {
    const steps = LOG_DRUM_PATTERN.map(([s]) => s);
    expect(steps.some((s) => s % 4 !== 0)).toBe(true);
    expect(steps).toContain(0);
  });
});
