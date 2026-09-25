import * as THREE from 'three';
import { CONFIG } from '../config/gameConfig';
import { damp } from '../core/math';
import { createModelMaterial, box, ball, merge } from './models';
import type { ChaseContext, ChaserView } from './Chasers';

const C = CONFIG.chase;

/** Low-quality chasers: a boxy thief and a boxy dog with a simple bobbing run. */
export class PrimitiveChasers implements ChaserView {
  readonly root = new THREE.Group();
  private readonly thief = new THREE.Group();
  private readonly dog = new THREE.Group();
  private readonly material = createModelMaterial();
  private readonly geometries: THREE.BufferGeometry[] = [];
  private phase = 0;
  private sceneTime = 0;
  private gapOverride: number | null = null;

  constructor() {
    const thief = merge([
      box(0.56, 0.7, 0.32, 0x2c2f3a, 0, 1.05, 0),
      box(0.58, 0.85, 0.34, 0x16171c, 0, 0.42, 0),
      ball(0.2, 0xb98058, 0, 1.55, 0),
      box(0.4, 0.14, 0.42, 0x1d1f26, 0, 1.7, 0),
      box(0.3, 0.05, 0.2, 0x111318, 0, 1.63, -0.28),
    ]);
    const dog = merge([
      box(0.32, 0.3, 0.75, 0xc8843a, 0, 0.42, 0),
      box(0.22, 0.24, 0.26, 0xd99a55, 0, 0.6, -0.5),
      box(0.06, 0.28, 0.06, 0xc8843a, -0.1, 0.14, -0.25),
      box(0.06, 0.28, 0.06, 0xc8843a, 0.1, 0.14, 0.25),
      box(0.06, 0.2, 0.06, 0xa86a2a, 0, 0.62, 0.42),
    ]);
    this.geometries.push(thief, dog);
    this.thief.add(new THREE.Mesh(thief, this.material));
    this.dog.add(new THREE.Mesh(dog, this.material));
    this.root.add(this.thief, this.dog);
    this.root.visible = false;
  }

  reset(): void {
    this.sceneTime = 0;
    this.gapOverride = null;
    this.root.visible = false;
  }

  update(dt: number, ctx: ChaseContext): void {
    const { chase, path, travelled, player, speedNorm } = ctx;
    this.phase += dt * (10 + speedNorm * 6);
    if (chase.phase === 'snatch' || chase.phase === 'caught') this.sceneTime += dt;
    let gap = chase.gap;
    if (chase.phase === 'snatch') {
      this.gapOverride ??= chase.gap;
      this.gapOverride -= C.snatchSpeed * dt;
      gap = this.gapOverride;
    }
    this.root.visible = gap < 16 && gap > -60;
    if (!this.root.visible) return;

    const pt = path.sample(travelled - Math.max(gap, 0));
    const tx = chase.phase === 'snatch' ? damp(this.thief.position.x, player.x + 0.7, 8, dt) : pt.x;
    this.thief.position.set(tx, chase.phase === 'snatch' ? player.y : pt.y, gap);
    this.thief.position.y += Math.abs(Math.sin(this.phase)) * 0.08;

    const dogGap = gap - C.dogLead;
    const pd = path.sample(travelled - Math.max(dogGap, 0));
    this.dog.position.set(chase.phase === 'snatch' ? tx - 0.9 : pd.x - 0.55, pd.y, dogGap);
    this.dog.position.y += Math.abs(Math.sin(this.phase * 1.3)) * 0.1;
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    this.material.dispose();
    this.root.removeFromParent();
  }
}
