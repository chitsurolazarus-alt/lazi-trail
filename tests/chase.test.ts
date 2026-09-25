import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config/gameConfig';
import {
  chaseMeter,
  createChase,
  isFinished,
  onCrash,
  onStumble,
  stepChase,
  type ChaseState,
} from '../src/systems/ChaseSystem';
import { PathHistory } from '../src/systems/PathHistory';

const C = CONFIG.chase;

function run(state: ChaseState, seconds: number, boosting = false): void {
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) stepChase(state, dt, boosting);
}

describe('chase: run start', () => {
  it('starts with the thief right behind Lazi, reaching for the bag', () => {
    const s = createChase();
    expect(s.phase).toBe('intro');
    expect(s.gap).toBeCloseTo(C.introStartGap);
  });

  it('falls in close behind during the intro', () => {
    const s = createChase();
    run(s, C.introDuration + 0.05);
    expect(s.phase).toBe('close');
    expect(s.gap).toBeCloseTo(C.closeGap, 1);
  });

  it('falls back out of view after about five seconds of clean running', () => {
    const s = createChase();
    run(s, C.introDuration + C.startHold + 0.1);
    expect(s.phase).toBe('dropping');
    run(s, (C.farGap - C.closeGap) / C.dropRate + 0.5);
    expect(s.phase).toBe('far');
    expect(s.gap).toBeCloseTo(C.farGap);
    expect(C.introDuration + C.startHold).toBeGreaterThanOrEqual(4.5);
    expect(C.introDuration + C.startHold).toBeLessThanOrEqual(6);
  });

  it('gap never grows or shrinks by more than the configured rates', () => {
    const s = createChase();
    let prev = s.gap;
    const dt = 1 / 60;
    for (let t = 0; t < 30; t += dt) {
      stepChase(s, dt);
      expect(Math.abs(s.gap - prev)).toBeLessThanOrEqual(C.catchRate * dt + 1e-9);
      prev = s.gap;
    }
  });
});

describe('chase: stumbles', () => {
  const farState = (): ChaseState => {
    const s = createChase();
    run(s, 20);
    return s;
  };

  it('a first stumble while they are out of view makes them catch up, not catch her', () => {
    const s = farState();
    expect(s.phase).toBe('far');
    expect(onStumble(s)).toBe(false);
    expect(s.phase).toBe('catching');
    run(s, 2);
    expect(s.phase).toBe('close');
    expect(s.gap).toBeCloseTo(C.closeGap, 1);
  });

  it('a second stumble while they are close = caught', () => {
    const s = farState();
    onStumble(s);
    run(s, 1.5); // they are on her heels
    expect(onStumble(s)).toBe(true);
    expect(s.phase).toBe('caught');
    expect(isFinished(s)).toBe(true);
    expect(chaseMeter(s)).toBe(1);
  });

  it('a second stumble is only a stumble again once they have dropped back', () => {
    const s = farState();
    onStumble(s);
    run(s, 1.5);
    run(s, C.stumbleHold + (C.farGap - C.closeGap) / C.dropRate + 1);
    expect(s.phase).toBe('far');
    expect(onStumble(s)).toBe(false);
  });

  it('a stumble while they are dropping back but still close is a catch', () => {
    const s = createChase();
    run(s, C.introDuration + C.startHold + 0.3); // started dropping, gap ~ closeGap + 1
    expect(s.phase).toBe('dropping');
    expect(s.gap).toBeLessThan(C.caughtGap);
    expect(onStumble(s)).toBe(true);
  });

  it('after a stumble they stay close for the hold time, then drop back again', () => {
    const s = farState();
    onStumble(s);
    run(s, 1);
    expect(s.phase).toBe('close');
    run(s, C.stumbleHold - 0.5);
    expect(s.phase).toBe('close');
    run(s, 1);
    expect(s.phase).toBe('dropping');
  });

  it('does nothing once the chase is over', () => {
    const s = farState();
    onStumble(s);
    run(s, 1.5);
    onStumble(s);
    expect(onStumble(s)).toBe(false);
    run(s, 5);
    expect(s.phase).toBe('caught');
  });
});

