import * as THREE from 'three';
import { CONFIG } from '../config/gameConfig';
import type { ZoneStyle } from '../config/zones';
import type { Rng } from '../core/random';
import { randRange } from '../core/random';
import type { MaterialKey, MaterialLibrary } from './Materials';
import { MeshBuilder } from './MeshBuilder';

/**
 * Repeated street furniture (lamp posts, trees, utility poles, bins) drawn with InstancedMesh:
 * one draw call per part however many there are. Each chunk owns a small list of prop records in
 * its local space; `sync` copies them into the shared instance buffers every frame, adding the
 * chunk's current scroll offset. No allocation happens while running.
 */

export type PropKind = 'lamp' | 'tree' | 'pole' | 'bin';

interface PartSpec {
  material: MaterialKey;
  geometry: THREE.BufferGeometry;
  /** Per-instance colour variety (trees). */
  tint?: boolean;
}

const CAPACITY = 96;
/** floats per record: kind, x, y, z, rotY, scale, tint(0..1) */
const STRIDE = 7;
const MAX_PER_CHUNK = 24;

function buildLamp(): PartSpec[] {
  const pole = new MeshBuilder();
  pole.cylinderY(0, 0, 7.4, 0, 0.11, 0.06, 0x555b63, 8);
  pole.box(0, 0.25, 0, 0.36, 0.5, 0.36, 0x454a51);
  pole.box(0.85, 7.35, 0, 1.7, 0.08, 0.08, 0x555b63); // arm toward the road (+x)
  const head = new MeshBuilder();
  head.box(1.65, 7.3, 0, 0.6, 0.12, 0.28, 0xffffff);
  return [
    { material: 'matte', geometry: pole.build() },
    { material: 'lamp', geometry: head.build() },
  ];
}

function buildTree(): PartSpec[] {
  const trunk = new MeshBuilder();
  trunk.cylinderY(0, 0, 3.2, 0, 0.22, 0.13, 0x6b4a32, 7);
  trunk.box(0.25, 2.9, 0, 0.7, 0.1, 0.1, 0x6b4a32);
  trunk.box(-0.3, 3.1, 0.1, 0.7, 0.1, 0.1, 0x6b4a32);
  const crown = new MeshBuilder();
  // Flat-topped acacia-style canopy from a few overlapping blobs
  crown.blob(0, 4.3, 0, 2.0, 0.9, 1.9, 0x6f9a3a, 1);
  crown.blob(1.0, 4.1, 0.5, 1.4, 0.7, 1.3, 0x7fae42, 1);
  crown.blob(-1.1, 4.0, -0.4, 1.5, 0.7, 1.4, 0x5f8a33, 1);
  return [
    { material: 'matte', geometry: trunk.build() },
    { material: 'foliage', geometry: crown.build(), tint: true },
  ];
}

function buildPole(): PartSpec[] {
  const b = new MeshBuilder();
  b.cylinderY(0, 0, 9.2, 0, 0.16, 0.11, 0x6e5238, 8);
  b.box(0, 8.6, 0, 2.2, 0.12, 0.12, 0x5a442d);
  b.box(0, 7.9, 0, 1.6, 0.1, 0.1, 0x5a442d);
  for (const x of [-1.0, -0.4, 0.4, 1.0]) b.box(x, 8.75, 0, 0.07, 0.14, 0.07, 0xd9d9d9);
  return [{ material: 'matte', geometry: b.build() }];
}

function buildBin(): PartSpec[] {
  const b = new MeshBuilder();
  b.box(0, 0.5, 0, 0.6, 1.0, 0.75, 0x2f7d4a);
  b.box(0, 1.03, 0, 0.66, 0.08, 0.8, 0x24603a);
  b.cylinderX(0, 0.12, 0.3, 0.12, 0.66, 0x1b1b1b, 8);
  return [{ material: 'matte', geometry: b.build() }];
}

interface KindDef {
  parts: PartSpec[];
  meshes: THREE.InstancedMesh[];
}

/** How each zone style dresses its pavements. Positions are per side, per 40 m chunk. */
interface Placement {
  kind: PropKind;
  /** Average number per side per chunk (fractions become probabilities). */
  perSide: number;
  /** Lateral distance from the road centre (m). */
  x: readonly [number, number];
  /** Height of the surface the prop stands on (platforms are raised). */
  y?: number;
}

const PLACEMENTS: Record<ZoneStyle, readonly Placement[]> = {
  township: [
    { kind: 'pole', perSide: 0.9, x: [4.4, 4.8] },
    { kind: 'tree', perSide: 0.7, x: [6.6, 7.0] },
    { kind: 'bin', perSide: 0.5, x: [6.5, 7.1] },
  ],
  city: [
    { kind: 'lamp', perSide: 2, x: [4.3, 4.6] },
    { kind: 'tree', perSide: 0.5, x: [6.4, 6.9] },
    { kind: 'bin', perSide: 0.6, x: [6.5, 7.1] },
  ],
  trainyard: [
    { kind: 'lamp', perSide: 1.4, x: [6.1, 6.5], y: 1.1 },
    { kind: 'bin', perSide: 0.5, x: [6.8, 7.2], y: 1.1 },
  ],
  stadium: [
    { kind: 'lamp', perSide: 2, x: [4.3, 4.6] },
    { kind: 'tree', perSide: 0.4, x: [6.6, 7.0] },
  ],
};

