/** What happened in one finished run, as measured by the game. */
export interface RunStats {
  score: number;
  distance: number;
  /** Rand collected. */
  coins: number;
  /** Furthest zone reached, 0-based. */
  zone: number;
  jumps: number;
  slides: number;
  nearMisses: number;
  stumbles: number;
  /** Times the thief and his dog were shaken off (fell back out of view). */
  outruns: number;
  /** Longest stretch in metres run without a stumble. */
  noStumble: number;
  /** The thief and his dog caught her (as opposed to hitting an obstacle). */
  caught: boolean;
  character: string;
  name: string;
}
