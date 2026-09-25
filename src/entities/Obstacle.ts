import * as THREE from 'three';
import { OBSTACLE_DEFS, type ObstacleDef, type ObstacleKind } from '../config/gameConfig';
import { ObjectPool } from '../world/ObjectPool';
import { buildObstacleGeometry, createModelMaterial } from './models';

/** A live obstacle placed in a chunk. */
export interface ObstacleInstance {
  def: ObstacleDef;
  /** Track distance of the body's near edge (m). Changes every frame for moving vehicles. */
  s: number;
  /** Where the row is: for moving vehicles, the point where they meet the player. */
  anchorS: number;
  /** World x of the obstacle's centre. */
  x: number;
  mesh: THREE.Object3D;
  /** Already resolved (stumbled on); ignored by further collision tests. */
  hit: boolean;
}

/** Supplies the visual for each obstacle kind (primitive shapes on Low, detailed models above). */
export interface ObstacleModels {
  /** A fresh, poolable object for `kind`. Geometry/materials should be shared, not cloned. */
  create(kind: ObstacleKind): THREE.Object3D;
  dispose(): void;
}

/** Phase 1 look: one vertex-coloured mesh per kind. Also the Low-quality fallback. */
export class PrimitiveObstacleModels implements ObstacleModels {
  private readonly material = createModelMaterial();
  private readonly geometries = new Map<ObstacleKind, THREE.BufferGeometry>();

  create(kind: ObstacleKind): THREE.Object3D {
    let geometry = this.geometries.get(kind);
    if (!geometry) {
      geometry = buildObstacleGeometry(kind);
      this.geometries.set(kind, geometry);
    }
    return new THREE.Mesh(geometry, this.material);
  }

  dispose(): void {
    for (const g of this.geometries.values()) g.dispose();
    this.geometries.clear();
    this.material.dispose();
  }
}

const KINDS = Object.keys(OBSTACLE_DEFS) as ObstacleKind[];

/** Pools objects per obstacle kind, so obstacles are never allocated during a run. */
export class ObstaclePool {
  private readonly pools = new Map<ObstacleKind, ObjectPool<THREE.Object3D>>();

  constructor(
    private readonly models: ObstacleModels,
    castShadows = false,
  ) {
    for (const kind of KINDS) {
      this.pools.set(
        kind,
        new ObjectPool<THREE.Object3D>(
          () => {
            const object = models.create(kind);
            if (castShadows) object.traverse((o) => (o.castShadow = true));
            return object;
          },
          (o) => {
            o.visible = false;
          },
          3,
        ),
      );
    }
  }

  acquire(kind: ObstacleKind): THREE.Object3D {
    const object = this.pools.get(kind)?.acquire();
    if (!object) throw new Error(`No pool for obstacle kind ${kind}`);
    object.visible = true;
    return object;
  }

  release(kind: ObstacleKind, object: THREE.Object3D): void {
    object.removeFromParent();
    this.pools.get(kind)?.release(object);
  }

  dispose(): void {
    for (const pool of this.pools.values()) pool.clear();
    this.models.dispose();
  }
}
