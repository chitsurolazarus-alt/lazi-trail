/**
 * Every tunable number in the game lives here.
 * World convention: the player stays at z = 0 and runs toward -Z; the world scrolls toward +Z.
 * "s" is distance along the track in metres (increases as the player runs).
 */

export const LANE_COUNT = 3;

export type ObstacleKind =
  | 'stall'
  | 'cart'
  | 'awning'
  | 'barrier'
  | 'taxi'
  | 'taxiRamp'
  | 'taxiMoving'
  | 'trainParked'
  | 'trainMoving';

/** What the player must do to get past an obstacle sharing their lane. */
export type ObstacleRequirement = 'lane' | 'jump' | 'slide';

export interface ObstacleDef {
  readonly kind: ObstacleKind;
  readonly requirement: ObstacleRequirement;
  /** Half of the obstacle's width (x). */
  readonly halfWidth: number;
  /** Extent of the solid body along the track (z). */
  readonly length: number;
  /** Vertical extent of the solid part. */
  readonly yMin: number;
  readonly yMax: number;
  /**
   * Parked vehicles you can run onto: a ramp of `rampLength` leads up in front of the body to a
   * walkable roof at `yMax`. The body is still solid from the front and sides.
   */
  readonly ramp?: { readonly length: number };
  /**
   * Moving vehicles. `closing` is how fast the vehicle approaches, as a fraction of the player's
   * speed (0.8 = it drives toward Lazi at 80% of Lazi's own speed). They start moving once the
   * player is `approachDistance` away, so they always meet the player at their row.
   */
  readonly moving?: { readonly closing: number };
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
  barrier: {
    kind: 'barrier',
    requirement: 'jump',
    halfWidth: 1.0,
    length: 0.6,
    yMin: 0,
    yMax: 0.9,
  },
  taxi: { kind: 'taxi', requirement: 'lane', halfWidth: 1.0, length: 5.5, yMin: 0, yMax: 2.4 },
  taxiRamp: {
    kind: 'taxiRamp',
    requirement: 'lane',
    halfWidth: 1.0,
    length: 5.5,
    yMin: 0,
    yMax: 2.4,
    ramp: { length: 8 },
  },
  taxiMoving: {
    kind: 'taxiMoving',
    requirement: 'lane',
    halfWidth: 1.0,
    length: 5.5,
    yMin: 0,
    yMax: 2.4,
    moving: { closing: 0.8 },
  },
  trainParked: {
    kind: 'trainParked',
    requirement: 'lane',
    halfWidth: 1.15,
    length: 20,
    yMin: 0,
    yMax: 3.6,
    ramp: { length: 12 },
  },
  trainMoving: {
    kind: 'trainMoving',
    requirement: 'lane',
    halfWidth: 1.15,
    length: 20,
    yMin: 0,
    yMax: 3.6,
    moving: { closing: 0.9 },
  },
};

/** Player progress (m) before the meeting point at which a moving vehicle starts to move. */
export const APPROACH_DISTANCE = 60;

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
    recycleDistance: 110,
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
    /** Same, for walkable roofs (so you can hop off the side of a train). */
    roofForgiveness: 0.6,
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
    /** Seconds of slow motion right after a crash, easing back to full speed. */
    slowMoTime: 0.6,
    slowMoScale: 0.25,
    /** Seconds the world takes to roll to a halt after crashing. */
    stopTime: 0.5,
    /** Seconds before the game-over screen appears (the chasers' bag-snatch plays first). */
    screenDelay: 2.0,
  },

  /** The thief and his dog. Gaps are metres behind Lazi. */
  chase: {
    /** Run-start intro: the thief lunges for the bag, then falls in behind. */
    introDuration: 2.2,
    /** Lazi's speed at the very start of the intro, as a fraction of normal (she sprints off). */
    introSpeedStart: 0.45,
    introStartGap: 0.9,
    /** How close they run when they are on her heels. */
    closeGap: 4,
    /** Out of view (behind the camera). */
    farGap: 26,
    /** Extra head start while Energy Drink Boost is active. */
    boostGap: 60,
    /** Seconds they stay close after the intro (clean running) before dropping back. */
    startHold: 3,
    /** Seconds they stay close after a stumble before dropping back. */
    stumbleHold: 4,
    /** m/s they fall back / catch up / are left behind while boosting. */
    dropRate: 4,
    catchRate: 30,
    boostRate: 25,
    /** A stumble while the gap is below this is a catch (game over). */
    caughtGap: 8,
    /** m/s the pair run at to reach Lazi when she crashes. */
    snatchSpeed: 16,
    /** The dog runs this many metres ahead of the thief. */
    dogLead: 1.7,
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
