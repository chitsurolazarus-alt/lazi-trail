import { CONFIG, LANE_COUNT, OBSTACLE_DEFS, type ObstacleKind } from '../config/gameConfig';
import { ZONE_OBSTACLES, type ObstacleMix } from '../config/obstacles';
import { PICKUPS, POWER_UP_IDS, type PowerUpId } from '../config/progression';
import { lerp, smoothstep01 } from '../core/math';
import { pickWeighted, pickOne, type Rng } from '../core/random';
import { movingSweep } from '../systems/ObstacleMotion';

export type CoinKind = 'silver' | 'gold';

export interface ObstacleSpec {
  kind: ObstacleKind;
  /** Lane index 0..LANE_COUNT-1. */
  lane: number;
  /**
   * Track distance of the body's near edge (m). For moving vehicles this is the meeting point:
   * where the vehicle and the player are level.
   */
  s: number;
}

export interface CoinSpec {
  /** Lane position; fractional while a coin line drifts between lanes. */
  lane: number;
  /** Height of the coin's centre above the road. */
  y: number;
  s: number;
  kind: CoinKind;
}

/** A power-up sitting on the track. */
export interface PickupSpec {
  lane: number;
  s: number;
  kind: PowerUpId;
}

/** One line of obstacles across the track. `safeLane` is guaranteed free of lane-blockers. */
export interface Row {
  /** Near edge of the bodies. */
  s: number;
  /** Space needed in front of `s` for ramps (m). */
  lead: number;
  /** Length of the longest body in the row. */
  depth: number;
  safeLane: number;
  obstacles: ObstacleSpec[];
}

export interface GeneratorParams {
  /** Current run speed (m/s); converts reaction time into metres. */
  speed: number;
  blockChance: number;
  actionChance: number;
  coinChance: number;
  maxBlocked: number;
  reactSeconds: number;
  /** Zone index the section is generated for (selects the obstacle mix). */
  zone: number;
}

export interface GeneratedSection {
  rows: Row[];
  obstacles: ObstacleSpec[];
  coins: CoinSpec[];
  pickups: PickupSpec[];
}

const COIN_SPACING = 2;
const COIN_HEIGHT = 1.0;

function def(kind: ObstacleKind) {
  return OBSTACLE_DEFS[kind];
}

/** True if the obstacle forces the player out of its lane (cannot be jumped or slid past). */
export function blocksLane(o: ObstacleSpec): boolean {
  return def(o.kind).requirement === 'lane';
}

function pickKind(rng: Rng, list: ObstacleMix['block']): ObstacleKind {
  const index = pickWeighted(
    rng,
    list.map(([, w]) => w),
  );
  return (list[index] as readonly [ObstacleKind, number])[0];
}

/**
 * Builds obstacle rows and coins for the track, in order, as the world asks for more.
 *
 * Path guarantee: every row picks a `safeLane` (moving at most one lane from the previous
 * row's) and never places a lane-blocking obstacle in it, so a route always exists.
 *
 * Moving vehicles reserve the lane they sweep through, so nothing else is placed on top of them.
 */
export class ObstacleGenerator {
  private nextRowS: number;
  private prevEnd: number;
  private prevSafeLane = 1;
  private lastPickupS = -Infinity;
  private safeLane = 1;
  /** Track distance up to which each lane is swept by a moving vehicle. */
  private readonly reserved: number[] = Array.from({ length: LANE_COUNT }, () => -Infinity);

  constructor(
    private readonly rng: Rng,
    startRunway: number = CONFIG.world.startRunway,
  ) {
    this.nextRowS = startRunway;
    this.prevEnd = 12;
  }

  /** Generate every row whose start lies before `endS`. */
  generate(endS: number, params: GeneratorParams): GeneratedSection {
    const section: GeneratedSection = { rows: [], obstacles: [], coins: [], pickups: [] };
    while (this.nextRowS < endS) {
      const row = this.buildRow(this.nextRowS, params);
      section.rows.push(row);
      section.obstacles.push(...row.obstacles);
      this.addGapCoins(section.coins, row, params);
      this.addRowCoins(section.coins, row);
      this.addPickup(section.pickups, row);

      this.prevEnd = row.s + row.depth;
      this.prevSafeLane = row.safeLane;
      this.nextRowS = row.s + row.depth + Math.max(6, params.reactSeconds * params.speed);
    }
    return section;
  }

  private buildRow(candidate: number, p: GeneratorParams): Row {
    this.safeLane = this.nextSafeLane();
    const mix = ZONE_OBSTACLES[Math.min(p.zone, ZONE_OBSTACLES.length - 1)] as ObstacleMix;
    const picks: Array<{ kind: ObstacleKind; lane: number }> = [];
    let blocked = 0;

    const lanes = this.shuffledLanes();
    for (const lane of lanes) {
      // A lane still being swept by a moving vehicle takes nothing else.
      if (this.reserved[lane] > candidate) continue;
      if (lane === this.safeLane) {
        if (this.rng() < p.actionChance) picks.push({ kind: pickKind(this.rng, mix.action), lane });
      } else if (blocked < p.maxBlocked && this.rng() < p.blockChance) {
        picks.push({ kind: pickKind(this.rng, mix.block), lane });
        blocked++;
      } else if (this.rng() < p.actionChance * 0.6) {
        picks.push({ kind: pickKind(this.rng, mix.action), lane });
      }
    }

    // A row with nothing in it is pointless: force one blocker beside the safe lane.
    if (picks.length === 0 && p.maxBlocked > 0) {
      const options = lanes.filter((l) => l !== this.safeLane && this.reserved[l] <= candidate);
      if (options.length > 0) {
        picks.push({ kind: pickKind(this.rng, mix.block), lane: pickOne(this.rng, options) });
      }
    }

    let lead = 0;
    let depth = 0;
    for (const o of picks) {
      lead = Math.max(lead, def(o.kind).ramp?.length ?? 0);
      depth = Math.max(depth, def(o.kind).length);
    }
    const s = candidate + lead;
    const obstacles: ObstacleSpec[] = picks.map((o) => ({ ...o, s }));
    for (const o of obstacles) {
      const d = def(o.kind);
      if (d.moving) this.reserved[o.lane] = s + movingSweep(d) + 4;
    }
    return { s, lead, depth, safeLane: this.safeLane, obstacles };
  }

