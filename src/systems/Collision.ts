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
}

export type HitKind = 'none' | 'front' | 'side';

/**
 * AABB overlap test that also classifies the hit: a barely-overlapping lateral clip is a
 * `side` hit (stumble), anything deeper is a `front` hit (crash).
 */
export function testObstacleHit(p: PlayerBox, o: ObstacleBox): HitKind {
  const lateralOverlap = p.halfWidth + o.halfWidth - Math.abs(p.x - o.x);
  if (lateralOverlap <= 0) return 'none';
  if (p.s + p.halfDepth <= o.s || p.s - p.halfDepth >= o.s + o.length) return 'none';
  if (p.yMax <= o.yMin) return 'none';
  if (p.yMin >= o.yMax - C.topForgiveness) return 'none';
  return lateralOverlap < C.sideClipOverlap ? 'side' : 'front';
}

/** What a side clip turns into, given when the previous stumble happened (or null). */
export function resolveStumble(
  lastStumbleAt: number | null,
  now: number,
  window: number = C.stumbleWindow,
): 'stumble' | 'crash' {
  return lastStumbleAt !== null && now - lastStumbleAt < window ? 'crash' : 'stumble';
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
