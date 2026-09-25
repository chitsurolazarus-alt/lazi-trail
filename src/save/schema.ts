import { CHARACTERS, DEFAULT_CHARACTER, defaultOutfitId, getOutfit } from '../config/characters';
import { POWER_UP_IDS, UPGRADE_MAX, type PowerUpId } from '../config/progression';
import { QUALITY_LEVELS, type QualityLevel } from '../config/quality';

/** localStorage key. The number is the schema generation, bumped only with a migration. */
export const SAVE_KEY = 'lazitrail_save_v2';
/** Where the previous generation lived. It is read (never written or deleted) to migrate. */
export const LEGACY_SAVE_KEY_V1 = 'lazitrail_save_v1';
export const SAVE_VERSION = 2;
export const LEADERBOARD_SIZE = 10;

export interface LeaderboardEntry {
  name: string;
  /** Character id the run was played with. */
  character: string;
  score: number;
  distance: number;
  /** Index into ZONES of the furthest zone reached in that run. */
  zone: number;
  /** ISO date string. */
  date: string;
}

export interface SaveSettings {
  /** `null` until the player (or first-run detection) has chosen one. */
  quality: QualityLevel | null;
  musicVolume: number;
  sfxVolume: number;
  ambienceVolume: number;
  /** Global mute (all channels). */
  muted: boolean;
  showControls: boolean;
}

export interface SaveStats {
  runs: number;
  totalCoins: number;
  totalDistance: number;
}

export interface SavePlayer {
  /** `null` until the player has named their runner. */
  name: string | null;
  xp: number;
  badges: string[];
  tutorialDone: boolean;
}

/** Lifetime counters that achievements and missions read. */
export interface SaveCounters {
  outruns: number;
  jumps: number;
  slides: number;
  nearMisses: number;
  stumbles: number;
  caught: number;
  missionsCompleted: number;
  boxesOpened: number;
  purchases: number;
  /** Best clean stretch (metres without a stumble) in any run. */
  bestNoStumble: number;
  /** Most Rand collected in a single run. */
  bestRunCoins: number;
}

export interface MissionInstance {
  templateId: string;
  tier: 0 | 1 | 2;
  target: number;
  progress: number;
  reward: number;
  done: boolean;
}

export interface MissionState {
  /** Local date (YYYY-MM-DD) the current list was made for. */
  date: string | null;
  list: MissionInstance[];
  rerolls: number;
  /** Date the last full set was completed. */
  lastSetDate: string | null;
  /** Consecutive days a full set was completed (as of `lastSetDate`). */
  streak: number;
  bestStreak: number;
  setsCompleted: number;
}

export interface LoginState {
  /** Local date (YYYY-MM-DD) of the last claimed reward. */
  lastClaim: string | null;
  /** Calendar day (1-7) of the last claim; 0 = never. */
  day: number;
  /** Total days rewards were claimed. */
  total: number;
}

export interface SaveItems {
  headStart: number;
  secondChance: number;
  boxes: number;
}

export interface SaveData {
  version: number;
  player: SavePlayer;
  highScore: number;
  bestDistance: number;
  /** Index into ZONES of the furthest zone ever reached. */
  bestZone: number;
  /** Rand collected over all runs (lifetime, never decreases). */
  totalCoins: number;
  /** Rand available to spend. */
  rand: number;
  goldenMedals: number;
  characters: { owned: string[]; selected: string };
  outfits: {
    /** Non-default outfits the player has unlocked. */
    owned: string[];
    /** Character id -> outfit id worn. */
    selected: Record<string, string>;
    /** Mystery-box outfit pieces collected, by outfit id. */
    pieces: Record<string, number>;
  };
  /** Achievement id -> ISO date earned. */
  achievements: Record<string, string>;
  counters: SaveCounters;
  missions: MissionState;
  login: LoginState;
  items: SaveItems;
  /** Power-up upgrade level (0-5) per power-up. */
  upgrades: Record<PowerUpId, number>;
  settings: SaveSettings;
  stats: SaveStats;
  leaderboard: LeaderboardEntry[];
}

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    player: { name: null, xp: 0, badges: [], tutorialDone: false },
    highScore: 0,
    bestDistance: 0,
    bestZone: 0,
    totalCoins: 0,
    rand: 0,
    goldenMedals: 0,
    characters: { owned: [DEFAULT_CHARACTER], selected: DEFAULT_CHARACTER },
    outfits: { owned: [], selected: {}, pieces: {} },
    achievements: {},
    counters: {
      outruns: 0,
      jumps: 0,
      slides: 0,
      nearMisses: 0,
      stumbles: 0,
      caught: 0,
      missionsCompleted: 0,
      boxesOpened: 0,
      purchases: 0,
      bestNoStumble: 0,
      bestRunCoins: 0,
    },
    missions: {
      date: null,
      list: [],
      rerolls: 0,
      lastSetDate: null,
      streak: 0,
      bestStreak: 0,
      setsCompleted: 0,
    },
    login: { lastClaim: null, day: 0, total: 0 },
    items: { headStart: 0, secondChance: 0, boxes: 0 },
    upgrades: { magnet: 0, boost: 0, spikes: 0, doubleScore: 0 },
    settings: {
      quality: null,
      musicVolume: 0.7,
      sfxVolume: 0.8,
      ambienceVolume: 0.7,
      muted: false,
      showControls: true,
    },
    stats: { runs: 0, totalCoins: 0, totalDistance: 0 },
    leaderboard: [],
  };
}

