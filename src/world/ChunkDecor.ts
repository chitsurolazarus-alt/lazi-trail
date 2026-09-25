import * as THREE from 'three';
import type { Rng } from '../core/random';
import type { MaterialKey, MaterialLibrary } from './Materials';
import type { StreetKit, StreetVariant } from './StreetKit';

/** The scenery of one chunk (road, pavements, street fronts). Pooled with its chunk. */
export interface ChunkDecor {
  readonly object: THREE.Object3D;
  /** Re-dress this (recycled) chunk for the given zone. Must not allocate. */
  dress(zoneIndex: number, rng: Rng): void;
  dispose(): void;
}

export interface DecorFactory {
  create(): ChunkDecor;
  /** Make sure scenery for `zoneIndex` is ready (may build synchronously). */
  prepare(zoneIndex: number): void;
  /** Build a bit more scenery in idle time. Returns true while there is more to do. */
  warm(zoneIndex: number): boolean;
  dispose(): void;
}

const SLOT_KEYS: readonly MaterialKey[] = [
  'road',
  'pavement',
  'gravel',
  'concrete',
  'brick',
  'plaster',
  'corrugated',
  'rust',
  'metal',
  'wood',
  'boxmetal',
  'markings',
  'matte',
  'paint',
  'glass',
  'glassLit',
  'sign',
  'cloth',
  'foliage',
  'lamp',
];

/** One mesh slot per material; dressing swaps in the variant's geometry for each. */
class RealisticDecor implements ChunkDecor {
  readonly object = new THREE.Group();
  private readonly slots = new Map<MaterialKey, THREE.Mesh>();
  private lastVariant = -1;

  constructor(
    private readonly kit: StreetKit,
    materials: MaterialLibrary,
    castShadows: boolean,
    receiveShadows: boolean,
  ) {
    for (const key of SLOT_KEYS) {
      const mesh = new THREE.Mesh(undefined, materials.get(key));
      mesh.visible = false;
      mesh.frustumCulled = true;
      mesh.castShadow =
        castShadows &&
        key !== 'road' &&
        key !== 'pavement' &&
        key !== 'gravel' &&
        key !== 'markings';
      mesh.receiveShadow = receiveShadows;
      this.slots.set(key, mesh);
      this.object.add(mesh);
    }
  }

  dress(zoneIndex: number, rng: Rng): void {
    const variants = this.kit.variants(zoneIndex);
    // Avoid showing the same variant twice in a row.
    let index = Math.floor(rng() * variants.length);
    if (index === this.lastVariant) index = (index + 1) % variants.length;
    this.lastVariant = index;
    const variant = variants[index] as StreetVariant;
    for (const [key, mesh] of this.slots) {
      const geometry = variant.geometries.get(key);
      if (geometry) {
        mesh.geometry = geometry;
        mesh.visible = true;
      } else {
        mesh.visible = false;
      }
    }
  }

  dispose(): void {
    // Geometry and materials are shared and owned by the kit / library.
    this.object.removeFromParent();
  }
}

export class RealisticDecorFactory implements DecorFactory {
  constructor(
    private readonly kit: StreetKit,
    private readonly materials: MaterialLibrary,
    private readonly shadows: boolean,
  ) {}

  create(): ChunkDecor {
    return new RealisticDecor(this.kit, this.materials, this.shadows, this.shadows);
  }

  prepare(zoneIndex: number): void {
    this.kit.variants(zoneIndex);
  }

  warm(zoneIndex: number): boolean {
    return this.kit.warmOne(zoneIndex);
  }

  dispose(): void {
    this.kit.dispose();
  }
}
