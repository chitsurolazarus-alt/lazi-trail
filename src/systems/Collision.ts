import { CONFIG } from '../config/gameConfig';

const C = CONFIG.collision;

/** Player bounds. `s` is the player's position along the track. */
export interface PlayerBox {
  x: number;
  s: number;
  halfWidth: number;
  halfDepth: number;
  yMin: number;
  yMax: number;
}

/** Obstacle bounds. `s` is the near (first-hit) edge along the track. */
export interface ObstacleBox {
  x: number;
  s: number;
  length: number;
  halfWidth: number;
  yMin: number;
  yMax: number;
  /** Length of a walkable ramp leading up to the body's roof (0 / absent = none). */
  ramp?: number;
}

export type HitKind = 'none' | 'front' | 'side';

/**
 * AABB overlap test that also classifies the hit: a barely-overlapping lateral clip is a
 * `side` hit (stumble), anything deeper is a `front` hit (crash).
 */
export function testObstacleHit(p: PlayerBox, o: ObstacleBox): HitKind {
  const lateralOverlap = p.halfWidth + o.halfWidth - Math.abs(p.x - o.x);
  if (lateralOverlap <= 0) return 'none';
  const ramp = o.ramp ?? 0;
  const near = o.s - ramp;
  if (p.s + p.halfDepth <= near || p.s - p.halfDepth >= o.s + o.length) return 'none';
  if (p.yMax <= o.yMin) return 'none';
  // Over the ramp the solid top slopes up from the ground to the roof.
  let top = o.yMax;
  if (ramp > 0 && p.s < o.s) top = o.yMax * Math.min(1, Math.max(0, (p.s - near) / ramp));
  // Roofs are forgiving: stepping off the side of one shouldn't clip the body on the way down.
  const forgiveness = ramp > 0 ? C.roofForgiveness : C.topForgiveness;
  if (p.yMin >= top - forgiveness) return 'none';
  return lateralOverlap < C.sideClipOverlap ? 'side' : 'front';
}

export interface CoinPoint {
  x: number;
  s: number;
  y: number;
}

export function coinTouched(p: PlayerBox, coin: CoinPoint): boolean {
  return (
    Math.abs(coin.x - p.x) < C.coinRadiusX &&
    Math.abs(coin.s - p.s) < C.coinRadiusS &&
    coin.y + C.coinRadius > p.yMin &&
    coin.y - C.coinRadius < p.yMax
  );
}
