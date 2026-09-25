import { describe, expect, it } from 'vitest';
import { ADAPTIVE, AdaptiveScale } from '../src/systems/AdaptiveScale';

/** Feed `seconds` of frames at `ms` each; returns every scale change. */
function feed(a: AdaptiveScale, ms: number, seconds: number): number[] {
  const changes: number[] = [];
  for (let t = 0; t < seconds; t += ms / 1000) {
    const next = a.update(ms / 1000);
    if (next !== null) changes.push(next);
  }
  return changes;
}

describe('AdaptiveScale', () => {
  it('starts at full resolution and waits out the initial cooldown', () => {
    const a = new AdaptiveScale();
    expect(a.current).toBe(1);
    expect(feed(a, 60, ADAPTIVE.cooldown - 0.2)).toEqual([]);
  });

  it('lowers resolution step by step when frames are slow, down to the floor', () => {
    const a = new AdaptiveScale();
    const changes = feed(a, 50, 60);
    expect(changes[0]).toBeCloseTo(1 - ADAPTIVE.step);
    expect(a.current).toBe(ADAPTIVE.minScale);
    expect(changes.every((c, i) => i === 0 || c < (changes[i - 1] as number))).toBe(true);
  });

  it('leaves a healthy frame rate alone', () => {
    const a = new AdaptiveScale();
    expect(feed(a, 16.7, 30)).toEqual([]);
    expect(a.current).toBe(1);
  });

  it('raises resolution again when there is headroom, but never above 1', () => {
    const a = new AdaptiveScale();
    feed(a, 50, 20);
    expect(a.current).toBeLessThan(1);
    feed(a, 10, 60);
    expect(a.current).toBe(1);
  });

  it('does not flap in the band between the thresholds', () => {
    const a = new AdaptiveScale();
    feed(a, 50, 10);
    const settled = a.current;
    expect(feed(a, (ADAPTIVE.slowMs + ADAPTIVE.fastMs) / 2, 60)).toEqual([]);
    expect(a.current).toBe(settled);
  });

  it('reset clears history and restarts the cooldown', () => {
    const a = new AdaptiveScale();
    feed(a, 50, 1);
    a.reset();
    expect(feed(a, 50, ADAPTIVE.cooldown - 0.3)).toEqual([]);
  });
});