  /** Safe lane drifts by at most one lane per row. */
  private nextSafeLane(): number {
    const step = pickWeighted(this.rng, [0.3, 0.4, 0.3]) - 1; // -1, 0, +1
    const next = this.safeLane + step;
    if (next < 0 || next > LANE_COUNT - 1) return this.safeLane - step;
    return next;
  }

  private shuffledLanes(): number[] {
    const lanes = Array.from({ length: LANE_COUNT }, (_, i) => i);
    for (let i = lanes.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [lanes[i], lanes[j]] = [lanes[j] as number, lanes[i] as number];
    }
    return lanes;
  }

  /** Coin line along the free path between the previous row and this one. */
  private addGapCoins(out: CoinSpec[], row: Row, p: GeneratorParams): void {
    const from = this.prevEnd + 3.5;
    const to = row.s - row.lead - 3;
    if (to - from < 6 || this.rng() >= p.coinChance) return;
    for (let s = from; s <= to; s += COIN_SPACING) {
      // Drift between lanes over the middle 40% of the gap.
      const u = (s - from) / (to - from);
      const t = smoothstep01((u - 0.3) / 0.4);
      const lane = lerp(this.prevSafeLane, row.safeLane, t);
      // Don't put coins where a moving vehicle is still driving.
      if ((this.reserved[Math.round(lane)] ?? -Infinity) > s) continue;
      out.push({ lane, y: COIN_HEIGHT, s, kind: 'silver' });
    }
  }

  /**
   * Now and then a power-up floats in the free stretch before a row, on the lane the path is
   * heading for. Spaced out so there is never more than one on screen at a time.
   */
  private addPickup(out: PickupSpec[], row: Row): void {
    const from = this.prevEnd + 3.5;
    const to = row.s - row.lead - 3;
    if (to - from < 10) return;
    const s = (from + to) / 2;
    if (s < PICKUPS.firstAt || s - this.lastPickupS < PICKUPS.minSpacing) return;
    if (this.rng() >= PICKUPS.chance) return;
    const lane = Math.round(lerp(this.prevSafeLane, row.safeLane, 0.5));
    if ((this.reserved[lane] ?? -Infinity) > s) return;
    const weights = POWER_UP_IDS.map((id) => PICKUPS.weights[id]);
    out.push({ lane, s, kind: POWER_UP_IDS[pickWeighted(this.rng, weights)] as PowerUpId });
    this.lastPickupS = s;
  }

  /** Coins that reward taking the action lane, or climbing onto a ramp and running along a roof. */
  private addRowCoins(out: CoinSpec[], row: Row): void {
    const safe = row.obstacles.find((o) => o.lane === row.safeLane);
    if (safe) {
      const length = def(safe.kind).length;
      if (safe.kind === 'cart' || safe.kind === 'barrier') {
        const from = row.s - 2;
        const to = row.s + length + 2;
        for (let s = from; s <= to; s += 1.6) {
          const u = (s - from) / (to - from);
          out.push({
            lane: row.safeLane,
            y: COIN_HEIGHT + 1.1 * Math.sin(Math.PI * u),
            s,
            kind: 'gold',
          });
        }
      } else if (safe.kind === 'awning') {
        for (let s = row.s - 1; s <= row.s + length + 1; s += 1.4) {
          out.push({ lane: row.safeLane, y: 0.5, s, kind: 'silver' });
        }
      }
    }

    // Roof-running reward: a coin line up the ramp and along the roof.
    for (const o of row.obstacles) {
      const d = def(o.kind);
      if (!d.ramp) continue;
      const start = o.s - d.ramp.length + 1;
      let i = 0;
      for (let s = start; s <= o.s + d.length - 1; s += 2.5, i++) {
        const surface = s < o.s ? (d.yMax * (s - (o.s - d.ramp.length))) / d.ramp.length : d.yMax;
        out.push({
          lane: o.lane,
          y: surface + COIN_HEIGHT,
          s,
          kind: i % 5 === 4 ? 'gold' : 'silver',
        });
      }
    }
  }
}

/**
 * Independent check used by tests: is there a lane-by-lane route through these rows, assuming
 * the player can shift `maxLaneShift` lanes between consecutive rows?
 */
export function hasPassablePath(rows: readonly Row[], startLane = 1, maxLaneShift = 1): boolean {
  let reachable = new Set<number>([startLane]);
  for (const row of rows) {
    const next = new Set<number>();
    for (let lane = 0; lane < LANE_COUNT; lane++) {
      if (row.obstacles.some((o) => o.lane === lane && blocksLane(o))) continue;
      for (const from of reachable) {
        if (Math.abs(from - lane) <= maxLaneShift) {
          next.add(lane);
          break;
        }
      }
    }
    if (next.size === 0) return false;
    reachable = next;
  }
  return true;
}
