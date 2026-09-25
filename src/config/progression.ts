/** Every tunable number for XP, rewards, missions, login calendar, boxes and the shop. */

export const NAME_RULES = { min: 3, max: 16 } as const;

/* ------------------------------------------------------------------ XP */

export const XP = {
  maxLevel: 50,
  /** XP needed to go from level n to n+1:  base + linear*(n-1) + quad*(n-1)^2 */
  base: 100,
  linear: 50,
  quad: 10,
  perMetre: 0.1,
  perRand: 0.4,
  /** Bonus for the furthest zone reached in the run (per zone above the first). */
  perZone: 40,
  perAchievement: 60,
  perMission: 80,
  perMissionSet: 150,
} as const;

/** Rewards for reaching a level. Every level pays Rand; some add more. */
export interface Reward {
  rand?: number;
  boxes?: number;
  medals?: number;
  headStart?: number;
  secondChance?: number;
  /** Outfit unlocked (its `unlock` says `level`). */
  outfit?: string;
  badge?: string;
}

export const LEVEL_REWARD_RAND = { base: 100, perLevel: 25 } as const;
export const LEVEL_MILESTONES: Readonly<Record<number, Reward>> = {
  3: { headStart: 1 },
  5: { boxes: 1, badge: 'rookie' },
  8: { outfit: 'lazi_night' },
  10: { boxes: 1, medals: 1, badge: 'street_star' },
  12: { outfit: 'sipho_cup' },
  15: { secondChance: 2, boxes: 1 },
  20: { outfit: 'bongani_captain', medals: 1, badge: 'trail_blazer' },
  25: { boxes: 2 },
  30: { medals: 2, badge: 'legend' },
  40: { boxes: 3 },
  50: { medals: 3, badge: 'icon' },
};

export const BADGES: Readonly<Record<string, { name: string; description: string }>> = {
  rookie: { name: 'Rookie', description: 'Reached level 5' },
  street_star: { name: 'Street Star', description: 'Reached level 10' },
  trail_blazer: { name: 'Trail Blazer', description: 'Reached level 20' },
  legend: { name: 'Legend', description: 'Reached level 30' },
  icon: { name: 'Icon', description: 'Reached level 50' },
};

/* ---------------------------------------------------------- daily login */

/** Index 0 = day 1. Day 7 is the big one. */
export const LOGIN_REWARDS: readonly Reward[] = [
  { rand: 100 },
  { rand: 200 },
  { headStart: 1 },
  { rand: 300 },
  { boxes: 1 },
  { rand: 500 },
  { rand: 1000, boxes: 1, medals: 1 },
];

/* ------------------------------------------------------------- missions */

export const MISSIONS = {
  perDay: 3,
  rerollCost: 150,
  /** Reward when the whole set is done. */
  setRewardRand: 300,
  /** Permanent score multiplier: +this for every set ever completed, up to `bonusCap`. */
  bonusPerSet: 0.05,
  bonusCap: 1,
} as const;

export type MissionStat =
  | 'coins'
  | 'distance'
  | 'jumps'
  | 'slides'
  | 'nearMisses'
  | 'runs'
  | 'outruns'
  | 'bestDistance'
  | 'bestScore'
  | 'bestZone'
  | 'noStumble';

export interface MissionTemplate {
  id: string;
  /** `{n}` is replaced by the target. */
  text: string;
  stat: MissionStat;
  /** `sum` adds up across the day's runs; `max` needs it in a single run. */
  mode: 'sum' | 'max';
  /** Targets for easy / medium / hard tiers. */
  targets: readonly [number, number, number];
  /** Rand reward for easy / medium / hard. */
  rewards: readonly [number, number, number];
}

