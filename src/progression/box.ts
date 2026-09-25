import { ALL_OUTFITS } from '../config/characters';
import { BOX, POWER_UP_IDS, UPGRADE_MAX, type PowerUpId } from '../config/progression';
import { pickOne, pickWeighted, randRange, type Rng } from '../core/random';
import type { SaveData } from '../save/schema';

export type BoxReward =
  | { kind: 'rand'; amount: number }
  | { kind: 'upgrade'; powerUp: PowerUpId }
  | { kind: 'piece'; outfit: string }
  | { kind: 'medal' }
  | { kind: 'headStart' }
  | { kind: 'secondChance' };

const KINDS = ['rand', 'upgrade', 'piece', 'medal', 'headStart', 'secondChance'] as const;

/** Outfits that could still drop as a piece: for characters the player owns, not yet unlocked. */
export function pieceCandidates(save: SaveData): string[] {
  return ALL_OUTFITS.filter(
    (o) =>
      o.unlock.kind === 'rand' &&
      save.characters.owned.includes(o.character) &&
      !save.outfits.owned.includes(o.id),
  ).map((o) => o.id);
}

export function upgradeCandidates(save: SaveData): PowerUpId[] {
  return POWER_UP_IDS.filter((id) => save.upgrades[id] < UPGRADE_MAX);
}

/**
 * Roll one mystery-box reward. A kind that has nothing left to give (every upgrade maxed, every
 * outfit owned) turns into Rand instead, so a box is never empty.
 */
export function rollBox(save: SaveData, rng: Rng): BoxReward {
  const w = BOX.weights;
  const kind = KINDS[
    pickWeighted(
      rng,
      KINDS.map((k) => w[k]),
    )
  ] as (typeof KINDS)[number];
  const rand = (): BoxReward => ({
    kind: 'rand',
    amount: Math.round(randRange(rng, BOX.randMin, BOX.randMax) / 10) * 10,
  });
  switch (kind) {
    case 'upgrade': {
      const options = upgradeCandidates(save);
      return options.length ? { kind, powerUp: pickOne(rng, options) } : rand();
    }
    case 'piece': {
      const options = pieceCandidates(save);
      return options.length ? { kind, outfit: pickOne(rng, options) } : rand();
    }
    case 'rand':
      return rand();
    default:
      return { kind };
  }
}
