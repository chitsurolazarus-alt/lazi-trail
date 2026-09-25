import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config/gameConfig';
import {
  addCoins,
  advanceDistance,
  createScoreState,
  multiplierForDistance,
  totalScore,
} from '../src/systems/Scoring';

const S = CONFIG.scoring;

describe('multiplierForDistance', () => {
  it('starts at 1x and steps up every multiplierEvery metres', () => {
    expect(multiplierForDistance(0)).toBe(1);
    expect(multiplierForDistance(S.multiplierEvery - 1)).toBe(1);
    expect(multiplierForDistance(S.multiplierEvery)).toBe(2);
    expect(multiplierForDistance(S.multiplierEvery * 3)).toBe(4);
  });

  it('is capped', () => {
    expect(multiplierForDistance(1_000_000)).toBe(S.maxMultiplier);
  });

  it('stacks a bonus multiplier on top of the distance tier', () => {
    expect(multiplierForDistance(0, 2)).toBe(2);
    expect(multiplierForDistance(S.multiplierEvery, 2)).toBe(4);
  });

  it('treats negative distance as zero', () => {
    expect(multiplierForDistance(-50)).toBe(1);
  });
});

describe('advanceDistance', () => {
  it('scores metres x multiplier', () => {
    const state = advanceDistance(createScoreState(), 100);
    expect(state.distance).toBe(100);
    expect(totalScore(state)).toBe(100 * S.pointsPerMeter);
  });

  it('applies a higher multiplier only to metres run after the threshold', () => {
    let state = createScoreState();
    state = advanceDistance(state, S.multiplierEvery); // all at 1x
    const before = totalScore(state);
    state = advanceDistance(state, 10); // now 2x
    expect(totalScore(state) - before).toBe(10 * S.pointsPerMeter * 2);
  });

  it('applies the bonus multiplier', () => {
    expect(totalScore(advanceDistance(createScoreState(), 100, 2))).toBe(200);
  });

  it('ignores non-positive distance and does not mutate its input', () => {
    const start = createScoreState();
    expect(advanceDistance(start, 0)).toBe(start);
    expect(advanceDistance(start, -5)).toBe(start);
    advanceDistance(start, 10);
    expect(start.distance).toBe(0);
  });
});

describe('addCoins', () => {
  it('adds coins and coin points', () => {
    const state = addCoins(createScoreState());
    expect(state.coins).toBe(S.silverValue);
    expect(totalScore(state)).toBe(S.silverValue * S.pointsPerCoin);
  });

  it('supports coins worth more than one Rand', () => {
    const state = addCoins(createScoreState(), S.goldValue);
    expect(state.coins).toBe(S.goldValue);
  });

  it('is not affected by the distance multiplier', () => {
    const far = advanceDistance(createScoreState(), S.multiplierEvery * 3);
    const withCoin = addCoins(far);
    expect(totalScore(withCoin) - totalScore(far)).toBe(S.silverValue * S.pointsPerCoin);
  });
});

describe('totalScore', () => {
  it('sums distance and coin points, rounded down', () => {
    let state = advanceDistance(createScoreState(), 10.7);
    state = addCoins(state);
    expect(totalScore(state)).toBe(Math.floor(10.7 + S.pointsPerCoin));
  });
});
