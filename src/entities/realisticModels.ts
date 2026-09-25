import * as THREE from 'three';
import { OBSTACLE_DEFS, type ObstacleKind } from '../config/gameConfig';
import type { MaterialKey, MaterialLibrary } from '../world/Materials';
import { KitBuilders } from '../world/kit/common';
import type { ObstacleModels } from './Obstacle';

/**
 * Detailed obstacle models built from primitives, using the shared PBR material library.
 * Local space: the body is centred on x = 0, z = 0; the FRONT of a vehicle faces -Z (moving
 * vehicles are turned around at spawn so it faces the player); ramps run out toward +Z. The face
 * the player approaches is +Z, so signs and produce face that way.
 */

const WHITE = 0xdcdee2;
const NAVY = 0x0b2a5b;
const ORANGE = 0xff7a1a;

type B = KitBuilders;

/** Sloped surface + side walls: a ramp whose top edge meets the body at z0 and reaches the road at z0 + length. */
function ramp(
  k: B,
  width: number,
  height: number,
  z0: number,
  length: number,
  plank = 0xffffff,
): void {
  const hw = width / 2;
  const slope = Math.hypot(length, height);
  const wood = k.of('wood');
  wood.quad(
    [-hw, 0, z0 + length],
    [hw, 0, z0 + length],
    [hw, height, z0],
    [-hw, height, z0],
    plank,
    width / 2,
    slope / 2,
  );
  const matte = k.of('matte');
  for (const s of [-1, 1]) {
    // Side skirts (hazard-striped) and a toe board at the foot
    const steps = 8;
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps;
      const t1 = (i + 1) / steps;
      const z_0 = z0 + length * (1 - t0);
      const z_1 = z0 + length * (1 - t1);
      const c = i % 2 === 0 ? 0xffd23f : 0x1d1d1d;
      const x = s * hw;
      const y0 = height * t0;
      const y1 = height * t1;
      // outward-facing quad along the slope edge, 0.18 tall
      matte.quad([x, y0, z_0], [x, y1, z_1], [x, y1 + 0.18, z_1], [x, y0 + 0.18, z_0], c);
      matte.quad([x, y1, z_1], [x, y0, z_0], [x, y0 + 0.18, z_0], [x, y1 + 0.18, z_1], c);
    }
  }
  // Triangular supports under the slope
  const struts = 4;
  for (let i = 1; i <= struts; i++) {
    const t = i / (struts + 1);
    const z = z0 + length * (1 - t);
    matte.box(0, (height * t) / 2, z, width - 0.1, height * t, 0.08, 0x3a3d42, {
      faces: ['pz', 'nz'],
    });
  }
}

function minibus(k: B, withRamp: boolean): void {
  const paint = k.of('paint');
  const glass = k.of('glass');
  const matte = k.of('matte');
  const lamp = k.of('lamp');
  const L = 5.4;
  const front = -L / 2;
  const rear = L / 2;

  // lower body + livery
  paint.box(0, 0.85, 0, 2.0, 0.8, L, WHITE, { faces: ['px', 'nx', 'py', 'pz', 'nz'] });
  for (const s of [-1, 1]) {
    paint.box(s * 1.006, 0.72, 0, 0.02, 0.24, L - 0.1, NAVY, { faces: [s < 0 ? 'nx' : 'px'] });
    paint.box(s * 1.006, 0.98, 0, 0.02, 0.1, L - 0.1, ORANGE, { faces: [s < 0 ? 'nx' : 'px'] });
  }
  // cabin
  paint.box(0, 1.72, 0.3, 1.94, 0.95, L - 0.8, WHITE, { faces: ['px', 'nx', 'py', 'pz'] });
  paint.box(0, 2.28, 0.3, 1.9, 0.1, L - 0.8, 0xdfe1e4, { faces: ['py', 'px', 'nx'] });
  // raked windscreen
  glass.quad(
    [-0.95, 1.25, front],
    [0.95, 1.25, front],
    [0.9, 2.2, front + 0.55],
    [-0.9, 2.2, front + 0.55],
    0x0d1622,
  );
  for (const s of [-1, 1]) {
    // side windows between pillars
    for (const [z0, z1] of [
      [-1.75, -0.65],
      [-0.5, 0.75],
      [0.9, 2.4],
    ] as const) {
      glass.box(s * 0.975, 1.78, (z0 + z1) / 2, 0.03, 0.62, z1 - z0, 0x0d1622, {
        faces: [s < 0 ? 'nx' : 'px'],
      });
    }
    // wheel arches + wheels
    for (const z of [-1.65, 1.75]) {
      matte.cylinderX(s * 0.9, 0.38, z, 0.4, 0.26, 0x141518, 12);
      paint.cylinderX(s * 1.03, 0.38, z, 0.2, 0.05, 0xb7bcc3, 10);
    }
    // mirror
    matte.box(s * 1.08, 1.75, front + 0.7, 0.14, 0.18, 0.1, 0x1a1b1e);
  }
  // rear (the face the player sees when approaching a parked taxi)
  glass.box(0, 1.78, rear - 0.34, 1.6, 0.6, 0.03, 0x0d1622, { faces: ['pz'] });
  matte.box(0, 0.5, rear + 0.05, 2.06, 0.22, 0.12, 0x26282c);
  paint.box(-0.8, 1.05, rear + 0.01, 0.28, 0.16, 0.04, 0xc1121f, { faces: ['pz'] });
  paint.box(0.8, 1.05, rear + 0.01, 0.28, 0.16, 0.04, 0xc1121f, { faces: ['pz'] });
  paint.box(0, 0.78, rear + 0.02, 0.5, 0.14, 0.02, 0xf5f5f5, { faces: ['pz'] });
  // front: bumper, grille, headlights
  matte.box(0, 0.5, front - 0.05, 2.06, 0.22, 0.12, 0x26282c);
  matte.box(0, 0.86, front - 0.005, 0.9, 0.22, 0.02, 0x15171a, { faces: ['nz'] });
  for (const s of [-1, 1])
    lamp.box(s * 0.72, 0.93, front - 0.02, 0.36, 0.2, 0.06, 0xffffff, { faces: ['nz'] });
  // roof: TAXI sign and rack
  paint.box(0, 2.42, -0.7, 0.7, 0.16, 0.28, 0xffd23f);
  for (const z of [-1.4, 0.2, 1.8]) matte.box(0, 2.36, z, 1.7, 0.05, 0.05, 0x2a2c30);
  if (withRamp)
    ramp(k, 1.9, OBSTACLE_DEFS.taxiRamp.yMax, rear, OBSTACLE_DEFS.taxiRamp.ramp?.length ?? 8);
}

