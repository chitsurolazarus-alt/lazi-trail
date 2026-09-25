import type { ModelKey } from '../core/AssetLoader';

/** Gameplay tweaks a character brings to a run. 1 = no change. All numbers are tunable here. */
export interface Perks {
  /** Multiplies how fast Lazi slides between lanes. */
  laneSpeedMul: number;
  /** Multiplies Coin Magnet duration (applied when power-ups land in Phase 5). */
  magnetDurationMul: number;
  /** Multiplies jump height. */
  jumpHeightMul: number;
  /** Multiplies the time it takes to recover full speed after a stumble (smaller = faster). */
  stumbleRecoverMul: number;
  /** Starts every run with a shield that absorbs one hit. */
  startShield: boolean;
  /** Multiplies how far behind the thief and his dog start (and hold back to). */
  chaseGapMul: number;
}

export const NO_PERKS: Readonly<Perks> = {
  laneSpeedMul: 1,
  magnetDurationMul: 1,
  jumpHeightMul: 1,
  stumbleRecoverMul: 1,
  startShield: false,
  chaseGapMul: 1,
};

export type CharacterId = 'lazi' | 'thandi' | 'sipho' | 'naledi' | 'kagiso' | 'bongani' | 'zola';

/** How a character becomes playable. */
export type CharacterUnlock =
  | { kind: 'free' }
  | { kind: 'rand'; cost: number }
  /** Reach this zone (1-based) in any run. */
  | { kind: 'zone'; zone: number }
  /** Complete the full daily mission set on this many days in a row. */
  | { kind: 'missionStreak'; days: number }
  | { kind: 'achievements'; count: number }
  | { kind: 'medals'; count: number };

/** How an outfit becomes wearable. */
export type OutfitUnlock =
  | { kind: 'default' }
  | { kind: 'rand'; cost: number }
  /** Rare: only by earning this achievement. */
  | { kind: 'achievement'; id: string }
  /** Reward for reaching this player level. */
  | { kind: 'level'; level: number };

/** Material-name -> colour overrides for a rigged model (see `Character`). */
export type Recolor = Readonly<Record<string, number>>;

export interface OutfitDef {
  id: string;
  name: string;
  unlock: OutfitUnlock;
  /** Overrides on top of the character's base look. */
  colors: Recolor;
}

export interface CharacterDef {
  id: CharacterId;
  name: string;
  /** Short role line, e.g. "Netball star". */
  title: string;
  bio: string;
  unlock: CharacterUnlock;
  /** Hidden name and silhouette until unlocked. */
  secret?: boolean;
  perkLabel: string;
  perkText: string;
  perks: Partial<Perks>;
  model: ModelKey;
  /** Meshes to hide (hard hats, farm hats). */
  hideMeshes?: readonly string[];
  /** Base colours (skin, hair, kit) shared by all this character's outfits. */
  base: Recolor;
  /** First outfit is the free default. */
  outfits: readonly OutfitDef[];
}

const HAIR = 0x0c0806;

