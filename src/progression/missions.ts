import {
  MISSIONS,
  MISSION_TEMPLATES,
  missionTier,
  type MissionStat,
  type MissionTemplate,
} from '../config/progression';
import { createRng, pickOne, type Rng } from '../core/random';
import type { MissionInstance, MissionState } from '../save/schema';
import { dateSeed, daysBetween } from './dates';
import type { RunStats } from './types';

export function templateOf(id: string): MissionTemplate | undefined {
  return MISSION_TEMPLATES.find((t) => t.id === id);
}

/** Human text for a mission, e.g. "Collect 450 Rand". */
export function missionText(m: MissionInstance): string {
  const t = templateOf(m.templateId);
  return (t?.text ?? 'Mission').replace('{n}', m.target.toLocaleString());
}

export function makeMission(template: MissionTemplate, tier: 0 | 1 | 2): MissionInstance {
  return {
    templateId: template.id,
    tier,
    target: template.targets[tier],
    progress: 0,
    reward: template.rewards[tier],
    done: false,
  };
}

function clampTier(n: number): 0 | 1 | 2 {
  return Math.max(0, Math.min(2, n)) as 0 | 1 | 2;
}

/**
 * The day's set of missions. Seeded by the date, so everyone with the same level sees the same
 * three missions on a given day, and reopening the game never re-rolls them. Slots are easy,
 * medium and hard for the player's level; the three always use different mission types.
 */
export function rollDailySet(date: string, level: number): MissionInstance[] {
  const rng = createRng(dateSeed(date));
  const tier = missionTier(level);
  const tiers = [clampTier(tier - 1), tier, clampTier(tier + 1)] as const;
  const pool = [...MISSION_TEMPLATES];
  const list: MissionInstance[] = [];
  for (let slot = 0; slot < MISSIONS.perDay; slot++) {
    const template = pickOne(rng, pool);
    pool.splice(pool.indexOf(template), 1);
    list.push(makeMission(template, tiers[slot] ?? tier));
  }
  return list;
}

/** Start a new day's missions if the stored ones are from another day. Returns whether it changed. */
export function ensureDaily(state: MissionState, today: string, level: number): boolean {
  if (state.date === today && state.list.length > 0) return false;
  state.date = today;
  state.list = rollDailySet(today, level);
  state.rerolls = 0;
  return true;
}

/** Replace one unfinished mission with a different one (same tier). Returns false if not allowed. */
export function rerollMission(state: MissionState, index: number, rng: Rng): boolean {
  const current = state.list[index];
  if (!current || current.done) return false;
  const taken = new Set(state.list.map((m) => m.templateId));
  const options = MISSION_TEMPLATES.filter((t) => !taken.has(t.id));
  if (options.length === 0) return false;
  state.list[index] = makeMission(pickOne(rng, options), current.tier);
  state.rerolls++;
  return true;
}

/** How much a run adds to (or, for "max" missions, sets) a stat. */
export function missionValue(stat: MissionStat, run: RunStats): number {
  switch (stat) {
    case 'coins':
      return run.coins;
    case 'distance':
    case 'bestDistance':
      return Math.floor(run.distance);
    case 'jumps':
      return run.jumps;
    case 'slides':
      return run.slides;
    case 'nearMisses':
      return run.nearMisses;
    case 'runs':
      return 1;
    case 'outruns':
      return run.outruns;
    case 'bestScore':
      return run.score;
    case 'bestZone':
      return run.zone + 1;
    case 'noStumble':
      return Math.floor(run.noStumble);
  }
}

export interface MissionRunResult {
  /** Missions that were finished by this run. */
  completed: MissionInstance[];
  /** The whole set is now done (and wasn't before). */
  setCompleted: boolean;
}

/** Feed a finished run into today's missions. Mutates `state`. */
export function applyRunToMissions(
  state: MissionState,
  run: RunStats,
  today: string,
): MissionRunResult {
  const wasComplete = state.list.length > 0 && state.list.every((m) => m.done);
  const completed: MissionInstance[] = [];
  for (const m of state.list) {
    if (m.done) continue;
    const template = templateOf(m.templateId);
    if (!template) continue;
    const value = missionValue(template.stat, run);
    m.progress = Math.min(
      m.target,
      template.mode === 'sum' ? m.progress + value : Math.max(m.progress, value),
    );
    if (m.progress >= m.target) {
      m.done = true;
      completed.push(m);
    }
  }
  const nowComplete = state.list.length > 0 && state.list.every((m) => m.done);
  const setCompleted = nowComplete && !wasComplete;
  if (setCompleted) registerSetCompleted(state, today);
  return { completed, setCompleted };
}

/** Count a finished set and extend (or restart) the day streak. */
export function registerSetCompleted(state: MissionState, today: string): void {
  state.setsCompleted++;
  const continues = state.lastSetDate !== null && daysBetween(state.lastSetDate, today) === 1;
  state.streak = continues ? state.streak + 1 : 1;
  state.bestStreak = Math.max(state.bestStreak, state.streak);
  state.lastSetDate = today;
}

/** The daily-mission streak as of `today` (it lapses if yesterday's set was missed). */
export function currentStreak(state: MissionState, today: string): number {
  if (state.lastSetDate === null) return 0;
  return daysBetween(state.lastSetDate, today) <= 1 ? state.streak : 0;
}

/** Permanent score multiplier earned by completing mission sets (1 = none yet). */
export function missionBonus(setsCompleted: number): number {
  return 1 + Math.min(MISSIONS.bonusCap, setsCompleted * MISSIONS.bonusPerSet);
}
