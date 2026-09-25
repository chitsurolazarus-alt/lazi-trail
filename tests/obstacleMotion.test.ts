import { describe, expect, it } from 'vitest';
import { APPROACH_DISTANCE, OBSTACLE_DEFS } from '../src/config/gameConfig';
import {
  groundHeightAt,
  movingNearEdge,
  movingSweep,
  rampTopAt,
  surfaceHeight,
  type SurfaceObstacle,
} from '../src/systems/ObstacleMotion';

const taxi = OBSTACLE_DEFS.taxiMoving;
const train = OBSTACLE_DEFS.trainParked;

describe('movingNearEdge', () => {
  it('waits ahead of its row until the player is APPROACH_DISTANCE away', () => {
    const anchor = 500;
    const k = taxi.moving?.closing ?? 0;
    const hold = anchor + k * APPROACH_DISTANCE;
    expect(movingNearEdge(anchor, k, 0)).toBeCloseTo(hold);
    expect(movingNearEdge(anchor, k, anchor - APPROACH_DISTANCE - 20)).toBeCloseTo(hold);
    expect(movingNearEdge(anchor, k, anchor - APPROACH_DISTANCE)).toBeCloseTo(hold);
  });

  it('meets the player exactly at its row, whatever the speed', () => {
    for (const anchor of [100, 777, 4200]) {
      expect(movingNearEdge(anchor, 0.8, anchor)).toBeCloseTo(anchor);
    }
  });

  it('closes on the player faster than the player runs, then passes behind', () => {
    const anchor = 300;
    const k = 0.8;
    const gapAt = (t: number): number => movingNearEdge(anchor, k, t) - t;
    // 30 m before the meeting point the vehicle is (1 + k) × 30 m ahead.
    expect(gapAt(anchor - 30)).toBeCloseTo(30 * (1 + k));
    expect(gapAt(anchor)).toBeCloseTo(0);
    expect(gapAt(anchor + 10)).toBeLessThan(0);
  });

  it('moves monotonically toward the player', () => {
    let prev = Infinity;
    for (let t = 0; t <= 400; t += 5) {
      const s = movingNearEdge(300, 0.9, t);
      expect(s).toBeLessThanOrEqual(prev + 1e-9);
      prev = s;
    }
  });

  it('sweep covers the approach path plus the body', () => {
    expect(movingSweep(taxi)).toBeCloseTo(
      (taxi.moving?.closing ?? 0) * APPROACH_DISTANCE + taxi.length,
    );
    expect(movingSweep(OBSTACLE_DEFS.stall)).toBe(0);
  });
});

describe('walkable surfaces', () => {
  const o: SurfaceObstacle = { s: 200, x: 0, def: train };
  const rampLen = train.ramp?.length ?? 0;

  it('is flat road away from the vehicle', () => {
    expect(surfaceHeight(o, 0, 100)).toBe(0);
    expect(surfaceHeight(o, 0, 200 + train.length + 1)).toBe(0);
    expect(surfaceHeight(o, 5, 210)).toBe(0); // another lane
  });

  it('rises linearly up the ramp to the roof height', () => {
    expect(surfaceHeight(o, 0, 200 - rampLen)).toBeCloseTo(0);
    expect(surfaceHeight(o, 0, 200 - rampLen / 2)).toBeCloseTo(train.yMax / 2);
    expect(surfaceHeight(o, 0, 200)).toBeCloseTo(train.yMax);
  });

  it('stays at roof height along the whole body', () => {
    for (let s = 200; s <= 200 + train.length; s += 4)
      expect(surfaceHeight(o, 0, s)).toBe(train.yMax);
  });

  it('has no surface for vehicles without a ramp', () => {
    const plain: SurfaceObstacle = { s: 200, x: 0, def: OBSTACLE_DEFS.taxi };
    expect(surfaceHeight(plain, 0, 202)).toBe(0);
  });

  it('groundHeightAt returns the highest surface', () => {
    const low: SurfaceObstacle = { s: 200, x: 0, def: OBSTACLE_DEFS.taxiRamp };
    expect(groundHeightAt([low, o], 0, 205)).toBe(train.yMax);
    expect(groundHeightAt([], 0, 205)).toBe(0);
  });

  it('rampTopAt is zero on the body and off the ramp', () => {
    expect(rampTopAt(o, 200 + 1)).toBe(0);
    expect(rampTopAt(o, 200 - rampLen - 1)).toBe(0);
    expect(rampTopAt(o, 200 - rampLen / 2)).toBeCloseTo(train.yMax / 2);
  });
});
