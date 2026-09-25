import * as THREE from 'three';
import { CONFIG, LANE_COUNT, laneToX } from '../config/gameConfig';
import { clamp, damp } from '../core/math';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import type { PlayerBox } from '../systems/Collision';
import { buildLaziGeometries, createModelMaterial, type LaziGeometries } from './models';

const P = CONFIG.player;
const LANE_SPEED = CONFIG.lane.width / CONFIG.lane.changeTime;

/**
 * Lazi. Lane switching, jump, slide and gravity live here; the mesh is a placeholder made of
 * primitives with procedural run/jump/slide animation.
 */
export class Player {
  readonly root = new THREE.Group();

  lane = 1;
  x = 0;
  y = 0;
  alive = true;
  /** Jump apex height (m); Super Spikes will raise this later. */
  jumpHeight: number = P.jumpHeight;

  private vy = 0;
  private grounded = true;
  private sliding = false;
  private slideTimer = 0;
  private prevLane = 1;
  private bufferedJump = 0;
  private queuedSlide = false;
  private runPhase = 0;
  private crashTime = 0;

  private readonly visual = new THREE.Group();
  private readonly legL = new THREE.Group();
  private readonly legR = new THREE.Group();
  private readonly armL = new THREE.Group();
  private readonly armR = new THREE.Group();
  private readonly shadow: THREE.Mesh;
  private readonly geometries: LaziGeometries;
  private readonly material = createModelMaterial();
  private readonly shadowMaterial = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  });
  private readonly shadowGeometry = new THREE.CircleGeometry(0.5, 16).rotateX(-Math.PI / 2);

  constructor(private readonly bus: EventBus<GameEvents>) {
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
    this.root.add(this.visual);

    this.shadow = new THREE.Mesh(this.shadowGeometry, this.shadowMaterial);
    this.shadow.position.y = 0.03;
    this.root.add(this.shadow);
    // The shadow must stay on the ground while `root` lifts off during a jump.
  }

  reset(): void {
    this.lane = 1;
    this.prevLane = 1;
    this.x = 0;
    this.y = 0;
    this.vy = 0;
    this.grounded = true;
    this.sliding = false;
    this.slideTimer = 0;
    this.bufferedJump = 0;
    this.queuedSlide = false;
    this.alive = true;
    this.crashTime = 0;
    this.runPhase = 0;
    this.visual.rotation.set(0, 0, 0);
    this.visual.position.set(0, 0, 0);
    this.jumpHeight = P.jumpHeight;
    this.syncTransform();
  }

  moveLeft(): void {
    this.changeLane(-1);
  }

  moveRight(): void {
    this.changeLane(1);
  }

  private changeLane(direction: -1 | 1): void {
    if (!this.alive) return;
    const next = this.lane + direction;
    if (next < 0 || next > LANE_COUNT - 1) return;
    this.prevLane = this.lane;
    this.lane = next;
    this.bus.emit('laneChange');
  }

  /** After a side clip: go back to the lane we came from. */
  bounceBack(): void {
    this.lane = this.prevLane;
  }

  jump(): void {
    if (!this.alive) return;
    if (this.grounded) {
      this.vy = Math.sqrt(2 * P.gravity * this.jumpHeight);
      this.grounded = false;
      this.sliding = false;
      this.slideTimer = 0;
      this.bus.emit('jump');
    } else {
      this.bufferedJump = P.inputBuffer;
    }
  }

  slide(): void {
    if (!this.alive) return;
    if (this.grounded) {
      this.startSlide();
    } else {
      // Down in the air = fast-fall, then slide on landing.
      this.vy = Math.min(this.vy, -P.fastFallSpeed);
      this.queuedSlide = true;
    }
  }

  private startSlide(): void {
    this.sliding = true;
    this.slideTimer = P.slideTime;
    this.bus.emit('slide');
  }

  crash(): void {
    this.alive = false;
    this.sliding = false;
    this.crashTime = 0;
  }

  getBox(s: number): PlayerBox {
    return {
      x: this.x,
      s,
      halfWidth: P.halfWidth,
      halfDepth: P.halfDepth,
      yMin: this.y,
      yMax: this.y + (this.sliding ? P.slideHeight : P.height),
    };
  }

  /** `speedNorm` (0..1) scales the run-cycle rate; `running` is false on menus. */
  update(dt: number, speedNorm: number, running: boolean): void {
    if (this.alive) {
      this.updateLane(dt);
      this.updatePhysics(dt);
    } else {
      this.crashTime += dt;
    }
    this.animate(dt, speedNorm, running);
    this.syncTransform();
  }

  private updateLane(dt: number): void {
    const target = laneToX(this.lane);
    const step = LANE_SPEED * dt;
    const diff = target - this.x;
    this.x = Math.abs(diff) <= step ? target : this.x + Math.sign(diff) * step;
  }

  private updatePhysics(dt: number): void {
    if (this.sliding) {
      this.slideTimer -= dt;
      if (this.slideTimer <= 0) this.sliding = false;
    }
    this.bufferedJump = Math.max(0, this.bufferedJump - dt);
    if (this.grounded) return;

    this.vy -= P.gravity * dt;
    this.y += this.vy * dt;
    if (this.y <= 0) {
      this.y = 0;
      this.vy = 0;
      this.grounded = true;
      if (this.queuedSlide) {
        this.queuedSlide = false;
        this.startSlide();
      }
      if (this.bufferedJump > 0) {
        this.bufferedJump = 0;
        this.jump();
      }
    }
  }

  private animate(dt: number, speedNorm: number, running: boolean): void {
    const v = this.visual;
    if (!this.alive) {
      // Tumble forward and flop.
      const t = clamp(this.crashTime / 0.35, 0, 1);
      v.rotation.x = -1.5 * t;
      v.position.y = 0.25 * t;
      this.armL.rotation.x = this.armR.rotation.x = -2.2 * t;
      this.legL.rotation.x = 0.3 * t;
      this.legR.rotation.x = -0.4 * t;
      return;
    }

    const lean = clamp((laneToX(this.lane) - this.x) / CONFIG.lane.width, -1, 1);
    v.rotation.z = damp(v.rotation.z, -lean * 0.25, 20, dt);

    if (this.sliding) {
      v.rotation.x = damp(v.rotation.x, 1.3, 30, dt);
      v.position.y = damp(v.position.y, 0.05, 30, dt);
      this.legL.rotation.x = this.legR.rotation.x = 0;
      this.armL.rotation.x = this.armR.rotation.x = 1.2;
    } else if (!this.grounded) {
      v.rotation.x = damp(v.rotation.x, 0, 20, dt);
      v.position.y = damp(v.position.y, 0, 20, dt);
      this.legL.rotation.x = -0.9;
      this.legR.rotation.x = 0.5;
      this.armL.rotation.x = 2.4;
      this.armR.rotation.x = 2.4;
    } else if (running) {
      v.rotation.x = damp(v.rotation.x, 0.12, 20, dt);
      this.runPhase += dt * (10 + speedNorm * 6);
      const swing = Math.sin(this.runPhase);
      this.legL.rotation.x = swing * 0.95;
      this.legR.rotation.x = -swing * 0.95;
      this.armL.rotation.x = -swing * 0.85;
      this.armR.rotation.x = swing * 0.85;
      v.position.y = Math.abs(Math.cos(this.runPhase)) * 0.06;
    } else {
      // Idle
      v.rotation.x = damp(v.rotation.x, 0, 10, dt);
      v.position.y = damp(v.position.y, 0, 10, dt);
      this.legL.rotation.x = this.legR.rotation.x = 0;
      this.armL.rotation.x = this.armR.rotation.x = 0;
    }
  }

  private syncTransform(): void {
    this.root.position.set(this.x, this.y, 0);
    // Keep the blob shadow on the road and shrink/fade it with height.
    this.shadow.position.y = 0.03 - this.y;
    const k = 1 / (1 + this.y * 0.6);
    this.shadow.scale.setScalar(k);
    this.shadowMaterial.opacity = 0.3 * k;
  }

  dispose(): void {
    this.geometries.body.dispose();
    this.geometries.leg.dispose();
    this.geometries.arm.dispose();
    this.shadowGeometry.dispose();
    this.shadowMaterial.dispose();
    this.material.dispose();
  }
}
