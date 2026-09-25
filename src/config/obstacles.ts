import type { ObstacleKind } from './gameConfig';

export interface ObstacleMix {
  /** Obstacles that force a lane change (weights, relative). */
  readonly block: ReadonlyArray<readonly [ObstacleKind, number]>;
  /** Obstacles you jump over or slide under. */
  readonly action: ReadonlyArray<readonly [ObstacleKind, number]>;
}

/** Which obstacles appear in each zone (index = zone index). */
export const ZONE_OBSTACLES: readonly ObstacleMix[] = [
  // Township Market: stalls, carts, parked taxis (some with ramps)
  {
    block: [
      ['stall', 0.45],
      ['taxi', 0.3],
      ['taxiRamp', 0.25],
    ],
    action: [
      ['cart', 0.5],
      ['awning', 0.3],
      ['barrier', 0.2],
    ],
  },
  // City Streets: moving taxis join
  {
    block: [
      ['stall', 0.25],
      ['taxi', 0.2],
      ['taxiRamp', 0.2],
      ['taxiMoving', 0.35],
    ],
    action: [
      ['cart', 0.4],
      ['awning', 0.3],
      ['barrier', 0.3],
    ],
  },
  // Train Yard: trains take over
  {
    block: [
      ['trainParked', 0.4],
      ['trainMoving', 0.3],
      ['taxiRamp', 0.1],
      ['stall', 0.1],
      ['taxiMoving', 0.1],
    ],
    action: [
      ['barrier', 0.5],
      ['cart', 0.25],
      ['awning', 0.25],
    ],
  },
  // Stadium Approach: everything mixed
  {
    block: [
      ['stall', 0.12],
      ['taxiRamp', 0.14],
      ['taxiMoving', 0.2],
      ['trainParked', 0.27],
      ['trainMoving', 0.27],
    ],
    action: [
      ['cart', 0.3],
      ['awning', 0.3],
      ['barrier', 0.4],
    ],
  },
];
