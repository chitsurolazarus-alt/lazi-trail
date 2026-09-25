import { describe, expect, it } from 'vitest';
import { CONFIG, OBSTACLE_DEFS } from '../src/config/gameConfig';
import {
  coinTouched,
  testObstacleHit,
  type ObstacleBox,
  type PlayerBox,
} from '../src/systems/Collision';

const P = CONFIG.player;

const player = (over: Partial<PlayerBox> = {}): PlayerBox => ({
  x: 0,
  s: 100,
  halfWidth: P.halfWidth,
  halfDepth: P.halfDepth,
  yMin: 0,
  yMax: P.height,
  ...over,
});

function obstacle(kind: keyof typeof OBSTACLE_DEFS, over: Partial<ObstacleBox> = {}): ObstacleBox {
  const d = OBSTACLE_DEFS[kind];
  return {
    x: 0,
    s: 100,
    length: d.length,
    halfWidth: d.halfWidth,
    yMin: d.yMin,
    yMax: d.yMax,
    ...over,
  };
}

describe('testObstacleHit', () => {
  it('detects no hit in a different lane', () => {
    expect(testObstacleHit(player({ x: 2.4 }), obstacle('stall'))).toBe('none');
  });

  it('detects no hit before or after the obstacle', () => {
    expect(testObstacleHit(player({ s: 90 }), obstacle('stall'))).toBe('none');
    expect(testObstacleHit(player({ s: 110 }), obstacle('stall'))).toBe('none');
  });

  it('is a front hit when running straight into an obstacle', () => {
    expect(testObstacleHit(player(), obstacle('stall'))).toBe('front');
    expect(testObstacleHit(player(), obstacle('taxi'))).toBe('front');
  });

  it('is a side hit when only clipping the edge', () => {
    const o = obstacle('stall');
    const gap = P.halfWidth + o.halfWidth - 0.2; // 0.2 m of lateral overlap
    expect(testObstacleHit(player({ x: gap }), o)).toBe('side');
  });

  it('lets a jump clear a low cart but not a taxi', () => {
    const airborne = player({ yMin: 1.0, yMax: 1.0 + P.height });
    expect(testObstacleHit(airborne, obstacle('cart'))).toBe('none');
    expect(testObstacleHit(airborne, obstacle('taxi'))).toBe('front');
  });

  it('hits a cart if you have not jumped', () => {
    expect(testObstacleHit(player(), obstacle('cart'))).toBe('front');
  });

  it('lets a slide pass under an awning but not standing', () => {
    const sliding = player({ yMax: P.slideHeight });
    expect(testObstacleHit(sliding, obstacle('awning'))).toBe('none');
    expect(testObstacleHit(player(), obstacle('awning'))).toBe('front');
  });
});

describe('coinTouched', () => {
  it('collects coins in reach and ignores far ones', () => {
    expect(coinTouched(player(), { x: 0, s: 100.2, y: 1 })).toBe(true);
    expect(coinTouched(player(), { x: 2.4, s: 100, y: 1 })).toBe(false);
    expect(coinTouched(player(), { x: 0, s: 105, y: 1 })).toBe(false);
  });

  it('respects height: high arcs need a jump', () => {
    expect(coinTouched(player(), { x: 0, s: 100, y: 3 })).toBe(false);
    expect(coinTouched(player({ yMin: 1.5, yMax: 3.2 }), { x: 0, s: 100, y: 3 })).toBe(true);
  });
});

describe('ramps and roofs', () => {
  const train = OBSTACLE_DEFS.trainParked;
  const rampLen = train.ramp?.length ?? 0;
  const body = (over: Partial<ObstacleBox> = {}): ObstacleBox => ({
    ...obstacle('trainParked'),
    ramp: rampLen,
    ...over,
  });

  it('lets a player standing on the ramp surface run up it', () => {
    for (const t of [0.1, 0.4, 0.8]) {
      const s = 100 - rampLen + rampLen * t;
      const surface = train.yMax * t;
      expect(testObstacleHit(player({ s, yMin: surface, yMax: surface + P.height }), body())).toBe(
        'none',
      );
    }
  });

  it('lets a player run along the roof, but hits the front wall at ground level', () => {
    expect(
      testObstacleHit(player({ s: 110, yMin: train.yMax, yMax: train.yMax + P.height }), body()),
    ).toBe('none');
    expect(testObstacleHit(player({ s: 100.2 }), body({ ramp: 0 }))).toBe('front');
  });

  it('runs onto the ramp foot from the ground without a hit', () => {
    expect(testObstacleHit(player({ s: 100 - rampLen + 0.4 }), body())).toBe('none');
  });

  it('clips the side of the ramp if you step sideways into it low down', () => {
    const s = 100 - rampLen * 0.6; // ramp is ~2.2 m high here
    const x = P.halfWidth + train.halfWidth - 0.2;
    expect(testObstacleHit(player({ s, x }), body())).toBe('side');
  });

  it('does not clip the body when hopping off the side of the roof', () => {
    // Just started falling (0.4 m below the roof) and already 1.35 m to the side.
    const x = train.halfWidth - 0.1;
    const yMin = train.yMax - 0.4;
    expect(testObstacleHit(player({ s: 110, x, yMin, yMax: yMin + P.height }), body())).toBe(
      'none',
    );
  });

  it('is solid at the rear end when falling past it', () => {
    expect(testObstacleHit(player({ s: 100 + train.length + 1 }), body())).toBe('none');
  });
});
