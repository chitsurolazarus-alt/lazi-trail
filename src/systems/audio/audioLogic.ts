import { zoneBlendAt, type GroundStyle } from '../../config/zones';

/** Pure helpers behind the audio system: no Web Audio here, so it can all be unit-tested. */

export const midiToFreq = (note: number): number => 440 * 2 ** ((note - 69) / 12);

/** Volume sliders are linear 0..1; ears are logarithmic, so square them for the actual gain. */
export const volumeToGain = (v: number): number => {
  const c = Math.min(1, Math.max(0, v));
  return c * c;
};

/* -------------------------------------------------------------------- coins */

/** Semitone offsets of a major pentatonic run, so a streak of coins climbs a pleasant scale. */
const COIN_SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24] as const;

/** Pitch (semitones above the base note) of the n-th coin in a streak (0-based). Caps at two octaves. */
export function coinPitchSemitones(streak: number): number {
  const i = Math.min(COIN_SCALE.length - 1, Math.max(0, Math.floor(streak)));
  return COIN_SCALE[i] as number;
}

/** A coin streak continues if the next coin is collected within this many seconds. */
export const COIN_STREAK_WINDOW = 1.1;

export function nextStreak(streak: number, secondsSinceLastCoin: number): number {
  return secondsSinceLastCoin <= COIN_STREAK_WINDOW ? streak + 1 : 0;
}

/* -------------------------------------------------------------------- music */

export interface IntensityInput {
  /** 0..1 run speed relative to the cap. */
  speedNorm: number;
  /** 0..1 how close the chasers are (chase meter). */
  chase: number;
}

/** Overall musical intensity 0..1: faster and closer chasers = more going on. */
export function musicIntensity({ speedNorm, chase }: IntensityInput): number {
  const v = 0.12 + 0.5 * speedNorm + 0.4 * chase;
  return Math.min(1, Math.max(0, v));
}

const ramp = (x: number, from: number, to: number): number =>
  Math.min(1, Math.max(0, (x - from) / (to - from)));

/** How loud each music layer is at a given intensity. The base layer is always on. */
export function layerGains(intensity: number): { base: number; mid: number; high: number } {
  return { base: 1, mid: ramp(intensity, 0.22, 0.5), high: ramp(intensity, 0.6, 0.88) };
}

/* ------------------------------------------------------------------ ambience */

/** Bed weights (township, city, trainyard, stadium) for a distance run; they always sum to 1. */
export function ambienceWeights(distance: number): [number, number, number, number] {
  const { from, to, t } = zoneBlendAt(distance);
  const w: [number, number, number, number] = [0, 0, 0, 0];
  w[from] += 1 - t;
  w[to] += t;
  return w;
}

/* ---------------------------------------------------------------- footsteps */

export type Surface = 'tar' | 'gravel' | 'wood' | 'metal';

/** What Lazi's feet are hitting. `groundY` is the walkable height under her (0 = road). */
export function footstepSurface(ground: GroundStyle, groundY: number, onRoof: boolean): Surface {
  if (onRoof) return 'metal';
  if (groundY > 0.15) return 'wood'; // the plank ramp
  return ground === 'rails' ? 'gravel' : 'tar';
}

/** Seconds between footsteps (and dust puffs). Faster running = quicker steps. */
export function stepInterval(speedNorm: number): number {
  return 0.34 - 0.16 * Math.min(1, Math.max(0, speedNorm));
}

/* ------------------------------------------------------------- sound cues */

/** True the moment a distance that was above `threshold` drops to or below it. */
export function crossedThreshold(previous: number, current: number, threshold: number): boolean {
  return previous > threshold && current <= threshold;
}

/** Range (metres) at which vehicles announce themselves. */
export const HONK_RANGE = { taxiMoving: 75, trainMoving: 115 } as const;

/* ---------------------------------------------------------------------- music data */

/** A minor pentatonic in MIDI notes (A C D E G), used by the arpeggios. */
export const PENTATONIC = [57, 60, 62, 64, 67] as const;

export interface Chord {
  /** Bass/log-drum root. */
  root: number;
  /** Piano/pad voicing. */
  notes: readonly number[];
}

/** Am9 · Fmaj9 · Cmaj7(add9) · G6 — the four-bar loop the tracks are built on. */
export const PROGRESSION: readonly Chord[] = [
  { root: 33, notes: [57, 60, 64, 67, 71] },
  { root: 29, notes: [53, 57, 60, 64, 67] },
  { root: 36, notes: [60, 64, 67, 71, 74] },
  { root: 31, notes: [55, 59, 62, 64, 69] },
];

export const STEPS_PER_BAR = 16;

/** Log-drum hits per bar: step → semitones above the chord root (the classic syncopated Amapiano bounce). */
export const LOG_DRUM_PATTERN: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [3, 0],
  [6, 12],
  [8, 7],
  [10, 0],
  [13, 12],
  [15, 7],
];

/** Piano stabs per bar (steps). */
export const CHORD_STABS: readonly number[] = [0, 3, 6, 10, 12];
/** Sixteenth-note shaker accents (1 = accent). */
export const SHAKER: readonly number[] = [
  0.5, 0.25, 0.7, 0.25, 0.5, 0.25, 0.7, 0.25, 0.5, 0.25, 0.7, 0.25, 0.5, 0.25, 0.7, 0.4,
];
/** Pentatonic degrees for the melodic pluck, per bar step (-1 = rest). */
export const PLUCK_PATTERNS: ReadonlyArray<readonly number[]> = [
  [-1, -1, 4, -1, -1, 3, -1, -1, 2, -1, -1, 3, -1, 1, -1, -1],
  [-1, 3, -1, -1, 2, -1, -1, 0, -1, -1, 1, -1, -1, 2, -1, -1],
  [-1, -1, 4, -1, -1, 4, -1, 3, -1, -1, 2, -1, -1, -1, 3, -1],
  [-1, 2, -1, -1, 3, -1, -1, 4, -1, -1, 3, -1, 2, -1, 0, -1],
];
