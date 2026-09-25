import { ZONES, zoneIndexAt, type ZoneDef } from '../config/zones';

/**
 * Tracks which zone the player is in. The look of the world (sky, fog, lighting) blends smoothly
 * on its own from the distance run; this owns the discrete part: the zone's identity, the banner,
 * and the best zone reached.
 */
export class ZoneManager {
  private currentIndex = 0;
  private best = 0;

  get index(): number {
    return this.currentIndex;
  }

  get zone(): ZoneDef {
    return ZONES[this.currentIndex] as ZoneDef;
  }

  /** Furthest zone reached this run. */
  get bestIndex(): number {
    return this.best;
  }

  reset(distance = 0): void {
    this.currentIndex = zoneIndexAt(distance);
    this.best = this.currentIndex;
  }

  /** Feed the distance run. Returns the new zone index if the player just entered one. */
  update(distance: number): number | null {
    const index = zoneIndexAt(distance);
    if (index === this.currentIndex) return null;
    this.currentIndex = index;
    this.best = Math.max(this.best, index);
    return index;
  }

  /** Banner text for a zone, e.g. "ZONE 2 — CITY STREETS". */
  static bannerText(zone: ZoneDef): string {
    return `ZONE ${zone.id} — ${zone.name.toUpperCase()}`;
  }
}
