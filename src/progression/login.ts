import { LOGIN_REWARDS, type Reward } from '../config/progression';
import type { LoginState } from '../save/schema';
import { daysBetween } from './dates';

export const LOGIN_DAYS = LOGIN_REWARDS.length;

export interface LoginStatus {
  canClaim: boolean;
  /** The calendar day (1-7) that can be claimed now, or the one last claimed if nothing is due. */
  day: number;
  /** A day was missed, so the calendar starts over at day 1. */
  streakBroken: boolean;
}

/**
 * Where the 7-day login calendar stands on `today` (a `YYYY-MM-DD` device date).
 * Claim on consecutive days to walk through 1..7; skip a day and it starts again at 1.
 * After day 7 the calendar loops back to day 1. A device clock that goes backwards never pays twice.
 */
export function loginStatus(login: LoginState, today: string): LoginStatus {
  if (login.lastClaim === null) return { canClaim: true, day: 1, streakBroken: false };
  const gap = daysBetween(login.lastClaim, today);
  if (gap <= 0) return { canClaim: false, day: login.day, streakBroken: false };
  if (gap === 1) {
    return {
      canClaim: true,
      day: login.day >= LOGIN_DAYS ? 1 : login.day + 1,
      streakBroken: false,
    };
  }
  return { canClaim: true, day: 1, streakBroken: true };
}

/** Claim today's reward. Returns the new state and the reward, or null if nothing was due. */
export function claimLogin(
  login: LoginState,
  today: string,
): { login: LoginState; day: number; reward: Reward } | null {
  const status = loginStatus(login, today);
  if (!status.canClaim) return null;
  return {
    login: { lastClaim: today, day: status.day, total: login.total + 1 },
    day: status.day,
    reward: LOGIN_REWARDS[status.day - 1] as Reward,
  };
}
