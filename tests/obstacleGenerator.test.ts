import { describe, expect, it } from 'vitest';
import { LANE_COUNT } from '../src/config/gameConfig';
import { createRng } from '../src/core/random';
import { getDifficulty } from '../src/systems/Difficulty';
import {
  ObstacleGenerator,
  blocksLane,
  hasPassablePath,
  type Row,
} from '../src/world/ObstacleGenerator';

function generateRows(seed: number, elapsed: number, length = 4000): Row[] {
  const generator = new ObstacleGenerator(createRng(seed));
  return generator.generate(length, getDifficulty(elapsed)).rows;
}

const SAMPLE_TIMES = [0, 30, 59, 90, 180, 300, 360, 1000];

describe('ObstacleGenerator', () => {
  it('always leaves a lane free of lane-blockers in every row', () => {
    for (let seed = 1; seed <= 30; seed++) {
      for (const t of SAMPLE_TIMES) {
        for (const row of generateRows(seed, t)) {
          const blockedLanes = new Set(row.obstacles.filter(blocksLane).map((o) => o.lane));
          expect(blockedLanes.size).toBeLessThan(LANE_COUNT);
          expect(blockedLanes.has(row.safeLane)).toBe(false);
        }
      }
    }
  });

  it('always has a route through the whole track, moving at most one lane per row', () => {
    for (let seed = 1; seed <= 30; seed++) {
      for (const t of SAMPLE_TIMES) {
        expect(hasPassablePath(generateRows(seed, t))).toBe(true);
      }
    }
  });

  it('the safe lane never jumps more than one lane between rows', () => {
    for (const t of SAMPLE_TIMES) {
      const rows = generateRows(7, t);
      for (let i = 1; i < rows.length; i++) {
        const a = rows[i - 1] as Row;
        const b = rows[i] as Row;
        expect(Math.abs(a.safeLane - b.safeLane)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('keeps the start runway clear', () => {
    const generator = new ObstacleGenerator(createRng(3), 60);
    const { obstacles } = generator.generate(500, getDifficulty(0));
    expect(Math.min(...obstacles.map((o) => o.s))).toBeGreaterThanOrEqual(60);
  });

  it('leaves at least the reaction gap between rows', () => {
    for (const t of SAMPLE_TIMES) {
      const d = getDifficulty(t);
      const rows = generateRows(11, t);
      for (let i = 1; i < rows.length; i++) {
        const a = rows[i - 1] as Row;
        const b = rows[i] as Row;
        expect(b.s - (a.s + a.depth)).toBeGreaterThanOrEqual(d.reactSeconds * d.speed - 1e-6);
      }
    }
  });

  it('blocks at most one lane per row during the easy phase', () => {
    for (let seed = 1; seed <= 20; seed++) {
      for (const row of generateRows(seed, 10)) {
        expect(row.obstacles.filter(blocksLane).length).toBeLessThanOrEqual(1);
      }
    }
  });

  it('is deterministic for a given seed', () => {
    const a = generateRows(42, 100, 1000);
    const b = generateRows(42, 100, 1000);
    expect(a).toEqual(b);
  });

  it('generates incrementally without gaps or duplicates', () => {
    const params = getDifficulty(120);
    const whole = new ObstacleGenerator(createRng(5)).generate(800, params);
    const gen = new ObstacleGenerator(createRng(5));
    const parts = [gen.generate(200, params), gen.generate(500, params), gen.generate(800, params)];
    expect(parts.flatMap((p) => p.rows)).toEqual(whole.rows);
  });

  it('places coins only on reachable positions (never inside a lane-blocking obstacle)', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const section = new ObstacleGenerator(createRng(seed)).generate(3000, getDifficulty(150));
      const blockers = section.obstacles.filter(blocksLane);
      for (const coin of section.coins) {
        const clash = blockers.some(
          (o) => Math.abs(o.lane - coin.lane) < 0.5 && coin.s >= o.s - 0.5 && coin.s <= o.s + 6,
        );
        expect(clash).toBe(false);
      }
    }
  });
});

describe('hasPassablePath', () => {
  const blocker = (lane: number) => ({ kind: 'stall' as const, lane, s: 0 });

  it('fails when every lane in a row is blocked', () => {
    const row: Row = { s: 0, depth: 1, safeLane: 0, obstacles: [0, 1, 2].map(blocker) };
    expect(hasPassablePath([row])).toBe(false);
  });

  it('fails when the only free lane is unreachable', () => {
    const row: Row = { s: 0, depth: 1, safeLane: 2, obstacles: [blocker(0), blocker(1)] };
    expect(hasPassablePath([row], 0)).toBe(false);
    expect(hasPassablePath([row], 0, 2)).toBe(true);
  });

  it('treats jump/slide obstacles as passable', () => {
    const row: Row = {
      s: 0,
      depth: 2,
      safeLane: 1,
      obstacles: [
        { kind: 'cart', lane: 0, s: 0 },
        { kind: 'awning', lane: 1, s: 0 },
        { kind: 'cart', lane: 2, s: 0 },
      ],
    };
    expect(hasPassablePath([row])).toBe(true);
  });
});
