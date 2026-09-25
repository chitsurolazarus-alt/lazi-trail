import { APPROACH_DISTANCE, type ObstacleDef } from '../config/gameConfig';

/**
 * Near-edge position (track metres) of a moving vehicle.
 *
 * A vehicle is anchored to its row at `anchorS`. It sits still until the player is
 * `APPROACH_DISTANCE` before that point, then drives toward the player at `closing` × the
 * player's own progress, so the two always meet exactly at `anchorS` regardless of speed.
 * After the meeting it keeps going and passes behind the player.
 */
export function movingNearEdge(anchorS: number, closing: number, travelled: number): number {
  return anchorS + closing * Math.min(APPROACH_DISTANCE, anchorS - travelled);
}

/** How far beyond its row a moving vehicle starts, i.e. the lane it sweeps through. */
export function movingSweep(def: ObstacleDef): number {
  return def.moving ? def.moving.closing * APPROACH_DISTANCE + def.length : 0;
}

export interface SurfaceObstacle {
  /** Near edge of the solid body. */
  s: number;
  x: number;
  def: ObstacleDef;
}

/** Sideways tolerance for standing on a ramp/roof (a little inside the body's edge). */
const SURFACE_HALF_WIDTH_SCALE = 0.9;

/**
 * Height of a walkable ramp or roof at track position `s` and lateral position `x`
 * (0 when the obstacle has no walkable surface there).
 */
export function surfaceHeight(o: SurfaceObstacle, x: number, s: number): number {
  const ramp = o.def.ramp;
  if (!ramp) return 0;
  if (Math.abs(x - o.x) > o.def.halfWidth * SURFACE_HALF_WIDTH_SCALE) return 0;
  const top = o.def.yMax;
  if (s >= o.s && s <= o.s + o.def.length) return top;
  if (s < o.s && s >= o.s - ramp.length) return (top * (s - (o.s - ramp.length))) / ramp.length;
  return 0;
}

/** Highest walkable surface under (x, s) among the given obstacles. */
export function groundHeightAt(obstacles: Iterable<SurfaceObstacle>, x: number, s: number): number {
  let h = 0;
  for (const o of obstacles) {
    if (!o.def.ramp) continue;
    const v = surfaceHeight(o, x, s);
    if (v > h) h = v;
  }
  return h;
}

/**
 * Height of the ramp's sloped side at `s` (used to stop the player walking sideways *through* the
 * ramp). Zero outside the ramp's length.
 */
export function rampTopAt(o: SurfaceObstacle, s: number): number {
  const ramp = o.def.ramp;
  if (!ramp || s < o.s - ramp.length || s >= o.s) return 0;
  return (o.def.yMax * (s - (o.s - ramp.length))) / ramp.length;
}
