import { CONFIG, laneToX } from '../../config/gameConfig';
import type { GroundStyle } from '../../config/zones';
import type { Rng } from '../../core/random';
import { CHUNK_LENGTH, CURB_HEIGHT, KitBuilders, tileOf } from './common';

const W = CONFIG.world;
const ROAD = W.roadHalfWidth;
const WALK_OUT = ROAD + W.sidewalkWidth;

/** Upward-facing quad on the ground, spanning x0..x1 and a0..a1 (a = distance along the street). */
function flat(
  k: KitBuilders,
  mat: Parameters<KitBuilders['of']>[0],
  x0: number,
  x1: number,
  a0: number,
  a1: number,
  y: number,
  color: number,
): void {
  const t = tileOf(mat);
  k.of(mat).quad(
    [x0, y, -a0],
    [x1, y, -a0],
    [x1, y, -a1],
    [x0, y, -a1],
    color,
    (x1 - x0) / t,
    (a1 - a0) / t,
    x0 / t,
    a0 / t,
  );
}

function pavements(k: KitBuilders, mat: 'pavement' | 'concrete', height: number): void {
  for (const side of [-1, 1]) {
    const x0 = side === -1 ? -WALK_OUT : ROAD;
    const x1 = side === -1 ? -ROAD : WALK_OUT;
    // top
    flat(k, mat, x0, x1, 0, CHUNK_LENGTH, height, 0xffffff);
    // kerb face toward the road + a lighter kerb stone strip on top
    const cx = side * (ROAD + 0.1);
    k.of('concrete').box(cx, height / 2, -CHUNK_LENGTH / 2, 0.2, height, CHUNK_LENGTH, 0xc9c5ba, {
      faces: ['px', 'nx', 'py'],
      tile: 4,
    });
  }
}

function laneLines(k: KitBuilders, dashed = true): void {
  const m = k.of('markings');
  const w = 0.12;
  for (const x of [-CONFIG.lane.width / 2, CONFIG.lane.width / 2]) {
    if (dashed) {
      for (let a = 2; a < CHUNK_LENGTH; a += 8) {
        m.quad(
          [x - w, 0.012, -a],
          [x + w, 0.012, -a],
          [x + w, 0.012, -(a + 4)],
          [x - w, 0.012, -(a + 4)],
          0xffffff,
        );
      }
    } else {
      m.quad(
        [x - w, 0.012, 0],
        [x + w, 0.012, 0],
        [x + w, 0.012, -CHUNK_LENGTH],
        [x - w, 0.012, -CHUNK_LENGTH],
        0xffffff,
      );
    }
  }
  for (const x of [-ROAD + 0.35, ROAD - 0.35]) {
    m.quad(
      [x - w, 0.012, 0],
      [x + w, 0.012, 0],
      [x + w, 0.012, -CHUNK_LENGTH],
      [x - w, 0.012, -CHUNK_LENGTH],
      0xffffff,
    );
  }
}

function crosswalk(k: KitBuilders, a: number): void {
  const m = k.of('markings');
  for (let x = -ROAD + 0.6; x < ROAD - 0.5; x += 0.9) {
    m.quad(
      [x, 0.014, -a],
      [x + 0.5, 0.014, -a],
      [x + 0.5, 0.014, -(a + 3.2)],
      [x, 0.014, -(a + 3.2)],
      0xffffff,
    );
  }
}

function drains(k: KitBuilders, rng: Rng): void {
  const m = k.of('matte');
  for (const side of [-1, 1]) {
    const a = 6 + rng() * 28;
    m.box(side * (ROAD - 0.3), 0.004, -a, 0.5, 0.008, 0.9, 0x1d1f23, { faces: ['py'] });
  }
  if (rng() < 0.6) {
    const a = 4 + rng() * 32;
    const x = laneToX(Math.floor(rng() * 3));
    k.of('matte').cylinderY(x, 0.0, 0.012, -a, 0.42, 0.42, 0x25272c, 14);
  }
}

/**
 * Road, kerbs and pavements for one 40 m chunk. Built once per variant; the material's UV tiles
 * divide 40 m evenly so the texture is seamless from one chunk to the next.
 */
export function buildGround(
  k: KitBuilders,
  style: GroundStyle,
  rng: Rng,
  withCrosswalk: boolean,
): void {
  if (style === 'asphalt') {
    flat(k, 'road', -ROAD, ROAD, 0, CHUNK_LENGTH, 0, 0xffffff);
    pavements(k, 'pavement', CURB_HEIGHT);
    laneLines(k);
    if (withCrosswalk) crosswalk(k, 6 + rng() * 22);
    drains(k, rng);
    return;
  }

  if (style === 'plaza') {
    flat(k, 'concrete', -ROAD, ROAD, 0, CHUNK_LENGTH, 0, 0xd6d6d6);
    pavements(k, 'pavement', CURB_HEIGHT);
    laneLines(k);
    // brand-coloured kerb stripes
    const m = k.of('matte');
    for (const side of [-1, 1]) {
      m.quad(
        [side * ROAD - 0.16, 0.014, 0],
        [side * ROAD + 0.16, 0.014, 0],
        [side * ROAD + 0.16, 0.014, -CHUNK_LENGTH],
        [side * ROAD - 0.16, 0.014, -CHUNK_LENGTH],
        0xff7a1a,
      );
      m.quad(
        [side * (ROAD - 0.45) - 0.16, 0.014, 0],
        [side * (ROAD - 0.45) + 0.16, 0.014, 0],
        [side * (ROAD - 0.45) + 0.16, 0.014, -CHUNK_LENGTH],
        [side * (ROAD - 0.45) - 0.16, 0.014, -CHUNK_LENGTH],
        0x0b2a5b,
      );
    }
    drains(k, rng);
    return;
  }

  // rails: ballast, sleepers and steel rails under each lane
  flat(k, 'gravel', -ROAD - 0.5, ROAD + 0.5, 0, CHUNK_LENGTH, 0, 0xffffff);
  const wood = k.of('matte');
  const steel = k.of('metal');
  for (let lane = 0; lane < CONFIG.lane.width * 0 + 3; lane++) {
    const x = laneToX(lane);
    for (let a = 0.4; a < CHUNK_LENGTH; a += 0.8) {
      wood.box(x, 0.075, -a, 2.1, 0.15, 0.3, 0x3a2d24, { faces: ['py', 'px', 'nx', 'pz', 'nz'] });
    }
    for (const rx of [-0.72, 0.72]) {
      steel.box(x + rx, 0.23, -CHUNK_LENGTH / 2, 0.08, 0.16, CHUNK_LENGTH, 0x9aa0a8, {
        faces: ['py', 'px', 'nx'],
        tile: 2.5,
      });
    }
  }
  void rng;
}
