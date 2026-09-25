import { describe, expect, it } from 'vitest';
import {
  CHARACTERS,
  ALL_OUTFITS,
  getCharacter,
  perksFor,
  recolorFor,
} from '../src/config/characters';
import {
  MISSION_TEMPLATES,
  MISSIONS,
  POWER_UP_IDS,
  UPGRADE_MAX,
  XP,
  upgradeCost,
} from '../src/config/progression';
import { createRng } from '../src/core/random';
import { ACHIEVEMENTS, newlyEarned } from '../src/progression/achievements';
import { rollBox } from '../src/progression/box';
import { dateKey, daysBetween } from '../src/progression/dates';
import { claimLogin, loginStatus } from '../src/progression/login';
import {
  applyRunToMissions,
  currentStreak,
  ensureDaily,
  missionBonus,
  rerollMission,
  rollDailySet,
} from '../src/progression/missions';
import { validateName } from '../src/progression/names';
import { Progression } from '../src/progression/Progression';
import type { RunStats } from '../src/progression/types';
import {
  characterRequirement,
  characterUnlocksDue,
  outfitUnlocksDue,
} from '../src/progression/unlocks';
import { levelFromXp, levelReward, xpForLevel, xpForRun, xpToNext } from '../src/progression/xp';
import { SaveManager, type StorageLike } from '../src/save/SaveManager';
import { defaultSave, type LoginState, type MissionState } from '../src/save/schema';

class MemoryStorage implements StorageLike {
  store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
}

const run = (over: Partial<RunStats> = {}): RunStats => ({
  score: 1000,
  distance: 500,
  coins: 100,
  zone: 0,
  jumps: 10,
  slides: 5,
  nearMisses: 2,
  stumbles: 0,
  outruns: 0,
  noStumble: 500,
  powerUps: 0,
  caught: false,
  character: 'lazi',
  name: 'Tester',
  ...over,
});

function makeProgression(
  date = '2026-03-10',
  seed = 1,
): { p: Progression; store: SaveManager; setDate: (d: string) => void } {
  const store = new SaveManager(new MemoryStorage());
  store.load();
  let current = date;
  const p = new Progression(store, () => new Date(`${current}T12:00:00`), createRng(seed));
  return { p, store, setDate: (d) => (current = d) };
}

/* ------------------------------------------------------------------- XP */

describe('XP and levels', () => {
  it('each level needs more XP than the last', () => {
    for (let l = 1; l < XP.maxLevel; l++) expect(xpToNext(l + 1)).toBeGreaterThan(xpToNext(l));
  });

  it('level 1 starts at 0 XP and the curve matches the formula', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpToNext(1)).toBe(XP.base);
    expect(xpForLevel(2)).toBe(XP.base);
    expect(xpToNext(3)).toBe(XP.base + XP.linear * 2 + XP.quad * 4);
  });

  it('levelFromXp inverts xpForLevel exactly at every boundary', () => {
    for (let l = 1; l <= XP.maxLevel; l++) {
      expect(levelFromXp(xpForLevel(l)).level).toBe(l);
      if (l > 1) expect(levelFromXp(xpForLevel(l) - 1).level).toBe(l - 1);
    }
  });

  it('reports progress inside a level', () => {
    const info = levelFromXp(xpForLevel(4) + 50);
    expect(info.level).toBe(4);
    expect(info.into).toBe(50);
    expect(info.need).toBe(xpToNext(4));
    expect(info.progress).toBeCloseTo(50 / xpToNext(4));
  });

  it('stops at the maximum level', () => {
    const info = levelFromXp(1e9);
    expect(info.level).toBe(XP.maxLevel);
    expect(info.maxed).toBe(true);
    expect(info.progress).toBe(1);
  });

  it('rewards distance, Rand and zones', () => {
    expect(xpForRun({ distance: 1000, coins: 100, zone: 2 })).toBe(
      Math.floor(1000 * XP.perMetre + 100 * XP.perRand + 2 * XP.perZone),
    );
    expect(xpForRun({ distance: 0, coins: 0, zone: 0 })).toBe(0);
  });

  it('every level pays Rand and milestone levels pay more', () => {
    expect(levelReward(2).rand).toBeGreaterThan(0);
    expect(levelReward(5).boxes).toBe(1);
    expect(levelReward(5).badge).toBe('rookie');
  });
});

/* -------------------------------------------------------------- unlocks */

