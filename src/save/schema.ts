import { QUALITY_LEVELS, type QualityLevel } from '../config/quality';

/** localStorage key. The number is the schema generation, bumped only with a migration. */
export const SAVE_KEY = 'lazitrail_save_v1';
export const SAVE_VERSION = 1;
export const LEADERBOARD_SIZE = 10;

export interface LeaderboardEntry {
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

export interface SaveData {
  version: number;
  highScore: number;
  bestDistance: number;
  /** Index into ZONES of the furthest zone ever reached. */
  bestZone: number;
  totalCoins: number;
  settings: SaveSettings;
  stats: SaveStats;
  leaderboard: LeaderboardEntry[];
}

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    highScore: 0,
    bestDistance: 0,
    bestZone: 0,
    totalCoins: 0,
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

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function num(v: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

function sanitizeEntry(v: unknown): LeaderboardEntry | null {
  if (!isRecord(v)) return null;
  return {
    score: num(v.score, 0),
    distance: num(v.distance, 0),
    zone: Math.floor(num(v.zone, 0, 0, 99)),
    date: typeof v.date === 'string' ? v.date : new Date(0).toISOString(),
  };
}

/**
 * Turn whatever was stored into a valid, current-version SaveData. Unknown or corrupt fields fall
 * back to defaults; nothing here throws. This is also the migration hook: when the schema changes,
 * add a `case` that upgrades older versions before validation (see `migrate`).
 */
export function sanitizeSave(raw: unknown): SaveData {
  const base = defaultSave();
  if (!isRecord(raw)) return base;
  const data = migrate(raw);

  const settings = isRecord(data.settings) ? data.settings : {};
  const stats = isRecord(data.stats) ? data.stats : {};
  const quality = QUALITY_LEVELS.find((q) => q === settings.quality) ?? null;

  const leaderboard = (Array.isArray(data.leaderboard) ? data.leaderboard : [])
    .map(sanitizeEntry)
    .filter((e): e is LeaderboardEntry => e !== null);

  return {
    version: SAVE_VERSION,
    highScore: num(data.highScore, base.highScore),
    bestDistance: num(data.bestDistance, base.bestDistance),
    bestZone: Math.floor(num(data.bestZone, base.bestZone, 0, 99)),
    totalCoins: num(data.totalCoins, base.totalCoins),
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
      runs: Math.floor(num(stats.runs, 0)),
      totalCoins: num(stats.totalCoins, 0),
      totalDistance: num(stats.totalDistance, 0),
    },
    leaderboard: sortLeaderboard(leaderboard),
  };
}

/** Upgrade older saves to the current shape. v1 is the first version, so nothing to do yet. */
function migrate(raw: Record<string, unknown>): Record<string, unknown> {
  // Example for the future:  if (raw.version === 1) raw = migrateV1toV2(raw);
  return raw;
}

export function sortLeaderboard(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  return [...entries].sort((a, b) => b.score - a.score).slice(0, LEADERBOARD_SIZE);
}
