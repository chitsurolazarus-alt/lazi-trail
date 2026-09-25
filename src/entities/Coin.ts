import * as THREE from 'three';
import { ObjectPool } from '../world/ObjectPool';
import type { CoinKind } from '../world/ObstacleGenerator';
import { createCoinAssets, type CoinAssets } from './models';

/** A live Rand coin placed in a chunk. */
export interface CoinInstance {
  kind: CoinKind;
  x: number;
  y: number;
  /** Track distance (m). */
  s: number;
  mesh: THREE.Mesh;
  collected: boolean;
}

const KINDS: readonly CoinKind[] = ['silver', 'gold'];

export class CoinPool {
  private readonly assets: CoinAssets = createCoinAssets();
  private readonly pools = new Map<CoinKind, ObjectPool<THREE.Mesh>>();

  constructor() {
    for (const kind of KINDS) {
      this.pools.set(
        kind,
        new ObjectPool<THREE.Mesh>(
          () => new THREE.Mesh(this.assets.geometry, this.assets.materials[kind]),
          (mesh) => {
            mesh.visible = false;
          },
          32,
        ),
      );
    }
  }

  acquire(kind: CoinKind): THREE.Mesh {
    const mesh = this.pools.get(kind)?.acquire();
    if (!mesh) throw new Error(`No pool for coin kind ${kind}`);
    mesh.visible = true;
    return mesh;
  }

  release(kind: CoinKind, mesh: THREE.Mesh): void {
    mesh.removeFromParent();
    this.pools.get(kind)?.release(mesh);
  }

  dispose(): void {
    for (const pool of this.pools.values()) pool.clear();
    this.assets.dispose();
  }
}