describe('chase: boost and crash', () => {
  it('Energy Drink Boost makes Lazi pull far ahead', () => {
    const s = createChase();
    run(s, 1);
    run(s, 4, true);
    expect(s.gap).toBeCloseTo(C.boostGap);
    expect(chaseMeter(s)).toBe(0);
  });

  it('after the boost the lead settles back to the normal far gap', () => {
    const s = createChase();
    run(s, 4, true);
    run(s, 20);
    expect(s.gap).toBeCloseTo(C.farGap);
  });

  it('crashing into an obstacle starts the bag-snatch, from no further than the camera shows', () => {
    const s = createChase();
    run(s, 20);
    onCrash(s);
    expect(s.phase).toBe('snatch');
    expect(s.gap).toBeLessThanOrEqual(14);
    expect(isFinished(s)).toBe(true);
  });

  it('a stumble that is not a catch never ends the run', () => {
    const s = createChase();
    run(s, 20);
    expect(onStumble(s)).toBe(false);
    expect(isFinished(s)).toBe(false);
  });
});

describe('chaseMeter', () => {
  it('is 1 when they are on her heels and 0 when out of view', () => {
    const s = createChase();
    run(s, C.introDuration + 0.5);
    expect(chaseMeter(s)).toBeCloseTo(1, 1);
    run(s, 30);
    expect(chaseMeter(s)).toBe(0);
  });

  it('stays within 0..1', () => {
    const s = createChase();
    for (let i = 0; i < 2000; i++) {
      stepChase(s, 1 / 60, i > 900 && i < 1200);
      const m = chaseMeter(s);
      expect(m).toBeGreaterThanOrEqual(0);
      expect(m).toBeLessThanOrEqual(1);
    }
  });
});

describe('PathHistory', () => {
  it("replays Lazi's lane changes and jumps at the point she made them", () => {
    const h = new PathHistory(0.25, 512);
    for (let s = 0; s <= 100; s += 0.25) {
      const x = s < 40 ? 0 : 2.4;
      const y = s >= 60 && s <= 65 ? 2 : 0;
      h.record(s, x, y);
    }
    expect(h.sample(30).x).toBeCloseTo(0);
    expect(h.sample(50).x).toBeCloseTo(2.4);
    expect(h.sample(62).y).toBeCloseTo(2);
    expect(h.sample(70).y).toBeCloseTo(0);
  });

  it('interpolates between samples', () => {
    const h = new PathHistory(1, 64);
    h.record(0, 0, 0);
    h.record(1, 1, 2);
    expect(h.sample(0.5).x).toBeCloseTo(0.5);
    expect(h.sample(0.5).y).toBeCloseTo(1);
  });

  it('clamps before the start and beyond the newest sample', () => {
    const h = new PathHistory(0.5, 64);
    h.record(10, 3, 1);
    h.record(11, 4, 2);
    expect(h.sample(-5).x).toBeCloseTo(3);
    expect(h.sample(99).x).toBeCloseTo(4);
  });

  it('forgets the oldest history when the buffer wraps, without losing recent samples', () => {
    const h = new PathHistory(1, 32);
    for (let s = 0; s < 200; s++) h.record(s, s, 0);
    expect(h.sample(190).x).toBeCloseTo(190);
    expect(h.sample(0).x).toBeGreaterThan(150); // clamped to the oldest kept sample
  });

  it('returns the start position with no history and after reset', () => {
    const h = new PathHistory();
    expect(h.sample(5)).toEqual({ x: 0, y: 0 });
    h.record(1, 2, 3);
    h.reset();
    expect(h.sample(1)).toEqual({ x: 0, y: 0 });
  });
});
