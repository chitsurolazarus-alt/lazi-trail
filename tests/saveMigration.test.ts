import { describe, expect, it } from 'vitest';
import { SaveManager, type StorageLike } from '../src/save/SaveManager';
import {
  LEGACY_SAVE_KEY_V1,
  SAVE_KEY,
  SAVE_VERSION,
  defaultSave,
  migrateV1toV2,
  sanitizeSave,
} from '../src/save/schema';

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

/** A save exactly as Phase 1-3 wrote it (schema v1). */
const V1_SAVE = {
  version: 1,
  highScore: 4321,
  bestDistance: 2750,
  bestZone: 2,
  totalCoins: 900,
  settings: {
    quality: 'medium',
    musicVolume: 0.4,
    sfxVolume: 0.5,
    ambienceVolume: 0.6,
    muted: true,
    showControls: false,
  },
  stats: { runs: 12, totalCoins: 900, totalDistance: 20000 },
  leaderboard: [
    { score: 4321, distance: 2750, zone: 2, date: '2026-01-02T10:00:00.000Z' },
    { score: 100, distance: 300, zone: 0, date: '2026-01-01T10:00:00.000Z' },
  ],
};

describe('save v1 -> v2 migration', () => {
  it('keeps every v1 field', () => {
    const save = sanitizeSave(V1_SAVE);
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.highScore).toBe(4321);
    expect(save.bestDistance).toBe(2750);
    expect(save.bestZone).toBe(2);
    expect(save.totalCoins).toBe(900);
    expect(save.settings).toEqual(V1_SAVE.settings);
    expect(save.stats).toEqual(V1_SAVE.stats);
    expect(save.leaderboard).toHaveLength(2);
    expect(save.leaderboard[0]?.score).toBe(4321);
    expect(save.leaderboard[0]?.zone).toBe(2);
  });

  it('turns banked coins into a spendable Rand balance', () => {
    expect(sanitizeSave(V1_SAVE).rand).toBe(900);
  });

  it('gives old leaderboard rows a default name and character', () => {
    const row = sanitizeSave(V1_SAVE).leaderboard[0];
    expect(row?.name).toBe('Runner');
    expect(row?.character).toBe('lazi');
  });

  it('starts with only Lazi and no player name (the runner must be named)', () => {
    const save = sanitizeSave(V1_SAVE);
    expect(save.player.name).toBeNull();
    expect(save.characters).toEqual({ owned: ['lazi'], selected: 'lazi' });
    expect(save.player.xp).toBe(0);
  });

  it('skips the tutorial for players who already played, but not for new ones', () => {
    expect(sanitizeSave(V1_SAVE).player.tutorialDone).toBe(true);
    expect(sanitizeSave({ ...V1_SAVE, stats: { runs: 0 } }).player.tutorialDone).toBe(false);
  });

  it('does not change the object it is given', () => {
    const copy = structuredClone(V1_SAVE);
    migrateV1toV2(copy);
    expect(copy).toEqual(V1_SAVE);
  });

  it('accepts a v1 save with missing pieces', () => {
    const save = sanitizeSave({ highScore: 10 });
    expect(save.highScore).toBe(10);
    expect(save.rand).toBe(0);
    expect(save.version).toBe(SAVE_VERSION);
  });

  it('is a no-op for a save that is already v2', () => {
    const v2 = defaultSave();
    v2.rand = 55;
    v2.player.name = 'Thabo';
    expect(sanitizeSave(structuredClone(v2))).toEqual(v2);
  });
});

describe('SaveManager and the legacy key', () => {
  it('loads a v1 save from the old key and stores it under the v2 key', () => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_SAVE_KEY_V1, JSON.stringify(V1_SAVE));
    const manager = new SaveManager(storage);
    manager.load();
    expect(manager.hadSave).toBe(true);
    expect(manager.current.highScore).toBe(4321);
    expect(manager.current.rand).toBe(900);
    const stored = JSON.parse(storage.getItem(SAVE_KEY) ?? '{}') as { version: number };
    expect(stored.version).toBe(2);
  });

  it('never deletes or rewrites the old v1 data', () => {
    const storage = new MemoryStorage();
    const original = JSON.stringify(V1_SAVE);
    storage.setItem(LEGACY_SAVE_KEY_V1, original);
    const manager = new SaveManager(storage);
    manager.load();
    manager.edit((d) => {
      d.rand = 1;
    });
    expect(storage.getItem(LEGACY_SAVE_KEY_V1)).toBe(original);
  });

  it('prefers the v2 save when both exist', () => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_SAVE_KEY_V1, JSON.stringify(V1_SAVE));
    const v2 = defaultSave();
    v2.highScore = 777;
    storage.setItem(SAVE_KEY, JSON.stringify(v2));
    const manager = new SaveManager(storage);
    manager.load();
    expect(manager.current.highScore).toBe(777);
  });

  it('survives a corrupt v1 blob', () => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_SAVE_KEY_V1, '{not json');
    const manager = new SaveManager(storage);
    expect(manager.load()).toEqual(defaultSave());
  });
});

describe('v2 validation', () => {
  it('repairs bad progression fields instead of trusting them', () => {
    const save = sanitizeSave({
      version: 2,
      player: { name: '   ', xp: -5, badges: ['rookie', 5, 'rookie'] },
      rand: 'lots',
      characters: { owned: ['thandi', 'nobody'], selected: 'kagiso' },
      outfits: {
        owned: ['lazi_gold', 'lazi_trail', 'ghost'],
        selected: { lazi: 'thandi_court', thandi: 'thandi_green' },
        pieces: { thandi_green: 1, ghost: 4 },
      },
      upgrades: { magnet: 99, boost: -3, spikes: 2.9 },
      items: { headStart: 500, secondChance: 'x' },
      missions: { date: 'yesterday', list: [{ templateId: 'coins', target: 100, progress: 250 }] },
      login: { lastClaim: '2026-13-99x', day: 9 },
    });
    expect(save.player.name).toBeNull();
    expect(save.player.xp).toBe(0);
    expect(save.player.badges).toEqual(['rookie']);
    expect(save.rand).toBe(0);
    // Lazi is always owned; unknown ids dropped; a character you don't own can't be selected.
    expect(save.characters.owned).toEqual(['lazi', 'thandi']);
    expect(save.characters.selected).toBe('lazi');
    // The default outfit is never "owned" (it is always available); unknown ids dropped.
    expect(save.outfits.owned).toEqual(['lazi_gold']);
    // An outfit that belongs to another character can't be worn, and one that is not owned neither.
    expect(save.outfits.selected).toEqual({});
    expect(save.outfits.pieces).toEqual({ thandi_green: 1 });
    expect(save.upgrades).toEqual({ magnet: 5, boost: 0, spikes: 2, doubleScore: 0 });
    expect(save.items.headStart).toBe(99);
    expect(save.items.secondChance).toBe(0);
    expect(save.missions.date).toBeNull();
    expect(save.missions.list[0]?.progress).toBe(100);
    expect(save.missions.list[0]?.done).toBe(true);
    expect(save.login.lastClaim).toBeNull();
    expect(save.login.day).toBe(7);
  });
});