/* ------------------------------------------------------------ validation */

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function num(v: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

const int = (v: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number =>
  Math.floor(num(v, fallback, min, max));

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dateOrNull = (v: unknown): string | null =>
  typeof v === 'string' && DATE_RE.test(v) ? v : null;

function strings(v: unknown, valid?: (s: string) => boolean, limit = 500): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const s of v) {
    if (typeof s === 'string' && (!valid || valid(s)) && !out.includes(s)) out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}

function stringMap(v: unknown, valid: (k: string, val: string) => boolean): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isRecord(v)) return out;
  for (const [k, val] of Object.entries(v))
    if (typeof val === 'string' && valid(k, val)) out[k] = val;
  return out;
}

function sanitizeEntry(v: unknown): LeaderboardEntry | null {
  if (!isRecord(v)) return null;
  return {
    name: typeof v.name === 'string' && v.name.trim() ? v.name.trim().slice(0, 16) : 'Runner',
    character: CHARACTERS.some((c) => c.id === v.character)
      ? (v.character as string)
      : DEFAULT_CHARACTER,
    score: num(v.score, 0),
    distance: num(v.distance, 0),
    zone: int(v.zone, 0, 0, 99),
    date: typeof v.date === 'string' ? v.date : new Date(0).toISOString(),
  };
}

function sanitizeMission(v: unknown): MissionInstance | null {
  if (!isRecord(v) || typeof v.templateId !== 'string') return null;
  const tier = int(v.tier, 0, 0, 2) as 0 | 1 | 2;
  const target = Math.max(1, num(v.target, 1));
  return {
    templateId: v.templateId,
    tier,
    target,
    progress: Math.min(target, num(v.progress, 0)),
    reward: int(v.reward, 0),
    done: v.done === true || num(v.progress, 0) >= target,
  };
}

/**
 * Turn whatever was stored into a valid, current-version SaveData. Unknown or corrupt fields fall
 * back to defaults; nothing here throws. Older versions are upgraded first (see `migrate`).
 */
