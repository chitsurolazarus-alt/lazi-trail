import * as THREE from 'three';
import { APPROACH_DISTANCE, OBSTACLE_DEFS, laneToX } from '../config/gameConfig';
import { PICKUPS } from '../config/progression';
import type { Rng } from '../core/random';
import type { CoinInstance } from '../entities/Coin';
import type { PickupInstance } from '../entities/Pickup';
import type { ObstacleInstance, ObstaclePool } from '../entities/Obstacle';
import { movingNearEdge } from '../systems/ObstacleMotion';
import type { ChunkDecor } from './ChunkDecor';
import type { GeneratedSection } from './ObstacleGenerator';
import { PropField } from './PropField';

/**
 * One 40 m slice of track: scenery (a `ChunkDecor`) plus the obstacles and coins generated for it.
 * Chunks are pooled: `populate` re-dresses a recycled chunk in place.
 *
 * Local space: the chunk's near edge is at z = 0 and it extends toward -Z.
 */
export class Chunk {
  readonly group = new THREE.Group();
  /** Track distance at which this chunk begins. */
  start = 0;
  zoneIndex = 0;
  obstacles: ObstacleInstance[] = [];
  /** Obstacles with a walkable ramp/roof (for ground-height queries). */
  ramps: ObstacleInstance[] = [];
  /** Vehicles that drive toward the player. */
  movers: ObstacleInstance[] = [];
  /** Coins (drawn together by the CoinField). */
  coins: CoinInstance[] = [];
  /** Power-ups (drawn by the `PickupField`). */
  pickups: PickupInstance[] = [];
  /** Street furniture records (see PropField), in this chunk's local space. */
  readonly props = new Float32Array(PropField.maxPerChunk * PropField.stride);
  propCount = 0;

  constructor(readonly decor: ChunkDecor) {
    this.group.add(decor.object);
  }

  populate(
    start: number,
    zoneIndex: number,
    section: GeneratedSection,
    obstaclePool: ObstaclePool,
    rng: Rng,
  ): void {
    this.start = start;
    this.zoneIndex = zoneIndex;
    this.decor.dress(zoneIndex, rng);

    for (const spec of section.obstacles) {
      const def = OBSTACLE_DEFS[spec.kind];
      const mesh = obstaclePool.acquire(spec.kind);
      const x = laneToX(spec.lane);
      // Moving vehicles wait ahead until the player is close, then drive toward Lazi (facing her).
      const s = def.moving ? spec.s + def.moving.closing * APPROACH_DISTANCE : spec.s;
      mesh.position.set(x, 0, -(s + def.length / 2 - start));
      mesh.rotation.y = def.moving ? Math.PI : 0;
      this.group.add(mesh);
      const instance: ObstacleInstance = { def, s, anchorS: spec.s, x, mesh, hit: false };
      this.obstacles.push(instance);
      if (def.ramp) this.ramps.push(instance);
      if (def.moving) this.movers.push(instance);
    }

    for (const spec of section.pickups) {
      this.pickups.push({
        kind: spec.kind,
        x: laneToX(spec.lane),
        y: PICKUPS.height,
        s: spec.s,
        collected: false,
      });
    }

    for (const spec of section.coins) {
      this.coins.push({
        kind: spec.kind,
        x: laneToX(spec.lane),
        y: spec.y,
        s: spec.s,
        collected: false,
      });
    }
  }

  /** Current scroll offset of this chunk (its z in world space). */
  get scrollZ(): number {
    return this.group.position.z;
  }

  /** Hand everything spawned in this chunk back to the pools. */
  clear(obstaclePool: ObstaclePool): void {
    for (const o of this.obstacles) obstaclePool.release(o.def.kind, o.mesh);
    this.obstacles.length = 0;
    this.ramps.length = 0;
    this.movers.length = 0;
    this.coins.length = 0;
    this.pickups.length = 0;
    this.propCount = 0;
  }

  /** Advance every moving vehicle to where it is when the player has run `travelled` metres. */
  updateMoving(travelled: number): void {
    for (const o of this.movers) {
      o.s = movingNearEdge(o.anchorS, (o.def.moving as { closing: number }).closing, travelled);
      o.mesh.position.z = -(o.s + o.def.length / 2 - this.start);
    }
  }

  /** Scroll the chunk: the player is always at z = 0, so this chunk sits at `travelled - start`. */
  setScroll(travelled: number): void {
    this.group.position.z = travelled - this.start;
  }
}
