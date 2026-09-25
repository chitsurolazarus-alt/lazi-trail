import * as THREE from 'three';
import { ZONES, type ZoneDef, type ZoneStyle } from '../config/zones';
import { createRng } from '../core/random';
import type { MaterialLibrary, MaterialKey } from './Materials';
import { Frame, KitBuilders } from './kit/common';
import { buildGround } from './kit/ground';
import { citySide } from './kit/city';
import { stadiumSide } from './kit/stadium';
import { townshipSide } from './kit/township';
import { trainyardSide } from './kit/trainyard';

/** One pre-built 40 m stretch of street (both sides + road): geometry per material. */
export interface StreetVariant {
  geometries: Map<MaterialKey, THREE.BufferGeometry>;
}

type SideBuilder = (f: Frame) => void;

/** Facade generators per zone style. */
const SIDE_BUILDERS: Record<ZoneStyle, SideBuilder> = {
  township: townshipSide,
  city: citySide,
  trainyard: trainyardSide,
  stadium: stadiumSide,
};

const VARIANTS_PER_ZONE = 8;

/**
 * Builds and caches street-front variants. Variants are generated lazily per zone (and can be
 * warmed up in idle time), then shared by every pooled chunk, so recycling a chunk only swaps
 * geometry references: no allocation while running.
 */
export class StreetKit {
  private readonly cache = new Map<number, StreetVariant[]>();

  constructor(private readonly materials: MaterialLibrary) {}

  /** Variants for a zone, building them on first use. */
  variants(zoneIndex: number): StreetVariant[] {
    let list = this.cache.get(zoneIndex);
    if (!list) {
      list = [];
      this.cache.set(zoneIndex, list);
    }
    while (list.length < VARIANTS_PER_ZONE) list.push(this.build(zoneIndex, list.length));
    return list;
  }

  /** Build just one more variant for a zone; returns false once the zone is complete. */
  warmOne(zoneIndex: number): boolean {
    let list = this.cache.get(zoneIndex);
    if (!list) {
      list = [];
      this.cache.set(zoneIndex, list);
    }
    if (list.length >= VARIANTS_PER_ZONE) return false;
    list.push(this.build(zoneIndex, list.length));
    return list.length < VARIANTS_PER_ZONE;
  }

  isReady(zoneIndex: number): boolean {
    return (this.cache.get(zoneIndex)?.length ?? 0) >= VARIANTS_PER_ZONE;
  }

  private build(zoneIndex: number, n: number): StreetVariant {
    const zone = ZONES[zoneIndex] as ZoneDef;
    const rng = createRng(zone.id * 1000 + n * 7919 + 13);
    const k = new KitBuilders();
    buildGround(k, zone.ground, rng, n % 3 === 1);
    for (const side of [-1, 1] as const) {
      SIDE_BUILDERS[zone.style](new Frame(k, side, rng, this.materials.signs));
    }
    const geometries = new Map<MaterialKey, THREE.BufferGeometry>();
    for (const [key, builder] of k.entries()) {
      if (!builder.isEmpty) geometries.set(key, builder.build());
    }
    return { geometries };
  }

  dispose(): void {
    for (const list of this.cache.values()) {
      for (const v of list) for (const g of v.geometries.values()) g.dispose();
    }
    this.cache.clear();
  }
}
