import { pickOne, randRange } from '../../core/random';
import { CHUNK_LENGTH, Frame, PAINTS, parkedCar, randomCarColor, shade } from './common';

/** Split 0..CHUNK_LENGTH into building slots [a0, a1] with small gaps. */
export function fillSlots(
  f: Frame,
  minW: number,
  maxW: number,
  gapMin: number,
  gapMax: number,
): Array<[number, number]> {
  const slots: Array<[number, number]> = [];
  let a = randRange(f.rng, 0, 0.8);
  while (a < CHUNK_LENGTH - minW) {
    let w = randRange(f.rng, minW, maxW);
    if (a + w > CHUNK_LENGTH - 0.2) w = CHUNK_LENGTH - 0.2 - a;
    if (w < minW * 0.75) break;
    slots.push([a, a + w]);
    a += w + randRange(f.rng, gapMin, gapMax);
  }
  return slots;
}

/** Windows with white frames, sill and (township-style) burglar bars. */
function windowPane(f: Frame, aC: number, h0: number, w: number, hgt: number, bars: boolean): void {
  const a0 = aC - w / 2;
  const a1 = aC + w / 2;
  f.face('glass', a0, a1, h0, h0 + hgt, -0.03, 0x1b2a3a);
  const fr = 0x2a2d33;
  const t = 0.07;
  f.box('matte', a0 - t, a1 + t, h0 - t, h0, -0.1, 0, fr);
  f.box('matte', a0 - t, a1 + t, h0 + hgt, h0 + hgt + t, -0.1, 0, fr);
  f.box('matte', a0 - t, a0, h0, h0 + hgt, -0.1, 0, fr);
  f.box('matte', a1, a1 + t, h0, h0 + hgt, -0.1, 0, fr);
  f.box('matte', aC - 0.02, aC + 0.02, h0, h0 + hgt, -0.08, 0, fr);
  f.box('concrete', a0 - 0.12, a1 + 0.12, h0 - 0.1, h0 - 0.02, -0.22, 0, 0xcfcac0);
  if (bars) {
    const n = Math.max(4, Math.round(w / 0.16));
    for (let i = 0; i <= n; i++) {
      const a = a0 + (w * i) / n;
      f.box('matte', a - 0.012, a + 0.012, h0, h0 + hgt, -0.14, -0.1, 0x1a1a1a);
    }
  }
}

function door(f: Frame, aC: number, color: number): void {
  f.box('wood', aC - 0.55, aC + 0.55, 0, 2.1, -0.08, 0, color);
  f.box('matte', aC - 0.62, aC + 0.62, 2.1, 2.2, -0.1, 0, 0x2a2d33);
  f.box('matte', aC - 0.62, aC - 0.55, 0, 2.1, -0.1, 0, 0x2a2d33);
  f.box('matte', aC + 0.55, aC + 0.62, 0, 2.1, -0.1, 0, 0x2a2d33);
  f.box('metal', aC + 0.3, aC + 0.36, 1.0, 1.15, -0.13, -0.08, 0xd8d2c0);
}

function dish(f: Frame, aC: number, h: number): void {
  f.box('matte', aC - 0.02, aC + 0.02, h, h + 0.45, -0.45, -0.4, 0x666a70);
  f.box('metal', aC - 0.33, aC + 0.33, h + 0.38, h + 0.44, -0.75, -0.3, 0xe8e8e8);
}

function crates(f: Frame, aC: number, count: number): void {
  const colors = [0xe63946, 0xff8c1a, 0x3fa34d, 0xffd23f, 0xc1440e];
  for (let i = 0; i < count; i++) {
    const a = aC - (count * 0.55) / 2 + i * 0.55;
    const c = pickOne(f.rng, colors);
    f.box('wood', a - 0.24, a + 0.24, 0, 0.32, -1.4, -0.9, 0xa86a3a);
    f.box('matte', a - 0.2, a + 0.2, 0.32, 0.44, -1.36, -0.94, c);
    if (f.rng() < 0.4) {
      f.box('wood', a - 0.24, a + 0.24, 0.32, 0.64, -1.4, -0.9, 0x936037);
      f.box('matte', a - 0.2, a + 0.2, 0.64, 0.76, -1.36, -0.94, pickOne(f.rng, colors));
    }
  }
}

