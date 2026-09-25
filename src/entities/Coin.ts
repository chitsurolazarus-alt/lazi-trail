import * as THREE from 'three';
import type { CoinKind } from '../world/ObstacleGenerator';
import { createCoinAssets, type CoinAssets } from './models';

/** A live Rand coin placed in a chunk. Drawn by the `CoinField`, not by its own mesh. */
export interface CoinInstance {
  kind: CoinKind;
  x: number;
  y: number;
  /** Track distance (m). */
  s: number;
  collected: boolean;
}

/** The slice of a chunk the coin field needs. */
export interface CoinSource {
  coins: readonly CoinInstance[];
  start: number;
  scrollZ: number;
}

const CAPACITY = 300;

/**
 * Every coin in the world drawn with two InstancedMeshes (silver and gold): two draw calls
 * however many coins are on screen. Positions are rebuilt each frame from the chunks' coin lists.
 */
export class CoinField {
  readonly object = new THREE.Group();
  private readonly assets: CoinAssets = createCoinAssets();
  private readonly meshes: Record<CoinKind, THREE.InstancedMesh>;
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly position = new THREE.Vector3();
  private readonly one = new THREE.Vector3(1, 1, 1);
  private readonly axis = new THREE.Vector3(0, 1, 0);

  constructor() {
    const make = (kind: CoinKind): THREE.InstancedMesh => {
      const mesh = new THREE.InstancedMesh(
        this.assets.geometry,
        this.assets.materials[kind],
        CAPACITY,
      );
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.object.add(mesh);
      return mesh;
    };
    this.meshes = { silver: make('silver'), gold: make('gold') };
  }

  /** Rebuild instance matrices: `spin` is the current coin rotation about the vertical axis. */
  sync(chunks: readonly CoinSource[], spin: number): void {
    const counts = { silver: 0, gold: 0 };
    this.quaternion.setFromAxisAngle(this.axis, spin);
    for (const chunk of chunks) {
      for (const coin of chunk.coins) {
        if (coin.collected) continue;
        const n = counts[coin.kind];
        if (n >= CAPACITY) continue;
        counts[coin.kind] = n + 1;
        this.position.set(coin.x, coin.y, -(coin.s - chunk.start) + chunk.scrollZ);
        this.matrix.compose(this.position, this.quaternion, this.one);
        this.meshes[coin.kind].setMatrixAt(n, this.matrix);
      }
    }
    for (const kind of ['silver', 'gold'] as const) {
      const mesh = this.meshes[kind];
      mesh.count = counts[kind];
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const mesh of Object.values(this.meshes)) mesh.dispose();
    this.assets.dispose();
    this.object.removeFromParent();
  }
}
