import { getCharacter } from '../config/characters';
import { POWER_UPS, type PowerUpId, type Reward } from '../config/progression';
import { ZONES } from '../config/zones';
import type { BoxReward } from '../progression/box';
import { getOutfit } from '../config/characters';
import { fmt } from './dom';

/** "R 500", "Mystery box"... one entry per thing a reward gives. */
export function rewardParts(reward: Reward): string[] {
  const parts: string[] = [];
  if (reward.rand) parts.push(`R ${fmt(reward.rand)}`);
  if (reward.boxes) parts.push(reward.boxes > 1 ? `${reward.boxes} mystery boxes` : 'Mystery box');
  if (reward.medals)
    parts.push(reward.medals > 1 ? `${reward.medals} Golden Medals` : 'Golden Medal');
  if (reward.headStart)
    parts.push(reward.headStart > 1 ? `${reward.headStart} Head Starts` : 'Head Start');
  if (reward.secondChance) {
    parts.push(reward.secondChance > 1 ? `${reward.secondChance} Second Chances` : 'Second Chance');
  }
  if (reward.outfit) parts.push(`Outfit: ${getOutfit(reward.outfit)?.name ?? reward.outfit}`);
  if (reward.badge) parts.push('New badge');
  return parts;
}

export function rewardText(reward: Reward): string {
  return rewardParts(reward).join(' + ');
}

export function zoneName(index: number): string {
  return ZONES[Math.min(index, ZONES.length - 1)]?.name ?? '';
}

export function characterName(id: string): string {
  return getCharacter(id).name;
}

export function powerUpName(id: PowerUpId): string {
  return POWER_UPS[id].name;
}

/** Player-facing description of a mystery box roll. */
export function boxRewardText(reward: BoxReward, upgradedTo?: number, unlocked?: boolean): string {
  switch (reward.kind) {
    case 'rand':
      return `R ${fmt(reward.amount)}`;
    case 'upgrade':
      return `${powerUpName(reward.powerUp)} upgraded${upgradedTo ? ` to level ${upgradedTo}` : ''}`;
    case 'piece': {
      const name = getOutfit(reward.outfit)?.name ?? 'Outfit';
      return unlocked ? `${name} outfit unlocked!` : `${name} outfit piece`;
    }
    case 'medal':
      return 'A Golden Medal!';
    case 'headStart':
      return 'A Head Start';
    case 'secondChance':
      return 'A Second Chance';
  }
}