export class PropField {
  readonly object = new THREE.Group();
  private readonly kinds = new Map<PropKind, KindDef>();
  private readonly counts = new Map<PropKind, number>();
  private readonly tmp = new THREE.Color();

  constructor(
    materials: MaterialLibrary,
    castShadows: boolean,
    private readonly density = 1,
  ) {
    const builders: Record<PropKind, () => PartSpec[]> = {
      lamp: buildLamp,
      tree: buildTree,
      pole: buildPole,
      bin: buildBin,
    };
    for (const kind of Object.keys(builders) as PropKind[]) {
      const parts = builders[kind]();
      const meshes = parts.map((p) => {
        const mesh = new THREE.InstancedMesh(p.geometry, materials.get(p.material), CAPACITY);
        mesh.count = 0;
        mesh.frustumCulled = false;
        mesh.castShadow = castShadows && p.material !== 'lamp';
        mesh.receiveShadow = castShadows;
        if (p.tint)
          mesh.instanceColor = new THREE.InstancedBufferAttribute(
            new Float32Array(CAPACITY * 3),
            3,
          );
        this.object.add(mesh);
        return mesh;
      });
      this.kinds.set(kind, { parts, meshes });
    }
  }

  /** Scatter this chunk's props (into `records`, a preallocated Float32Array). Returns the count. */
  fill(records: Float32Array, zone: ZoneStyle, rng: Rng): number {
    let n = 0;
    for (const side of [-1, 1]) {
      for (const p of PLACEMENTS[zone]) {
        const expected = p.perSide * this.density;
        let count = Math.floor(expected);
        if (rng() < expected - count) count++;
        for (let i = 0; i < count && n < MAX_PER_CHUNK; i++) {
          // Spread evenly along the chunk with a little jitter
          const slot = (i + 0.5 + randRange(rng, -0.25, 0.25)) / Math.max(1, count);
          const o = n * STRIDE;
          records[o] = kindIndex(p.kind);
          records[o + 1] = side * randRange(rng, p.x[0], p.x[1]);
          records[o + 2] = p.y ?? CURB;
          records[o + 3] = -slot * CONFIG.world.chunkLength;
          records[o + 4] = p.kind === 'lamp' ? (side === -1 ? 0 : Math.PI) : rng() * Math.PI * 2;
          records[o + 5] = p.kind === 'tree' ? randRange(rng, 0.6, 0.9) : 1;
          records[o + 6] = rng();
          n++;
        }
      }
    }
    return n;
  }

  /** Rebuild instance buffers from every active chunk's records, at their current scroll. */
  sync(chunks: ReadonlyArray<{ props: Float32Array; propCount: number; scrollZ: number }>): void {
    for (const c of this.counts.keys()) this.counts.set(c, 0);
    for (const chunk of chunks) {
      for (let i = 0; i < chunk.propCount; i++) {
        const o = i * STRIDE;
        const kind = KIND_ORDER[chunk.props[o] as number] as PropKind;
        const def = this.kinds.get(kind);
        if (!def) continue;
        const at = this.counts.get(kind) ?? 0;
        if (at >= CAPACITY) continue;
        this.counts.set(kind, at + 1);
        const x = chunk.props[o + 1] as number;
        const y = chunk.props[o + 2] as number;
        const z = (chunk.props[o + 3] as number) + chunk.scrollZ;
        const rot = chunk.props[o + 4] as number;
        const s = chunk.props[o + 5] as number;
        const tint = chunk.props[o + 6] as number;
        const cos = Math.cos(rot) * s;
        const sin = Math.sin(rot) * s;
        for (let m = 0; m < def.meshes.length; m++) {
          const mesh = def.meshes[m] as THREE.InstancedMesh;
          const a = mesh.instanceMatrix.array as Float32Array;
          const b = at * 16;
          a[b] = cos;
          a[b + 1] = 0;
          a[b + 2] = -sin;
          a[b + 3] = 0;
          a[b + 4] = 0;
          a[b + 5] = s;
          a[b + 6] = 0;
          a[b + 7] = 0;
          a[b + 8] = sin;
          a[b + 9] = 0;
          a[b + 10] = cos;
          a[b + 11] = 0;
          a[b + 12] = x;
          a[b + 13] = y;
          a[b + 14] = z;
          a[b + 15] = 1;
          if (mesh.instanceColor) {
            // Vary the greens of each tree
            this.tmp.setHSL(0.24 + tint * 0.06, 0.45, 0.28 + tint * 0.14);
            mesh.setColorAt(at, this.tmp);
          }
        }
      }
    }
    for (const [kind, def] of this.kinds) {
      const n = this.counts.get(kind) ?? 0;
      for (const mesh of def.meshes) {
        mesh.count = n;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    }
  }

  static get maxPerChunk(): number {
    return MAX_PER_CHUNK;
  }

  static get stride(): number {
    return STRIDE;
  }

  dispose(): void {
    for (const def of this.kinds.values()) {
      for (const p of def.parts) p.geometry.dispose();
      for (const mesh of def.meshes) mesh.dispose();
    }
    this.object.removeFromParent();
  }
}

const KIND_ORDER: readonly PropKind[] = ['lamp', 'tree', 'pole', 'bin'];
const kindIndex = (k: PropKind): number => KIND_ORDER.indexOf(k);
const CURB = 0.18;
