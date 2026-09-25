/**
 * Every tunable number in the game lives here.
 * World convention: the player stays at z = 0 and runs toward -Z; the world scrolls toward +Z.
 * "s" is distance along the track in metres (increases as the player runs).
 */

export const LANE_COUNT = 3;

export type ObstacleKind = 'stall' | 'cart' | 'awning' | 'taxi';
/** What the player must do to get past an obstacle sharing their lane. */
export type ObstacleRequirement = 'lane' | 'jump' | 'slide';

export interface ObstacleDef {
  readonly kind: ObstacleKind;
  readonly requirement: ObstacleRequirement;
  /** Half of the obstacle's width (x). */
  readonly halfWidth: number;
  /** Extent along the track (z). */
  readonly length: number;
  /** Vertical extent of the solid part. */
  readonly yMin: number;
  readonly yMax: number;
}

export const OBSTACLE_DEFS: Readonly<Record<ObstacleKind, ObstacleDef>> = {
  stall: { kind: 'stall', requirement: 'lane', halfWidth: 0.95, length: 1.6, yMin: 0, yMax: 3.0 },
  cart: { kind: 'cart', requirement: 'jump', halfWidth: 0.8, length: 1.8, yMin: 0, yMax: 0.95 },
  awning: {
    kind: 'awning',
    requirement: 'slide',
    halfWidth: 0.95,
    length: 1.8,
    yMin: 1.15,
    yMax: 2.0,
  },
  taxi: { kind: 'taxi', requirement: 'lane', halfWidth: 1.0, length: 5.5, yMin: 0, yMax: 2.4 },
};

export const CONFIG = {
  lane: {
    /** Distance between lane centres. */
    width: 2.4,
    /** Seconds to slide from one lane to the next. */
    changeTime: 0.12,
  },

  player: {
    halfWidth: 0.35,
    halfDepth: 0.3,
    height: 1.7,
    slideHeight: 0.6,
    slideTime: 0.75,
    jumpHeight: 2.0,
    gravity: 50,
    fastFallSpeed: 32,
    /** Seconds a jump/slide press is remembered while still airborne. */
    inputBuffer: 0.12,
  },

  world: {
    chunkLength: 40,
    /** How far ahead of the player (m) chunks are generated. */
    lookahead: 170,
    /** A chunk is recycled once its start is this far behind the player. */
    recycleDistance: 60,
    roadHalfWidth: 3.9,
    sidewalkWidth: 3.5,
    buildingsPerSide: 5,
    /** Obstacle-free runway at the start of every run (m). */
    startRunway: 60,
    fogNear: 45,
    fogFar: 160,
  },

  difficulty: {
    /** Seconds of gentle play before the ramp starts. */
    easyDuration: 60,
    /** Seconds the ramp takes to reach the cap after the easy phase. */
    rampDuration: 300,
    baseSpeed: 13,
    easyEndSpeed: 15,
    maxSpeed: 32,
    blockChance: { start: 0.45, end: 0.8 },
    actionChance: { start: 0.15, end: 0.4 },
    coinChance: { start: 0.9, end: 0.7 },
    /** Seconds of free running between obstacle rows (higher = easier). */
    reactSeconds: { start: 1.9, end: 0.8 },
    maxBlockedEasy: 1,
    maxBlockedHard: 2,
  },

  scoring: {
    pointsPerMeter: 1,
    pointsPerCoin: 10,
    /** Multiplier goes up by 1 every this many metres... */
    multiplierEvery: 750,
    /** ...up to this cap. */
    maxMultiplier: 5,
    silverValue: 1,
    goldValue: 2,
  },

  collision: {
    /** Lateral overlap (m) below which a hit counts as a side clip instead of a front hit. */
    sideClipOverlap: 0.45,
    /** Feet within this distance of an obstacle's top are treated as clearing it. */
    topForgiveness: 0.3,
    /** A second stumble within this many seconds is a crash. */
    stumbleWindow: 3,
    stumbleSlowFactor: 0.6,
    /** Seconds to get back to full speed after a stumble. */
    stumbleRecover: 1.0,
    coinRadiusX: 1.0,
    coinRadiusS: 0.9,
    coinRadius: 0.42,
  },

  camera: {
    height: 4.4,
    distance: 8,
    lookAheadZ: -14,
    lookHeight: 1.3,
    followX: 0.55,
    fovBase: 62,
    fovMax: 76,
    smoothing: 9,
  },

  crash: {
    /** Seconds the world takes to roll to a halt after crashing. */
    stopTime: 0.5,
    /** Seconds before the game-over screen appears. */
    screenDelay: 0.9,
  },
} as const;

export const CREDIT = {
  text: 'Built by Lazarus Chitsuro',
  url: 'https://github.com/chitsurolazarus-alt',
} as const;

/** Convert a (possibly fractional) lane index to a world x coordinate. */
export function laneToX(lane: number): number {
  return (lane - (LANE_COUNT - 1) / 2) * CONFIG.lane.width;
}