export const CHARACTERS: readonly CharacterDef[] = [
  {
    id: 'lazi',
    name: 'Lazi',
    title: 'Sprinter',
    bio: 'A township sprinter carrying her medal and her kit bag to the stadium. Nothing stops Lazi except a thief who wants that bag.',
    unlock: { kind: 'free' },
    perkLabel: 'All-rounder',
    perkText: 'No perk. Pure running.',
    perks: {},
    model: 'lazi',
    base: {
      Skin: 0x6b4126,
      Skin_Darker: 0x5a3520,
      Hair: HAIR,
      Eyebrows: HAIR,
      White: 0xc9c5ba,
    },
    outfits: [
      {
        id: 'lazi_trail',
        name: 'Trail Runner',
        unlock: { kind: 'default' },
        colors: { LightBrown: 0xff7a1a, LightBlue: 0x0b2a5b, Red_Dark: 0xff7a1a },
      },
      {
        id: 'lazi_township',
        name: 'Township Tee',
        unlock: { kind: 'rand', cost: 800 },
        colors: { LightBrown: 0xf3efe6, LightBlue: 0xff7a1a, Red_Dark: 0x0b2a5b },
      },
      {
        id: 'lazi_night',
        name: 'Stadium Night',
        unlock: { kind: 'level', level: 8 },
        colors: { LightBrown: 0x1d4fa0, LightBlue: 0x101a2e, Red_Dark: 0xffd23f },
      },
      {
        id: 'lazi_gold',
        name: 'Golden Sprinter',
        unlock: { kind: 'achievement', id: 'stadium' },
        colors: { LightBrown: 0xffc83d, LightBlue: 0x0b2a5b, Red_Dark: 0xffffff },
      },
    ],
  },
  {
    id: 'thandi',
    name: 'Thandi',
    title: 'Netball star',
    bio: 'Goal attack for her school side and the quickest feet on the court. Thandi can change direction before the thief has finished turning.',
    unlock: { kind: 'rand', cost: 2500 },
    perkLabel: 'Quick feet',
    perkText: 'Switches lanes 30% faster.',
    perks: { laneSpeedMul: 1.3 },
    model: 'char_woman2',
    base: { Skin: 0x8a5a3c, Hair_Blond: HAIR, Hair_Brown: HAIR, Grey: 0xf2f2f2 },
    outfits: [
      {
        id: 'thandi_court',
        name: 'Court Kit',
        unlock: { kind: 'default' },
        colors: { White: 0xff7a1a, Orange: 0x0b2a5b },
      },
      {
        id: 'thandi_green',
        name: 'Away Colours',
        unlock: { kind: 'rand', cost: 1200 },
        colors: { White: 0x1e8a4c, Orange: 0xf2f2f2 },
      },
      {
        id: 'thandi_gold',
        name: 'Golden Bib',
        unlock: { kind: 'achievement', id: 'rand_run_1000' },
        colors: { White: 0xffc83d, Orange: 0x6b1f9a },
      },
    ],
  },
  {
    id: 'sipho',
    name: 'Sipho',
    title: 'Footballer',
    bio: 'Midfielder who never stops running. Sipho has a knack for pulling every coin on the street toward him.',
    unlock: { kind: 'zone', zone: 3 },
    perkLabel: 'Magnet master',
    perkText: 'Coin Magnet lasts 50% longer.',
    perks: { magnetDurationMul: 1.5 },
    model: 'ped_worker',
    hideMeshes: ['Worker_Head_1'],
    base: { Skin: 0x4a2c1a, Moustache: HAIR, Eyebrows: HAIR, Black: 0x111111 },
    outfits: [
      {
        id: 'sipho_home',
        name: 'Home Strip',
        unlock: { kind: 'default' },
        colors: {
          Worker_Yellow: 0xffd21f,
          Worker_Vest: 0x0e7a3d,
          LightBrown: 0xffd21f,
          Brown2: 0x0e7a3d,
          Brown: 0x0e7a3d,
        },
      },
      {
        id: 'sipho_away',
        name: 'Away Strip',
        unlock: { kind: 'rand', cost: 1500 },
        colors: {
          Worker_Yellow: 0x1d4fa0,
          Worker_Vest: 0xf3efe6,
          LightBrown: 0x1d4fa0,
          Brown2: 0xf3efe6,
          Brown: 0xf3efe6,
        },
      },
      {
        id: 'sipho_cup',
        name: 'Cup Final Kit',
        unlock: { kind: 'level', level: 12 },
        colors: {
          Worker_Yellow: 0xd9252a,
          Worker_Vest: 0x111111,
          LightBrown: 0xd9252a,
          Brown2: 0x111111,
          Brown: 0x111111,
        },
      },
    ],
  },
  {
    id: 'naledi',
    name: 'Naledi',
    title: 'Long jumper',
    bio: 'Hits the sand further than anyone in the district. Naledi takes obstacles in a single soaring leap.',
    unlock: { kind: 'missionStreak', days: 10 },
    perkLabel: 'Big air',
    perkText: 'Jumps 20% higher.',
    perks: { jumpHeightMul: 1.2 },
    model: 'char_adventurer',
    base: { Skin: 0x7a4a2e, Hair_Brown: HAIR },
    outfits: [
      {
        id: 'naledi_pit',
        name: 'Sand Pit Kit',
        unlock: { kind: 'default' },
        colors: { LightGreen: 0xffffff, Green: 0xff7a1a, Brown2: 0x0b2a5b, Brown_02: 0x0b2a5b },
      },
      {
        id: 'naledi_meet',
        name: 'Meet Day',
        unlock: { kind: 'rand', cost: 2000 },
        colors: { LightGreen: 0x1d4fa0, Green: 0xffd23f, Brown2: 0x111a2e, Brown_02: 0x111a2e },
      },
      {
        id: 'naledi_star',
        name: 'Star Jumper',
        unlock: { kind: 'achievement', id: 'jumps_500' },
        colors: { LightGreen: 0xffc83d, Green: 0xffffff, Brown2: 0x6b1f9a, Brown_02: 0x6b1f9a },
      },
    ],
  },
  {
    id: 'kagiso',
    name: 'Kagiso',
    title: 'Marathon runner',
    bio: 'Forty-two kilometres before breakfast. Kagiso keeps his rhythm through anything and is back at full pace in no time.',
    unlock: { kind: 'rand', cost: 15000 },
    perkLabel: 'Iron legs',
    perkText: 'Recovers from a stumble 40% faster.',
    perks: { stumbleRecoverMul: 0.6 },
    model: 'ped_business',
    base: { Skin: 0x5a3520, Hair: HAIR, Black: 0xf3efe6 },
    outfits: [
      {
        id: 'kagiso_road',
        name: 'Road Racer',
        unlock: { kind: 'default' },
        colors: { Suit: 0x0b2a5b, White: 0xff7a1a, Tie: 0xffffff },
      },
      {
        id: 'kagiso_night',
        name: 'Night Run',
        unlock: { kind: 'rand', cost: 3000 },
        colors: { Suit: 0x1a1a24, White: 0x9bff3d, Tie: 0xffffff },
      },
      {
        id: 'kagiso_finisher',
        name: 'Finisher',
        unlock: { kind: 'achievement', id: 'no_stumble_2k' },
        colors: { Suit: 0xffc83d, White: 0x0b2a5b, Tie: 0xff7a1a },
      },
    ],
  },
  {
    id: 'bongani',
    name: 'Bongani',
    title: 'Rugby player',
    bio: 'Number eight with shoulders like a door. Bongani starts every run with a shield and shrugs off the first hit.',
    unlock: { kind: 'achievements', count: 25 },
    perkLabel: 'Shoulder charge',
    perkText: 'Starts each run with a shield that absorbs one hit.',
    perks: { startShield: true },
    model: 'ped_farmer',
    hideMeshes: ['Farmer_Head_2'],
    base: { Skin: 0x3e2415, Eyebrows: HAIR, Red: HAIR },
    outfits: [
      {
        id: 'bongani_club',
        name: 'Club Jersey',
        unlock: { kind: 'default' },
        colors: { Brown: 0x7a1530, LightBlue: 0xf0f0f0, Beige: 0x7a1530, Brown2: 0x111111 },
      },
      {
        id: 'bongani_away',
        name: 'Away Jersey',
        unlock: { kind: 'rand', cost: 3500 },
        colors: { Brown: 0x1e8a4c, LightBlue: 0x111111, Beige: 0x1e8a4c, Brown2: 0xf0f0f0 },
      },
      {
        id: 'bongani_captain',
        name: "Captain's Kit",
        unlock: { kind: 'level', level: 20 },
        colors: { Brown: 0xffc83d, LightBlue: 0x0b2a5b, Beige: 0xffc83d, Brown2: 0x111111 },
      },
    ],
  },
  {
    id: 'zola',
    name: 'Zola',
    title: 'Street legend',
    bio: 'Nobody knows where Zola trains, or who taught her. Rumour says the thief once chased her for a whole day and never got closer than a block.',
    unlock: { kind: 'medals', count: 10 },
    secret: true,
    perkLabel: 'Ghost',
    perkText: 'The thief and his dog start much further back.',
    perks: { chaseGapMul: 1.5 },
    model: 'char_punk',
    base: { Skin: 0x9a6b48, Hair_Brown: HAIR, Grey: 0x2a2a34 },
    outfits: [
      {
        id: 'zola_teal',
        name: 'Teal Streak',
        unlock: { kind: 'default' },
        colors: { Pink: 0x18c7b0, Black: 0x1a1a24 },
      },
      {
        id: 'zola_ember',
        name: 'Ember',
        unlock: { kind: 'rand', cost: 4000 },
        colors: { Pink: 0xff7a1a, Black: 0x0b2a5b },
      },
      {
        id: 'zola_gold',
        name: 'Gilded',
        unlock: { kind: 'achievement', id: 'medal_10' },
        colors: { Pink: 0xffc83d, Black: 0x111111 },
      },
    ],
  },
];

