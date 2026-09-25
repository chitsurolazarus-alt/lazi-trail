import * as THREE from 'three';

export type Face = 'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz';
const ALL_FACES: readonly Face[] = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];

export type Vec3 = readonly [number, number, number];

export interface BoxOptions {
  /** Faces to emit (default all). Skipping hidden faces keeps merged geometry small. */
  faces?: readonly Face[];
  /** Metres of world space covered by one texture repeat. Default 1. */
  tile?: number;
  /** UV offset in tiles, to de-synchronise repeated textures. */
  uvOffset?: readonly [number, number];
}

/**
 * Accumulates triangles for ONE material: position, normal, UV (in tiled world metres) and a
 * baked vertex colour. Used to build the merged, low-draw-call street geometry.
 */
export class MeshBuilder {
  private readonly pos: number[] = [];
  private readonly nor: number[] = [];
  private readonly uv: number[] = [];
  private readonly col: number[] = [];
  private readonly idx: number[] = [];
  private readonly c = new THREE.Color();

  get isEmpty(): boolean {
    return this.idx.length === 0;
  }

  /** Axis-aligned box centred at (cx, cy, cz). */
  box(
    cx: number,
    cy: number,
    cz: number,
    w: number,
    h: number,
    d: number,
    color: number,
    opt: BoxOptions = {},
  ): this {
    const faces = opt.faces ?? ALL_FACES;
    const tile = opt.tile ?? 1;
    const [ou, ov] = opt.uvOffset ?? [0, 0];
    const x0 = cx - w / 2;
    const x1 = cx + w / 2;
    const y0 = cy - h / 2;
    const y1 = cy + h / 2;
    const z0 = cz - d / 2;
    const z1 = cz + d / 2;
    for (const face of faces) {
      switch (face) {
        case 'pz':
          this.quad(
            [x0, y0, z1],
            [x1, y0, z1],
            [x1, y1, z1],
            [x0, y1, z1],
            color,
            w / tile,
            h / tile,
            ou,
            ov,
          );
          break;
        case 'nz':
          this.quad(
            [x1, y0, z0],
            [x0, y0, z0],
            [x0, y1, z0],
            [x1, y1, z0],
            color,
            w / tile,
            h / tile,
            ou,
            ov,
          );
          break;
        case 'px':
          this.quad(
            [x1, y0, z1],
            [x1, y0, z0],
            [x1, y1, z0],
            [x1, y1, z1],
            color,
            d / tile,
            h / tile,
            ou,
            ov,
          );
          break;
        case 'nx':
          this.quad(
            [x0, y0, z0],
            [x0, y0, z1],
            [x0, y1, z1],
            [x0, y1, z0],
            color,
            d / tile,
            h / tile,
            ou,
            ov,
          );
          break;
        case 'py':
          this.quad(
            [x0, y1, z1],
            [x1, y1, z1],
            [x1, y1, z0],
            [x0, y1, z0],
            color,
            w / tile,
            d / tile,
            ou,
            ov,
          );
          break;
        case 'ny':
          this.quad(
            [x0, y0, z0],
            [x1, y0, z0],
            [x1, y0, z1],
            [x0, y0, z1],
            color,
            w / tile,
            d / tile,
            ou,
            ov,
          );
          break;
      }
    }
    return this;
  }

  /**
   * One quad, counter-clockwise seen from the front (p0 bottom-left → p1 bottom-right → p2
   * top-right → p3 top-left). `uMax` / `vMax` are the UV extents (in tiles) it spans.
   */
  quad(
    p0: Vec3,
    p1: Vec3,
    p2: Vec3,
    p3: Vec3,
    color: number,
    uMax = 1,
    vMax = 1,
    uOff = 0,
    vOff = 0,
  ): this {
    const e1x = p1[0] - p0[0];
    const e1y = p1[1] - p0[1];
    const e1z = p1[2] - p0[2];
    const e2x = p3[0] - p0[0];
    const e2y = p3[1] - p0[1];
    const e2z = p3[2] - p0[2];
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;

    this.c.set(color);
    const base = this.pos.length / 3;
    const corners: Array<[Vec3, number, number]> = [
      [p0, uOff, vOff],
      [p1, uOff + uMax, vOff],
      [p2, uOff + uMax, vOff + vMax],
      [p3, uOff, vOff + vMax],
    ];
    for (const [p, u, v] of corners) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(nx, ny, nz);
      this.uv.push(u, v);
      this.col.push(this.c.r, this.c.g, this.c.b);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    return this;
  }

  /** Quad with explicit UV rectangle (0..1 atlas coordinates), for signs. */
  atlasQuad(
    p0: Vec3,
    p1: Vec3,
    p2: Vec3,
    p3: Vec3,
    color: number,
    rect: readonly [number, number, number, number],
  ): this {
    this.quad(p0, p1, p2, p3, color);
    const n = this.uv.length;
    const [u0, v0, u1, v1] = rect;
    this.uv[n - 8] = u0;
    this.uv[n - 7] = v0;
    this.uv[n - 6] = u1;
    this.uv[n - 5] = v0;
    this.uv[n - 4] = u1;
    this.uv[n - 3] = v1;
    this.uv[n - 2] = u0;
    this.uv[n - 1] = v1;
    return this;
  }

