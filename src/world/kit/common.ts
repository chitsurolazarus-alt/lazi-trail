import { CONFIG } from '../../config/gameConfig';
import type { Rng } from '../../core/random';
import { pickOne, randRange } from '../../core/random';
import { MeshBuilder, type Face } from '../MeshBuilder';
import { SURFACE_TILE, type MaterialKey } from '../Materials';
import type { SurfaceKey } from '../../core/AssetLoader';
import type { SignAtlas } from '../SignAtlas';

const W = CONFIG.world;

/** x of the plane where building fronts start, on each side of the road. */
export const FRONT_X = W.roadHalfWidth + W.sidewalkWidth + 0.2;
export const CHUNK_LENGTH = W.chunkLength;
export const CURB_HEIGHT = 0.18;

/** One MeshBuilder per material for a whole street variant. */
export class KitBuilders {
  private readonly map = new Map<MaterialKey, MeshBuilder>();

  of(key: MaterialKey): MeshBuilder {
    let b = this.map.get(key);
    if (!b) {
      b = new MeshBuilder();
      this.map.set(key, b);
    }
    return b;
  }

  entries(): IterableIterator<[MaterialKey, MeshBuilder]> {
    return this.map.entries();
  }
}

export function tileOf(key: MaterialKey): number {
  return key in SURFACE_TILE ? SURFACE_TILE[key as SurfaceKey] : 1;
}

/**
 * Places facade elements for one side of the street in "street coordinates":
 *  - `a`  distance along the street from the chunk start (0..40)
 *  - `h`  height above the road
 *  - `d`  depth from the building-front plane; negative = toward the road (awnings, balconies)
 * `side` is -1 for the left of the road, +1 for the right; the same code builds both.
 */
export class Frame {
  constructor(
    readonly k: KitBuilders,
    readonly side: -1 | 1,
    readonly rng: Rng,
    readonly signs: SignAtlas,
  ) {}

  x(d: number): number {
    return this.side * (FRONT_X + d);
  }

  z(a: number): number {
    return -a;
  }

  /** Solid box. Faces that can never be seen (bottom, and by default the back) are skipped. */
  box(
    mat: MaterialKey,
    a0: number,
    a1: number,
    h0: number,
    h1: number,
    d0: number,
    d1: number,
    color: number,
    faces?: readonly Face[],
    uvOffset?: readonly [number, number],
  ): void {
    const cx = this.x((d0 + d1) / 2);
    const cz = this.z((a0 + a1) / 2);
    const front: Face = this.side === -1 ? 'px' : 'nx';
    const back: Face = this.side === -1 ? 'nx' : 'px';
    const defaultFaces: Face[] = ['py', 'pz', 'nz', front, back];
    this.k
      .of(mat)
      .box(cx, (h0 + h1) / 2, cz, Math.abs(d1 - d0), h1 - h0, Math.abs(a1 - a0), color, {
        faces: faces ?? defaultFaces,
        tile: tileOf(mat),
        uvOffset,
      });
  }

  /** A quad lying in the front plane (or at depth `d`), facing the road. */
  face(
    mat: MaterialKey,
    a0: number,
    a1: number,
    h0: number,
    h1: number,
    d: number,
    color: number,
  ): void {
    const x = this.x(d);
    const t = tileOf(mat);
    const lo = this.side === -1 ? a0 : a1;
    const hi = this.side === -1 ? a1 : a0;
    this.k
      .of(mat)
      .quad(
        [x, h0, this.z(lo)],
        [x, h0, this.z(hi)],
        [x, h1, this.z(hi)],
        [x, h1, this.z(lo)],
        color,
        (a1 - a0) / t,
        (h1 - h0) / t,
        a0 / t,
        h0 / t,
      );
  }

  /** Sign or billboard quad from the atlas, facing the road. */
  atlasFace(
    a0: number,
    a1: number,
    h0: number,
    h1: number,
    d: number,
    rect: readonly [number, number, number, number],
  ): void {
    const x = this.x(d);
    const lo = this.side === -1 ? a0 : a1;
    const hi = this.side === -1 ? a1 : a0;
    this.k
      .of('sign')
      .atlasQuad(
        [x, h0, this.z(lo)],
        [x, h0, this.z(hi)],
        [x, h1, this.z(hi)],
        [x, h1, this.z(lo)],
        0xffffff,
        rect,
      );
  }

  /** Slanted fabric awning sloping down toward the road. */
  awning(
    a0: number,
    a1: number,
    hHigh: number,
    hLow: number,
    reach: number,
    color: number,
    stripe: number,
  ): void {
    const n = Math.max(2, Math.round((a1 - a0) / 0.5));
    const step = (a1 - a0) / n;
    for (let i = 0; i < n; i++) {
      const s0 = a0 + i * step;
      const s1 = s0 + step;
      const c = i % 2 === 0 ? color : stripe;
      const xHigh = this.x(0);
      const xLow = this.x(-reach);
      const lo = this.side === -1 ? s0 : s1;
      const hi = this.side === -1 ? s1 : s0;
      // top surface (visible from above) + underside are one quad; fabric material = cloth
      this.k
        .of('cloth')
        .quad(
          [xHigh, hHigh, this.z(lo)],
          [xHigh, hHigh, this.z(hi)],
          [xLow, hLow, this.z(hi)],
          [xLow, hLow, this.z(lo)],
          c,
        );
      // front valance
      this.k
        .of('cloth')
        .quad(
          [xLow, hLow, this.z(lo)],
          [xLow, hLow, this.z(hi)],
          [xLow, hLow - 0.28, this.z(hi)],
          [xLow, hLow - 0.28, this.z(lo)],
          c,
        );
    }
  }