function trainCoach(k: B, withRamp: boolean): void {
  const paint = k.of('paint');
  const glass = k.of('glass');
  const matte = k.of('matte');
  const lamp = k.of('lamp');
  const metal = k.of('metal');
  const L = 20;
  const W = 2.3;
  const front = -L / 2;
  const rear = L / 2;
  const roofY = OBSTACLE_DEFS.trainParked.yMax;

  // body shell: silver with a navy skirt and orange stripe
  paint.box(0, 1.95, 0, W, 2.9, L, 0xdde0e4, { faces: ['px', 'nx', 'pz', 'nz'] });
  for (const s of [-1, 1]) {
    const face = [s < 0 ? 'nx' : 'px'] as const;
    paint.box(s * (W / 2 + 0.01), 0.9, 0, 0.02, 0.9, L - 0.1, NAVY, { faces: face });
    paint.box(s * (W / 2 + 0.01), 1.5, 0, 0.02, 0.16, L - 0.1, ORANGE, { faces: face });
    // windows and doors
    for (let i = 0; i < 6; i++) {
      const z = -8 + i * 3.2;
      glass.box(s * (W / 2 + 0.015), 2.45, z, 0.03, 0.85, 1.9, 0x0e1826, { faces: face });
      paint.box(s * (W / 2 + 0.012), 2.45, z + 1.6, 0.02, 1.9, 0.08, 0x9ba1a9, { faces: face });
    }
    for (const z of [-4.8, 4.8]) {
      paint.box(s * (W / 2 + 0.014), 1.95, z, 0.03, 2.4, 1.3, 0x2f5d8c, { faces: face });
      glass.box(s * (W / 2 + 0.02), 2.35, z, 0.03, 1.0, 0.9, 0x0e1826, { faces: face });
    }
  }
  // roof: curved-look cap and a walkable deck (metal), equipment along the edges
  paint.box(0, roofY - 0.08, 0, W - 0.1, 0.14, L, 0xc3c8ce, { faces: ['px', 'nx', 'pz', 'nz'] });
  metal.box(0, roofY, 0, W - 0.3, 0.05, L - 0.2, 0xaeb4bb, { faces: ['py'], tile: 2.5 });
  for (const z of [-7, -2.5, 3, 7.5]) {
    for (const s of [-1, 1]) matte.box(s * 0.98, roofY + 0.14, z, 0.26, 0.24, 1.6, 0x6b7078);
  }

  // undercarriage + bogies
  matte.box(0, 0.42, 0, W - 0.3, 0.5, L - 1.5, 0x1c1e22);
  for (const z of [-6.5, 6.5]) {
    matte.box(0, 0.4, z, W - 0.5, 0.42, 3, 0x26282d);
    for (const zz of [-1.0, 1.0])
      for (const s of [-1, 1]) matte.cylinderX(s * 0.8, 0.42, z + zz, 0.42, 0.14, 0x33363b, 12);
  }

  // both ends look like a cab: windscreen, warning stripe, lights, coupler
  for (const [zEnd, dir] of [
    [front, -1],
    [rear, 1],
  ] as const) {
    const fc = dir < 0 ? 'nz' : 'pz';
    paint.box(0, 1.95, zEnd + dir * 0.01, W - 0.05, 2.9, 0.02, 0xf4c20d, { faces: [fc] });
    glass.box(0, 2.55, zEnd + dir * 0.02, W - 0.5, 1.0, 0.03, 0x0b141f, { faces: [fc] });
    for (const s of [-1, 1])
      lamp.box(s * 0.75, 1.3, zEnd + dir * 0.03, 0.34, 0.24, 0.04, 0xffffff, { faces: [fc] });
    lamp.box(0, 3.25, zEnd + dir * 0.03, 0.4, 0.14, 0.04, 0xffffff, { faces: [fc] });
    paint.box(0, 1.55, zEnd + dir * 0.03, 0.9, 0.22, 0.03, 0xf5f5f5, { faces: [fc] });
    matte.box(0, 0.55, zEnd + dir * 0.2, 0.5, 0.3, 0.4, 0x2a2c30);
  }

  if (withRamp) ramp(k, 2.0, roofY, rear, OBSTACLE_DEFS.trainParked.ramp?.length ?? 12);
}

