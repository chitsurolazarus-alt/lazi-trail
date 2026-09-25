import { CONFIG } from '../config/gameConfig';
import { lerp, smoothstep01 } from '../core/math';

const D = CONFIG.difficulty;

export interface Difficulty {
  /** Run speed in m/s. */
  speed: number;
  /** 0 during the easy phase, easing up to 1 at the cap. */
  level: number;
  /** Chance a non-safe lane gets a lane-blocking obstacle. */
  blockChance: number;
  /** Chance a lane gets a jump/slide obstacle. */
  actionChance: number;
  coinChance: number;
  /** Max lanes blocked in one row (never all three). */
  maxBlocked: number;
  /** Seconds of free running between obstacle rows. */
  reactSeconds: number;
}

/** 0 for the whole easy phase, then a smooth ease to 1 over `rampDuration`. */
export function difficultyLevel(elapsed: number): number {
  return smoothstep01((elapsed - D.easyDuration) / D.rampDuration);
}

/** Run speed (m/s) after `elapsed` seconds. Continuous and non-decreasing. */
export function speedAt(elapsed: number): number {
  if (elapsed <= 0) return D.baseSpeed;
  if (elapsed <= D.easyDuration) {
    return lerp(D.baseSpeed, D.easyEndSpeed, elapsed / D.easyDuration);
  }
  return lerp(D.easyEndSpeed, D.maxSpeed, difficultyLevel(elapsed));
}

export function getDifficulty(elapsed: number): Difficulty {
  const level = difficultyLevel(elapsed);
  const inEasyPhase = elapsed < D.easyDuration;
  return {
    speed: speedAt(elapsed),
    level,
    blockChance: lerp(D.blockChance.start, D.blockChance.end, level),
    actionChance: lerp(D.actionChance.start, D.actionChance.end, level),
    coinChance: lerp(D.coinChance.start, D.coinChance.end, level),
    maxBlocked: inEasyPhase ? D.maxBlockedEasy : D.maxBlockedHard,
    reactSeconds: lerp(D.reactSeconds.start, D.reactSeconds.end, level),
  };
}