/** Washing line strung between two posts in front of a house. */
function washingLine(f: Frame, a0: number, a1: number): void {
  const d = -1.6;
  const h = 2.15;
  f.box('metal', a0 - 0.04, a0 + 0.04, 0, h + 0.1, d - 0.04, d + 0.04, 0x8a8f96, [
    'py',
    'pz',
    'nz',
    'px',
    'nx',
  ]);
  f.box('metal', a1 - 0.04, a1 + 0.04, 0, h + 0.1, d - 0.04, d + 0.04, 0x8a8f96, [
    'py',
    'pz',
    'nz',
    'px',
    'nx',
  ]);
  f.box('matte', a0, a1, h + 0.06, h + 0.075, d - 0.01, d + 0.01, 0x2a2a2a);
  const n = Math.floor((a1 - a0) / 0.75);
  for (let i = 0; i < n; i++) {
    const a = a0 + 0.4 + i * 0.75;
    const c = pickOne(f.rng, PAINTS);
    const len = randRange(f.rng, 0.6, 0.95);
    // Two-sided quad hanging from the line; the cloth material waves in the wind.
    const x = f.x(d);
    const lo = f.side === -1 ? a : a + 0.5;
    const hi = f.side === -1 ? a + 0.5 : a;
    f.k
      .of('cloth')
      .quad(
        [x, h + 0.06 - len, f.z(lo)],
        [x, h + 0.06 - len, f.z(hi)],
        [x, h + 0.06, f.z(hi)],
        [x, h + 0.06, f.z(lo)],
        c,
        0.5,
        1,
      );
  }
}

function house(f: Frame, a0: number, a1: number): void {
  const rng = f.rng;
  const w = a1 - a0;
  const floors = rng() < 0.3 ? 2 : 1;
  const H = floors * 3.05;
  const depth = randRange(rng, 6, 9);
  const paint = shade(pickOne(rng, PAINTS), rng, 0.08);
  const roof = pickOne(rng, [0x9c9ea3, 0xa9503b, 0x5f7e93, 0x7d6a55, 0xb8b9bd]);

  f.box('plaster', a0, a1, 0.4, H, 0, depth, paint);
  f.box('concrete', a0 - 0.02, a1 + 0.02, 0, 0.45, -0.06, depth, 0x9a958a);
  // a contrasting painted band under the roof
  f.box('plaster', a0 - 0.02, a1 + 0.02, H - 0.35, H, -0.06, 0.2, shade(paint, rng, 0.25));

  const cols = Math.max(1, Math.round(w / 3.2));
  for (let fl = 0; fl < floors; fl++) {
    for (let c = 0; c < cols; c++) {
      const aC = a0 + (w * (c + 0.5)) / cols;
      const isDoor = fl === 0 && c === Math.floor(cols / 2) && rng() < 0.85;
      if (isDoor) door(f, aC, pickOne(rng, [0x2f5d8c, 0x7a3b2e, 0x1f6f50, 0x444a52]));
      else windowPane(f, aC, fl * 3.05 + 1.05, 1.1, 1.2, fl === 0);
    }
  }
  if (floors === 2) f.box('concrete', a0 - 0.02, a1 + 0.02, 3.0, 3.1, -0.15, 0.1, 0xb9b3a6);

  f.gableRoof(
    'corrugated',
    a0 - 0.25,
    a1 + 0.25,
    H,
    -0.55,
    depth + 0.3,
    rng() < 0.5 ? 1.5 : 0.9,
    roof,
    rng() < 0.5 ? 0.5 : 0.85,
  );
  if (rng() < 0.55) dish(f, a0 + w * randRange(rng, 0.25, 0.75), H - 1.2);
  if (rng() < 0.45) washingLine(f, a0 + 0.3, a1 - 0.3);
  else if (rng() < 0.6)
    f.box('corrugated', a0, a1, 0, 1.5, -2.1, -2.05, pickOne(rng, [0x9c9ea3, 0x6f8a9a, 0xa0522d]));
}

