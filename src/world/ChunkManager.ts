import * as THREE from 'three';
import { CONFIG } from '../config/gameConfig';
import { zoneIndexAt } from '../config/zones';
import { createRng } from '../core/random';
import { CoinPool } from '../entities/Coin';
import { ObstaclePool, type ObstacleModels } from '../entities/Obstacle';
import { Chunk } from './Chunk';
import type { DecorFactory } from './ChunkDecor';
import { surfaceHeight } from '../systems/ObstacleMotion';
import { ObstacleGenerator, type GeneratorParams } from './ObstacleGenerator';

const W = CONFIG.world;
const L = W.chunkLength;

/**
 * Keeps an endless stretch of chunks around the player: spawns ahead, recycles behind.
 * Chunks (and everything on them) are pooled, so steady-state running allocates nothing.
 */
export class ChunkManager {
  private active: Chunk[] = [];
  private spare: Chunk[] = [];
  private nextStart = -L;
  private generator: ObstacleGenerator;
  private rng = createRng(1);

  private readonly obstaclePool: ObstaclePool;
  private readonly coinPool = new CoinPool();

  constructor(
    private readonly parent: THREE.Object3D,
    private readonly decor: DecorFactory,
    obstacleModels: ObstacleModels,
    castShadows = false,
  ) {
    this.obstaclePool = new ObstaclePool(obstacleModels, castShadows);
    this.generator = new ObstacleGenerator(this.rng);
  }

  get chunks(): readonly Chunk[] {
    return this.active;
  }

  /** Start a fresh track. */
  reset(seed: number): void {
    for (const chunk of this.active) this.recycle(chunk);
    this.active.length = 0;
    this.nextStart = -L;
    this.rng = createRng(seed);
    this.generator = new ObstacleGenerator(this.rng);
  }

  update(travelled: number, params: Omit<GeneratorParams, 'zone'>): void {
    // Recycle chunks that have fully passed behind the player.
    while (this.active.length > 0) {
      const first = this.active[0] as Chunk;
      if (travelled - first.start <= W.recycleDistance) break;
      this.active.shift();
      this.recycle(first);
    }

    // Generate ahead.
    while (this.nextStart < travelled + W.lookahead) {
      const zone = zoneIndexAt(this.nextStart + L / 2);
      this.decor.prepare(zone);
      const chunk = this.spare.pop() ?? new Chunk(this.decor.create());
      const section = this.generator.generate(this.nextStart + L, { ...params, zone });
      chunk.populate(this.nextStart, zone, section, this.obstaclePool, this.coinPool, this.rng);
      this.parent.add(chunk.group);
      this.active.push(chunk);
      this.nextStart += L;
    }

    for (const chunk of this.active) {
      chunk.updateMoving(travelled);
      chunk.setScroll(travelled);
    }
  }

  /** Height of the walkable surface (road, ramp or roof) at lateral `x`, track position `s`. */
  groundAt(x: number, s: number): number {
    let h = 0;
    for (const chunk of this.active) {
      for (const o of chunk.ramps) {
        const v = surfaceHeight(o, x, s);
        if (v > h) h = v;
      }
    }
    return h;
  }

  /** Spin coins. Cheap: only touches coins still in play. */
  animateCoins(angle: number): void {
    for (const chunk of this.active) {
      for (const coin of chunk.coins) if (!coin.collected) coin.mesh.rotation.y = angle;
    }
  }

  private recycle(chunk: Chunk): void {
    chunk.clear(this.obstaclePool, this.coinPool);
    chunk.group.removeFromParent();
    this.spare.push(chunk);
  }

  dispose(): void {
    for (const chunk of this.active) chunk.clear(this.obstaclePool, this.coinPool);
    for (const chunk of [...this.active, ...this.spare]) {
      chunk.group.removeFromParent();
      chunk.decor.dispose();
    }
    this.active.length = 0;
    this.spare.length = 0;
    this.obstaclePool.dispose();
    this.coinPool.dispose();
    this.decor.dispose();
  }
}
