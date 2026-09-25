import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLORS } from '../config/colors';
import { CONFIG } from '../config/gameConfig';
import { ZONES } from '../config/zones';
import { pickOne, randRange, type Rng } from '../core/random';
import type { ChunkDecor, DecorFactory } from './ChunkDecor';

const W = CONFIG.world;
const L = W.chunkLength;
const BUILDINGS = W.buildingsPerSide * 2;

/** Road surface with dashed lane lines, drawn once and shared by every chunk. */
function createRoadTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const pxPerM = canvas.height / L;
    const roadWidth = W.roadHalfWidth * 2;
    const xPx = (x: number): number => ((x + W.roadHalfWidth) / roadWidth) * canvas.width;
    ctx.fillStyle = `#${COLORS.asphalt.toString(16).padStart(6, '0')}`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#e9e4d6';
    for (const x of [-W.roadHalfWidth + 0.25, W.roadHalfWidth - 0.25]) {
      ctx.fillRect(xPx(x) - 2, 0, 4, canvas.height);
    }
    ctx.fillStyle = '#f6f3ea';
    for (const x of [-CONFIG.lane.width / 2, CONFIG.lane.width / 2]) {
      for (let z = 0; z < L; z += 8) ctx.fillRect(xPx(x) - 2, z * pxPerM, 4, 4 * pxPerM);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

interface PrimitiveShared {
  roadGeometry: THREE.BufferGeometry;
  roadMaterial: THREE.Material;
  sidewalkGeometry: THREE.BufferGeometry;
  sidewalkMaterial: THREE.Material;
  buildingGeometry: THREE.BufferGeometry;
  buildingMaterial: THREE.Material;
}

/**
 * Phase 1 look: flat-coloured boxes for buildings. Used on Low quality, so it is deliberately
 * cheap: a chunk is three draw calls (road, sidewalks, and ONE instanced mesh for all buildings).
 */
class PrimitiveDecor implements ChunkDecor {
  readonly object = new THREE.Group();
  private readonly buildings: THREE.InstancedMesh;
  private readonly matrix = new THREE.Matrix4();
  private readonly color = new THREE.Color();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();

  constructor(shared: PrimitiveShared) {
    this.object.add(new THREE.Mesh(shared.roadGeometry, shared.roadMaterial));
    this.object.add(new THREE.Mesh(shared.sidewalkGeometry, shared.sidewalkMaterial));
    this.buildings = new THREE.InstancedMesh(
      shared.buildingGeometry,
      shared.buildingMaterial,
      BUILDINGS,
    );
    this.buildings.frustumCulled = false;
    this.object.add(this.buildings);
  }

  dress(zoneIndex: number, rng: Rng): void {
    const palette = (ZONES[zoneIndex] ?? ZONES[0])?.buildings ?? [0xcccccc];
    const perSide = W.buildingsPerSide;
    const slot = L / perSide;
    for (let i = 0; i < BUILDINGS; i++) {
      const side = i < perSide ? -1 : 1;
      const index = i % perSide;
      const width = randRange(rng, 4, 6.5);
      const height = randRange(rng, 5, 14);
      const depth = slot - randRange(rng, 0.4, 1.2);
      this.position.set(
        side * (W.roadHalfWidth + W.sidewalkWidth + width / 2 + 0.2),
        0,
        -(index * slot + slot / 2),
      );
      this.scale.set(width, height, depth);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.buildings.setMatrixAt(i, this.matrix);
      this.buildings.setColorAt(i, this.color.set(pickOne(rng, palette)));
    }
    this.buildings.instanceMatrix.needsUpdate = true;
    if (this.buildings.instanceColor) this.buildings.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.buildings.dispose();
    this.object.removeFromParent();
  }
}

export class PrimitiveDecorFactory implements DecorFactory {
  private readonly roadTexture = createRoadTexture();
  private readonly roadMaterial = new THREE.MeshLambertMaterial({ map: this.roadTexture });
  private readonly sidewalkMaterial = new THREE.MeshLambertMaterial({ color: COLORS.sidewalk });
  private readonly buildingMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });
  private readonly roadGeometry = new THREE.PlaneGeometry(W.roadHalfWidth * 2, L)
    .rotateX(-Math.PI / 2)
    .translate(0, 0, -L / 2);
  private readonly sidewalkGeometry: THREE.BufferGeometry;
  private readonly buildingGeometry = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);

  constructor() {
    const x = W.roadHalfWidth + W.sidewalkWidth / 2;
    const walk = (side: number): THREE.BufferGeometry =>
      new THREE.BoxGeometry(W.sidewalkWidth, 0.25, L).translate(side * x, 0.125 - 0.02, -L / 2);
    const merged = mergeGeometries([walk(-1), walk(1)]);
    if (!merged) throw new Error('Failed to build sidewalk geometry');
    this.sidewalkGeometry = merged;
  }

  create(): ChunkDecor {
    return new PrimitiveDecor({
      roadGeometry: this.roadGeometry,
      roadMaterial: this.roadMaterial,
      sidewalkGeometry: this.sidewalkGeometry,
      sidewalkMaterial: this.sidewalkMaterial,
      buildingGeometry: this.buildingGeometry,
      buildingMaterial: this.buildingMaterial,
    });
  }

  prepare(): void {}

  warm(): boolean {
    return false;
  }

  dispose(): void {
    this.roadGeometry.dispose();
    this.sidewalkGeometry.dispose();
    this.buildingGeometry.dispose();
    this.roadTexture.dispose();
    this.roadMaterial.dispose();
    this.sidewalkMaterial.dispose();
    this.buildingMaterial.dispose();
  }
}
