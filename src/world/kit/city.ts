import { pickOne, randRange } from '../../core/random';
import {
  CHUNK_LENGTH,
  Frame,
  MUTED,
  PAINTS,
  parkedCar,
  randomCarColor,
  shade,
} from './common';
import { fillSlots } from './township';

const FLOOR_H = 3.4;
const GROUND_H = 4.4;

/** Flat window (glass + frame + sill) placed as thin quads to keep the vertex count low. */
function officeWindow(f: Frame, aC: number, h0: number, w: number, hgt: number, lit: boolean): void {
  const a0 = aC - w / 2;
  const a1 = aC + w / 2;
  f.face(lit ? 'glassLit' : 'glass', a0, a1, h0, h0 + hgt, -0.04, 0x21334a);
  const t = 0.09;
  const fr = 0xe9e6de;
  f.face('matte', a0 - t, a1 + t, h0 + hgt, h0 + hgt + t, -0.08, fr);
  f.face('matte', a0 - t, a1 + t, h0 - t, h0, -0.08, fr);
  f.face('matte', a0 - t, a0, h0, h0 + hgt, -0.08, fr);
  f.face('matte', a1, a1 + t, h0, h0 + hgt, -0.08, fr);
  f.face('matte', aC - 0.03, aC + 0.03, h0, h0 + hgt, -0.08, fr);
  f.box('concrete', a0 - 0.14, a1 + 0.14, h0 - 0.16, h0 - 0.06, -0.24, 0, 0xcfcac0, ['py', 'pz', 'nz', f.side === -1 ? 'px' : 'nx']);
}

function balcony(f: Frame, aC: number, floorBase: number, w: number): void {
  const a0 = aC - w / 2;
  const a1 = aC + w / 2;
  f.box('concrete', a0, a1, floorBase - 0.18, floorBase, -1.15, 0, 0xc9c4b8);
  // railing: rail + posts
  f.box('metal', a0, a1, floorBase + 0.98, floorBase + 1.04, -1.15, -1.09, 0x222428, ['py', 'pz', 'nz', f.side === -1 ? 'px' : 'nx']);
  const n = Math.max(3, Math.round(w / 0.3));
  for (let i = 0; i <= n; i++) {
    const a = a0 + (w * i) / n;
    f.box('matte', a - 0.015, a + 0.015, floorBase, floorBase + 1.0, -1.15, -1.09, 0x222428, [f.side === -1 ? 'px' : 'nx']);
  }
  if (f.rng() < 0.4) f.box('matte', aC - 0.35, aC + 0.35, floorBase + 0.05, floorBase + 0.75, -0.9, -0.5, 0xdadbd8); // AC unit
}

function shopFront(f: Frame, a0: number, a1: number): void {
  const rng = f.rng;
  const w = a1 - a0;
  const glassW = w - 1.0;
  f.box('matte', a0, a1, 0, 0.5, -0.06, 0, 0x33363c);
  f.face('glass', a0 + 0.5, a0 + 0.5 + glassW, 0.5, 3.3, -0.05, 0x1d2c40);
  // mullions
  const cols = Math.max(2, Math.round(glassW / 1.6));
  for (let i = 0; i <= cols; i++) {
    const a = a0 + 0.5 + (glassW * i) / cols;
    f.face('matte', a - 0.05, a + 0.05, 0.5, 3.3, -0.09, 0x2a2d33);
  }
  f.face('matte', a0 + 0.5, a0 + 0.5 + glassW, 3.3, 3.42, -0.09, 0x2a2d33);
  // door
  const dC = a0 + w / 2;
  f.face('glass', dC - 0.6, dC + 0.6, 0.5, 2.4, -0.1, 0x14202f);
  f.face('matte', dC - 0.66, dC + 0.66, 2.4, 2.5, -0.11, 0x2a2d33);
  // awning + sign band
  const awning = pickOne(rng, [0xc1121f, 0x1d4ed8, 0x15803d, 0xf59e0b, 0x0b2a5b]);
  f.awning(a0 + 0.4, a1 - 0.4, 3.75, 3.2, 1.5, awning, 0xe3dccb);
  f.atlasFace(a0 + 0.7, a1 - 0.7, 3.85, 4.4, -0.06, f.signs.shopRect(Math.floor(rng() * f.signs.shopCount)));
}