function stall(k: B, rng: () => number, signs: MaterialLibrary['signs']): void {
  const wood = k.of('wood');
  const matte = k.of('matte');
  const cloth = k.of('cloth');
  const foliage = k.of('foliage');
  const corr = k.of('corrugated');
  const sign = k.of('sign');

  // counter, cloth and posts
  wood.box(0, 0.45, 0, 1.75, 0.9, 1.15, 0xc79a63, { tile: 2 });
  cloth.quad([-0.9, 0.92, 0.6], [0.9, 0.92, 0.6], [0.9, 0.92, -0.6], [-0.9, 0.92, -0.6], 0xe63946);
  for (const x of [-0.86, 0.86])
    for (const z of [-0.58, 0.58]) matte.box(x, 1.35, z, 0.08, 2.7, 0.08, 0x4b3421);
  // produce: tomatoes, oranges, cabbages
  const produce = [0xe63946, 0xff8c1a, 0x3fa34d, 0xffd23f, 0x9bc53d];
  for (let i = 0; i < 9; i++) {
    const x = -0.7 + (i % 3) * 0.7;
    const z = -0.25 + Math.floor(i / 3) * 0.28;
    const c = produce[Math.floor(rng() * produce.length)] as number;
    foliage.blob(x + (rng() - 0.5) * 0.1, 1.08, z, 0.2, 0.15, 0.2, c, 1);
  }
  wood.box(0, 1.02, 0.55, 1.6, 0.14, 0.06, 0xa0723f, { faces: ['pz', 'py'] });
  // striped awning + corrugated roof
  const n = 6;
  for (let i = 0; i < n; i++) {
    const x0 = -0.95 + (1.9 * i) / n;
    const x1 = -0.95 + (1.9 * (i + 1)) / n;
    const c = i % 2 === 0 ? 0xff7a1a : 0xf2efe6;
    cloth.quad([x0, 2.35, 0.85], [x1, 2.35, 0.85], [x1, 2.75, -0.2], [x0, 2.75, -0.2], c);
    cloth.quad([x0, 2.35, 0.85], [x1, 2.35, 0.85], [x1, 2.05, 0.85], [x0, 2.05, 0.85], c);
  }
  corr.box(0, 2.9, -0.3, 1.9, 0.08, 1.2, 0x9aa1a8, { tile: 2 });
  // hand-painted sign board on the near face
  matte.box(0, 2.55, 0.62, 1.7, 0.4, 0.04, 0x2a2118);
  sign.atlasQuad(
    [-0.8, 2.36, 0.65],
    [0.8, 2.36, 0.65],
    [0.8, 2.74, 0.65],
    [-0.8, 2.74, 0.65],
    0xffffff,
    signs.shopRect(Math.floor(rng() * signs.shopCount)),
  );
}