  /** Gable/lean-to roof over [a0,a1] spanning depth d0..d1, ridge along the street. */
  gableRoof(
    mat: MaterialKey,
    a0: number,
    a1: number,
    h: number,
    d0: number,
    d1: number,
    rise: number,
    color: number,
    apex = 0.5,
  ): void {
    const xa = this.x(d0);
    const xb = this.x(d1);
    const xApex = xa + (xb - xa) * apex;
    this.k
      .of(mat)
      .prismZ(
        Math.min(xa, xb),
        Math.max(xa, xb),
        xApex,
        h,
        h + rise,
        this.z(a1),
        this.z(a0),
        color,
        tileOf(mat),
      );
  }
}

/* ------------------------------------------------------------------ colours */

export const PAINTS = [
  0xf2b84b, 0xe4572e, 0x58b09c, 0xf28fad, 0x8fc1e3, 0xf5e6c8, 0x9ad0a0, 0xd97b66, 0xc9a0dc,
  0xffd166,
] as const;

export const MUTED = [0xd9d2c3, 0xc7ced6, 0xb9a99a, 0xe6dccb, 0xa9b6c2, 0xcfc4b3] as const;

/** Slightly vary a colour so repeated parts don't look identical. */
export function shade(color: number, rng: Rng, amount = 0.12): number {
  const k = 1 + (rng() - 0.5) * 2 * amount;
  const r = Math.min(255, Math.max(0, Math.round(((color >> 16) & 255) * k)));
  const g = Math.min(255, Math.max(0, Math.round(((color >> 8) & 255) * k)));
  const b = Math.min(255, Math.max(0, Math.round((color & 255) * k)));
  return (r << 16) | (g << 8) | b;
}

/* ------------------------------------------------------------------ shared props */

/** A parked car on the kerb side of the pavement, nose along the street. */
export function parkedCar(f: Frame, a: number, color: number): void {
  const d = -2.05; // x ≈ 5.5 from the centre line
  const len = 4.2;
  const wid = 1.8;
  const a0 = a - len / 2;
  const a1 = a + len / 2;
  const cx = f.x(d);
  const cz = f.z(a);
  const paint = f.k.of('paint');
  paint.box(cx, 0.62, cz, wid, 0.62, len, color, { faces: ['px', 'nx', 'py', 'pz', 'nz'] });
  paint.box(cx, 1.2, f.z(a + 0.2), wid - 0.16, 0.5, len * 0.55, color, {
    faces: ['py', 'pz', 'nz', 'px', 'nx'],
  });
  const glass = f.k.of('glass');
  // Side windows
  for (const sx of [-1, 1]) {
    glass.box(cx + sx * (wid / 2 - 0.06), 1.22, f.z(a + 0.2), 0.05, 0.36, len * 0.5, 0x101820, {
      faces: ['px', 'nx'],
    });
  }
  glass.box(cx, 1.2, f.z(a + 0.2 - len * 0.29), wid - 0.3, 0.38, 0.05, 0x101820, {
    faces: ['pz', 'nz'],
  });
  glass.box(cx, 1.2, f.z(a + 0.2 + len * 0.29), wid - 0.3, 0.38, 0.05, 0x101820, {
    faces: ['pz', 'nz'],
  });
  const matte = f.k.of('matte');
  for (const sx of [-1, 1]) {
    for (const za of [a0 + 0.8, a1 - 0.8]) {
      matte.cylinderX(cx + sx * (wid / 2 - 0.1), 0.32, f.z(za), 0.32, 0.22, 0x1b1c20, 10);
    }
  }
  matte.box(cx, 0.35, f.z(a0 - 0.03), wid, 0.16, 0.08, 0x2a2b30, { faces: ['pz', 'nz', 'py'] });
  matte.box(cx, 0.35, f.z(a1 + 0.03), wid, 0.16, 0.08, 0x2a2b30, { faces: ['pz', 'nz', 'py'] });
}

export function randomCarColor(rng: Rng): number {
  return pickOne(
    rng,
    [0xf4f4f4, 0x1f2a44, 0xb3202b, 0xc9ccd1, 0x2f3236, 0x2f5d8c, 0xd9d2b8, 0x487a4d],
  );
}

/** Cheap "dirty" tint used on lower walls. */
export const GRIME = 0x8a8478;

export function jitter(rng: Rng, v: number, amount: number): number {
  return v + randRange(rng, -amount, amount);
}
