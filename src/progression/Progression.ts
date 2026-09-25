import {
  CHARACTERS,
  defaultOutfitId,
  getCharacter,
  getOutfit,
  perksFor,
  type CharacterDef,
  type Perks,
} from '../config/characters';
import {
  BOX,
  ITEMS,
  MISSIONS,
  UPGRADE_MAX,
  XP,
  upgradeCost,
  type ItemId,
  type PowerUpId,
  type Reward,
} from '../config/progression';
import type { Rng } from '../core/random';
import type { SaveManager } from '../save/SaveManager';
import type { MissionInstance, SaveData } from '../save/schema';
import { newlyEarned, type AchievementDef } from './achievements';
import { rollBox, type BoxReward } from './box';
import { dateKey } from './dates';
import { claimLogin, loginStatus, type LoginStatus } from './login';
import {
  applyRunToMissions,
  currentStreak,
  ensureDaily,
  missionBonus,
  rerollMission,
} from './missions';
import type { RunStats } from './types';
import { characterRequirement, characterUnlocksDue, outfitUnlocksDue } from './unlocks';
import { validateName, type NameCheck } from './names';
import { levelFromXp, levelReward, xpForRun, type LevelInfo } from './xp';

export interface UnlockNote {
  kind: 'character' | 'outfit';
  id: string;
  name: string;
}

/** Everything that changed because of one action, for the UI to celebrate. */
export interface Report {
  levelBefore: number;
  level: number;
  /** XP gained, and where it came from. */
  xp: { run: number; missions: number; achievements: number; total: number };
  /** Rand paid out by rewards (not counting Rand collected while running). */
  bonusRand: number;
  gained: Required<Pick<Reward, 'boxes' | 'medals' | 'headStart' | 'secondChance'>>;
  levelUps: Array<{ level: number; reward: Reward }>;
  achievements: AchievementDef[];
  unlocks: UnlockNote[];
  missionsCompleted: MissionInstance[];
  setCompleted: boolean;
  newHighScore: boolean;
  newBestZone: boolean;
}

export type ProgressEvent =
  | { type: 'achievement'; def: AchievementDef }
  | { type: 'levelUp'; level: number; reward: Reward }
  | { type: 'unlock'; note: UnlockNote }
  | { type: 'missionDone'; mission: MissionInstance }
  | { type: 'setDone' };

function emptyReport(level: number): Report {
  return {
    levelBefore: level,
    level,
    xp: { run: 0, missions: 0, achievements: 0, total: 0 },
    bonusRand: 0,
    gained: { boxes: 0, medals: 0, headStart: 0, secondChance: 0 },
    levelUps: [],
    achievements: [],
    unlocks: [],
    missionsCompleted: [],
    setCompleted: false,
    newHighScore: false,
    newBestZone: false,
  };
}

export type Result<T = void> = { ok: true; value: T } | { ok: false; reason: string };
const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });

/**
 * The rules of the meta-game (XP, missions, unlocks, shop, rewards) on top of the save file.
 * Every change goes through `mutate`, which edits a copy of the save, settles anything that
 * became due (achievements, unlocks, level rewards) and saves once.
 */
export class Progression {
  private readonly listeners = new Set<(e: ProgressEvent) => void>();

  constructor(
    private readonly store: SaveManager,
    private readonly now: () => Date = () => new Date(),
    private readonly rng: Rng = Math.random,
  ) {}

  get data(): Readonly<SaveData> {
    return this.store.current;
  }

  get today(): string {
    return dateKey(this.now());
  }

