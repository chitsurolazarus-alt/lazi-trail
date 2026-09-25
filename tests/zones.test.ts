import { describe, expect, it } from 'vitest';
import { BLEND_AFTER, BLEND_BEFORE, ZONES, zoneBlendAt, zoneIndexAt } from '../src/config/zones';
import { atmosphereAt, lerpHex } from '../src/world/Atmosphere';

describe('zoneIndexAt', () => {
  it('maps distances to the four zones', () => {
    expect(zoneIndexAt(0)).toBe(0);
    expect(zoneIndexAt(999)).toBe(0);
    expect(zoneIndexAt(1000)).toBe(1);
    expect(zoneIndexAt(2500)).toBe(2);
    expect(zoneIndexAt(4499)).toBe(2);
    expect(zoneIndexAt(4500)).toBe(3);
    expect(zoneIndexAt(99999)).toBe(ZONES.length - 1);
  });
});

describe('zoneBlendAt', () => {
  it('is steady well inside a zone', () => {
    expect(zoneBlendAt(0)).toEqual({ from: 0, to: 0, t: 0 });
    expect(zoneBlendAt(500)).toEqual({ from: 0, to: 0, t: 0 });
    expect(zoneBlendAt(1800)).toEqual({ from: 1, to: 1, t: 0 });
    expect(zoneBlendAt(99999)).toEqual({ from: 3, to: 3, t: 0 });
  });

  it('starts easing before a boundary and finishes just after it', () => {
    const boundary = 1000;
    expect(zoneBlendAt(boundary - BLEND_BEFORE - 1).t).toBe(0);
    const mid = zoneBlendAt(boundary - BLEND_BEFORE + (BLEND_BEFORE + BLEND_AFTER) / 2);
    expect(mid.from).toBe(0);
    expect(mid.to).toBe(1);
    expect(mid.t).toBeCloseTo(0.5, 5);
    expect(zoneBlendAt(boundary + BLEND_AFTER).t).toBe(0);
    expect(zoneBlendAt(boundary + BLEND_AFTER).from).toBe(1);
  });

  it('is monotonic and continuous across every boundary', () => {
    for (let i = 1; i < ZONES.length; i++) {
      const b = ZONES[i]?.startDistance ?? 0;
      let prev = 0;
      for (let d = b - BLEND_BEFORE; d < b + BLEND_AFTER; d += 2) {
        const { t } = zoneBlendAt(d);
        expect(t).toBeGreaterThanOrEqual(prev - 1e-9);
        expect(t - prev).toBeLessThan(0.1);
        prev = t;
      }
    }
  });
});

describe('atmosphereAt', () => {
  it('matches the zone definition inside a zone', () => {
    const a = atmosphereAt(300);
    expect(a.fog).toBe(ZONES[0]?.fog);
    expect(a.night).toBe(ZONES[0]?.night);
    expect(a.hdriMix).toBe(0);
  });

  it('blends colours and numbers between zones', () => {
    const boundary = ZONES[3]?.startDistance ?? 0;
    const mid = atmosphereAt(boundary - BLEND_BEFORE + (BLEND_BEFORE + BLEND_AFTER) / 2);
    const from = ZONES[2];
    const to = ZONES[3];
    expect(mid.night).toBeGreaterThan(from?.night ?? 0);
    expect(mid.night).toBeLessThan(to?.night ?? 1);
    expect(mid.hdriFrom).toBe(from?.hdri);
    expect(mid.hdriTo).toBe(to?.hdri);
  });

  it('gets darker/more atmospheric toward the stadium evening', () => {
    expect(atmosphereAt(6000).night).toBeGreaterThan(atmosphereAt(500).night);
  });
});

describe('lerpHex', () => {
  it('interpolates per channel', () => {
    expect(lerpHex(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    expect(lerpHex(0xff0000, 0x0000ff, 0)).toBe(0xff0000);
    expect(lerpHex(0xff0000, 0x0000ff, 1)).toBe(0x0000ff);
  });
});
