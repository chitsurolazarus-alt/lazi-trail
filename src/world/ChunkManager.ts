import * as THREE from 'three';
import { COLORS } from '../config/colors';
import { CONFIG } from '../config/gameConfig';
import type { ZoneDef } from '../config/zones';
import { createRng } from '../core/random';
import { CoinPool } from '../entities/Coin';
import { ObstaclePool } from '../entities/Obstacle';
import { Chunk, type ChunkAssets } from './Chunk';
import { ObstacleGenerator, type GeneratorParams } from './ObstacleGenerator';

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
    // Edge lines
    ctx.fillStyle = '#e9e4d6';
    for (const x of [-W.roadHalfWidth + 0.25, W.roadHalfWidth - 0.25]) {
      ctx.fillRect(xPx(x) - 2, 0, 4, canvas.height);
    }
    // Dashed lane dividers, 4 m on / 4 m off (chunk length is a multiple of 8 m)
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

/**
 * Keeps an endless stretch of chunks around the player: spawns ahead, recycles behind.
 * Chunks (and everything on them) are pooled, so steady-state running allocates nothing.
 */
export class ChunkManager {
  private active: Chunk[] = [];
  private spare: Chunk[] = [];
  private nextStart = -L;
  private generator: ObstacleGenerator;
  private rng = createRng(1);

  private readonly obstaclePool = new ObstaclePool();
  private readonly coinPool = new CoinPool();
  private readonly assets: ChunkAssets;
  private readonly roadTexture = createRoadTexture();
  private readonly roadMaterial = new THREE.MeshLambertMaterial({ map: this.roadTexture });
  private readonly buildingMaterials = new Map<number, THREE.MeshLambertMaterial>();
  private readonly sidewalkMaterial = new THREE.MeshLambertMaterial({ color: COLORS.sidewalk });
  private readonly roadGeometry = new THREE.PlaneGeometry(W.roadHalfWidth * 2, L)
    .rotateX(-Math.PI / 2)
    .translate(0, 0, -L / 2);
  private readonly sidewalkGeometry = new THREE.BoxGeometry(W.sidewalkWidth, 0.25, L).translate(
    0,
    0.125 - 0.02,
    -L / 2,
  );
  private readonly buildingGeometry = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);

  constructor(private readonly parent: THREE.Object3D) {
    this.generator = new ObstacleGenerator(this.rng);
    this.assets = {
      road: new THREE.Mesh(this.roadGeometry, this.roadMaterial),
      sidewalkGeometry: this.sidewalkGeometry,
      sidewalkMaterial: this.sidewalkMaterial,
      buildingGeometry: this.buildingGeometry,
      buildingMaterial: (color) => this.getBuildingMaterial(color),
    };
  }

  get chunks(): readonly Chunk[] {
    return this.active;
  }

  /** Start a fresh track. */
  reset(seed: number): void {
    for (const chunk of this.active) this.recycle(chunk);
    this.active.length = 0;
    this.nextStart = -L;
    this.rng = createRng(seed);
    this.generator = new ObstacleGenerator(this.rng);
  }

  update(travelled: number, params: GeneratorParams, zone: ZoneDef): void {
    // Recycle chunks that have fully passed behind the player.
    while (this.active.length > 0) {
      const first = this.active[0] as Chunk;
      if (travelled - first.start <= W.recycleDistance) break;
      this.active.shift();
      this.recycle(first);
    }

    // Generate ahead.
    while (this.nextStart < travelled + W.lookahead) {
      const chunk = this.spare.pop() ?? new Chunk(this.assets);
      const section = this.generator.generate(this.nextStart + L, params);
      chunk.populate(
        this.nextStart,
        section,
        this.obstaclePool,
        this.coinPool,
        this.rng,
        zone.buildings,
      );
      this.parent.add(chunk.group);
      this.active.push(chunk);
      this.nextStart += L;
    }

    for (const chunk of this.active) chunk.setScroll(travelled);
  }

  /** Spin coins. Cheap: only touches coins still in play. */
  animateCoins(angle: number): void {
    for (const chunk of this.active) {
      for (const coin of chunk.coins) if (!coin.collected) coin.mesh.rotation.y = angle;
    }
  }

  private recycle(chunk: Chunk): void {
    chunk.clear(this.obstaclePool, this.coinPool);
    chunk.group.removeFromParent();
    this.spare.push(chunk);
  }

  private getBuildingMaterial(color: number): THREE.Material {
    let material = this.buildingMaterials.get(color);
    if (!material) {
      material = new THREE.MeshLambertMaterial({ color });
      this.buildingMaterials.set(color, material);
    }
    return material;
  }

  dispose(): void {
    for (const chunk of this.active) chunk.clear(this.obstaclePool, this.coinPool);
    for (const chunk of [...this.active, ...this.spare]) chunk.group.removeFromParent();
    this.active.length = 0;
    this.spare.length = 0;
    this.obstaclePool.dispose();
    this.coinPool.dispose();
    this.roadGeometry.dispose();
    this.sidewalkGeometry.dispose();
    this.buildingGeometry.dispose();
    this.roadTexture.dispose();
    this.roadMaterial.dispose();
    this.sidewalkMaterial.dispose();
    for (const material of this.buildingMaterials.values()) material.dispose();
    this.buildingMaterials.clear();
  }
}
