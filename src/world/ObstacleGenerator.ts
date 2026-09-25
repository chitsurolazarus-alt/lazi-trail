import {
  CONFIG,
  LANE_COUNT,
  OBSTACLE_DEFS,
  type ObstacleKind,
  type ObstacleDef,
} from '../config/gameConfig';
import { lerp, smoothstep01 } from '../core/math';
import { pickOne, pickWeighted, type Rng } from '../core/random';

export type CoinKind = 'silver' | 'gold';

export interface ObstacleSpec {
  kind: ObstacleKind;
  /** Lane index 0..LANE_COUNT-1. */
  lane: number;
  /** Track distance of the obstacle's near edge (m). */
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

/** One line of obstacles across the track. `safeLane` is guaranteed free of lane-blockers. */
export interface Row {
  s: number;
  /** Length of the longest obstacle in the row. */
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
}

export interface GeneratedSection {
  rows: Row[];
  obstacles: ObstacleSpec[];
  coins: CoinSpec[];
}

const BLOCK_KINDS: readonly ObstacleKind[] = ['stall', 'taxi'];
const ACTION_KINDS: readonly ObstacleKind[] = ['cart', 'awning'];
const COIN_SPACING = 2;
const COIN_HEIGHT = 1.0;

function def(kind: ObstacleKind): ObstacleDef {
  return OBSTACLE_DEFS[kind];
}

/** True if the obstacle forces the player out of its lane (cannot be jumped or slid past). */
export function blocksLane(o: ObstacleSpec): boolean {
  return def(o.kind).requirement === 'lane';
}

/**
 * Builds obstacle rows and coins for the track, in order, as the world asks for more.
 *
 * Path guarantee: every row picks a `safeLane` (moving at most one lane from the previous
 * row's) and never places a lane-blocking obstacle in it, so a route always exists.
 */
export class ObstacleGenerator {
  private nextRowS: number;
  private prevEnd: number;
  private prevSafeLane = 1;
  private safeLane = 1;

  constructor(
    private readonly rng: Rng,
    startRunway: number = CONFIG.world.startRunway,
  ) {
    this.nextRowS = startRunway;
    this.prevEnd = 12;
  }

  /** Generate every row whose near edge lies before `endS`. */
  generate(endS: number, params: GeneratorParams): GeneratedSection {
    const section: GeneratedSection = { rows: [], obstacles: [], coins: [] };
    while (this.nextRowS < endS) {
      const row = this.buildRow(this.nextRowS, params);
      section.rows.push(row);
      section.obstacles.push(...row.obstacles);
      this.addGapCoins(section.coins, row, params);
      this.addRowCoins(section.coins, row);

      this.prevEnd = row.s + row.depth;
      this.prevSafeLane = row.safeLane;
      this.nextRowS = row.s + row.depth + Math.max(6, params.reactSeconds * params.speed);
    }
    return section;
  }

  private buildRow(s: number, p: GeneratorParams): Row {
    this.safeLane = this.nextSafeLane();
    const obstacles: ObstacleSpec[] = [];
    let blocked = 0;

    const lanes = this.shuffledLanes();
    for (const lane of lanes) {
      if (lane === this.safeLane) {
        if (this.rng() < p.actionChance) obstacles.push(this.actionObstacle(lane, s));
      } else if (blocked < p.maxBlocked && this.rng() < p.blockChance) {
        obstacles.push({ kind: pickOne(this.rng, BLOCK_KINDS), lane, s });
        blocked++;
      } else if (this.rng() < p.actionChance * 0.6) {
        obstacles.push(this.actionObstacle(lane, s));
      }
    }

    // A row with nothing in it is pointless: force one blocker beside the safe lane.
    if (obstacles.length === 0 && p.maxBlocked > 0) {
      const others = lanes.filter((l) => l !== this.safeLane);
      obstacles.push({ kind: pickOne(this.rng, BLOCK_KINDS), lane: pickOne(this.rng, others), s });
    }

    let depth = 0;
    for (const o of obstacles) depth = Math.max(depth, def(o.kind).length);
    return { s, depth, safeLane: this.safeLane, obstacles };
  }

  private actionObstacle(lane: number, s: number): ObstacleSpec {
    return { kind: pickOne(this.rng, ACTION_KINDS), lane, s };
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
    const to = row.s - 3;
    if (to - from < 6 || this.rng() >= p.coinChance) return;
    for (let s = from; s <= to; s += COIN_SPACING) {
      // Drift between lanes over the middle 40% of the gap.
      const u = (s - from) / (to - from);
      const t = smoothstep01((u - 0.3) / 0.4);
      out.push({
        lane: lerp(this.prevSafeLane, row.safeLane, t),
        y: COIN_HEIGHT,
        s,
        kind: 'silver',
      });
    }
  }

  /** Coins that reward taking the action lane: an arc over a cart, or a low line under an awning. */
  private addRowCoins(out: CoinSpec[], row: Row): void {
    const obstacle = row.obstacles.find((o) => o.lane === row.safeLane);
    if (!obstacle) return;
    const length = def(obstacle.kind).length;
    if (obstacle.kind === 'cart') {
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
    } else if (obstacle.kind === 'awning') {
      for (let s = row.s - 1; s <= row.s + length + 1; s += 1.4) {
        out.push({ lane: row.safeLane, y: 0.5, s, kind: 'silver' });
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
