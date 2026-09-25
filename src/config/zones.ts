import type { HdriKey } from '../core/AssetLoader';

export type GroundStyle = 'asphalt' | 'rails' | 'plaza';
export type ZoneStyle = 'township' | 'city' | 'trainyard' | 'stadium';

export interface ZoneDef {
  readonly id: number;
  readonly name: string;
  /** Distance (m) at which the zone begins. */
  readonly startDistance: number;
  readonly style: ZoneStyle;
  readonly ground: GroundStyle;

  /* ---- Atmosphere (blended between zones) ---- */
  /** Flat sky colour used on Low quality and as the HDRI's tint fallback. */
  readonly sky: number;
  readonly fog: number;
  readonly fogNear: number;
  readonly fogFar: number;
  readonly hdri: HdriKey;
  readonly sunColor: number;
  readonly sunIntensity: number;
  /** Sun position relative to the player (light shines toward the origin). */
  readonly sunPosition: readonly [number, number, number];
  /** Image-based light strength. */
  readonly envIntensity: number;
  readonly exposure: number;
  /** 0 = broad daylight, 1 = floodlit night: drives lamps and lit windows. */
  readonly night: number;
  /** Bloom strength (post-processing). */
  readonly bloom: number;

  /** Colours used for roadside buildings (primitive fallback + kit tints). */
  readonly buildings: readonly number[];
}

export const ZONES: readonly ZoneDef[] = [
  {
    id: 1,
    name: 'Township Market',
    startDistance: 0,
    style: 'township',
    ground: 'asphalt',
    sky: 0x7cc8ff,
    fog: 0xd7e6f0,
    fogNear: 40,
    fogFar: 175,
    hdri: 'morning',
    sunColor: 0xffe3bd,
    sunIntensity: 2.6,
    sunPosition: [-9, 13, 9],
    envIntensity: 0.9,
    exposure: 0.95,
    night: 0,
    bloom: 0.22,
    buildings: [0xf2b84b, 0xe4572e, 0x58b09c, 0xf28fad, 0x8fc1e3],
  },
  {
    id: 2,
    name: 'City Streets',
    startDistance: 1000,
    style: 'city',
    ground: 'asphalt',
    sky: 0x6fb2f2,
    fog: 0xc3d8ec,
    fogNear: 45,
    fogFar: 185,
    hdri: 'midday',
    sunColor: 0xfff5e6,
    sunIntensity: 2.9,
    sunPosition: [-6, 16, 8],
    envIntensity: 1.0,
    exposure: 0.95,
    night: 0,
    bloom: 0.2,
    buildings: [0x9db4d1, 0xc7d3e3, 0x7a93b8, 0xe3c8a8, 0x5d7aa6],
  },
  {
    id: 3,
    name: 'Train Yard',
    startDistance: 2500,
    style: 'trainyard',
    ground: 'rails',
    sky: 0xf6a96b,
    fog: 0xf1cfae,
    fogNear: 40,
    fogFar: 190,
    hdri: 'golden',
    sunColor: 0xffb56b,
    sunIntensity: 2.8,
    sunPosition: [-13, 8, 9],
    envIntensity: 0.95,
    exposure: 1.0,
    night: 0.1,
    bloom: 0.3,
    buildings: [0xb56a4c, 0xd48f5a, 0x8c5a44, 0xc9a26b, 0x7d6b5d],
  },
  {
    id: 4,
    name: 'Stadium Approach',
    startDistance: 4500,
    style: 'stadium',
    ground: 'plaza',
    sky: 0x4b5fc4,
    fog: 0x7a86c8,
    fogNear: 35,
    fogFar: 200,
    hdri: 'evening',
    sunColor: 0xff9c73,
    sunIntensity: 1.6,
    sunPosition: [-12, 6, 10],
    envIntensity: 0.85,
    exposure: 1.1,
    night: 0.85,
    bloom: 0.55,
    buildings: [0x3a3f8f, 0x5560b8, 0xff7a1a, 0x2b3576, 0x7b86d6],
  },
];

/** Index into ZONES for a given distance travelled. */
export function zoneIndexAt(distance: number): number {
  let index = 0;
  for (let i = 0; i < ZONES.length; i++) {
    const zone = ZONES[i];
    if (zone && distance >= zone.startDistance) index = i;
  }
  return index;
}

/** The environment starts easing into the next zone this far before the boundary... */
export const BLEND_BEFORE = 160;
/** ...and finishes this far after it. */
export const BLEND_AFTER = 40;

export interface ZoneBlend {
  from: number;
  to: number;
  /** 0 = fully `from`, 1 = fully `to` (already eased). */
  t: number;
}

/**
 * Which two zones the sky/fog/lighting are mixing at a given distance, and by how much.
 * The blend is centred just before the boundary so the new look arrives together with the new
 * street style that is being generated ahead of the player.
 */
export function zoneBlendAt(distance: number): ZoneBlend {
  for (let i = 1; i < ZONES.length; i++) {
    const boundary = (ZONES[i] as ZoneDef).startDistance;
    const start = boundary - BLEND_BEFORE;
    const end = boundary + BLEND_AFTER;
    if (distance < start) return { from: i - 1, to: i - 1, t: 0 };
    if (distance < end) {
      const u = (distance - start) / (end - start);
      return { from: i - 1, to: i, t: u * u * (3 - 2 * u) };
    }
  }
  const last = ZONES.length - 1;
  return { from: last, to: last, t: 0 };
}
