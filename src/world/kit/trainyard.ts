import { pickOne, randRange } from '../../core/random';
import { CHUNK_LENGTH, Frame, shade } from './common';
import { fillSlots } from './township';

const PLATFORM_H = 1.1;
const CONTAINER_COLORS = [0xb5432b, 0x2f5d8c, 0x2f7d4a, 0xd98324, 0x8b3a3a, 0x5a6470, 0xc9a227];

function platform(f: Frame): void {
  const front = f.side === -1 ? 'px' : 'nx';
  // slab + safety line + tactile edge
  f.box('concrete', 0, CHUNK_LENGTH, 0, PLATFORM_H, -3.4, -0.1, 0xc9c6bd);
  f.box('matte', 0, CHUNK_LENGTH, PLATFORM_H, PLATFORM_H + 0.02, -3.4, -3.0, 0xffd23f, ['py']);
  f.box('matte', 0, CHUNK_LENGTH, PLATFORM_H, PLATFORM_H + 0.02, -2.95, -2.75, 0x3a3d42, ['py']);
  void front;
}

/** Canopy over part of the platform: posts + corrugated roof + hanging station sign. */
function canopy(f: Frame, a0: number, a1: number): void {
  const top = PLATFORM_H + 3.6;
  for (let a = a0 + 0.5; a <= a1 - 0.4; a += 6) {
    f.box('metal', a - 0.09, a + 0.09, PLATFORM_H, top, -2.6, -2.42, 0x3a3f45);
  }
  f.box('corrugated', a0, a1, top, top + 0.16, -3.2, -0.2, 0xb8bcc2);
  f.box('metal', a0, a1, top - 0.25, top, -3.2, -3.1, 0x33373d, ['pz', 'nz', f.side === -1 ? 'px' : 'nx']);
  // benches and a hanging sign
  for (let a = a0 + 2; a < a1 - 2; a += 7) {
    f.box('wood', a - 0.9, a + 0.9, PLATFORM_H + 0.4, PLATFORM_H + 0.48, -1.2, -0.7, 0x8a5a2b);
    f.box('matte', a - 0.9, a - 0.8, PLATFORM_H, PLATFORM_H + 0.4, -1.2, -0.7, 0x2b2e34);
    f.box('matte', a + 0.8, a + 0.9, PLATFORM_H, PLATFORM_H + 0.4, -1.2, -0.7, 0x2b2e34);
  }
  const aS = (a0 + a1) / 2;
  f.atlasFace(aS - 1.6, aS + 1.6, top - 1.0, top - 0.2, -3.05, f.signs.billboardRect(5));
}

function container(f: Frame, aC: number, d: number, color: number, level: number): void {
  const len = 6;
  f.box('boxmetal', aC - len / 2, aC + len / 2, level * 2.6, level * 2.6 + 2.6, d, d + 2.4, color);
}

function containerStack(f: Frame, aC: number, d: number): void {
  const levels = 1 + Math.floor(f.rng() * 3);
  for (let l = 0; l < levels; l++) container(f, aC, d, pickOne(f.rng, CONTAINER_COLORS), l);
}

function warehouse(f: Frame, a0: number, a1: number): void {
  const rng = f.rng;
  const H = randRange(rng, 6, 9);
  const depth = randRange(rng, 9, 14);
  const wall = rng() < 0.5 ? 'corrugated' : 'concrete';
  const tint = wall === 'corrugated' ? pickOne(rng, [0x9aa1a8, 0x6f8a9a, 0xb3543a, 0x8a8f96]) : shade(0xcfcac0, rng, 0.08);
  f.box(wall, a0, a1, 0, H, 0.3, depth, tint);
  f.box('concrete', a0, a1, 0, 1.2, 0.2, 0.4, 0xa9a59b);
  f.box('metal', a0 - 0.2, a1 + 0.2, H, H + 0.25, 0, depth, 0x7d838a);
  // roller door + loading dock light
  const aD = a0 + (a1 - a0) * randRange(rng, 0.3, 0.7);
  f.box('metal', aD - 2, aD + 2, 0, 4.2, 0.2, 0.32, pickOne(rng, [0x2f5d8c, 0xb5432b, 0x5a6470]));
  f.face('matte', aD - 2.2, aD + 2.2, 4.2, 4.4, 0.18, 0x2a2d33);
  if (rng() < 0.6) f.atlasFace(a0 + 0.6, a1 - 0.6, 4.7, 5.9, 0.16, f.signs.graffitiRect(Math.floor(rng() * f.signs.graffitiCount)));
}

/** A long concrete wall covered in an (original) mural. */
function muralWall(f: Frame, a0: number, a1: number): void {
  const rng = f.rng;
  f.box('concrete', a0, a1, 0, 3.6, -0.8, 0.1, 0xc4c0b6);
  const w = a1 - a0;
  const panels = Math.max(1, Math.floor(w / 6));
  const pw = Math.min(6, w / panels);
  for (let i = 0; i < panels; i++) {
    const aa = a0 + i * pw + 0.2;
    f.atlasFace(aa, aa + pw - 0.4, 0.5, 0.5 + (pw - 0.4) * 0.375, -0.82, f.signs.graffitiRect(Math.floor(rng() * f.signs.graffitiCount)));
  }
}

/** Overhead line gantry: two masts, a cross-beam over the tracks and hanging wires. */
function gantry(f: Frame, a: number): void {
  const h = 7.2;
  f.box('metal', a - 0.14, a + 0.14, PLATFORM_H, h, -3.3, -3.02, 0x50565d);
  if (f.side === 1) {
    // Spans the whole track once (built on the right side only).
    const xL = f.x(-3.16);
    const xR = -xL;
    const b = f.k.of('metal');
    b.box(0, h - 0.4, f.z(a), Math.abs(xL - xR), 0.28, 0.28, 0x565c63, { faces: ['py', 'ny', 'pz', 'nz'], tile: 2.5 });
    const m = f.k.of('matte');
    for (const x of [-1.2, 1.2]) {
      m.box(x, h - 1.6, f.z(a), 0.05, 1.2, 0.05, 0x2b2e33);
    }
  }
}

function wires(f: Frame): void {
  if (f.side !== 1) return;
  const m = f.k.of('matte');
  for (const x of [-1.2, 1.2]) {
    m.box(x, 6.0, -CHUNK_LENGTH / 2, 0.04, 0.04, CHUNK_LENGTH, 0x1e2024, { faces: ['py', 'px', 'nx'] });
    m.box(x, 5.4, -CHUNK_LENGTH / 2, 0.035, 0.035, CHUNK_LENGTH, 0x1e2024, { faces: ['py', 'px', 'nx'] });
  }
}

export function trainyardSide(f: Frame): void {
  platform(f);
  const aCan = randRange(f.rng, 0, 6);
  canopy(f, aCan, Math.min(CHUNK_LENGTH, aCan + randRange(f.rng, 18, 30)));
  gantry(f, 8);
  gantry(f, 28);
  wires(f);

  const slots = fillSlots(f, 9, 16, 0.5, 3);
  for (const [a0, a1] of slots) {
    const r = f.rng();
    if (r < 0.4) warehouse(f, a0, a1);
    else if (r < 0.7) {
      muralWall(f, a0, a1);
      containerStack(f, (a0 + a1) / 2, 2.2);
    } else {
      containerStack(f, (a0 + a1) / 2 - 3, 0.6);
      containerStack(f, (a0 + a1) / 2 + 3.2, 0.6);
    }
  }
}