function spaza(f: Frame, a0: number, a1: number): void {
  const rng = f.rng;
  const w = a1 - a0;
  const H = 4.3;
  const depth = randRange(rng, 6.5, 8);
  const paint = shade(pickOne(rng, [0xe4572e, 0xffb703, 0x2a9d8f, 0xf28fad, 0x3a86ff]), rng, 0.06);

  f.box('plaster', a0, a1, 0.4, H, 0, depth, paint);
  f.box('concrete', a0 - 0.02, a1 + 0.02, 0, 0.45, -0.06, depth, 0x9a958a);
  // shop opening with a half-raised roller shutter
  const aC = a0 + w / 2;
  const open = Math.min(w - 1.6, 4.2);
  f.face('matte', aC - open / 2, aC + open / 2, 0.45, 2.6, -0.02, 0x141414);
  f.box('metal', aC - open / 2, aC + open / 2, 2.35, 2.75, -0.2, 0, 0x8b9096);
  f.box('wood', aC - open / 2, aC + open / 2, 0.45, 1.05, -0.9, -0.3, 0xa86a3a); // counter
  f.box('matte', aC - open / 2 + 0.1, aC + open / 2 - 0.1, 1.05, 1.1, -0.95, -0.25, 0xd9d2c3);
  for (const s of [-1, 1])
    f.box(
      'matte',
      aC + s * (open / 2) - 0.06,
      aC + s * (open / 2) + 0.06,
      0.45,
      2.75,
      -0.15,
      0,
      0x2a2d33,
    );

  f.awning(
    a0 + 0.3,
    a1 - 0.3,
    3.35,
    2.75,
    1.9,
    pickOne(rng, [0xe63946, 0x1d4ed8, 0x15803d]),
    0xf5f0e1,
  );
  f.atlasFace(
    a0 + 0.6,
    a1 - 0.6,
    H - 0.95,
    H - 0.15,
    -0.06,
    f.signs.shopRect(Math.floor(rng() * f.signs.shopCount)),
  );
  f.gableRoof(
    'corrugated',
    a0 - 0.2,
    a1 + 0.2,
    H,
    -0.5,
    depth + 0.3,
    1.0,
    pickOne(rng, [0x9c9ea3, 0xa9503b, 0x5f7e93]),
    0.7,
  );
  crates(f, aC + open / 2 + 0.6 < a1 ? aC + open / 2 + 0.6 : aC, 3);
  if (rng() < 0.5) crates(f, aC - open / 2 - 1.2 > a0 ? aC - open / 2 - 1.2 : aC, 2);
  // a painted advert on the side of the awning end
  f.atlasFace(
    a0 + 0.3,
    a0 + 2.3,
    1.2,
    2.0,
    -0.05,
    f.signs.billboardRect(Math.floor(rng() * f.signs.billboardCount)),
  );
}

/** A little corrugated-iron shack on an empty plot, with a fence. */
function shack(f: Frame, a0: number, a1: number): void {
  const rng = f.rng;
  const w = Math.min(a1 - a0, 4.5);
  const aa = a0 + (a1 - a0 - w) / 2;
  const depth = 4;
  const tint = pickOne(rng, [0x9c9ea3, 0x6f8a9a, 0xa0522d, 0xc9a26b]);
  f.box('corrugated', aa, aa + w, 0, 2.5, 0.5, depth, tint);
  f.gableRoof('rust', aa - 0.2, aa + w + 0.2, 2.5, 0.2, depth + 0.3, 0.6, 0x8d5a3b, 0.2);
  f.box(
    'wood',
    aa + w / 2 - 0.4,
    aa + w / 2 + 0.4,
    0,
    1.9,
    0.44,
    0.5,
    pickOne(rng, [0x2f5d8c, 0x7a3b2e]),
  );
  f.box('corrugated', a0, a1, 0, 1.7, -0.3, -0.24, tint);
  if (rng() < 0.6) washingLine(f, aa + 0.2, aa + w - 0.2);
}

export function townshipSide(f: Frame): void {
  const slots = fillSlots(f, 5.5, 8.5, 0.2, 1.8);
  for (const [a0, a1] of slots) {
    const r = f.rng();
    if (a1 - a0 > 6.8 && r < 0.3) spaza(f, a0, a1);
    else if (r < 0.85) house(f, a0, a1);
    else shack(f, a0, a1);
  }
  // parked cars on the kerb between properties
  const cars = Math.floor(randRange(f.rng, 0, 2.4));
  for (let i = 0; i < cars; i++)
    parkedCar(f, randRange(f.rng, 4, CHUNK_LENGTH - 4), randomCarColor(f.rng));
}
