import * as THREE from 'three';
import type { PowerUpId } from '../config/progression';
import { buildPowerUpModel, type PowerUpModel } from './powerupModels';

/** A power-up lying on the track. Drawn by the `PickupField`. */
export interface PickupInstance {
  kind: PowerUpId;
  x: number;
  y: number;
  /** Track distance (m). */
  s: number;
  collected: boolean;
}

/** The slice of a chunk the field needs. */
export interface PickupSource {
  pickups: readonly PickupInstance[];
  start: number;
  scrollZ: number;
}

/** Enough for the few that can be in view at once (they are spaced 170 m apart). */
const POOL = 2;
const KINDS: readonly PowerUpId[] = ['magnet', 'boost', 'spikes', 'doubleScore'];

/**
 * Draws power-ups as small hand-built 3D models that spin and bob above the road, each with a
 * soft halo. A tiny pool of models per kind is reused; only uncollected pickups in view are shown.
 */
export class PickupField {
  readonly object = new THREE.Group();
  private readonly pool = new Map<PowerUpId, PowerUpModel[]>();

  constructor() {
    for (const kind of KINDS) {
      const list: PowerUpModel[] = [];
      for (let i = 0; i < POOL; i++) {
        const model = buildPowerUpModel(kind);
        model.object.visible = false;
        this.object.add(model.object);
        list.push(model);
      }
      this.pool.set(kind, list);
    }
  }

  /** Place a model on every visible pickup; `time` drives the spin and bob. */
  sync(chunks: readonly PickupSource[], time: number): void {
    const used = new Map<PowerUpId, number>();
    for (const chunk of chunks) {
      for (const p of chunk.pickups) {
        if (p.collected) continue;
        const z = -(p.s - chunk.start) + chunk.scrollZ;
        if (z < -190 || z > 12) continue;
        const n = used.get(p.kind) ?? 0;
        const model = this.pool.get(p.kind)?.[n];
        if (!model) continue;
        used.set(p.kind, n + 1);
        model.object.visible = true;
        model.object.position.set(p.x, p.y + Math.sin(time * 2.4 + p.s) * 0.12, z);
        model.spin.rotation.y = time * 1.8 + p.s;
        model.halo.scale.setScalar(1 + Math.sin(time * 3 + p.s) * 0.08);
      }
    }
    for (const kind of KINDS) {
      const list = this.pool.get(kind) ?? [];
      for (let i = used.get(kind) ?? 0; i < list.length; i++) {
        (list[i] as PowerUpModel).object.visible = false;
      }
    }
  }

  dispose(): void {
    for (const list of this.pool.values()) for (const m of list) m.dispose();
    this.pool.clear();
    this.object.removeFromParent();
  }
}
