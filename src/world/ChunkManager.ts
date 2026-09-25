import * as THREE from 'three';
import { CONFIG } from '../config/gameConfig';
import { ZONES, zoneIndexAt } from '../config/zones';
import { createRng } from '../core/random';
import { CoinField } from '../entities/Coin';
import { PickupField } from '../entities/Pickup';
import { ObstaclePool, type ObstacleModels } from '../entities/Obstacle';
import { Chunk } from './Chunk';
import type { DecorFactory } from './ChunkDecor';
import { surfaceHeight } from '../systems/ObstacleMotion';
import { ObstacleGenerator, type GeneratorParams } from './ObstacleGenerator';
import type { PropField } from './PropField';

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
  /** All coins in the world, drawn with two instanced meshes. */
  readonly coinField = new CoinField();
  /** Power-up pickups (a few small models). */
  readonly pickupField = new PickupField();

  constructor(
    private readonly parent: THREE.Object3D,
    private readonly decor: DecorFactory,
    obstacleModels: ObstacleModels,
    castShadows = false,
    private readonly props: PropField | null = null,
  ) {
    this.obstaclePool = new ObstaclePool(obstacleModels, castShadows);
    this.generator = new ObstacleGenerator(this.rng);
    parent.add(this.coinField.object, this.pickupField.object);
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
      chunk.populate(this.nextStart, zone, section, this.obstaclePool, this.rng);
      if (this.props) {
        const style = (ZONES[zone] ?? ZONES[0])?.style ?? 'township';
        chunk.propCount = this.props.fill(chunk.props, style, this.rng);
      }
      this.parent.add(chunk.group);
      this.active.push(chunk);
      this.nextStart += L;
    }

    for (const chunk of this.active) {
      chunk.updateMoving(travelled);
      chunk.setScroll(travelled);
    }
    this.props?.sync(this.active);
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

  /** Redraw every coin, spinning by `angle`. Two instanced draw calls in total. */
  animateCoins(angle: number): void {
    this.coinField.sync(this.active, angle);
    this.pickupField.sync(this.active, angle / 4);
  }

  private recycle(chunk: Chunk): void {
    chunk.clear(this.obstaclePool);
    chunk.group.removeFromParent();
    this.spare.push(chunk);
  }

  dispose(): void {
    for (const chunk of this.active) chunk.clear(this.obstaclePool);
    for (const chunk of [...this.active, ...this.spare]) {
      chunk.group.removeFromParent();
      chunk.decor.dispose();
    }
    this.active.length = 0;
    this.spare.length = 0;
    this.obstaclePool.dispose();
    this.coinField.dispose();
    this.pickupField.dispose();
    this.decor.dispose();
  }
}