export const DEFAULT_CHARACTER: CharacterId = 'lazi';

export function getCharacter(id: string): CharacterDef {
  return CHARACTERS.find((c) => c.id === id) ?? (CHARACTERS[0] as CharacterDef);
}

export function isCharacterId(id: unknown): id is CharacterId {
  return CHARACTERS.some((c) => c.id === id);
}

export const ALL_OUTFITS: readonly (OutfitDef & { character: CharacterId })[] = CHARACTERS.flatMap(
  (c) => c.outfits.map((o) => ({ ...o, character: c.id })),
);

export function getOutfit(id: string): (OutfitDef & { character: CharacterId }) | undefined {
  return ALL_OUTFITS.find((o) => o.id === id);
}

export function defaultOutfitId(character: CharacterId): string {
  return getCharacter(character).outfits[0]?.id ?? '';
}

/** The perks a character has, with every missing field filled in. */
export function perksFor(character: CharacterId): Perks {
  return { ...NO_PERKS, ...getCharacter(character).perks };
}

/** Base look + outfit colours for a character wearing an outfit. */
export function recolorFor(character: CharacterId, outfitId: string): Recolor {
  const def = getCharacter(character);
  const outfit = def.outfits.find((o) => o.id === outfitId) ?? def.outfits[0];
  return { ...def.base, ...outfit?.colors };
}
