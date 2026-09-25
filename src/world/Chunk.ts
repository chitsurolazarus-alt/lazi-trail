import * as THREE from 'three';
import { OBSTACLE_DEFS, laneToX } from '../config/gameConfig';
import type { Rng } from '../core/random';
import type { CoinInstance, CoinPool } from '../entities/Coin';
import type { ObstacleInstance, ObstaclePool } from '../entities/Obstacle';
import type { ChunkDecor } from './ChunkDecor';
import type { GeneratedSection } from './ObstacleGenerator';

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
  coins: CoinInstance[] = [];

  constructor(readonly decor: ChunkDecor) {
    this.group.add(decor.object);
  }

  populate(
    start: number,
    zoneIndex: number,
    section: GeneratedSection,
    obstaclePool: ObstaclePool,
    coinPool: CoinPool,
    rng: Rng,
  ): void {
    this.start = start;
    this.zoneIndex = zoneIndex;
    this.decor.dress(zoneIndex, rng);

    for (const spec of section.obstacles) {
      const def = OBSTACLE_DEFS[spec.kind];
      const mesh = obstaclePool.acquire(spec.kind);
      const x = laneToX(spec.lane);
      mesh.position.set(x, 0, -(spec.s + def.length / 2 - start));
      this.group.add(mesh);
      this.obstacles.push({ def, s: spec.s, x, mesh, hit: false });
    }

    for (const spec of section.coins) {
      const mesh = coinPool.acquire(spec.kind);
      const x = laneToX(spec.lane);
      mesh.position.set(x, spec.y, -(spec.s - start));
      this.group.add(mesh);
      this.coins.push({ kind: spec.kind, x, y: spec.y, s: spec.s, mesh, collected: false });
    }
  }

  /** Hand everything spawned in this chunk back to the pools. */
  clear(obstaclePool: ObstaclePool, coinPool: CoinPool): void {
    for (const o of this.obstacles) obstaclePool.release(o.def.kind, o.mesh);
    for (const c of this.coins) coinPool.release(c.kind, c.mesh);
    this.obstacles.length = 0;
    this.coins.length = 0;
  }

  /** Scroll the chunk: the player is always at z = 0, so this chunk sits at `travelled - start`. */
  setScroll(travelled: number): void {
    this.group.position.z = travelled - this.start;
  }
}
