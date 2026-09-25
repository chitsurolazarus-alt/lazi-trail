import { CONFIG } from '../config/gameConfig';
import { clamp, smoothstep01 } from '../core/math';

/**
 * Pure logic for the thief and his dog. It only decides how far behind Lazi they are and when
 * she has been caught; drawing and animation live in `Chasers`.
 *
 *  intro     Run start: the thief lunges for the bag, then falls in behind.
 *  close     On her heels, for `hold` seconds of clean running.
 *  dropping  Falling back out of view.
 *  far       Out of view.
 *  catching  A stumble: they sprint to catch up.
 *  caught    A second stumble while they were close: game over.
 *  snatch    Lazi crashed into an obstacle: they run up and grab the bag.
 */
export type ChasePhase = 'intro' | 'close' | 'dropping' | 'far' | 'catching' | 'caught' | 'snatch';

export interface ChaseState {
  phase: ChasePhase;
  /** Metres behind Lazi (negative once they have run past her in the snatch scene). */
  gap: number;
  /** Seconds spent in the current phase. */
  timer: number;
  /** How long to stay `close` before dropping back. */
  hold: number;
  /** How near they run when on her heels (a character perk can push this back). */
  closeGap: number;
  /** Where the run-start lunge begins. */
  introStartGap: number;
}

const C = CONFIG.chase;

/** `gapMul` > 1 makes the pair start (and stay) further back; Zola's perk. */
export function createChase(gapMul = 1): ChaseState {
  const introStartGap = C.introStartGap * gapMul;
  return {
    phase: 'intro',
    gap: introStartGap,
    timer: 0,
    hold: C.startHold,
    closeGap: C.closeGap * gapMul,
    introStartGap,
  };
}

export function isFinished(state: ChaseState): boolean {
  return state.phase === 'caught' || state.phase === 'snatch';
}

/** Advance the chase by `dt` seconds. `boosting` = Energy Drink Boost is active. */
export function stepChase(state: ChaseState, dt: number, boosting = false): void {
  if (isFinished(state)) return;
  state.timer += dt;

  if (boosting) {
    // Lazi pulls far ahead; they can't be caught up with until the boost ends.
    state.phase = 'far';
    state.gap = Math.min(C.boostGap, state.gap + C.boostRate * dt);
    return;
  }

  switch (state.phase) {
    case 'intro': {
      const t = smoothstep01(state.timer / C.introDuration);
      state.gap = state.introStartGap + (state.closeGap - state.introStartGap) * t;
      if (state.timer >= C.introDuration) enter(state, 'close', C.startHold);
      break;
    }
    case 'close':
      state.gap = state.closeGap;
      if (state.timer >= state.hold) enter(state, 'dropping', state.hold);
      break;
    case 'dropping':
      state.gap = Math.min(C.farGap, state.gap + C.dropRate * dt);
      if (state.gap >= C.farGap) enter(state, 'far', state.hold);
      break;
    case 'far':
      // Settle back from a boost lead.
      state.gap = state.gap > C.farGap ? Math.max(C.farGap, state.gap - C.dropRate * dt) : C.farGap;
      break;
    case 'catching':
      state.gap = Math.max(state.closeGap, state.gap - C.catchRate * dt);
      if (state.gap <= state.closeGap) enter(state, 'close', C.stumbleHold);
      break;
  }
}

/** Lazi stumbled. Returns true if that was the second one while they were close: she's caught. */
export function onStumble(state: ChaseState): boolean {
  if (isFinished(state)) return false;
  if (state.gap < C.caughtGap && state.phase !== 'intro') {
    enter(state, 'caught', 0);
    state.gap = 1.0;
    return true;
  }
  // First stumble (or they were out of view): they close in.
  enter(state, 'catching', C.stumbleHold);
  return false;
}

/** Lazi crashed into an obstacle: the pair run in to snatch the bag. */
export function onCrash(state: ChaseState): void {
  if (isFinished(state)) return;
  enter(state, 'snatch', 0);
  // Never start the scene further away than the camera can show.
  state.gap = Math.min(state.gap, 14);
}

/** 0 = safe, 1 = they have her. Drives the HUD chase meter. */
export function chaseMeter(state: ChaseState): number {
  if (isFinished(state)) return 1;
  return clamp(1 - (state.gap - state.closeGap) / (C.farGap - state.closeGap), 0, 1);
}

function enter(state: ChaseState, phase: ChasePhase, hold: number): void {
  state.phase = phase;
  state.timer = 0;
  state.hold = hold;
}
