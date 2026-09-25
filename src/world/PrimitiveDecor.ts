import * as THREE from 'three';
import { COLORS } from '../config/colors';
import { CONFIG } from '../config/gameConfig';
import { ZONES } from '../config/zones';
import { pickOne, randRange, type Rng } from '../core/random';
import type { ChunkDecor, DecorFactory } from './ChunkDecor';

const W = CONFIG.world;
const L = W.chunkLength;

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

/** Phase 1 look: flat-coloured boxes for buildings. Used on Low quality. */
class PrimitiveDecor implements ChunkDecor {
  readonly object = new THREE.Group();
  private readonly buildings: THREE.Mesh[] = [];

  constructor(private readonly shared: PrimitiveShared) {
    this.object.add(new THREE.Mesh(shared.roadGeometry, shared.roadMaterial));
    const sidewalkX = W.roadHalfWidth + W.sidewalkWidth / 2;
    for (const side of [-1, 1]) {
      const walk = new THREE.Mesh(shared.sidewalkGeometry, shared.sidewalkMaterial);
      walk.position.x = side * sidewalkX;
      this.object.add(walk);
    }
    for (let i = 0; i < W.buildingsPerSide * 2; i++) {
      const b = new THREE.Mesh(shared.buildingGeometry, shared.buildingMaterial(0xffffff));
      this.buildings.push(b);
      this.object.add(b);
    }
  }

  dress(zoneIndex: number, rng: Rng): void {
    const palette = (ZONES[zoneIndex] ?? ZONES[0])?.buildings ?? [0xcccccc];
    const perSide = W.buildingsPerSide;
    const slot = L / perSide;
    for (let i = 0; i < this.buildings.length; i++) {
      const building = this.buildings[i] as THREE.Mesh;
      const side = i < perSide ? -1 : 1;
      const index = i % perSide;
      const width = randRange(rng, 4, 6.5);
      const height = randRange(rng, 5, 14);
      const depth = slot - randRange(rng, 0.4, 1.2);
      building.material = this.shared.buildingMaterial(pickOne(rng, palette));
      building.scale.set(width, height, depth);
      building.position.set(
        side * (W.roadHalfWidth + W.sidewalkWidth + width / 2 + 0.2),
        0,
        -(index * slot + slot / 2),
      );
    }
  }

  dispose(): void {
    this.object.removeFromParent();
  }
}

interface PrimitiveShared {
  roadGeometry: THREE.BufferGeometry;
  roadMaterial: THREE.Material;
  sidewalkGeometry: THREE.BufferGeometry;
  sidewalkMaterial: THREE.Material;
  buildingGeometry: THREE.BufferGeometry;
  buildingMaterial(color: number): THREE.Material;
}

export class PrimitiveDecorFactory implements DecorFactory {
  private readonly roadTexture = createRoadTexture();
  private readonly roadMaterial = new THREE.MeshLambertMaterial({ map: this.roadTexture });
  private readonly sidewalkMaterial = new THREE.MeshLambertMaterial({ color: COLORS.sidewalk });
  private readonly buildingMaterials = new Map<number, THREE.MeshLambertMaterial>();
  private readonly roadGeometry = new THREE.PlaneGeometry(W.roadHalfWidth * 2, L)
    .rotateX(-Math.PI / 2)
    .translate(0, 0, -L / 2);
  private readonly sidewalkGeometry = new THREE.BoxGeometry(W.sidewalkWidth, 0.25, L).translate(
    0,
    0.125 - 0.02,
    -L / 2,
  );
  private readonly buildingGeometry = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);

  create(): ChunkDecor {
    return new PrimitiveDecor({
      roadGeometry: this.roadGeometry,
      roadMaterial: this.roadMaterial,
      sidewalkGeometry: this.sidewalkGeometry,
      sidewalkMaterial: this.sidewalkMaterial,
      buildingGeometry: this.buildingGeometry,
      buildingMaterial: (color) => this.material(color),
    });
  }

  prepare(): void {}

  warm(): boolean {
    return false;
  }

  private material(color: number): THREE.Material {
    let m = this.buildingMaterials.get(color);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color });
      this.buildingMaterials.set(color, m);
    }
    return m;
  }

  dispose(): void {
    this.roadGeometry.dispose();
    this.sidewalkGeometry.dispose();
    this.buildingGeometry.dispose();
    this.roadTexture.dispose();
    this.roadMaterial.dispose();
    this.sidewalkMaterial.dispose();
    for (const m of this.buildingMaterials.values()) m.dispose();
    this.buildingMaterials.clear();
  }
}
