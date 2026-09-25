import { describe, expect, it } from 'vitest';
import { LANE_COUNT, OBSTACLE_DEFS } from '../src/config/gameConfig';
import { ZONES } from '../src/config/zones';
import { createRng } from '../src/core/random';
import { getDifficulty } from '../src/systems/Difficulty';
import { movingSweep } from '../src/systems/ObstacleMotion';
import {
  ObstacleGenerator,
  blocksLane,
  hasPassablePath,
  type GeneratorParams,
  type Row,
} from '../src/world/ObstacleGenerator';

function params(elapsed: number, zone = 0): GeneratorParams {
  return { ...getDifficulty(elapsed), zone };
}

function generateRows(seed: number, elapsed: number, zone = 0, length = 4000): Row[] {
  return new ObstacleGenerator(createRng(seed)).generate(length, params(elapsed, zone)).rows;
}

const SAMPLE_TIMES = [0, 30, 59, 90, 180, 300, 360, 1000];
const ZONE_IDS = ZONES.map((_, i) => i);

describe('ObstacleGenerator', () => {
  it('always leaves a lane free of lane-blockers in every row, in every zone', () => {
    for (const zone of ZONE_IDS) {
      for (let seed = 1; seed <= 15; seed++) {
        for (const t of SAMPLE_TIMES) {
          for (const row of generateRows(seed, t, zone)) {
            const blockedLanes = new Set(row.obstacles.filter(blocksLane).map((o) => o.lane));
            expect(blockedLanes.size).toBeLessThan(LANE_COUNT);
            expect(blockedLanes.has(row.safeLane)).toBe(false);
          }
        }
      }
    }
  });

  it('always has a route through the whole track, moving at most one lane per row', () => {
    for (const zone of ZONE_IDS) {
      for (let seed = 1; seed <= 15; seed++) {
        for (const t of SAMPLE_TIMES) {
          expect(hasPassablePath(generateRows(seed, t, zone))).toBe(true);
        }
      }
    }
  });

  it('the safe lane never jumps more than one lane between rows', () => {
    for (const t of SAMPLE_TIMES) {
      const rows = generateRows(7, t, 3);
      for (let i = 1; i < rows.length; i++) {
        const a = rows[i - 1] as Row;
        const b = rows[i] as Row;
        expect(Math.abs(a.safeLane - b.safeLane)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('keeps the start runway clear (including room for ramps)', () => {
    const generator = new ObstacleGenerator(createRng(3), 60);
    const { rows } = generator.generate(500, params(0));
    for (const row of rows) expect(row.s - row.lead).toBeGreaterThanOrEqual(60);
  });

  it('leaves at least the reaction gap between rows, measured from ramp foot to body end', () => {
    for (const zone of ZONE_IDS) {
      for (const t of SAMPLE_TIMES) {
        const d = getDifficulty(t);
        const rows = generateRows(11, t, zone);
        for (let i = 1; i < rows.length; i++) {
          const a = rows[i - 1] as Row;
          const b = rows[i] as Row;
          expect(b.s - b.lead - (a.s + a.depth)).toBeGreaterThanOrEqual(
            d.reactSeconds * d.speed - 1e-6,
          );
        }
      }
    }
  });

  it('blocks at most one lane per row during the easy phase', () => {
    for (let seed = 1; seed <= 20; seed++) {
      for (const row of generateRows(seed, 10, 0)) {
        expect(row.obstacles.filter(blocksLane).length).toBeLessThanOrEqual(1);
      }
    }
  });

  it('only uses obstacles that belong to the zone', () => {
    const kindsIn = (zone: number): Set<string> =>
      new Set(generateRows(5, 200, zone).flatMap((r) => r.obstacles.map((o) => o.kind)));
    const z1 = kindsIn(0);
    expect(z1.has('taxiMoving')).toBe(false);
    expect(z1.has('trainParked')).toBe(false);
    expect(z1.has('trainMoving')).toBe(false);
    const z2 = kindsIn(1);
    expect(z2.has('taxiMoving')).toBe(true);
    expect(z2.has('trainParked')).toBe(false);
    const z3 = kindsIn(2);
    expect(z3.has('trainParked')).toBe(true);
    expect(z3.has('trainMoving')).toBe(true);
  });

  it('reserves room in front of a row for its ramps', () => {
    let sawRamp = false;
    for (const row of generateRows(21, 100, 2)) {
      const maxRamp = Math.max(
        0,
        ...row.obstacles.map((o) => OBSTACLE_DEFS[o.kind].ramp?.length ?? 0),
      );
      expect(row.lead).toBe(maxRamp);
      if (maxRamp > 0) sawRamp = true;
    }
    expect(sawRamp).toBe(true);
  });

  it('never puts anything else in a lane while a moving vehicle is still sweeping it', () => {
    for (const zone of [1, 2, 3]) {
      for (let seed = 1; seed <= 10; seed++) {
        const rows = generateRows(seed, 150, zone, 3000);
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i] as Row;
          for (const mover of row.obstacles.filter((o) => OBSTACLE_DEFS[o.kind].moving)) {
            const swept = row.s + movingSweep(OBSTACLE_DEFS[mover.kind]);
            for (let j = i + 1; j < rows.length; j++) {
              const later = rows[j] as Row;
              if (later.s - later.lead > swept) break;
              expect(later.obstacles.some((o) => o.lane === mover.lane)).toBe(false);
            }
          }
        }
      }
    }
  });

  it('is deterministic for a given seed', () => {
    const a = generateRows(42, 100, 2, 1000);
    const b = generateRows(42, 100, 2, 1000);
    expect(a).toEqual(b);
  });

  it('generates incrementally without gaps or duplicates', () => {
    const p = params(120, 1);
    const whole = new ObstacleGenerator(createRng(5)).generate(800, p);
    const gen = new ObstacleGenerator(createRng(5));
    const parts = [gen.generate(200, p), gen.generate(500, p), gen.generate(800, p)];
    expect(parts.flatMap((part) => part.rows)).toEqual(whole.rows);
  });

  it('places ground coins only on free ground, never inside a lane-blocking obstacle', () => {
    for (const zone of ZONE_IDS) {
      for (let seed = 1; seed <= 6; seed++) {
        const section = new ObstacleGenerator(createRng(seed)).generate(3000, params(150, zone));
        const blockers = section.obstacles.filter(blocksLane);
        for (const coin of section.coins) {
          const clash = blockers.some((o) => {
            const d = OBSTACLE_DEFS[o.kind];
            const near = o.s - (d.ramp?.length ?? 0) - 0.5;
            const inFootprint =
              Math.abs(o.lane - coin.lane) < 0.5 &&
              coin.s >= near &&
              coin.s <= o.s + d.length + 0.5;
            // Coins above the body are the roof-running reward; they are meant to be there.
            return inFootprint && coin.y < d.yMax + 0.5 - 0.01 && !d.ramp && !d.moving;
          });
          expect(clash).toBe(false);
        }
      }
    }
  });

  it('puts a coin line on the ramp and roof of parked vehicles', () => {
    const section = new ObstacleGenerator(createRng(9)).generate(4000, params(150, 2));
    const parked = section.obstacles.filter((o) => OBSTACLE_DEFS[o.kind].ramp);
    expect(parked.length).toBeGreaterThan(0);
    const o = parked[0]!;
    const d = OBSTACLE_DEFS[o.kind];
    const roofCoins = section.coins.filter(
      (c) =>
        Math.abs(c.lane - o.lane) < 0.01 && c.s >= o.s && c.s <= o.s + d.length && c.y > d.yMax,
    );
    expect(roofCoins.length).toBeGreaterThan(0);
  });
});

describe('hasPassablePath', () => {
  const blocker = (lane: number) => ({ kind: 'stall' as const, lane, s: 0 });

  it('fails when every lane in a row is blocked', () => {
    const row: Row = { s: 0, lead: 0, depth: 1, safeLane: 0, obstacles: [0, 1, 2].map(blocker) };
    expect(hasPassablePath([row])).toBe(false);
  });

  it('fails when the only free lane is unreachable', () => {
    const row: Row = { s: 0, lead: 0, depth: 1, safeLane: 2, obstacles: [blocker(0), blocker(1)] };
    expect(hasPassablePath([row], 0)).toBe(false);
    expect(hasPassablePath([row], 0, 2)).toBe(true);
  });

  it('treats jump/slide obstacles as passable', () => {
    const row: Row = {
      s: 0,
      lead: 0,
      depth: 2,
      safeLane: 1,
      obstacles: [
        { kind: 'cart', lane: 0, s: 0 },
        { kind: 'awning', lane: 1, s: 0 },
        { kind: 'barrier', lane: 2, s: 0 },
      ],
    };
    expect(hasPassablePath([row])).toBe(true);
  });

  it('treats parked vehicles with ramps and moving vehicles as lane blockers', () => {
    const row: Row = {
      s: 0,
      lead: 12,
      depth: 20,
      safeLane: 1,
      obstacles: [
        { kind: 'trainParked', lane: 0, s: 0 },
        { kind: 'trainMoving', lane: 2, s: 0 },
        { kind: 'taxiRamp', lane: 1, s: 0 },
      ],
    };
    expect(hasPassablePath([row])).toBe(false);
  });
});