export function sanitizeSave(raw: unknown): SaveData {
  const base = defaultSave();
  if (!isRecord(raw)) return base;
  const data = migrate(raw);

  const settings = isRecord(data.settings) ? data.settings : {};
  const stats = isRecord(data.stats) ? data.stats : {};
  const player = isRecord(data.player) ? data.player : {};
  const counters = isRecord(data.counters) ? data.counters : {};
  const missions = isRecord(data.missions) ? data.missions : {};
  const login = isRecord(data.login) ? data.login : {};
  const items = isRecord(data.items) ? data.items : {};
  const upgrades = isRecord(data.upgrades) ? data.upgrades : {};
  const chars = isRecord(data.characters) ? data.characters : {};
  const outfits = isRecord(data.outfits) ? data.outfits : {};
  const quality = QUALITY_LEVELS.find((q) => q === settings.quality) ?? null;

  const leaderboard = (Array.isArray(data.leaderboard) ? data.leaderboard : [])
    .map(sanitizeEntry)
    .filter((e): e is LeaderboardEntry => e !== null);

  // Characters: Lazi is always owned; the selected one must be owned.
  const ownedChars = strings(chars.owned, (id) => CHARACTERS.some((c) => c.id === id));
  if (!ownedChars.includes(DEFAULT_CHARACTER)) ownedChars.unshift(DEFAULT_CHARACTER);
  const selectedChar =
    typeof chars.selected === 'string' && ownedChars.includes(chars.selected)
      ? chars.selected
      : DEFAULT_CHARACTER;

  // Outfits: only known, non-default ones can be "owned"; the worn outfit must be the character's own.
  const ownedOutfits = strings(outfits.owned, (id) => {
    const o = getOutfit(id);
    return o !== undefined && o.id !== defaultOutfitId(o.character);
  });
  const wornOutfits = stringMap(outfits.selected, (charId, outfitId) => {
    const o = getOutfit(outfitId);
    return (
      o !== undefined &&
      o.character === charId &&
      (o.id === defaultOutfitId(o.character) || ownedOutfits.includes(o.id))
    );
  });
  const pieces: Record<string, number> = {};
  if (isRecord(outfits.pieces)) {
    for (const [id, n] of Object.entries(outfits.pieces)) {
      if (getOutfit(id) && typeof n === 'number' && n > 0) pieces[id] = int(n, 0, 0, 99);
    }
  }

  const achievements: Record<string, string> = stringMap(
    data.achievements,
    (id) => id.length > 0 && id.length < 60,
  );

  const missionList = (Array.isArray(missions.list) ? missions.list : [])
    .map(sanitizeMission)
    .filter((m): m is MissionInstance => m !== null)
    .slice(0, 6);

  const upgradeLevels = { ...base.upgrades };
  for (const id of POWER_UP_IDS) upgradeLevels[id] = int(upgrades[id], 0, 0, UPGRADE_MAX);

  const highScore = num(data.highScore, base.highScore);
  return {
    version: SAVE_VERSION,
    player: {
      name:
        typeof player.name === 'string' && player.name.trim()
          ? player.name.trim().slice(0, 16)
          : null,
      xp: int(player.xp, 0),
      badges: strings(player.badges, undefined, 50),
      tutorialDone: player.tutorialDone === true,
    },
    highScore,
    bestDistance: num(data.bestDistance, base.bestDistance),
    bestZone: int(data.bestZone, base.bestZone, 0, 99),
    totalCoins: num(data.totalCoins, base.totalCoins),
    rand: int(data.rand, 0),
    goldenMedals: int(data.goldenMedals, 0),
    characters: { owned: ownedChars, selected: selectedChar },
    outfits: { owned: ownedOutfits, selected: wornOutfits, pieces },
    achievements,
    counters: {
      outruns: int(counters.outruns, 0),
      jumps: int(counters.jumps, 0),
      slides: int(counters.slides, 0),
      nearMisses: int(counters.nearMisses, 0),
      stumbles: int(counters.stumbles, 0),
      caught: int(counters.caught, 0),
      missionsCompleted: int(counters.missionsCompleted, 0),
      boxesOpened: int(counters.boxesOpened, 0),
      purchases: int(counters.purchases, 0),
      bestNoStumble: num(counters.bestNoStumble, 0),
      bestRunCoins: num(counters.bestRunCoins, 0),
    },
    missions: {
      date: dateOrNull(missions.date),
      list: missionList,
      rerolls: int(missions.rerolls, 0, 0, 99),
      lastSetDate: dateOrNull(missions.lastSetDate),
      streak: int(missions.streak, 0),
      bestStreak: int(missions.bestStreak, 0),
      setsCompleted: int(missions.setsCompleted, 0),
    },
    login: {
      lastClaim: dateOrNull(login.lastClaim),
      day: int(login.day, 0, 0, 7),
      total: int(login.total, 0),
    },
    items: {
      headStart: int(items.headStart, 0, 0, 99),
      secondChance: int(items.secondChance, 0, 0, 99),
      boxes: int(items.boxes, 0, 0, 999),
    },
    upgrades: upgradeLevels,
    settings: {
      quality,
      musicVolume: num(settings.musicVolume, base.settings.musicVolume, 0, 1),
      sfxVolume: num(settings.sfxVolume, base.settings.sfxVolume, 0, 1),
      ambienceVolume: num(settings.ambienceVolume, base.settings.ambienceVolume, 0, 1),
      muted: typeof settings.muted === 'boolean' ? settings.muted : base.settings.muted,
      showControls:
        typeof settings.showControls === 'boolean'
          ? settings.showControls
          : base.settings.showControls,
    },
    stats: {
      runs: int(stats.runs, 0),
      totalCoins: num(stats.totalCoins, 0),
      totalDistance: num(stats.totalDistance, 0),
    },
    leaderboard: sortLeaderboard(leaderboard),
  };
}

/* ------------------------------------------------------------- migration */

/**
 * Upgrade an older save to the current shape (returns a new object; the input is untouched).
 *
 *  v1 -> v2: every v1 field carries over unchanged. Coins the player had banked become their
 *  spendable Rand balance, old leaderboard rows get the default name and character, and players
 *  who had already played skip the first-run tutorial. The runner still has to pick a name.
 */
export function migrate(raw: Record<string, unknown>): Record<string, unknown> {
  const version = typeof raw.version === 'number' ? raw.version : 1;
  if (version >= SAVE_VERSION) return raw;
  return migrateV1toV2(raw);
}

export function migrateV1toV2(v1: Record<string, unknown>): Record<string, unknown> {
  const stats = isRecord(v1.stats) ? v1.stats : {};
  const board = Array.isArray(v1.leaderboard) ? v1.leaderboard : [];
  return {
    ...v1,
    version: 2,
    rand: num(v1.totalCoins, 0),
    player: { name: null, xp: 0, badges: [], tutorialDone: num(stats.runs, 0) > 0 },
    leaderboard: board.map((e) =>
      isRecord(e) ? { name: 'Runner', character: DEFAULT_CHARACTER, ...e } : e,
    ),
  };
}

export function sortLeaderboard(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  return [...entries].sort((a, b) => b.score - a.score).slice(0, LEADERBOARD_SIZE);
}
