import * as THREE from 'three';
import { MeshBuilder } from '../world/MeshBuilder';

/** Small hand-held / worn props for the characters. Each returns the object plus a disposer. */
export interface Prop {
  object: THREE.Object3D;
  dispose(): void;
}

function vertexColoured(builder: MeshBuilder, roughness = 0.7): THREE.Mesh {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });
  return new THREE.Mesh(builder.build(), material);
}

function disposeMesh(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
    }
  });
}

/** Lazi's sports bag: deep-blue duffel with orange ends, a white stripe and a strap. */
export function createSportsBag(): Prop {
  const b = new MeshBuilder();
  // body (x = width, y = height, z = depth); +z is the side facing away from the wearer's back
  b.box(0, 0, 0, 0.5, 0.3, 0.22, 0x0b2a5b);
  b.box(-0.27, 0, 0, 0.06, 0.28, 0.2, 0xff7a1a);
  b.box(0.27, 0, 0, 0.06, 0.28, 0.2, 0xff7a1a);
  b.box(0, 0, 0.005, 0.5, 0.05, 0.225, 0xf6f3ea); // stripe
  b.box(0, 0.17, 0, 0.3, 0.03, 0.04, 0x1b1b1b); // grab handle
  b.box(0, 0.06, -0.12, 0.42, 0.14, 0.02, 0x092149); // zipped pocket
  // shoulder strap wrapping the torso
  b.box(-0.14, 0.02, -0.16, 0.05, 0.62, 0.02, 0x1b1b1b);
  b.box(0.14, 0.02, -0.16, 0.05, 0.62, 0.02, 0x1b1b1b);
  const mesh = vertexColoured(b);
  const group = new THREE.Group();
  group.add(mesh);
  group.name = 'sportsBag';
  return { object: group, dispose: () => disposeMesh(group) };
}

/** The race medal: gold disc on a red-white-blue ribbon. Faces +Z. */
export function createMedal(): Prop {
  const group = new THREE.Group();
  group.name = 'medal';

  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.075, 0.018, 24).rotateX(Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xffc21a, metalness: 1, roughness: 0.28 }),
  );
  disc.position.set(0, -0.2, 0);
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.075, 0.008, 8, 24),
    new THREE.MeshStandardMaterial({ color: 0xc98a00, metalness: 1, roughness: 0.35 }),
  );
  rim.position.copy(disc.position);
  group.add(disc, rim);

  const b = new MeshBuilder();
  // ribbon: two straps from the neck converging on the medal
  const w = 0.03;
  b.quad(
    [-0.11, 0.03, 0],
    [-0.11 + w, 0.03, 0],
    [-0.0 + w * 0.3, -0.13, 0],
    [-0.0 - w * 0.3, -0.13, 0],
    0x1d4ed8,
  );
  b.quad(
    [0.11 - w, 0.03, 0],
    [0.11, 0.03, 0],
    [0.0 + w * 0.3, -0.13, 0],
    [0.0 - w * 0.3, -0.13, 0],
    0xc1121f,
  );
  const ribbon = vertexColoured(b, 0.9);
  group.add(ribbon);
  return { object: group, dispose: () => disposeMesh(group) };
}

/** A cheap baseball-style cap for the thief. Sits on the head; brim points toward -Z. */
export function createCap(color = 0x1d1f26): Prop {
  const b = new MeshBuilder();
  b.blob(0, 0, 0, 0.16, 0.1, 0.17, color, 1);
  b.box(0, -0.035, -0.18, 0.28, 0.025, 0.17, 0x111318);
  b.box(0, 0.09, 0, 0.03, 0.025, 0.03, 0xff7a1a);
  const group = new THREE.Group();
  group.add(vertexColoured(b, 0.85));
  group.name = 'cap';
  return { object: group, dispose: () => disposeMesh(group) };
}

/** The thief's sack. */
export function createSack(): Prop {
  const b = new MeshBuilder();
  b.blob(0, 0, 0, 0.25, 0.32, 0.22, 0x8a6a42, 1);
  b.box(0, 0.3, 0, 0.14, 0.1, 0.12, 0x6d532f);
  b.box(0, 0.24, 0, 0.16, 0.03, 0.14, 0xc9b28a);
  const group = new THREE.Group();
  group.add(vertexColoured(b, 0.95));
  group.name = 'sack';
  return { object: group, dispose: () => disposeMesh(group) };
}
