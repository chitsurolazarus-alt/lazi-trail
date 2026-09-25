import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config/gameConfig';
import { difficultyLevel, getDifficulty, speedAt } from '../src/systems/Difficulty';

const D = CONFIG.difficulty;
const END = D.easyDuration + D.rampDuration;

describe('speedAt', () => {
  it('starts at the base speed', () => {
    expect(speedAt(0)).toBe(D.baseSpeed);
  });

  it('stays gentle for the whole easy phase', () => {
    expect(speedAt(D.easyDuration)).toBeCloseTo(D.easyEndSpeed);
    expect(speedAt(D.easyDuration / 2)).toBeLessThan(D.easyEndSpeed);
  });

  it('reaches the cap after the ramp and never exceeds it', () => {
    expect(speedAt(END)).toBeCloseTo(D.maxSpeed);
    expect(speedAt(END * 10)).toBeCloseTo(D.maxSpeed);
  });

  it('is continuous and non-decreasing', () => {
    let prev = speedAt(0);
    for (let t = 0.5; t <= END + 30; t += 0.5) {
      const now = speedAt(t);
      expect(now).toBeGreaterThanOrEqual(prev - 1e-9);
      expect(now - prev).toBeLessThan(0.5); // no jumps
      prev = now;
    }
  });
});

describe('difficultyLevel', () => {
  it('is 0 during the easy phase, 1 at the cap', () => {
    expect(difficultyLevel(0)).toBe(0);
    expect(difficultyLevel(D.easyDuration)).toBe(0);
    expect(difficultyLevel(END)).toBe(1);
  });
});

describe('getDifficulty', () => {
  it('is easy for the first minute: at most one lane blocked, generous spacing', () => {
    for (const t of [0, 20, 59.9]) {
      const d = getDifficulty(t);
      expect(d.maxBlocked).toBe(D.maxBlockedEasy);
      expect(d.reactSeconds).toBeCloseTo(D.reactSeconds.start);
      expect(d.blockChance).toBeCloseTo(D.blockChance.start);
    }
  });

  it('ramps density up and spacing down after the easy phase', () => {
    const early = getDifficulty(D.easyDuration + 1);
    const late = getDifficulty(END);
    expect(late.blockChance).toBeGreaterThan(early.blockChance);
    expect(late.actionChance).toBeGreaterThan(early.actionChance);
    expect(late.reactSeconds).toBeLessThan(early.reactSeconds);
    expect(late.maxBlocked).toBe(D.maxBlockedHard);
  });

  it('never blocks all three lanes', () => {
    expect(D.maxBlockedHard).toBeLessThan(3);
    expect(getDifficulty(END * 2).maxBlocked).toBeLessThan(3);
  });
});