describe('unlock rules', () => {
  it('Lazi is free and owned from the start; the rest are not', () => {
    const save = defaultSave();
    expect(save.characters.owned).toEqual(['lazi']);
    expect(getCharacter('lazi').unlock.kind).toBe('free');
    expect(CHARACTERS.filter((c) => c.unlock.kind === 'free')).toHaveLength(1);
  });

  it('matches the specified roster and requirements', () => {
    const u = (id: string) => getCharacter(id).unlock;
    expect(u('thandi')).toEqual({ kind: 'rand', cost: 2500 });
    expect(u('sipho')).toEqual({ kind: 'zone', zone: 3 });
    expect(u('naledi')).toEqual({ kind: 'missionStreak', days: 10 });
    expect(u('kagiso')).toEqual({ kind: 'rand', cost: 15000 });
    expect(u('bongani')).toEqual({ kind: 'achievements', count: 25 });
    expect(u('zola')).toEqual({ kind: 'medals', count: 10 });
    expect(getCharacter('zola').secret).toBe(true);
  });

  it('gives each character a distinct perk in config, and Lazi none', () => {
    expect(perksFor('lazi')).toEqual(perksFor('lazi'));
    expect(perksFor('thandi').laneSpeedMul).toBeGreaterThan(1);
    expect(perksFor('sipho').magnetDurationMul).toBeGreaterThan(1);
    expect(perksFor('naledi').jumpHeightMul).toBeGreaterThan(1);
    expect(perksFor('kagiso').stumbleRecoverMul).toBeLessThan(1);
    expect(perksFor('bongani').startShield).toBe(true);
    expect(perksFor('zola').chaseGapMul).toBeGreaterThan(1);
    expect(getCharacter('lazi').perks).toEqual({});
  });

  it('Sipho unlocks on reaching Zone 3 (zone index 2), not before', () => {
    const save = defaultSave();
    save.bestZone = 1;
    expect(characterUnlocksDue(save).map((c) => c.id)).not.toContain('sipho');
    save.bestZone = 2;
    expect(characterUnlocksDue(save).map((c) => c.id)).toContain('sipho');
  });

  it('Naledi needs a 10-day mission streak', () => {
    const save = defaultSave();
    save.missions.bestStreak = 9;
    expect(characterUnlocksDue(save).map((c) => c.id)).not.toContain('naledi');
    save.missions.bestStreak = 10;
    expect(characterUnlocksDue(save).map((c) => c.id)).toContain('naledi');
  });

  it('Bongani needs 25 achievements and Zola 10 Golden Medals', () => {
    const save = defaultSave();
    for (let i = 0; i < 24; i++) save.achievements[`a${i}`] = 'x';
    save.goldenMedals = 9;
    let due = characterUnlocksDue(save).map((c) => c.id);
    expect(due).not.toContain('bongani');
    expect(due).not.toContain('zola');
    save.achievements.a24 = 'x';
    save.goldenMedals = 10;
    due = characterUnlocksDue(save).map((c) => c.id);
    expect(due).toContain('bongani');
    expect(due).toContain('zola');
  });

  it('Rand characters are never auto-unlocked, only bought', () => {
    const save = defaultSave();
    save.rand = 1e6;
    const due = characterUnlocksDue(save).map((c) => c.id);
    expect(due).not.toContain('thandi');
    expect(due).not.toContain('kagiso');
  });

  it('reports requirement progress', () => {
    const save = defaultSave();
    save.rand = 1000;
    const r = characterRequirement(save, { kind: 'rand', cost: 2500 });
    expect(r.met).toBe(false);
    expect(r.current).toBe(1000);
    expect(r.buyable).toBe(true);
    save.rand = 2500;
    expect(characterRequirement(save, { kind: 'rand', cost: 2500 }).met).toBe(true);
  });

  it('every character has a free default outfit and a rare or earned one', () => {
    for (const c of CHARACTERS) {
      expect(c.outfits[0]?.unlock.kind).toBe('default');
      expect(c.outfits.some((o) => o.unlock.kind === 'rand')).toBe(true);
      expect(
        c.outfits.some((o) => o.unlock.kind === 'achievement' || o.unlock.kind === 'level'),
      ).toBe(true);
    }
    const ids = ALL_OUTFITS.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('achievement-only outfits point at real achievements', () => {
    for (const o of ALL_OUTFITS) {
      if (o.unlock.kind === 'achievement') {
        expect(ACHIEVEMENTS.some((a) => a.id === (o.unlock as { id: string }).id)).toBe(true);
      }
    }
  });

  it('level and achievement outfits unlock when earned', () => {
    const save = defaultSave();
    expect(outfitUnlocksDue(save)).toEqual([]);
    save.player.xp = xpForLevel(8);
    expect(outfitUnlocksDue(save)).toContain('lazi_night');
    save.achievements.stadium = 'x';
    expect(outfitUnlocksDue(save)).toContain('lazi_gold');
  });

  it('recolor merges the base look with the outfit', () => {
    const c = recolorFor('thandi', 'thandi_green');
    expect(c.White).toBe(0x1e8a4c);
    expect(c.Skin).toBe(getCharacter('thandi').base.Skin);
    // Unknown outfit falls back to the character's first outfit.
    expect(recolorFor('thandi', 'nope').White).toBe(0xff7a1a);
  });
});

/* ---------------------------------------------------------------- names */

describe('player names', () => {
  it('accepts normal names and trims them', () => {
    expect(validateName('  Lindiwe ')).toEqual({ ok: true, name: 'Lindiwe' });
    expect(validateName('Sipho M')).toEqual({ ok: true, name: 'Sipho M' });
    expect(validateName('Zola_99')).toEqual({ ok: true, name: 'Zola_99' });
  });

  it('enforces 3 to 16 characters', () => {
    expect(validateName('ab').ok).toBe(false);
    expect(validateName('abc').ok).toBe(true);
    expect(validateName('a'.repeat(16)).ok).toBe(true);
    expect(validateName('a'.repeat(17)).ok).toBe(false);
  });

  it('rejects bad words, including disguised ones', () => {
    expect(validateName('shitface').ok).toBe(false);
    expect(validateName('F.u.c.k').ok).toBe(false);
    expect(validateName('sh1t head').ok).toBe(false);
    expect(validateName('fuuuck').ok).toBe(false);
  });

  it('does not refuse ordinary names that merely contain short words', () => {
    for (const n of [
      'Essex',
      'Hancock',
      'Draper',
      'Swank',
      'Lucas',
      'Bob',
      'Nigel',
      'Kaya',
      'Fagan',
    ]) {
      expect(validateName(n).ok, n).toBe(true);
    }
  });

  it('rejects odd characters and symbol-only names', () => {
    expect(validateName('<script>').ok).toBe(false);
    expect(validateName('___').ok).toBe(false);
  });
});

/* --------------------------------------------------------- login streak */

describe('daily login calendar', () => {
  const fresh = (): LoginState => ({ lastClaim: null, day: 0, total: 0 });

  it('the first ever claim is day 1', () => {
    const s = loginStatus(fresh(), '2026-03-10');
    expect(s).toEqual({ canClaim: true, day: 1, streakBroken: false });
  });

  it('claims consecutive days in order and pays each day once', () => {
    let login = fresh();
    for (let day = 1; day <= 7; day++) {
      const date = `2026-03-${String(9 + day).padStart(2, '0')}`;
      const claim = claimLogin(login, date);
      expect(claim?.day).toBe(day);
      login = (claim as NonNullable<typeof claim>).login;
      expect(claimLogin(login, date)).toBeNull();
    }
    expect(login.total).toBe(7);
  });

  it('day 7 is the biggest reward', () => {
    let login = fresh();
    const rewards = [];
    for (let day = 1; day <= 7; day++) {
      const claim = claimLogin(login, `2026-03-${String(9 + day).padStart(2, '0')}`);
      rewards.push(claim?.reward);
      login = (claim as NonNullable<typeof claim>).login;
    }
    expect(rewards[6]?.rand).toBe(1000);
    expect(rewards[6]?.medals).toBe(1);
    expect(rewards[6]?.boxes).toBe(1);
  });

  it('starts a new week after day 7', () => {
    const login: LoginState = { lastClaim: '2026-03-16', day: 7, total: 7 };
    expect(loginStatus(login, '2026-03-17')).toEqual({
      canClaim: true,
      day: 1,
      streakBroken: false,
    });
  });

  it('resets the streak to day 1 if a day is missed', () => {
    const login: LoginState = { lastClaim: '2026-03-12', day: 3, total: 3 };
    expect(loginStatus(login, '2026-03-13').day).toBe(4);
    const missed = loginStatus(login, '2026-03-14');
    expect(missed.day).toBe(1);
    expect(missed.streakBroken).toBe(true);
  });

  it('works across month and year boundaries', () => {
    const login: LoginState = { lastClaim: '2026-12-31', day: 2, total: 2 };
    expect(loginStatus(login, '2027-01-01').day).toBe(3);
    expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1);
  });

  it('never pays twice when the device clock goes backwards', () => {
    const login: LoginState = { lastClaim: '2026-03-12', day: 3, total: 3 };
    expect(loginStatus(login, '2026-03-05').canClaim).toBe(false);
    expect(claimLogin(login, '2026-03-12')).toBeNull();
  });

  it('formats local dates', () => {
    expect(dateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

/* -------------------------------------------------------------- missions */

describe('daily missions', () => {
  it('rolls three different missions, the same for the same date', () => {
    const a = rollDailySet('2026-03-10', 1);
    const b = rollDailySet('2026-03-10', 1);
    expect(a).toHaveLength(MISSIONS.perDay);
    expect(a).toEqual(b);
    expect(new Set(a.map((m) => m.templateId)).size).toBe(3);
  });

  it('rotates: different days give different sets', () => {
    const seen = new Set<string>();
    for (let d = 1; d <= 28; d++) {
      seen.add(
        rollDailySet(`2026-03-${String(d).padStart(2, '0')}`, 1)
          .map((m) => m.templateId)
          .join(','),
      );
    }
    expect(seen.size).toBeGreaterThan(10);
  });

  it('every template shows up eventually', () => {
    const used = new Set<string>();
    for (let d = 1; d <= 60; d++) {
      const date = dateKey(new Date(2026, 0, d));
      for (const m of rollDailySet(date, 10)) used.add(m.templateId);
    }
    expect(used.size).toBe(MISSION_TEMPLATES.length);
  });

  it('gets harder as the player levels up', () => {
    const easy = rollDailySet('2026-03-10', 1);
    const hard = rollDailySet('2026-03-10', 30);
    const t = (list: typeof easy) => list.reduce((s, m) => s + m.tier, 0);
    expect(t(hard)).toBeGreaterThan(t(easy));
  });

  const blank = (): MissionState => ({
    date: null,
    list: [],
    rerolls: 0,
    lastSetDate: null,
    streak: 0,
    bestStreak: 0,
    setsCompleted: 0,
  });

  it('only starts a new set when the day changes', () => {
    const state = blank();
    expect(ensureDaily(state, '2026-03-10', 1)).toBe(true);
    state.list[0]!.progress = 5;
    expect(ensureDaily(state, '2026-03-10', 1)).toBe(false);
    expect(state.list[0]?.progress).toBe(5);
    expect(ensureDaily(state, '2026-03-11', 1)).toBe(true);
    expect(state.list.every((m) => m.progress === 0)).toBe(true);
  });

  it('sums cumulative missions across runs and keeps the best for single-run missions', () => {
    const state = blank();
    state.date = '2026-03-10';
    state.list = [
      { templateId: 'coins', tier: 0, target: 250, progress: 0, reward: 100, done: false },
      { templateId: 'oneRunDistance', tier: 0, target: 800, progress: 0, reward: 120, done: false },
      { templateId: 'runs', tier: 0, target: 3, progress: 0, reward: 80, done: false },
    ];
    applyRunToMissions(state, run({ coins: 100, distance: 600 }), '2026-03-10');
    applyRunToMissions(state, run({ coins: 100, distance: 300 }), '2026-03-10');
    expect(state.list[0]?.progress).toBe(200);
    expect(state.list[1]?.progress).toBe(600);
    expect(state.list[2]?.progress).toBe(2);
    const result = applyRunToMissions(state, run({ coins: 100, distance: 900 }), '2026-03-10');
    expect(result.completed.map((m) => m.templateId).sort()).toEqual([
      'coins',
      'oneRunDistance',
      'runs',
    ]);
    expect(result.setCompleted).toBe(true);
    expect(state.setsCompleted).toBe(1);
  });

  it('does not count a finished mission again', () => {
    const state = blank();
    state.date = '2026-03-10';
    state.list = [{ templateId: 'runs', tier: 0, target: 1, progress: 0, reward: 80, done: false }];
    expect(applyRunToMissions(state, run(), '2026-03-10').completed).toHaveLength(1);
    expect(applyRunToMissions(state, run(), '2026-03-10').completed).toHaveLength(0);
    expect(state.setsCompleted).toBe(1);
  });

  it('a completed set builds a day streak that lapses when a day is missed', () => {
    const state = blank();
    for (const date of ['2026-03-10', '2026-03-11', '2026-03-12']) {
      state.date = date;
      state.list = [
        { templateId: 'runs', tier: 0, target: 1, progress: 0, reward: 80, done: false },
      ];
      applyRunToMissions(state, run(), date);
    }
    expect(state.streak).toBe(3);
    expect(state.bestStreak).toBe(3);
    expect(currentStreak(state, '2026-03-12')).toBe(3);
    expect(currentStreak(state, '2026-03-13')).toBe(3); // still alive: today's set isn't due yet
    expect(currentStreak(state, '2026-03-14')).toBe(0); // missed a whole day
    // Completing a set after a gap restarts at 1 but remembers the best.
    state.date = '2026-03-20';
    state.list = [{ templateId: 'runs', tier: 0, target: 1, progress: 0, reward: 80, done: false }];
    applyRunToMissions(state, run(), '2026-03-20');
    expect(state.streak).toBe(1);
    expect(state.bestStreak).toBe(3);
  });

  it('rerolls an unfinished mission into a different type, never a finished one', () => {
    const state = blank();
    ensureDaily(state, '2026-03-10', 1);
    const before = state.list.map((m) => m.templateId);
    expect(rerollMission(state, 0, createRng(3))).toBe(true);
    expect(state.list[0]?.templateId).not.toBe(before[0]);
    expect(new Set(state.list.map((m) => m.templateId)).size).toBe(3);
    state.list[1]!.done = true;
    expect(rerollMission(state, 1, createRng(3))).toBe(false);
    expect(rerollMission(state, 9, createRng(3))).toBe(false);
  });

  it('the permanent multiplier grows per set and is capped', () => {
    expect(missionBonus(0)).toBe(1);
    expect(missionBonus(4)).toBeCloseTo(1 + 4 * MISSIONS.bonusPerSet);
    expect(missionBonus(10_000)).toBe(1 + MISSIONS.bonusCap);
  });
});

/* ----------------------------------------------------------- achievements */

describe('achievements', () => {
  it('has at least 30, with unique ids, and includes the ones the brief names', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(30);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    const byId = (id: string) => ACHIEVEMENTS.find((a) => a.id === id);
    expect(byId('outrun_50')).toMatchObject({ stat: 'outruns', target: 50 });
    expect(byId('stadium')).toMatchObject({ stat: 'bestZone', target: 4 });
    expect(byId('rand_run_1000')).toMatchObject({ stat: 'bestRunCoins', target: 1000 });
    expect(byId('no_stumble_2k')).toMatchObject({ stat: 'bestNoStumble', target: 2000 });
  });

  it('unlocks when the target is reached and not before', () => {
    const save = defaultSave();
    save.counters.outruns = 49;
    expect(newlyEarned(save).map((a) => a.id)).not.toContain('outrun_50');
    save.counters.outruns = 50;
    expect(newlyEarned(save).map((a) => a.id)).toContain('outrun_50');
    save.achievements.outrun_50 = '2026-03-10';
    expect(newlyEarned(save).map((a) => a.id)).not.toContain('outrun_50');
  });
});

/* ------------------------------------------------------------ mystery box */

describe('mystery boxes', () => {
  it('always give something, over many rolls', () => {
    const save = defaultSave();
    const rng = createRng(9);
    const kinds = new Set<string>();
    for (let i = 0; i < 400; i++) kinds.add(rollBox(save, rng).kind);
    expect(kinds).toEqual(
      new Set(['rand', 'upgrade', 'piece', 'medal', 'headStart', 'secondChance']),
    );
  });

  it('drops outfit pieces once a character with a purchasable outfit is owned', () => {
    const save = defaultSave();
    const rng = createRng(4);
    const kinds = new Set<string>();
    for (let i = 0; i < 400; i++) kinds.add(rollBox(save, rng).kind);
    expect(kinds.has('piece')).toBe(true); // Lazi has a Rand outfit
  });

  it('turns an exhausted reward into Rand', () => {
    const save = defaultSave();
    for (const id of POWER_UP_IDS) save.upgrades[id] = UPGRADE_MAX;
    save.outfits.owned = ALL_OUTFITS.filter((o) => o.unlock.kind === 'rand').map((o) => o.id);
    const rng = createRng(2);
    for (let i = 0; i < 300; i++) {
      const kind = rollBox(save, rng).kind;
      expect(['upgrade', 'piece']).not.toContain(kind);
    }
  });
});

/* -------------------------------------------------------- Progression flow */

describe('Progression service', () => {
  it('names the runner and refuses bad names', () => {
    const { p } = makeProgression();
    expect(p.setName('xx').ok).toBe(false);
    expect(p.name).toBeNull();
    expect(p.setName('Thabo').ok).toBe(true);
    expect(p.name).toBe('Thabo');
  });

  it('pays XP for a run, banks Rand and records the leaderboard with name and character', () => {
    const { p } = makeProgression();
    p.setName('Thabo');
    const report = p.applyRun(run({ distance: 1000, coins: 200, score: 5000 }));
    expect(report.xp.run).toBe(xpForRun({ distance: 1000, coins: 200, zone: 0 }));
    expect(p.data.player.xp).toBe(report.xp.total);
    expect(p.data.rand).toBeGreaterThanOrEqual(200);
    expect(p.data.stats.runs).toBe(1);
    expect(p.data.leaderboard[0]).toMatchObject({ name: 'Tester', character: 'lazi', score: 5000 });
    expect(report.newHighScore).toBe(true);
  });

  it('levels up with rewards and emits events', () => {
    const { p } = makeProgression();
    const events: string[] = [];
    p.onEvent((e) => events.push(e.type));
    const report = p.applyRun(run({ distance: 3000, coins: 800, zone: 2 }));
    expect(report.levelUps.length).toBeGreaterThan(0);
    expect(p.level.level).toBe(report.level);
    expect(events).toContain('levelUp');
    expect(events).toContain('achievement');
  });

  it('unlocks Sipho by reaching zone 3 in a run', () => {
    const { p } = makeProgression();
    const report = p.applyRun(run({ zone: 2 }));
    expect(p.data.characters.owned).toContain('sipho');
    expect(report.unlocks.some((u) => u.id === 'sipho')).toBe(true);
    expect(p.selectCharacter('sipho')).toBe(true);
    expect(p.perks().magnetDurationMul).toBe(1.5);
  });

  it('cannot select or wear what is not owned', () => {
    const { p } = makeProgression();
    expect(p.selectCharacter('thandi')).toBe(false);
    expect(p.selectOutfit('lazi', 'lazi_township')).toBe(false);
    expect(p.selectOutfit('lazi', 'thandi_court')).toBe(false);
    expect(p.selectOutfit('lazi', 'lazi_trail')).toBe(true);
  });

  it('buying takes Rand, unlocks the item, and refuses when short', () => {
    const { p, store } = makeProgression();
    expect(p.buyCharacter('thandi')).toEqual({ ok: false, reason: 'Not enough Rand.' });
    store.edit((d) => {
      d.rand = 3000;
      d.achievements.buy_1 = 'x'; // so the first-purchase bonus doesn't muddy the arithmetic
    });
    expect(p.buyCharacter('thandi').ok).toBe(true);
    expect(p.data.rand).toBe(500);
    expect(p.data.characters.owned).toContain('thandi');
    expect(p.buyCharacter('thandi').ok).toBe(false);
    expect(p.buyOutfit('thandi_green').ok).toBe(false); // 1,200 > 500
    expect(p.buyOutfit('sipho_away').ok).toBe(false); // character not owned
  });

  it('upgrades power-ups with doubling costs up to the cap', () => {
    const { p, store } = makeProgression();
    store.edit((d) => {
      d.rand = 1_000_000;
      d.achievements.buy_1 = 'x';
    });
    for (let level = 0; level < UPGRADE_MAX; level++) {
      const before = p.data.rand;
      expect(p.buyUpgrade('magnet').ok).toBe(true);
      expect(before - p.data.rand).toBe(upgradeCost('magnet', level));
    }
    expect(p.data.upgrades.magnet).toBe(UPGRADE_MAX);
    expect(p.buyUpgrade('magnet').ok).toBe(false);
  });

  it('sells Head Start and Second Chance, and spends them one at a time', () => {
    const { p, store } = makeProgression();
    store.edit((d) => {
      d.rand = 5000;
    });
    expect(p.buyItem('headStart').ok).toBe(true);
    expect(p.data.items.headStart).toBe(1);
    expect(p.useItem('headStart')).toBe(true);
    expect(p.useItem('headStart')).toBe(false);
    expect(p.useItem('secondChance')).toBe(false);
  });

  it('opens boxes from the inventory only', () => {
    const { p, store } = makeProgression('2026-03-10', 5);
    expect(p.openBox().ok).toBe(false);
    store.edit((d) => {
      d.rand = 500;
    });
    expect(p.buyBox().ok).toBe(true);
    expect(p.data.items.boxes).toBe(1);
    const opened = p.openBox();
    expect(opened.ok).toBe(true);
    expect(p.data.items.boxes).toBe(0);
    expect(p.data.counters.boxesOpened).toBe(1);
  });

  it('claims the login reward once a day and again the next day', () => {
    const { p, setDate } = makeProgression('2026-03-10');
    const first = p.claimLoginReward();
    expect(first).toMatchObject({ ok: true, value: { day: 1 } });
    expect(p.claimLoginReward().ok).toBe(false);
    setDate('2026-03-11');
    expect(p.claimLoginReward()).toMatchObject({ ok: true, value: { day: 2 } });
    setDate('2026-03-14');
    expect(p.claimLoginReward()).toMatchObject({ ok: true, value: { day: 1 } });
  });

  it('completing a mission set pays rewards and raises the permanent multiplier', () => {
    const { p, store, setDate } = makeProgression('2026-03-10');
    p.ensureMissions();
    store.edit((d) => {
      d.missions.list = [
        { templateId: 'runs', tier: 0, target: 1, progress: 0, reward: 80, done: false },
        { templateId: 'coins', tier: 0, target: 50, progress: 0, reward: 100, done: false },
        { templateId: 'distance', tier: 0, target: 100, progress: 0, reward: 100, done: false },
      ];
    });
    expect(p.scoreBonus()).toBe(1);
    const report = p.applyRun(run({ coins: 60, distance: 200 }));
    expect(report.missionsCompleted).toHaveLength(3);
    expect(report.setCompleted).toBe(true);
    expect(p.data.missions.setsCompleted).toBe(1);
    expect(p.scoreBonus()).toBeCloseTo(1 + MISSIONS.bonusPerSet);
    expect(p.data.counters.missionsCompleted).toBe(3);
    // Next day: a fresh set appears, the bonus stays.
    setDate('2026-03-11');
    p.ensureMissions();
    expect(p.data.missions.list.every((m) => !m.done)).toBe(true);
    expect(p.scoreBonus()).toBeCloseTo(1 + MISSIONS.bonusPerSet);
  });

  it('rerolling costs Rand', () => {
    const { p, store } = makeProgression();
    p.ensureMissions();
    expect(p.rerollMission(0).ok).toBe(false);
    store.edit((d) => {
      d.rand = 1000;
    });
    expect(p.rerollMission(0).ok).toBe(true);
    expect(p.data.rand).toBe(1000 - MISSIONS.rerollCost);
  });

  it('earning the 25th achievement unlocks Bongani', () => {
    const { p, store } = makeProgression();
    store.edit((d) => {
      // The last 24: none of these can be earned by the short run below.
      for (const a of ACHIEVEMENTS.slice(-24)) d.achievements[a.id] = '2026-01-01';
    });
    expect(p.data.characters.owned).not.toContain('bongani');
    p.applyRun(run({ distance: 1000 }));
    expect(Object.keys(p.data.achievements).length).toBeGreaterThanOrEqual(25);
    expect(p.data.characters.owned).toContain('bongani');
  });

  it('level rewards unlock level outfits and badges', () => {
    const { p, store } = makeProgression();
    store.edit((d) => {
      d.player.xp = xpForLevel(5) - 1;
    });
    p.applyRun(run({ distance: 20000, coins: 0 }));
    expect(p.level.level).toBeGreaterThanOrEqual(8);
    expect(p.data.outfits.owned).toContain('lazi_night');
    expect(p.data.player.badges).toContain('rookie');
  });

  it('keeps the save valid after a long sequence of actions', () => {
    const { p, store } = makeProgression();
    for (let i = 0; i < 40; i++)
      p.applyRun(run({ distance: 800 + i * 50, zone: i % 4, coins: 150 }));
    const snapshot = structuredClone(store.current);
    expect(store.load()).toBeDefined();
    expect(snapshot.player.xp).toBeGreaterThan(0);
    expect(snapshot.leaderboard.length).toBeLessThanOrEqual(10);
  });
});
