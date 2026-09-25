export interface ZoneDef {
  readonly id: number;
  readonly name: string;
  /** Distance (m) at which the zone begins. */
  readonly startDistance: number;
  readonly sky: number;
  readonly fog: number;
  /** Colours used for roadside buildings. */
  readonly buildings: readonly number[];
}

export const ZONES: readonly ZoneDef[] = [
  {
    id: 1,
    name: 'Township Market',
    startDistance: 0,
    sky: 0x7cc8ff,
    fog: 0xbfe6ff,
    buildings: [0xf2b84b, 0xe4572e, 0x58b09c, 0xf28fad, 0x8fc1e3],
  },
  {
    id: 2,
    name: 'City Streets',
    startDistance: 1000,
    sky: 0x6fb2f2,
    fog: 0xaad0f2,
    buildings: [0x9db4d1, 0xc7d3e3, 0x7a93b8, 0xe3c8a8, 0x5d7aa6],
  },
  {
    id: 3,
    name: 'Train Yard',
    startDistance: 2500,
    sky: 0xf6a96b,
    fog: 0xffd9b0,
    buildings: [0xb56a4c, 0xd48f5a, 0x8c5a44, 0xc9a26b, 0x7d6b5d],
  },
  {
    id: 4,
    name: 'Stadium Approach',
    startDistance: 4500,
    sky: 0x4b5fc4,
    fog: 0x8792dc,
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
