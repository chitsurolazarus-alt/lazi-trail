import * as THREE from 'three';
import { OBSTACLE_DEFS, type ObstacleDef, type ObstacleKind } from '../config/gameConfig';
import { ObjectPool } from '../world/ObjectPool';
import { buildObstacleGeometry, createModelMaterial } from './models';

/** A live obstacle placed in a chunk. */
export interface ObstacleInstance {
  def: ObstacleDef;
  /** Track distance of the near edge (m). */
  s: number;
  /** World x of the obstacle's centre. */
  x: number;
  mesh: THREE.Mesh;
  /** Already resolved (stumbled on); ignored by further collision tests. */
  hit: boolean;
}

const KINDS = Object.keys(OBSTACLE_DEFS) as ObstacleKind[];

/** Pools one mesh set per obstacle kind; geometry and material are shared by every instance. */
export class ObstaclePool {
  private readonly material = createModelMaterial();
  private readonly geometries = new Map<ObstacleKind, THREE.BufferGeometry>();
  private readonly pools = new Map<ObstacleKind, ObjectPool<THREE.Mesh>>();

  constructor() {
    for (const kind of KINDS) {
      const geometry = buildObstacleGeometry(kind);
      this.geometries.set(kind, geometry);
      this.pools.set(
        kind,
        new ObjectPool<THREE.Mesh>(
          () => new THREE.Mesh(geometry, this.material),
          (mesh) => {
            mesh.visible = false;
          },
          4,
        ),
      );
    }
  }

  acquire(kind: ObstacleKind): THREE.Mesh {
    const mesh = this.pools.get(kind)?.acquire();
    if (!mesh) throw new Error(`No pool for obstacle kind ${kind}`);
    mesh.visible = true;
    return mesh;
  }

  release(kind: ObstacleKind, mesh: THREE.Mesh): void {
    mesh.removeFromParent();
    this.pools.get(kind)?.release(mesh);
  }

  dispose(): void {
    for (const pool of this.pools.values()) pool.clear();
    for (const geometry of this.geometries.values()) geometry.dispose();
    this.material.dispose();
  }
}