  onEvent(listener: (e: ProgressEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /* ---------------------------------------------------------------- reads */

  get name(): string | null {
    return this.data.player.name;
  }

  get level(): LevelInfo {
    return levelFromXp(this.data.player.xp);
  }

  get selectedCharacter(): CharacterDef {
    return getCharacter(this.data.characters.selected);
  }

  selectedOutfitId(characterId: string): string {
    const worn = this.data.outfits.selected[characterId];
    return worn ?? defaultOutfitId(characterId as never);
  }

  perks(): Perks {
    return perksFor(this.selectedCharacter.id);
  }

  /** Permanent score multiplier from completed mission sets (1 = none yet). */
  scoreBonus(): number {
    return missionBonus(this.data.missions.setsCompleted);
  }

  missionStreak(): number {
    return currentStreak(this.data.missions, this.today);
  }

  loginStatus(): LoginStatus {
    return loginStatus(this.data.login, this.today);
  }

  canAfford(cost: number): boolean {
    return this.data.rand >= cost;
  }

  /* -------------------------------------------------------------- profile */

  setName(input: string): NameCheck {
    const check = validateName(input);
    if (!check.ok) return check;
    this.mutate((d) => {
      d.player.name = check.name;
    });
    return check;
  }

  markTutorialDone(): void {
    if (this.data.player.tutorialDone) return;
    this.mutate((d) => {
      d.player.tutorialDone = true;
    });
  }

  resetTutorial(): void {
    this.mutate((d) => {
      d.player.tutorialDone = false;
    });
  }

  /** Make sure characters/outfits/achievements that are already earned are recorded (e.g. after a migration). */
  settleNow(): Report {
    return this.mutate(() => undefined).report;
  }

  /* ------------------------------------------------------------ selection */

  selectCharacter(id: string): boolean {
    if (!this.data.characters.owned.includes(id)) return false;
    this.mutate((d) => {
      d.characters.selected = id;
    });
    return true;
  }

  selectOutfit(characterId: string, outfitId: string): boolean {
    const outfit = getOutfit(outfitId);
    if (!outfit || outfit.character !== characterId) return false;
    const owned =
      outfitId === defaultOutfitId(outfit.character) || this.data.outfits.owned.includes(outfitId);
    if (!owned) return false;
    this.mutate((d) => {
      d.outfits.selected[characterId] = outfitId;
    });
    return true;
  }

  /* ----------------------------------------------------------------- shop */

  buyCharacter(id: string): Result {
    const def = CHARACTERS.find((c) => c.id === id);
    if (!def || def.unlock.kind !== 'rand') return fail('Not for sale.');
    if (this.data.characters.owned.includes(id)) return fail('Already yours.');
    if (!this.canAfford(def.unlock.cost)) return fail('Not enough Rand.');
    const cost = def.unlock.cost;
    this.mutate((d) => {
      d.rand -= cost;
      d.characters.owned.push(id);
      d.counters.purchases++;
    });
    return { ok: true, value: undefined };
  }

  buyOutfit(id: string): Result {
    const outfit = getOutfit(id);
    if (!outfit || outfit.unlock.kind !== 'rand') return fail('Not for sale.');
    if (!this.data.characters.owned.includes(outfit.character)) {
      return fail('Unlock the character first.');
    }
    if (this.data.outfits.owned.includes(id)) return fail('Already yours.');
    if (!this.canAfford(outfit.unlock.cost)) return fail('Not enough Rand.');
    const cost = outfit.unlock.cost;
    this.mutate((d) => {
      d.rand -= cost;
      d.outfits.owned.push(id);
      delete d.outfits.pieces[id];
      d.counters.purchases++;
    });
    return { ok: true, value: undefined };
  }

  buyUpgrade(id: PowerUpId): Result<number> {
    const level = this.data.upgrades[id];
    if (level >= UPGRADE_MAX) return fail('Fully upgraded.');
    const cost = upgradeCost(id, level);
    if (!this.canAfford(cost)) return fail('Not enough Rand.');
    this.mutate((d) => {
      d.rand -= cost;
      d.upgrades[id]++;
      d.counters.purchases++;
    });
    return { ok: true, value: level + 1 };
  }

  buyItem(id: ItemId): Result {
    const item = ITEMS[id];
    if (this.data.items[id] >= item.max) return fail(`You can carry ${item.max}.`);
    if (!this.canAfford(item.price)) return fail('Not enough Rand.');
    this.mutate((d) => {
      d.rand -= item.price;
      d.items[id]++;
      d.counters.purchases++;
    });
    return { ok: true, value: undefined };
  }

  buyBox(): Result {
    if (!this.canAfford(BOX.price)) return fail('Not enough Rand.');
    this.mutate((d) => {
      d.rand -= BOX.price;
      d.items.boxes++;
      d.counters.purchases++;
    });
    return { ok: true, value: undefined };
  }

  /** Open one mystery box from the inventory. */
  openBox(): Result<BoxReward> {
    if (this.data.items.boxes <= 0) return fail('No boxes to open.');
    const { value } = this.mutate((d, r) => {
      d.items.boxes--;
      d.counters.boxesOpened++;
      const reward = rollBox(d, this.rng);
      switch (reward.kind) {
        case 'rand':
          d.rand += reward.amount;
          break;
        case 'upgrade':
          d.upgrades[reward.powerUp]++;
          break;
        case 'piece': {
          const have = (d.outfits.pieces[reward.outfit] ?? 0) + 1;
          if (have >= BOX.piecesNeeded) {
            delete d.outfits.pieces[reward.outfit];
            d.outfits.owned.push(reward.outfit);
            const o = getOutfit(reward.outfit);
            if (o) r.unlocks.push({ kind: 'outfit', id: o.id, name: o.name });
          } else d.outfits.pieces[reward.outfit] = have;
          break;
        }
        case 'medal':
          d.goldenMedals++;
          break;
        case 'headStart':
          d.items.headStart = Math.min(ITEMS.headStart.max, d.items.headStart + 1);
          break;
        case 'secondChance':
          d.items.secondChance = Math.min(ITEMS.secondChance.max, d.items.secondChance + 1);
          break;
      }
      return reward;
    });
    return { ok: true, value };
  }

  /** Spend one Head Start / Second Chance. Returns false if none are left. */
  useItem(id: ItemId): boolean {
    if (this.data.items[id] <= 0) return false;
    this.mutate((d) => {
      d.items[id]--;
    });
    return true;
  }

  /* ------------------------------------------------------------- calendar */

  claimLoginReward(): Result<{ day: number; reward: Reward }> {
    if (!this.loginStatus().canClaim) return fail('Already claimed today.');
    const { value } = this.mutate((d, r) => {
      const claim = claimLogin(d.login, this.today);
      if (!claim) return null;
      d.login = claim.login;
      this.grant(d, r, claim.reward);
      return { day: claim.day, reward: claim.reward };
    });
    return value ? { ok: true, value } : fail('Already claimed today.');
  }

  /* ------------------------------------------------------------- missions */

  /** Start today's missions if it is a new day. Call whenever the menu opens. */
  ensureMissions(): void {
    if (this.data.missions.date === this.today && this.data.missions.list.length > 0) return;
    const level = this.level.level;
    this.mutate((d) => {
      ensureDaily(d.missions, this.today, level);
    });
  }

  rerollMission(index: number): Result {
    const m = this.data.missions.list[index];
    if (!m || m.done) return fail('That mission is finished.');
    if (!this.canAfford(MISSIONS.rerollCost)) return fail('Not enough Rand.');
    const { value } = this.mutate((d) => {
      if (!rerollMission(d.missions, index, this.rng)) return false;
      d.rand -= MISSIONS.rerollCost;
      return true;
    });
    return value ? { ok: true, value: undefined } : fail('No other missions to swap in.');
  }

  /* ------------------------------------------------------------------ run */

  /** Bank a finished run: records it, pays XP and missions, and settles achievements and unlocks. */
  applyRun(run: RunStats): Report {
    const record = this.store.recordRun({
      name: run.name,
      character: run.character,
      score: run.score,
      distance: run.distance,
      coins: run.coins,
      zone: run.zone,
    });
    const level = this.level.level;
    const { report } = this.mutate((d, r) => {
      r.newHighScore = record.newHighScore;
      r.newBestZone = record.newBestZone;
      const c = d.counters;
      c.outruns += run.outruns;
      c.jumps += run.jumps;
      c.slides += run.slides;
      c.nearMisses += run.nearMisses;
      c.stumbles += run.stumbles;
      c.powerUps += run.powerUps;
      if (run.caught) c.caught++;
      c.bestNoStumble = Math.max(c.bestNoStumble, Math.floor(run.noStumble));
      c.bestRunCoins = Math.max(c.bestRunCoins, run.coins);

      this.addXp(d, r, xpForRun(run), 'run');

      ensureDaily(d.missions, this.today, level);
      const result = applyRunToMissions(d.missions, run, this.today);
      for (const m of result.completed) {
        d.rand += m.reward;
        r.bonusRand += m.reward;
        c.missionsCompleted++;
        r.missionsCompleted.push(m);
        this.addXp(d, r, XP.perMission, 'missions');
      }
      if (result.setCompleted) {
        r.setCompleted = true;
        this.grant(d, r, {
          rand: MISSIONS.setRewardRand,
          boxes: d.missions.setsCompleted % 3 === 0 ? 1 : 0,
        });
        this.addXp(d, r, XP.perMissionSet, 'missions');
      }
    });
    return report;
  }

  /* -------------------------------------------------------------- internals */

  private mutate<T>(fn: (d: SaveData, r: Report) => T): { value: T; report: Report } {
    let report = emptyReport(this.level.level);
    let value = undefined as T;
    this.store.edit((d) => {
      report = emptyReport(levelFromXp(d.player.xp).level);
      value = fn(d, report);
      this.settle(d, report);
    });
    this.publish(report);
    return { value, report };
  }

  private publish(r: Report): void {
    if (this.listeners.size === 0) return;
    const send = (e: ProgressEvent): void => {
      for (const l of this.listeners) l(e);
    };
    for (const note of r.unlocks) send({ type: 'unlock', note });
    for (const def of r.achievements) send({ type: 'achievement', def });
    for (const lu of r.levelUps) send({ type: 'levelUp', level: lu.level, reward: lu.reward });
    for (const mission of r.missionsCompleted) send({ type: 'missionDone', mission });
    if (r.setCompleted) send({ type: 'setDone' });
  }

  /** Keep granting whatever became due (earned characters and outfits, achievements) until stable. */
  private settle(d: SaveData, r: Report): void {
    for (let pass = 0; pass < 25; pass++) {
      let changed = false;
      for (const c of characterUnlocksDue(d)) {
        d.characters.owned.push(c.id);
        r.unlocks.push({ kind: 'character', id: c.id, name: c.name });
        changed = true;
      }
      for (const id of outfitUnlocksDue(d)) {
        d.outfits.owned.push(id);
        r.unlocks.push({ kind: 'outfit', id, name: getOutfit(id)?.name ?? id });
        changed = true;
      }
      for (const def of newlyEarned(d)) {
        d.achievements[def.id] = this.now().toISOString();
        d.rand += def.rand;
        r.bonusRand += def.rand;
        r.achievements.push(def);
        this.addXp(d, r, XP.perAchievement, 'achievements');
        changed = true;
      }
      if (!changed) return;
    }
  }

  private addXp(
    d: SaveData,
    r: Report,
    amount: number,
    source: 'run' | 'missions' | 'achievements',
  ) {
    if (amount <= 0) return;
    d.player.xp += amount;
    r.xp[source] += amount;
    r.xp.total += amount;
    const level = levelFromXp(d.player.xp).level;
    while (r.level < level) {
      r.level++;
      const reward = levelReward(r.level);
      r.levelUps.push({ level: r.level, reward });
      this.grant(d, r, reward);
    }
  }

  private grant(d: SaveData, r: Report, reward: Reward): void {
    if (reward.rand) {
      d.rand += reward.rand;
      r.bonusRand += reward.rand;
    }
    if (reward.boxes) {
      d.items.boxes += reward.boxes;
      r.gained.boxes += reward.boxes;
    }
    if (reward.medals) {
      d.goldenMedals += reward.medals;
      r.gained.medals += reward.medals;
    }
    if (reward.headStart) {
      d.items.headStart = Math.min(ITEMS.headStart.max, d.items.headStart + reward.headStart);
      r.gained.headStart += reward.headStart;
    }
    if (reward.secondChance) {
      d.items.secondChance = Math.min(
        ITEMS.secondChance.max,
        d.items.secondChance + reward.secondChance,
      );
      r.gained.secondChance += reward.secondChance;
    }
    if (reward.badge && !d.player.badges.includes(reward.badge)) d.player.badges.push(reward.badge);
  }

  /** Requirement progress for a character, for the UI. */
  requirement(def: CharacterDef): ReturnType<typeof characterRequirement> {
    return characterRequirement(this.data as SaveData, def.unlock);
  }
}
