import { describe, expect, it } from 'vitest';
import { detectQuality } from '../src/config/quality';
import { SaveManager, type StorageLike } from '../src/save/SaveManager';
import { SAVE_KEY, defaultSave, sanitizeSave } from '../src/save/schema';

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

const throwing: StorageLike = {
  getItem() {
    throw new Error('blocked');
  },
  setItem() {
    throw new Error('quota');
  },
  removeItem() {
    throw new Error('blocked');
  },
};

describe('sanitizeSave', () => {
  it('returns defaults for garbage input', () => {
    expect(sanitizeSave(null)).toEqual(defaultSave());
    expect(sanitizeSave('nope')).toEqual(defaultSave());
    expect(sanitizeSave([1, 2, 3])).toEqual(defaultSave());
  });

  it('keeps valid values and repairs invalid ones', () => {
    const save = sanitizeSave({
      highScore: 1234,
      bestDistance: -50,
      bestZone: 2,
      settings: { quality: 'ultra', musicVolume: 9, sfxVolume: 'loud', showControls: false },
      stats: { runs: 3.9, totalCoins: 'x' },
    });
    expect(save.highScore).toBe(1234);
    expect(save.bestDistance).toBe(0);
    expect(save.bestZone).toBe(2);
    expect(save.settings.quality).toBeNull();
    expect(save.settings.musicVolume).toBe(1);
    expect(save.settings.sfxVolume).toBe(defaultSave().settings.sfxVolume);
    expect(save.settings.showControls).toBe(false);
    expect(save.stats.runs).toBe(3);
    expect(save.stats.totalCoins).toBe(0);
  });

  it('accepts each valid quality level', () => {
    for (const quality of ['low', 'medium', 'high'] as const) {
      expect(sanitizeSave({ settings: { quality } }).settings.quality).toBe(quality);
    }
  });

  it('caps and sorts the leaderboard, dropping bad entries', () => {
    const entries = Array.from({ length: 15 }, (_, i) => ({
      score: i * 10,
      distance: i,
      zone: 0,
      date: 'd',
    }));
    const save = sanitizeSave({ leaderboard: [...entries, 'junk', null] });
    expect(save.leaderboard).toHaveLength(10);
    expect(save.leaderboard[0]?.score).toBe(140);
  });
});

describe('SaveManager', () => {
  it('starts with defaults when nothing is stored', () => {
    const manager = new SaveManager(new MemoryStorage());
    expect(manager.load()).toEqual(defaultSave());
    expect(manager.hadSave).toBe(false);
  });

  it('round-trips settings through storage under the v1 key', () => {
    const storage = new MemoryStorage();
    const a = new SaveManager(storage);
    a.load();
    a.updateSettings({ quality: 'medium', musicVolume: 0.2 });
    expect(storage.store.has(SAVE_KEY)).toBe(true);

    const b = new SaveManager(storage);
    const loaded = b.load();
    expect(b.hadSave).toBe(true);
    expect(loaded.settings.quality).toBe('medium');
    expect(loaded.settings.musicVolume).toBeCloseTo(0.2);
  });

  it('recovers from corrupt JSON', () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, '{not json');
    expect(new SaveManager(storage).load()).toEqual(defaultSave());
  });

  it('keeps working when storage throws (private mode)', () => {
    const manager = new SaveManager(throwing);
    expect(() => manager.load()).not.toThrow();
    expect(() => manager.updateSettings({ quality: 'low' })).not.toThrow();
    expect(manager.current.settings.quality).toBe('low');
    expect(manager.save()).toBe(false);
  });

  it('keeps working with no storage at all', () => {
    const manager = new SaveManager(null);
    manager.load();
    manager.recordRun({ score: 10, distance: 5, coins: 1, zone: 0 });
    expect(manager.current.stats.runs).toBe(1);
  });

  it('records runs: bests, stats and top-10', () => {
    const manager = new SaveManager(new MemoryStorage());
    manager.load();
    const first = manager.recordRun({ score: 500, distance: 320.7, coins: 12, zone: 1 });
    expect(first).toEqual({ newHighScore: true, newBestZone: true });
    const second = manager.recordRun({ score: 200, distance: 100, coins: 3, zone: 0 });
    expect(second).toEqual({ newHighScore: false, newBestZone: false });

    const d = manager.current;
    expect(d.highScore).toBe(500);
    expect(d.bestDistance).toBe(320);
    expect(d.bestZone).toBe(1);
    expect(d.totalCoins).toBe(15);
    expect(d.stats).toEqual({ runs: 2, totalCoins: 15, totalDistance: 420 });
    expect(d.leaderboard.map((e) => e.score)).toEqual([500, 200]);
  });

  it('reset wipes progress but keeps the graphics setting', () => {
    const manager = new SaveManager(new MemoryStorage());
    manager.load();
    manager.updateSettings({ quality: 'high' });
    manager.recordRun({ score: 999, distance: 900, coins: 9, zone: 2 });
    manager.reset();
    expect(manager.current.highScore).toBe(0);
    expect(manager.current.leaderboard).toEqual([]);
    expect(manager.current.settings.quality).toBe('high');
  });
});

describe('detectQuality', () => {
  const desktop = {
    coarsePointer: false,
    maxTouchPoints: 0,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
  };

  it('gives desktops High', () => {
    expect(detectQuality({ ...desktop, deviceMemory: 8, hardwareConcurrency: 8 })).toBe('high');
  });

  it('gives phones and tablets Medium', () => {
    expect(detectQuality({ ...desktop, coarsePointer: true, maxTouchPoints: 5 })).toBe('medium');
    expect(detectQuality({ ...desktop, userAgent: 'Mozilla/5.0 (Linux; Android 13) Mobile' })).toBe(
      'medium',
    );
  });

  it('gives very weak devices Low', () => {
    expect(detectQuality({ ...desktop, deviceMemory: 2 })).toBe('low');
    expect(detectQuality({ ...desktop, coarsePointer: true, hardwareConcurrency: 2 })).toBe('low');
  });
});