function cart(k: B, rng: () => number): void {
  const wood = k.of('wood');
  const matte = k.of('matte');
  const foliage = k.of('foliage');
  wood.box(0, 0.62, 0, 1.3, 0.3, 1.3, 0xb98555, { tile: 2 });
  for (const s of [-1, 1])
    wood.box(s * 0.62, 0.9, 0, 0.06, 0.28, 1.3, 0x94663a, {
      faces: ['px', 'nx', 'py', 'pz', 'nz'],
    });
  wood.box(0, 0.9, 0.62, 1.3, 0.28, 0.06, 0x94663a, { faces: ['pz', 'py'] });
  for (const s of [-1, 1]) {
    matte.cylinderX(s * 0.72, 0.36, 0.15, 0.36, 0.1, 0x1c1d21, 14);
    matte.cylinderX(s * 0.72, 0.36, 0.15, 0.1, 0.14, 0xc5c8cc, 8);
  }
  // handles pointing back toward the player
  for (const s of [-1, 1]) matte.box(s * 0.45, 0.72, 1.0, 0.07, 0.07, 0.8, 0x5e4327);
  const c = [0xe63946, 0xff8c1a, 0x3fa34d, 0xffd23f];
  for (let i = 0; i < 8; i++) {
    const x = -0.45 + (i % 3) * 0.45;
    const z = -0.4 + Math.floor(i / 3) * 0.4;
    foliage.blob(x, 0.95, z, 0.22, 0.14, 0.22, c[Math.floor(rng() * c.length)] as number, 1);
  }
}

function awning(k: B): void {
  const matte = k.of('matte');
  const cloth = k.of('cloth');
  const wood = k.of('wood');
  for (const x of [-0.9, 0.9])
    for (const z of [-0.7, 0.7]) matte.box(x, 0.95, z, 0.08, 1.9, 0.08, 0x4b3421);
  const n = 6;
  for (let i = 0; i < n; i++) {
    const x0 = -0.98 + (1.96 * i) / n;
    const x1 = -0.98 + (1.96 * (i + 1)) / n;
    const c = i % 2 === 0 ? 0x1d4ed8 : 0xf2efe6;
    cloth.quad([x0, 1.62, 0.95], [x1, 1.62, 0.95], [x1, 1.9, -0.9], [x0, 1.9, -0.9], c);
    // valance hanging at the near edge, bottom at 1.28 so a slide clears it
    cloth.quad([x0, 1.28, 0.95], [x1, 1.28, 0.95], [x1, 1.62, 0.95], [x0, 1.62, 0.95], c);
  }
  wood.box(-0.65, 0.16, 0, 0.5, 0.3, 0.5, 0xc79a63, { tile: 2 });
  wood.box(0.65, 0.16, 0, 0.5, 0.3, 0.5, 0xc79a63, { tile: 2 });
}

function barrier(k: B): void {
  const matte = k.of('matte');
  const lamp = k.of('lamp');
  for (const s of [-1, 1]) {
    matte.box(s * 0.8, 0.45, 0, 0.1, 0.9, 0.5, 0x6d737a);
    matte.box(s * 0.8, 0.03, 0, 0.1, 0.06, 0.9, 0x6d737a);
  }
  for (const level of [0.55, 0.88]) {
    for (let j = 0; j < 8; j++) {
      const x = -0.86 + j * 0.215;
      matte.box(x + 0.108, level, 0.04, 0.215, 0.26, 0.06, j % 2 === 0 ? 0xff5a1f : 0xf5f5f5, {
        faces: ['pz', 'nz', 'py'],
      });
    }
  }
  lamp.box(-0.8, 1.02, 0, 0.16, 0.14, 0.16, 0xffffff);
  lamp.box(0.8, 1.02, 0, 0.16, 0.14, 0.16, 0xffffff);
}

export class RealisticObstacleModels implements ObstacleModels {
  private readonly protos = new Map<ObstacleKind, THREE.Group>();
  private rng: () => number = (() => {
    let a = 12345;
    return () => {
      a = (a * 1664525 + 1013904223) >>> 0;
      return a / 4294967296;
    };
  })();

  constructor(private readonly materials: MaterialLibrary) {}

  create(kind: ObstacleKind): THREE.Object3D {
    let proto = this.protos.get(kind);
    if (!proto) {
      proto = this.build(kind);
      this.protos.set(kind, proto);
    }
    return proto.clone();
  }

  private build(kind: ObstacleKind): THREE.Group {
    const k = new KitBuilders();
    switch (kind) {
      case 'stall':
        stall(k, this.rng, this.materials.signs);
        break;
      case 'cart':
        cart(k, this.rng);
        break;
      case 'awning':
        awning(k);
        break;
      case 'barrier':
        barrier(k);
        break;
      case 'taxi':
      case 'taxiMoving':
        minibus(k, false);
        break;
      case 'taxiRamp':
        minibus(k, true);
        break;
      case 'trainParked':
        trainCoach(k, true);
        break;
      case 'trainMoving':
        trainCoach(k, false);
        break;
    }
    const group = new THREE.Group();
    for (const [key, builder] of k.entries()) {
      if (builder.isEmpty) continue;
      const mesh = new THREE.Mesh(builder.build(), this.materials.get(key as MaterialKey));
      group.add(mesh);
    }
    return group;
  }

  dispose(): void {
    for (const group of this.protos.values()) {
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
    }
    this.protos.clear();
  }
}
