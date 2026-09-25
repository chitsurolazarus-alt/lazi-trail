/**
 * Records where Lazi has been (lateral x and height y) along the track, so the chasers can
 * follow her exact route: the same lane changes, jumps and ramps, without ever running through
 * an obstacle she avoided.
 */
export class PathHistory {
  private readonly s: Float32Array;
  private readonly x: Float32Array;
  private readonly y: Float32Array;
  private count = 0;
  private head = 0;
  private lastS = -Infinity;

  /** Sampled position (reused; read it straight away). */
  readonly out = { x: 0, y: 0 };

  /**
   * @param spacing metres between recorded samples
   * @param capacity number of samples kept (spacing × capacity = metres of history)
   */
  constructor(
    private readonly spacing = 0.25,
    private readonly capacity = 512,
  ) {
    this.s = new Float32Array(capacity);
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
  }

  reset(): void {
    this.count = 0;
    this.head = 0;
    this.lastS = -Infinity;
  }

  /** Record Lazi's position at track distance `s`. Cheap: only stores every `spacing` metres. */
  record(s: number, x: number, y: number): void {
    if (this.count > 0 && s < this.lastS) return; // never go backwards
    if (this.count > 0 && s - this.lastS < this.spacing) {
      // Keep the newest sample fresh between recordings.
      const i = (this.head - 1 + this.capacity) % this.capacity;
      this.x[i] = x;
      this.y[i] = y;
      this.s[i] = Math.max(this.s[i] as number, s);
      return;
    }
    this.s[this.head] = s;
    this.x[this.head] = x;
    this.y[this.head] = y;
    this.head = (this.head + 1) % this.capacity;
    this.count = Math.min(this.count + 1, this.capacity);
    this.lastS = s;
  }

  /**
   * Where Lazi was at track distance `s` (clamped to the recorded range), written to `out`.
   * Before the run began (negative s) it returns her starting position.
   */
  sample(s: number): { x: number; y: number } {
    const n = this.count;
    if (n === 0) {
      this.out.x = 0;
      this.out.y = 0;
      return this.out;
    }
    const oldest = (this.head - n + this.capacity) % this.capacity;
    const at = (k: number): number => (oldest + k) % this.capacity;

    if (s <= (this.s[oldest] as number)) {
      this.out.x = this.x[oldest] as number;
      this.out.y = this.y[oldest] as number;
      return this.out;
    }
    const newest = at(n - 1);
    if (s >= (this.s[newest] as number)) {
      this.out.x = this.x[newest] as number;
      this.out.y = this.y[newest] as number;
      return this.out;
    }
    // Binary search for the samples either side of s.
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if ((this.s[at(mid)] as number) <= s) lo = mid;
      else hi = mid;
    }
    const a = at(lo);
    const b = at(hi);
    const span = (this.s[b] as number) - (this.s[a] as number);
    const t = span > 1e-6 ? (s - (this.s[a] as number)) / span : 0;
    this.out.x = (this.x[a] as number) + ((this.x[b] as number) - (this.x[a] as number)) * t;
    this.out.y = (this.y[a] as number) + ((this.y[b] as number) - (this.y[a] as number)) * t;
    return this.out;
  }
}
