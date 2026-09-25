import * as THREE from 'three';
import { clamp, damp } from '../core/math';
import { buildLaziGeometries, createModelMaterial, type LaziGeometries } from './models';
import type { PlayerEvent, PlayerPose, PlayerView } from './PlayerView';

/** Phase 1 look: Lazi from boxes with a procedural run/jump/slide. Used on Low quality. */
export class PrimitivePlayerView implements PlayerView {
  readonly object = new THREE.Group();

  private readonly visual = new THREE.Group();
  private readonly legL = new THREE.Group();
  private readonly legR = new THREE.Group();
  private readonly armL = new THREE.Group();
  private readonly armR = new THREE.Group();
  private readonly geometries: LaziGeometries;
  private readonly material = createModelMaterial();
  private runPhase = 0;
  private crashTime = 0;
  private crashed = false;

  constructor() {
    this.geometries = buildLaziGeometries();
    const { body, leg, arm } = this.geometries;
    this.visual.add(new THREE.Mesh(body, this.material));
    this.legL.position.set(-0.14, 0.75, 0);
    this.legR.position.set(0.14, 0.75, 0);
    this.armL.position.set(-0.38, 1.32, 0);
    this.armR.position.set(0.38, 1.32, 0);
    for (const limb of [this.legL, this.legR]) limb.add(new THREE.Mesh(leg, this.material));
    for (const limb of [this.armL, this.armR]) limb.add(new THREE.Mesh(arm, this.material));
    this.visual.add(this.legL, this.legR, this.armL, this.armR);
    this.object.add(this.visual);
  }

  trigger(event: PlayerEvent): void {
    if (event === 'crash' || event === 'caught') {
      this.crashed = true;
      this.crashTime = 0;
    }
  }

  reset(): void {
    this.crashed = false;
    this.crashTime = 0;
    this.runPhase = 0;
    this.visual.rotation.set(0, 0, 0);
    this.visual.position.set(0, 0, 0);
  }

  setShadows(cast: boolean): void {
    this.visual.traverse((o) => (o.castShadow = cast));
  }

  update(dt: number, pose: PlayerPose): void {
    const v = this.visual;
    if (this.crashed || !pose.alive) {
      // Tumble forward and flop.
      this.crashTime += dt;
      const t = clamp(this.crashTime / 0.35, 0, 1);
      v.rotation.x = -1.5 * t;
      v.position.y = 0.25 * t;
      this.armL.rotation.x = this.armR.rotation.x = -2.2 * t;
      this.legL.rotation.x = 0.3 * t;
      this.legR.rotation.x = -0.4 * t;
      return;
    }

    v.rotation.z = damp(v.rotation.z, -pose.lean * 0.25, 20, dt);

    if (pose.sliding) {
      v.rotation.x = damp(v.rotation.x, 1.3, 30, dt);
      v.position.y = damp(v.position.y, 0.05, 30, dt);
      this.legL.rotation.x = this.legR.rotation.x = 0;
      this.armL.rotation.x = this.armR.rotation.x = 1.2;
    } else if (!pose.grounded) {
      v.rotation.x = damp(v.rotation.x, 0, 20, dt);
      v.position.y = damp(v.position.y, 0, 20, dt);
      this.legL.rotation.x = -0.9;
      this.legR.rotation.x = 0.5;
      this.armL.rotation.x = 2.4;
      this.armR.rotation.x = 2.4;
    } else if (pose.running) {
      v.rotation.x = damp(v.rotation.x, 0.12, 20, dt);
      this.runPhase += dt * (10 + pose.speedNorm * 6);
      const swing = Math.sin(this.runPhase);
      this.legL.rotation.x = swing * 0.95;
      this.legR.rotation.x = -swing * 0.95;
      this.armL.rotation.x = -swing * 0.85;
      this.armR.rotation.x = swing * 0.85;
      v.position.y = Math.abs(Math.cos(this.runPhase)) * 0.06;
    } else {
      v.rotation.x = damp(v.rotation.x, 0, 10, dt);
      v.position.y = damp(v.position.y, 0, 10, dt);
      this.legL.rotation.x = this.legR.rotation.x = 0;
      this.armL.rotation.x = this.armR.rotation.x = 0;
    }
  }

  dispose(): void {
    this.geometries.body.dispose();
    this.geometries.leg.dispose();
    this.geometries.arm.dispose();
    this.material.dispose();
  }
}
