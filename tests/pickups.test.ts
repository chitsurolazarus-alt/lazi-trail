import { describe, expect, it } from 'vitest';
import { LANE_COUNT } from '../src/config/gameConfig';
import {
  PICKUPS,
  POWER_UP_IDS,
  POWER_UPS,
  UPGRADE_MAX,
  powerUpSeconds,
} from '../src/config/progression';
import { createRng } from '../src/core/random';
import { getDifficulty } from '../src/systems/Difficulty';
import { addCoins, createScoreState, totalScore } from '../src/systems/Scoring';
import { ObstacleGenerator } from '../src/world/ObstacleGenerator';

function pickups(seed: number, length = 6000, elapsed = 60) {
  const gen = new ObstacleGenerator(createRng(seed));
  return gen.generate(length, { ...getDifficulty(elapsed), zone: 1 }).pickups;
}

describe('power-up placement', () => {
  it('spawns pickups, never before the first-at distance, on a real lane', () => {
    let total = 0;
    for (let seed = 1; seed <= 20; seed++) {
      for (const p of pickups(seed)) {
        total++;
        expect(p.s).toBeGreaterThanOrEqual(PICKUPS.firstAt);
        expect(p.lane).toBeGreaterThanOrEqual(0);
        expect(p.lane).toBeLessThan(LANE_COUNT);
        expect(POWER_UP_IDS).toContain(p.kind);
      }
    }
    expect(total).toBeGreaterThan(20);
  });

  it('keeps pickups at least the minimum spacing apart', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const list = pickups(seed);
      for (let i = 1; i < list.length; i++) {
        expect((list[i]?.s ?? 0) - (list[i - 1]?.s ?? 0)).toBeGreaterThanOrEqual(
          PICKUPS.minSpacing,
        );
      }
    }
  });

  it('offers every kind of power-up over a long run', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) for (const p of pickups(seed)) seen.add(p.kind);
    expect(seen).toEqual(new Set(POWER_UP_IDS));
  });

  it('is deterministic for a seed', () => {
    expect(pickups(7)).toEqual(pickups(7));
  });
});

describe('power-up durations', () => {
  it('match the brief at level 0: magnet 10 s, boost 5 s, spikes 10 s, 2x 15 s', () => {
    expect(powerUpSeconds('magnet', 0)).toBe(10);
    expect(powerUpSeconds('boost', 0)).toBe(5);
    expect(powerUpSeconds('spikes', 0)).toBe(10);
    expect(powerUpSeconds('doubleScore', 0)).toBe(15);
  });

  it('grow with each upgrade level and with the Sipho magnet perk', () => {
    for (const id of POWER_UP_IDS) {
      expect(powerUpSeconds(id, UPGRADE_MAX)).toBe(
        POWER_UPS[id].baseSeconds + POWER_UPS[id].perLevel * UPGRADE_MAX,
      );
      expect(powerUpSeconds(id, 1)).toBeGreaterThan(powerUpSeconds(id, 0));
    }
    expect(powerUpSeconds('magnet', 0, 1.5)).toBe(15);
  });
});

describe('2x Score on coins', () => {
  it('doubles the points of a coin but not the Rand collected', () => {
    const normal = addCoins(createScoreState(), 10);
    const doubled = addCoins(createScoreState(), 10, 2);
    expect(doubled.coins).toBe(normal.coins);
    expect(totalScore(doubled)).toBe(totalScore(normal) * 2);
  });
});