export const MISSION_TEMPLATES: readonly MissionTemplate[] = [
  {
    id: 'coins',
    text: 'Collect {n} Rand',
    stat: 'coins',
    mode: 'sum',
    targets: [250, 450, 700],
    rewards: [100, 160, 240],
  },
  {
    id: 'distance',
    text: 'Run {n} m in total',
    stat: 'distance',
    mode: 'sum',
    targets: [2000, 3500, 5000],
    rewards: [100, 160, 240],
  },
  {
    id: 'jumps',
    text: 'Jump {n} times',
    stat: 'jumps',
    mode: 'sum',
    targets: [30, 55, 90],
    rewards: [90, 140, 220],
  },
  {
    id: 'slides',
    text: 'Slide {n} times',
    stat: 'slides',
    mode: 'sum',
    targets: [15, 30, 50],
    rewards: [90, 140, 220],
  },
  {
    id: 'nearMisses',
    text: 'Get {n} near misses',
    stat: 'nearMisses',
    mode: 'sum',
    targets: [5, 10, 18],
    rewards: [100, 160, 240],
  },
  {
    id: 'runs',
    text: 'Play {n} runs',
    stat: 'runs',
    mode: 'sum',
    targets: [3, 5, 8],
    rewards: [80, 130, 200],
  },
  {
    id: 'outruns',
    text: 'Shake off the thief {n} times',
    stat: 'outruns',
    mode: 'sum',
    targets: [3, 6, 10],
    rewards: [100, 170, 250],
  },
  {
    id: 'oneRunDistance',
    text: 'Run {n} m in a single run',
    stat: 'bestDistance',
    mode: 'max',
    targets: [800, 1400, 2200],
    rewards: [120, 190, 280],
  },
  {
    id: 'oneRunScore',
    text: 'Score {n} in a single run',
    stat: 'bestScore',
    mode: 'max',
    targets: [2500, 5000, 9000],
    rewards: [120, 190, 280],
  },
  {
    id: 'reachZone',
    text: 'Reach zone {n}',
    stat: 'bestZone',
    mode: 'max',
    targets: [2, 3, 4],
    rewards: [110, 180, 270],
  },
  {
    id: 'noStumble',
    text: 'Run {n} m without stumbling',
    stat: 'noStumble',
    mode: 'max',
    targets: [400, 800, 1400],
    rewards: [120, 190, 280],
  },
];

/** Which difficulty tier of missions a player of this level gets. */
export function missionTier(level: number): 0 | 1 | 2 {
  return level >= 15 ? 2 : level >= 6 ? 1 : 0;
}

/* ---------------------------------------------------------- mystery box */

export const BOX = {
  price: 500,
  /** Outfit pieces needed to unlock an outfit. */
  piecesNeeded: 2,
  /** Relative weights of each reward kind. */
  weights: { rand: 46, upgrade: 14, piece: 14, medal: 6, headStart: 10, secondChance: 10 },
  randMin: 120,
  randMax: 900,
} as const;

/* ------------------------------------------------------------------ shop */

export const ITEMS = {
  headStart: {
    name: 'Head Start',
    price: 300,
    max: 10,
    description: 'Blast off with a 5 second invincible sprint.',
  },
  secondChance: {
    name: 'Second Chance',
    price: 600,
    max: 5,
    description: 'Get back up once after a crash or a catch.',
  },
} as const;
export type ItemId = keyof typeof ITEMS;

export const HEAD_START = { duration: 4.5, speedMul: 1.55 } as const;
export const SECOND_CHANCE = { invincible: 2.5, clearAhead: 30 } as const;

export type PowerUpId = 'magnet' | 'boost' | 'spikes' | 'doubleScore';

export const POWER_UPS: Readonly<
  Record<
    PowerUpId,
    { name: string; description: string; baseSeconds: number; perLevel: number; costBase: number }
  >
> = {
  magnet: {
    name: 'Coin Magnet',
    description: 'Pulls nearby Rand toward you.',
    baseSeconds: 10,
    perLevel: 2,
    costBase: 250,
  },
  boost: {
    name: 'Energy Drink Boost',
    description: 'A burst of speed and invincibility.',
    baseSeconds: 5,
    perLevel: 1,
    costBase: 350,
  },
  spikes: {
    name: 'Super Spikes',
    description: 'Jump much higher.',
    baseSeconds: 10,
    perLevel: 2,
    costBase: 250,
  },
  doubleScore: {
    name: '2x Score',
    description: 'Double the points you earn.',
    baseSeconds: 15,
    perLevel: 3,
    costBase: 300,
  },
};
export const POWER_UP_IDS = Object.keys(POWER_UPS) as PowerUpId[];
export const UPGRADE_MAX = 5;

export function upgradeCost(id: PowerUpId, currentLevel: number): number {
  return POWER_UPS[id].costBase * 2 ** currentLevel;
}

export function powerUpSeconds(id: PowerUpId, level: number, durationMul = 1): number {
  const p = POWER_UPS[id];
  return (p.baseSeconds + p.perLevel * level) * durationMul;
}
