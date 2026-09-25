import * as THREE from 'three';
import { CONFIG, OBSTACLE_DEFS, laneToX } from '../config/gameConfig';
import { randRange, pickOne, type Rng } from '../core/random';
import type { CoinInstance, CoinPool } from '../entities/Coin';
import type { ObstacleInstance, ObstaclePool } from '../entities/Obstacle';
import type { GeneratedSection } from './ObstacleGenerator';

const W = CONFIG.world;

/** Geometry/materials shared by every chunk. Owned (and disposed) by ChunkManager. */
export interface ChunkAssets {
  road: THREE.Mesh;
  sidewalkGeometry: THREE.BufferGeometry;
  sidewalkMaterial: THREE.Material;
  buildingGeometry: THREE.BufferGeometry;
  buildingMaterial: (color: number) => THREE.Material;
}

/**
 * One 40 m slice of track: road, sidewalks, roadside buildings, plus the obstacles and coins
 * generated for it. Chunks are pooled: `populate` re-dresses a recycled chunk in place.
 *
 * Local space: the chunk's near edge is at z = 0 and it extends toward -Z.
 */
export class Chunk {
  readonly group = new THREE.Group();
  /** Track distance at which this chunk begins. */
  start = 0;
  obstacles: ObstacleInstance[] = [];
  coins: CoinInstance[] = [];

  private readonly buildings: THREE.Mesh[] = [];

  constructor(private readonly assets: ChunkAssets) {
    const road = new THREE.Mesh(assets.road.geometry, assets.road.material);
    this.group.add(road);

    const sidewalkX = W.roadHalfWidth + W.sidewalkWidth / 2;
    for (const side of [-1, 1]) {
      const walk = new THREE.Mesh(assets.sidewalkGeometry, assets.sidewalkMaterial);
      walk.position.x = side * sidewalkX;
      this.group.add(walk);
    }

    for (let i = 0; i < W.buildingsPerSide * 2; i++) {
      const building = new THREE.Mesh(assets.buildingGeometry, assets.buildingMaterial(0xffffff));
      this.buildings.push(building);
      this.group.add(building);
    }
  }

  populate(
    start: number,
    section: GeneratedSection,
    obstaclePool: ObstaclePool,
    coinPool: CoinPool,
    rng: Rng,
    palette: readonly number[],
  ): void {
    this.start = start;
    this.dressBuildings(rng, palette);

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

  private dressBuildings(rng: Rng, palette: readonly number[]): void {
    const perSide = W.buildingsPerSide;
    const slot = W.chunkLength / perSide;
    for (let i = 0; i < this.buildings.length; i++) {
      const building = this.buildings[i] as THREE.Mesh;
      const side = i < perSide ? -1 : 1;
      const index = i % perSide;
      const width = randRange(rng, 4, 6.5);
      const height = randRange(rng, 5, 14);
      const depth = slot - randRange(rng, 0.4, 1.2);
      building.material = this.assets.buildingMaterial(pickOne(rng, palette));
      building.scale.set(width, height, depth);
      building.position.set(
        side * (W.roadHalfWidth + W.sidewalkWidth + width / 2 + 0.2),
        0,
        -(index * slot + slot / 2),
      );
    }
  }
}
