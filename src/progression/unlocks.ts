import {
  ALL_OUTFITS,
  CHARACTERS,
  defaultOutfitId,
  type CharacterDef,
  type CharacterUnlock,
  type OutfitDef,
} from '../config/characters';
import type { SaveData } from '../save/schema';
import { getAchievement } from './achievements';
import { levelFromXp } from './xp';

export interface Requirement {
  /** Rule is satisfied right now (for "rand" rules this just means the player can afford it). */
  met: boolean;
  current: number;
  target: number;
  /** Short, player-facing wording, e.g. "Reach Zone 3". */
  text: string;
  /** Bought with Rand rather than earned. */
  buyable: boolean;
  cost: number;
}

export function characterRequirement(save: SaveData, rule: CharacterUnlock): Requirement {
  switch (rule.kind) {
    case 'free':
      return { met: true, current: 1, target: 1, text: 'Free', buyable: false, cost: 0 };
    case 'rand':
      return {
        met: save.rand >= rule.cost,
        current: Math.min(save.rand, rule.cost),
        target: rule.cost,
        text: `${rule.cost.toLocaleString()} Rand`,
        buyable: true,
        cost: rule.cost,
      };
    case 'zone': {
      const reached = save.bestZone + 1;
      return {
        met: reached >= rule.zone,
        current: Math.min(reached, rule.zone),
        target: rule.zone,
        text: `Reach Zone ${rule.zone}`,
        buyable: false,
        cost: 0,
      };
    }
    case 'missionStreak':
      return {
        met: save.missions.bestStreak >= rule.days,
        current: Math.min(save.missions.bestStreak, rule.days),
        target: rule.days,
        text: `${rule.days}-day daily mission streak`,
        buyable: false,
        cost: 0,
      };
    case 'achievements': {
      const have = Object.keys(save.achievements).length;
      return {
        met: have >= rule.count,
        current: Math.min(have, rule.count),
        target: rule.count,
        text: `Earn ${rule.count} achievements`,
        buyable: false,
        cost: 0,
      };
    }
    case 'medals':
      return {
        met: save.goldenMedals >= rule.count,
        current: Math.min(save.goldenMedals, rule.count),
        target: rule.count,
        text: `Collect ${rule.count} Golden Medals`,
        buyable: false,
        cost: 0,
      };
  }
}

export function isCharacterOwned(save: SaveData, id: string): boolean {
  return save.characters.owned.includes(id);
}

/** Earned (non-Rand) characters whose requirement is met but that are not owned yet. */
export function characterUnlocksDue(save: SaveData): CharacterDef[] {
  return CHARACTERS.filter((c) => {
    if (isCharacterOwned(save, c.id)) return false;
    if (c.unlock.kind === 'free' || c.unlock.kind === 'rand') return false;
    return characterRequirement(save, c.unlock).met;
  });
}

export function isOutfitOwned(save: SaveData, character: string, outfit: OutfitDef): boolean {
  return (
    outfit.id === defaultOutfitId(character as never) || save.outfits.owned.includes(outfit.id)
  );
}

/** Outfits earned by level or achievement that have not been added to the wardrobe yet. */
export function outfitUnlocksDue(save: SaveData): string[] {
  const level = levelFromXp(save.player.xp).level;
  return ALL_OUTFITS.filter((o) => {
    if (save.outfits.owned.includes(o.id)) return false;
    if (o.unlock.kind === 'level') return level >= o.unlock.level;
    if (o.unlock.kind === 'achievement') return save.achievements[o.unlock.id] !== undefined;
    return false;
  }).map((o) => o.id);
}

/** Player-facing wording for how an outfit is obtained. */
export function outfitRequirementText(outfit: OutfitDef): string {
  switch (outfit.unlock.kind) {
    case 'default':
      return 'Included';
    case 'rand':
      return `${outfit.unlock.cost.toLocaleString()} Rand`;
    case 'level':
      return `Reach level ${outfit.unlock.level}`;
    case 'achievement':
      return `Achievement: ${getAchievement(outfit.unlock.id)?.name ?? '???'}`;
  }
}
