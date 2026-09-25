import { describe, expect, it } from 'vitest';
import { CONFIG, OBSTACLE_DEFS } from '../src/config/gameConfig';
import {
  coinTouched,
  resolveStumble,
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

describe('resolveStumble', () => {
  it('first stumble is just a stumble', () => {
    expect(resolveStumble(null, 10)).toBe('stumble');
  });

  it('a second stumble within the window is a crash', () => {
    expect(resolveStumble(10, 11)).toBe('crash');
  });

  it('a stumble after the window has passed is only a stumble again', () => {
    expect(resolveStumble(10, 10 + CONFIG.collision.stumbleWindow + 0.1)).toBe('stumble');
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
