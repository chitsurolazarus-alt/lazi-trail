import { CONFIG } from '../config/gameConfig';

const S = CONFIG.scoring;

export interface ScoreState {
  /** Metres run. */
  distance: number;
  /** Rand coins collected this run. */
  coins: number;
  /** Points earned from distance (already multiplied as they were earned). */
  distancePoints: number;
  coinPoints: number;
}

export function createScoreState(): ScoreState {
  return { distance: 0, coins: 0, distancePoints: 0, coinPoints: 0 };
}

/**
 * Multiplier at a given distance: steps up every `multiplierEvery` metres, capped.
 * `bonus` lets power-ups / missions stack on top (e.g. 2x Score).
 */
export function multiplierForDistance(distance: number, bonus = 1): number {
  const tier = Math.min(S.maxMultiplier, 1 + Math.floor(Math.max(0, distance) / S.multiplierEvery));
  return tier * bonus;
}

/** Score = distance × multiplier + coins. Points are banked as they are earned, so a later
 * multiplier increase never rewrites earlier progress. */
export function advanceDistance(state: ScoreState, meters: number, bonus = 1): ScoreState {
  if (meters <= 0) return state;
  const multiplier = multiplierForDistance(state.distance, bonus);
  return {
    ...state,
    distance: state.distance + meters,
    distancePoints: state.distancePoints + meters * S.pointsPerMeter * multiplier,
  };
}

/** Add a coin pickup worth `value` Rand. */
export function addCoins(state: ScoreState, value: number = S.silverValue): ScoreState {
  return {
    ...state,
    coins: state.coins + value,
    coinPoints: state.coinPoints + value * S.pointsPerCoin,
  };
}

export function totalScore(state: ScoreState): number {
  return Math.floor(state.distancePoints + state.coinPoints);
}
