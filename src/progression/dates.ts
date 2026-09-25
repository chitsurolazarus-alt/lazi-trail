/** Local calendar dates as `YYYY-MM-DD` strings (the device's clock decides what "today" is). */
export function dateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Whole days since 1970-01-01 for a `YYYY-MM-DD` key (timezone and DST proof). */
export function dayNumber(key: string): number {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

/** A stable number for seeding per-day randomness. */
export function dateSeed(key: string): number {
  return (dayNumber(key) * 2654435761 + 12345) >>> 0;
}
