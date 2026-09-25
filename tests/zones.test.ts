import { describe, expect, it } from 'vitest';
import { ZONES, zoneIndexAt } from '../src/config/zones';

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
