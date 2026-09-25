import { LEVEL_MILESTONES, LEVEL_REWARD_RAND, XP, type Reward } from '../config/progression';

/** XP needed to go from `level` to `level + 1`. */
export function xpToNext(level: number): number {
  const n = Math.max(0, level - 1);
  return XP.base + XP.linear * n + XP.quad * n * n;
}

/** Total XP needed to *reach* `level` (level 1 = 0). */
export function xpForLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += xpToNext(l);
  return total;
}

export interface LevelInfo {
  level: number;
  /** XP earned inside the current level. */
  into: number;
  /** XP the current level needs in total (0 at max level). */
  need: number;
  /** 0..1 progress through the level (1 at max level). */
  progress: number;
  maxed: boolean;
}

export function levelFromXp(xp: number): LevelInfo {
  let level = 1;
  let left = Math.max(0, Math.floor(xp));
  while (level < XP.maxLevel) {
    const need = xpToNext(level);
    if (left < need) return { level, into: left, need, progress: left / need, maxed: false };
    left -= need;
    level++;
  }
  return { level, into: 0, need: 0, progress: 1, maxed: true };
}

export interface RunXpInput {
  distance: number;
  coins: number;
  /** Furthest zone reached, 0-based. */
  zone: number;
}

/** XP a finished run earns on its own (missions and achievements add theirs separately). */
export function xpForRun(run: RunXpInput): number {
  return Math.floor(run.distance * XP.perMetre + run.coins * XP.perRand + run.zone * XP.perZone);
}

/** What reaching `level` pays out. */
export function levelReward(level: number): Reward {
  const milestone = LEVEL_MILESTONES[level] ?? {};
  return {
    ...milestone,
    rand: LEVEL_REWARD_RAND.base + LEVEL_REWARD_RAND.perLevel * level + (milestone.rand ?? 0),
  };
}