function tower(f: Frame, a0: number, a1: number, floors: number): void {
  const rng = f.rng;
  const w = a1 - a0;
  const depth = randRange(rng, 9, 13);
  const facade = rng();
  const mat = facade < 0.28 ? 'brick' : facade < 0.62 ? 'concrete' : 'plaster';
  const tint = mat === 'plaster' ? pickOne(rng, [...MUTED, ...PAINTS.slice(0, 4)]) : mat === 'brick' ? shade(0xf0d2c0, rng, 0.1) : shade(0xd8d6d0, rng, 0.08);
  const H = GROUND_H + floors * FLOOR_H;

  f.box(mat, a0, a1, 0.3, H, 0, depth, tint);
  shopFront(f, a0, a1);

  // pilasters at the ends give the block a frame
  f.box('concrete', a0 - 0.04, a0 + 0.55, 0.3, H, -0.14, 0.05, 0xcac5b9);
  f.box('concrete', a1 - 0.55, a1 + 0.04, 0.3, H, -0.14, 0.05, 0xcac5b9);
  f.box('concrete', a0 - 0.04, a1 + 0.04, GROUND_H - 0.12, GROUND_H + 0.1, -0.2, 0.05, 0xcac5b9);

  const cols = Math.max(2, Math.round((w - 1.8) / 2.5));
  const colW = (w - 1.8) / cols;
  const balconyFloors = new Set<number>();
  for (let fl = 1; fl < floors; fl++) if (rng() < 0.35) balconyFloors.add(fl);
  for (let fl = 0; fl < floors; fl++) {
    const base = GROUND_H + fl * FLOOR_H;
    for (let c = 0; c < cols; c++) {
      const aC = a0 + 0.9 + colW * (c + 0.5);
      officeWindow(f, aC, base + 0.85, Math.min(1.5, colW * 0.6), 1.6, rng() < 0.28);
      if (balconyFloors.has(fl) && c % 2 === 0) balcony(f, aC, base + 0.2, Math.min(1.9, colW * 0.85));
    }
    f.box('concrete', a0, a1, base + FLOOR_H - 0.1, base + FLOOR_H + 0.06, -0.08, 0.05, 0xd6d1c6, ['pz', 'nz', f.side === -1 ? 'px' : 'nx']);
  }

  // roof: parapet, water tank, aerial
  const p = 0.35;
  f.box('concrete', a0 - 0.05, a1 + 0.05, H, H + 0.7, -0.1, 0.35, 0xd0cbc0);
  f.box('concrete', a0 - 0.05, a1 + 0.05, H, H + 0.7, depth - 0.3, depth + 0.05, 0xd0cbc0);
  f.box('concrete', a0 - 0.05, a0 + p, H, H + 0.7, 0, depth, 0xd0cbc0);
  f.box('concrete', a1 - p, a1 + 0.05, H, H + 0.7, 0, depth, 0xd0cbc0);
  if (rng() < 0.6) {
    const aT = a0 + w * randRange(rng, 0.25, 0.75);
    f.box('matte', aT - 1, aT + 1, H, H + 0.4, 3, 5, 0x555a60);
    f.box('metal', aT - 0.8, aT + 0.8, H + 0.4, H + 2.2, 3.3, 4.7, 0x8f979f);
  }
  if (rng() < 0.5) f.box('matte', a0 + w * 0.5 - 0.03, a0 + w * 0.5 + 0.03, H, H + 4, 6, 6.06, 0x333333, ['pz', 'nz', 'px', 'nx']);
}

/** A big roadside billboard on two legs, facing the street. */
function billboardStand(f: Frame, aC: number, rng: () => number): void {
  const w = 6;
  const a0 = aC - w / 2;
  const a1 = aC + w / 2;
  const base = 4.4;
  f.box('metal', aC - 0.7, aC - 0.5, 0, base + 0.3, -0.5, -0.3, 0x545a60);
  f.box('metal', aC + 0.5, aC + 0.7, 0, base + 0.3, -0.5, -0.3, 0x545a60);
  f.box('matte', a0 - 0.1, a1 + 0.1, base, base + 3.1, -0.75, -0.5, 0x2a2d33);
  f.atlasFace(a0, a1, base + 0.05, base + 3.05, -0.76, f.signs.billboardRect(Math.floor(rng() * 6)));
}

function busStop(f: Frame, a: number): void {
  const w = 3.4;
  const a0 = a - w / 2;
  const a1 = a + w / 2;
  const d0 = -3.0;
  const d1 = -1.3;
  for (const aa of [a0, a1]) f.box('metal', aa - 0.05, aa + 0.05, 0, 2.5, d0, d0 + 0.1, 0x2b2e34);
  f.box('metal', a0, a1, 2.5, 2.62, d0 - 0.2, d1, 0x33373d);
  f.face('glass', a0 + 0.05, a1 - 0.05, 0.4, 2.4, d0 + 0.02, 0x1f3145);
  f.box('matte', a0 + 0.3, a1 - 0.3, 0.45, 0.55, d0 + 0.1, d0 + 0.6, 0x6b4f37);
  f.atlasFace(a0 + 0.2, a1 - 0.2, 1.3, 2.3, d1, f.signs.billboardRect(Math.floor(f.rng() * 6)));
}

export function citySide(f: Frame): void {
  const slots = fillSlots(f, 8.5, 14, 0, 1.4);
  for (const [a0, a1] of slots) {
    const floors = 3 + Math.floor(f.rng() * 7);
    tower(f, a0, a1, floors);
  }
  const r = f.rng();
  if (r < 0.35) busStop(f, randRange(f.rng, 8, CHUNK_LENGTH - 8));
  else if (r < 0.7) parkedCar(f, randRange(f.rng, 5, CHUNK_LENGTH - 5), randomCarColor(f.rng));
  if (f.rng() < 0.5) parkedCar(f, randRange(f.rng, 5, CHUNK_LENGTH - 5), randomCarColor(f.rng));
  if (f.rng() < 0.25) billboardStand(f, randRange(f.rng, 8, CHUNK_LENGTH - 8), f.rng);
}
