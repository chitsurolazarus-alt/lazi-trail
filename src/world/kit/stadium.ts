import { pickOne, randRange } from '../../core/random';
import { CHUNK_LENGTH, Frame, parkedCar, randomCarColor, shade } from './common';
import { fillSlots } from './township';

const FLAG_COLORS = [0xff7a1a, 0x0b2a5b, 0xf6f3ea, 0xffd23f, 0x2a9d8f];

/** Tall floodlight mast with a cluster of glowing lamps. */
function floodlightMast(f: Frame, a: number, height: number): void {
  const d = -2.2;
  f.box('matte', a - 0.2, a + 0.2, 0, height, d - 0.2, d + 0.2, 0x8a9199, [
    'py',
    'pz',
    'nz',
    'px',
    'nx',
  ]);
  const lamp = f.k.of('lamp');
  const rows = 3;
  const cols = 4;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const aa = a - 1.1 + c * 0.75;
      const hh = height + 0.1 + r * 0.6;
      lamp.box(f.x(d - 0.3), hh, f.z(aa), 0.25, 0.4, 0.6, 0xfff2cf, {
        faces: [f.side === -1 ? 'px' : 'nx', 'py', 'pz', 'nz'],
      });
    }
  }
  f.box('matte', a - 1.35, a + 1.35, height - 0.15, height + 2.0, d - 0.15, d - 0.05, 0x30343a);
}

/** A line of tall flags on poles along the pavement edge. */
function flagLine(f: Frame, a0: number, a1: number): void {
  for (let a = a0; a <= a1; a += 5.5) {
    const d = -3.1;
    f.box('matte', a - 0.05, a + 0.05, 0, 5.6, d - 0.05, d + 0.05, 0xc9ced4, [
      'py',
      'pz',
      'nz',
      'px',
      'nx',
    ]);
    const c = pickOne(f.rng, FLAG_COLORS);
    const x = f.x(d);
    const lo = f.side === -1 ? a + 0.05 : a + 1.75;
    const hi = f.side === -1 ? a + 1.75 : a + 0.05;
    f.k
      .of('cloth')
      .quad([x, 3.5, f.z(lo)], [x, 3.5, f.z(hi)], [x, 5.5, f.z(hi)], [x, 5.5, f.z(lo)], c, 1, 1);
  }
}

function ticketKiosk(f: Frame, aC: number): void {
  f.box('concrete', aC - 1.6, aC + 1.6, 0, 3.0, -2.6, -0.8, 0xdedad0);
  f.face('glass', aC - 1.2, aC + 1.2, 1.1, 2.4, -2.62, 0x1f3145);
  f.box('matte', aC - 1.75, aC + 1.75, 3.0, 3.25, -2.9, -0.7, 0x0b2a5b);
  f.atlasFace(aC - 1.4, aC + 1.4, 3.3, 4.0, -2.62, f.signs.billboardRect(5));
}

/** Modern low stadium-side building: concrete panels, glass bands and a big glowing screen. */
function concourse(f: Frame, a0: number, a1: number): void {
  const rng = f.rng;
  const w = a1 - a0;
  const H = randRange(rng, 9, 16);
  const depth = randRange(rng, 10, 14);
  const tint = shade(pickOne(rng, [0xd9dbe0, 0xc8ccd6, 0xe4e0d6]), rng, 0.06);
  f.box('concrete', a0, a1, 0, H, 0, depth, tint);
  f.box('metal', a0 - 0.1, a1 + 0.1, H, H + 0.5, -0.4, depth, 0x3a3f8f);
  // continuous glass bands, lit at night
  for (let level = 0; level < Math.floor(H / 4); level++) {
    const h0 = 1.6 + level * 4;
    f.face(rng() < 0.6 ? 'glassLit' : 'glass', a0 + 0.6, a1 - 0.6, h0, h0 + 1.7, -0.05, 0x24384f);
    for (let a = a0 + 0.6; a <= a1 - 0.5; a += 2.4) {
      f.face('matte', a - 0.05, a + 0.05, h0, h0 + 1.7, -0.08, 0x2a2d33);
    }
  }
  // entrance canopy
  const aE = a0 + w / 2;
  f.box('matte', aE - 2.2, aE + 2.2, 4.0, 4.3, -2.2, 0, 0xff7a1a);
  f.face('glass', aE - 1.8, aE + 1.8, 0, 3.9, -0.06, 0x14202f);
  if (rng() < 0.7) {
    // big screen (glows via the sign material's emissive map at night)
    f.box('matte', a0 + 1, a1 - 1, H - 4.4, H - 0.6, -0.5, -0.3, 0x15171b);
    f.atlasFace(
      a0 + 1.15,
      a1 - 1.15,
      H - 4.25,
      H - 0.75,
      -0.52,
      f.signs.billboardRect(Math.floor(rng() * 6)),
    );
  }
}

function turnstiles(f: Frame, a: number): void {
  for (let i = 0; i < 5; i++) {
    const aa = a + i * 1.1;
    f.box('metal', aa - 0.05, aa + 0.05, 0, 1.2, -1.6, -1.5, 0x8d949b);
    f.box('metal', aa - 0.05, aa + 0.05, 1.0, 1.1, -1.9, -1.2, 0x8d949b);
  }
}

export function stadiumSide(f: Frame): void {
  const slots = fillSlots(f, 12, 20, 0.5, 2.5);
  for (const [a0, a1] of slots) concourse(f, a0, a1);
  flagLine(f, 2, CHUNK_LENGTH - 2);
  floodlightMast(f, randRange(f.rng, 6, 34), 16 + f.rng() * 6);
  if (f.rng() < 0.4) ticketKiosk(f, randRange(f.rng, 8, CHUNK_LENGTH - 8));
  else if (f.rng() < 0.5) turnstiles(f, randRange(f.rng, 6, CHUNK_LENGTH - 12));
  if (f.rng() < 0.3) parkedCar(f, randRange(f.rng, 5, CHUNK_LENGTH - 5), randomCarColor(f.rng));
}
