import {
  LEGACY_SAVE_KEY_V1,
  SAVE_KEY,
  defaultSave,
  sanitizeSave,
  sortLeaderboard,
  type LeaderboardEntry,
  type SaveData,
  type SaveSettings,
} from './schema';

/** The subset of the Web Storage API we use, so tests can inject a fake. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function browserStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null; // Accessing localStorage can throw (private mode, blocked cookies).
  }
}

export interface RunResult {
  /** Who ran and as whom (shown on the leaderboard). */
  name?: string;
  character?: string;
  score: number;
  distance: number;
  coins: number;
  /** Furthest zone index reached this run. */
  zone: number;
}

/**
 * The one place the game touches localStorage. Every read and write is wrapped in try/catch and
 * falls back to an in-memory copy, so the game keeps working when storage is unavailable.
 * Callers save at key moments only (run end, settings change), never per frame.
 */
export class SaveManager {
  private data: SaveData = defaultSave();
  /** True once a save has been read from storage (false on first ever run / no storage). */
  hadSave = false;

  constructor(private readonly storage: StorageLike | null = browserStorage()) {}

  /** Read the save. A v1 save is migrated to v2 and written under the new key (v1 is left alone). */
  load(): SaveData {
    try {
      const text = this.storage?.getItem(SAVE_KEY);
      if (text) {
        this.data = sanitizeSave(JSON.parse(text));
        this.hadSave = true;
      } else {
        const legacy = this.storage?.getItem(LEGACY_SAVE_KEY_V1);
        if (legacy) {
          this.data = sanitizeSave(JSON.parse(legacy));
          this.hadSave = true;
          this.save();
        }
      }
    } catch {
      this.data = defaultSave();
    }
    return this.data;
  }

  get current(): Readonly<SaveData> {
    return this.data;
  }

  /** Returns false if storage refused the write (the in-memory copy is still updated). */
  save(): boolean {
    try {
      this.storage?.setItem(SAVE_KEY, JSON.stringify(this.data));
      return this.storage !== null;
    } catch {
      return false;
    }
  }

  /**
   * Change the save: `fn` edits a private copy, which is then validated and stored. Whatever `fn`
   * throws leaves the current save untouched.
   */
  edit(fn: (draft: SaveData) => void): void {
    const draft = structuredClone(this.data);
    fn(draft);
    this.data = sanitizeSave(draft);
    this.save();
  }

  updateSettings(patch: Partial<SaveSettings>): void {
    this.data = { ...this.data, settings: { ...this.data.settings, ...patch } };
    this.save();
  }

  /** Record a finished run: stats, bests and the top-10. Returns what was a new record. */
  recordRun(
    run: RunResult,
    now: Date = new Date(),
  ): { newHighScore: boolean; newBestZone: boolean } {
    const d = this.data;
    const newHighScore = run.score > d.highScore;
    const newBestZone = run.zone > d.bestZone;
    const entry: LeaderboardEntry = {
      name: run.name?.trim() || d.player.name || 'Runner',
      character: run.character ?? d.characters.selected,
      score: run.score,
      distance: Math.floor(run.distance),
      zone: run.zone,
      date: now.toISOString(),
    };
    this.data = {
      ...d,
      highScore: Math.max(d.highScore, run.score),
      bestDistance: Math.max(d.bestDistance, Math.floor(run.distance)),
      bestZone: Math.max(d.bestZone, run.zone),
      totalCoins: d.totalCoins + run.coins,
      rand: d.rand + run.coins,
      stats: {
        runs: d.stats.runs + 1,
        totalCoins: d.stats.totalCoins + run.coins,
        totalDistance: d.stats.totalDistance + Math.floor(run.distance),
      },
      leaderboard: sortLeaderboard([...d.leaderboard, entry]),
    };
    this.save();
    return { newHighScore, newBestZone };
  }

  /** Wipe all progress but keep the graphics setting so the game still looks right. */
  reset(): void {
    const quality = this.data.settings.quality;
    this.data = defaultSave();
    this.data.settings.quality = quality;
    this.save();
  }
}