  /**
   * Triangular prism lying along the Z axis (a gable roof or ramp). The cross-section triangle
   * has its base on y = cy - h/2 from x0..x1 and its apex at (apexX, cy + h/2).
   */
  prismZ(
    x0: number,
    x1: number,
    apexX: number,
    yBase: number,
    yTop: number,
    z0: number,
    z1: number,
    color: number,
    tile = 1,
  ): this {
    const d = z1 - z0;
    // Two sloped faces
    const left = Math.hypot(apexX - x0, yTop - yBase);
    const right = Math.hypot(x1 - apexX, yTop - yBase);
    this.quad(
      [x0, yBase, z1],
      [apexX, yTop, z1],
      [apexX, yTop, z0],
      [x0, yBase, z0],
      color,
      left / tile,
      d / tile,
    );
    this.quad(
      [apexX, yTop, z1],
      [x1, yBase, z1],
      [x1, yBase, z0],
      [apexX, yTop, z0],
      color,
      right / tile,
      d / tile,
    );
    // Gable end triangles (as degenerate quads: p2 == p3)
    this.tri([x0, yBase, z1], [x1, yBase, z1], [apexX, yTop, z1], color, tile);
    this.tri([x1, yBase, z0], [x0, yBase, z0], [apexX, yTop, z0], color, tile);
    return this;
  }

  /** Triangle counter-clockwise from the front. */
  tri(p0: Vec3, p1: Vec3, p2: Vec3, color: number, tile = 1): this {
    const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]] as const;
    const e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]] as const;
    let nx = e1[1] * e2[2] - e1[2] * e2[1];
    let ny = e1[2] * e2[0] - e1[0] * e2[2];
    let nz = e1[0] * e2[1] - e1[1] * e2[0];
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    this.c.set(color);
    const base = this.pos.length / 3;
    for (const p of [p0, p1, p2]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(nx, ny, nz);
      // Planar-ish projection: use the two axes the normal is least aligned with.
      const ax = Math.abs(nx);
      const az = Math.abs(nz);
      if (ax > az) this.uv.push(p[2] / tile, p[1] / tile);
      else this.uv.push(p[0] / tile, p[1] / tile);
      this.col.push(this.c.r, this.c.g, this.c.b);
    }
    this.idx.push(base, base + 1, base + 2);
    return this;
  }

  /** Upright cylinder / cone (flat-shaded facets look right for low-poly props). */
  cylinderY(
    cx: number,
    y0: number,
    y1: number,
    cz: number,
    rBottom: number,
    rTop: number,
    color: number,
    segments = 8,
  ): this {
    this.c.set(color);
    const base = this.pos.length / 3;
    const h = y1 - y0;
    const slope = (rBottom - rTop) / (h || 1);
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      const nl = Math.hypot(1, slope);
      const n: Vec3 = [cos / nl, slope / nl, sin / nl];
      this.pos.push(cx + cos * rBottom, y0, cz + sin * rBottom);
      this.pos.push(cx + cos * rTop, y1, cz + sin * rTop);
      this.nor.push(...n, ...n);
      this.uv.push(i / segments, 0, i / segments, 1);
      this.col.push(this.c.r, this.c.g, this.c.b, this.c.r, this.c.g, this.c.b);
    }
    for (let i = 0; i < segments; i++) {
      const a = base + i * 2;
      this.idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    return this;
  }

  /** Cylinder lying along X (wheels, pipes). */
  cylinderX(
    cx: number,
    cy: number,
    cz: number,
    radius: number,
    length: number,
    color: number,
    segments = 10,
  ): this {
    this.c.set(color);
    const base = this.pos.length / 3;
    const x0 = cx - length / 2;
    const x1 = cx + length / 2;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      this.pos.push(
        x0,
        cy + cos * radius,
        cz + sin * radius,
        x1,
        cy + cos * radius,
        cz + sin * radius,
      );
      this.nor.push(0, cos, sin, 0, cos, sin);
      this.uv.push(i / segments, 0, i / segments, 1);
      this.col.push(this.c.r, this.c.g, this.c.b, this.c.r, this.c.g, this.c.b);
    }
    for (let i = 0; i < segments; i++) {
      const a = base + i * 2;
      this.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    // End caps
    for (const [x, nx] of [
      [x0, -1],
      [x1, 1],
    ] as const) {
      const cbase = this.pos.length / 3;
      this.pos.push(x, cy, cz);
      this.nor.push(nx, 0, 0);
      this.uv.push(0.5, 0.5);
      this.col.push(this.c.r, this.c.g, this.c.b);
      for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        this.pos.push(x, cy + Math.cos(a) * radius, cz + Math.sin(a) * radius);
        this.nor.push(nx, 0, 0);
        this.uv.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
        this.col.push(this.c.r, this.c.g, this.c.b);
      }
      for (let i = 0; i < segments; i++) {
        if (nx > 0) this.idx.push(cbase, cbase + 1 + i, cbase + 2 + i);
        else this.idx.push(cbase, cbase + 2 + i, cbase + 1 + i);
      }
    }
    return this;
  }

  /** Blob of low-poly foliage: a squashed icosphere. */
  blob(
    cx: number,
    cy: number,
    cz: number,
    rx: number,
    ry: number,
    rz: number,
    color: number,
    detail = 1,
  ): this {
    const geo = new THREE.IcosahedronGeometry(1, detail);
    geo.computeVertexNormals();
    const p = geo.getAttribute('position');
    const n = geo.getAttribute('normal');
    this.c.set(color);
    const base = this.pos.length / 3;
    for (let i = 0; i < p.count; i++) {
      this.pos.push(cx + p.getX(i) * rx, cy + p.getY(i) * ry, cz + p.getZ(i) * rz);
      this.nor.push(n.getX(i), n.getY(i), n.getZ(i));
      this.uv.push(0, 0);
      this.col.push(this.c.r, this.c.g, this.c.b);
      this.idx.push(base + i);
    }
    geo.dispose();
    return this;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}
