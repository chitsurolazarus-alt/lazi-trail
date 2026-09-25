import * as THREE from 'three';
import { CONFIG, LANE_COUNT, laneToX } from '../config/gameConfig';
import type { QualityProfile } from '../config/quality';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import { clamp } from '../core/math';
import type { PlayerBox } from '../systems/Collision';
import type { PlayerPose, PlayerView } from './PlayerView';

const P = CONFIG.player;
const LANE_SPEED = CONFIG.lane.width / CONFIG.lane.changeTime;

/**
 * Lazi's movement: lane switching, jump, slide, gravity, ramps and roofs. What she looks like is
 * up to the `PlayerView` (rigged model, or primitive shapes on Low quality).
 */
export class Player {
  readonly root = new THREE.Group();

  lane = 1;
  x = 0;
  y = 0;
  alive = true;
  /** Jump apex height (m). Character perks scale the base; Super Spikes raise it further. */
  jumpHeight: number = P.jumpHeight;
  /** Character perks: lane-change speed and jump height multipliers. */
  private laneSpeedMul = 1;
  private jumpMul = 1;

  private vy = 0;
  private grounded = true;
  private sliding = false;
  private slideTimer = 0;
  private prevLane = 1;
  private bufferedJump = 0;
  private queuedSlide = false;
  private groundY = 0;
  private shadowsOn = false;

  private readonly pose: PlayerPose = {
    alive: true,
    grounded: true,
    sliding: false,
    running: false,
    speedNorm: 0,
    lean: 0,
    y: 0,
    vy: 0,
  };

  private readonly shadow: THREE.Mesh;
  private readonly shadowMaterial = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  });
  private readonly shadowGeometry = new THREE.CircleGeometry(0.5, 16).rotateX(-Math.PI / 2);

  constructor(
    private readonly bus: EventBus<GameEvents>,
    profile: QualityProfile,
    public view: PlayerView,
  ) {
    this.root.add(view.object);
    this.shadowsOn = profile.shadows === 'map';
    view.setShadows(this.shadowsOn);

    // A real shadow map replaces the blob; otherwise the blob keeps jumps readable.
    this.shadow = new THREE.Mesh(this.shadowGeometry, this.shadowMaterial);
    this.shadow.visible = profile.shadows !== 'map';
    this.root.add(this.shadow);
  }

  /** Swap in another character's model (menu only). */
  setView(view: PlayerView): void {
    this.root.remove(this.view.object);
    this.view.dispose();
    this.view = view;
    this.root.add(view.object);
    view.setShadows(this.shadowsOn);
    view.reset();
  }

  /** Stand back up after a crash (Second Chance). Keeps the lane and position. */
  revive(): void {
    this.alive = true;
    this.vy = 0;
    this.grounded = true;
    this.sliding = false;
    this.slideTimer = 0;
    this.bufferedJump = 0;
    this.queuedSlide = false;
    this.y = this.groundY;
    this.view.reset();
    this.syncTransform();
  }

  /** Apply the selected character's perks (call before `reset`). */
  setPerks(perks: { laneSpeedMul: number; jumpHeightMul: number }): void {
    this.laneSpeedMul = perks.laneSpeedMul;
    this.jumpMul = perks.jumpHeightMul;
    this.jumpHeight = P.jumpHeight * this.jumpMul;
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
    this.groundY = 0;
    this.jumpHeight = P.jumpHeight * this.jumpMul;
    this.view.reset();
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
    this.view.trigger('stumble');
  }

  jump(): void {
    if (!this.alive) return;
    if (this.grounded) {
      this.vy = Math.sqrt(2 * P.gravity * this.jumpHeight);
      this.grounded = false;
      this.sliding = false;
      this.slideTimer = 0;
      this.view.trigger('jump');
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
    this.view.trigger('slide');
    this.bus.emit('slide');
  }

  /** Game over. `caught` = the chasers got her (rather than an obstacle). */
  crash(caught = false): void {
    this.alive = false;
    this.sliding = false;
    this.view.trigger(caught ? 'caught' : 'crash');
  }

  celebrate(): void {
    this.view.trigger('celebrate');
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

  /** True while on a raised surface (roof), for dust/footstep effects. */
  get onRoof(): boolean {
    return this.grounded && this.groundY > 0.5;
  }

  get isGrounded(): boolean {
    return this.grounded;
  }

  get isSliding(): boolean {
    return this.sliding;
  }

  /**
   * `speedNorm` (0..1) scales the run-cycle rate; `running` is false on menus; `ground` is the
   * height of the walkable surface under Lazi (0 = road, higher on ramps and roofs).
   */
  update(dt: number, speedNorm: number, running: boolean, ground = 0): void {
    this.groundY = ground;
    if (this.alive) {
      this.updateLane(dt);
      this.updatePhysics(dt, ground);
    }
    const p = this.pose;
    p.alive = this.alive;
    p.grounded = this.grounded;
    p.sliding = this.sliding;
    p.running = running;
    p.speedNorm = speedNorm;
    p.lean = clamp((laneToX(this.lane) - this.x) / CONFIG.lane.width, -1, 1);
    p.y = this.y;
    p.vy = this.vy;
    this.view.update(dt, p);
    this.syncTransform();
  }

  private updateLane(dt: number): void {
    const target = laneToX(this.lane);
    const step = LANE_SPEED * this.laneSpeedMul * dt;
    const diff = target - this.x;
    this.x = Math.abs(diff) <= step ? target : this.x + Math.sign(diff) * step;
  }

  private updatePhysics(dt: number, ground: number): void {
    if (this.sliding) {
      this.slideTimer -= dt;
      if (this.slideTimer <= 0) this.sliding = false;
    }
    this.bufferedJump = Math.max(0, this.bufferedJump - dt);
    if (this.grounded) {
      if (this.y > ground + 0.08) {
        // Ran off the end of a roof: start falling.
        this.grounded = false;
        this.vy = 0;
      } else {
        this.y = ground; // follows ramps up, stays on roofs
        return;
      }
    }

    this.vy -= P.gravity * dt;
    this.y += this.vy * dt;
    if (this.y <= ground && this.vy <= 0) {
      const impact = -this.vy;
      this.y = ground;
      this.vy = 0;
      this.grounded = true;
      this.view.trigger('land');
      this.bus.emit('land', { impact });
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

  private syncTransform(): void {
    this.root.position.set(this.x, this.y, 0);
    // Keep the blob shadow on the surface underfoot and shrink/fade it with height above it.
    const above = Math.max(0, this.y - this.groundY);
    this.shadow.position.y = this.groundY - this.y + 0.03;
    const k = 1 / (1 + above * 0.6);
    this.shadow.scale.setScalar(k);
    this.shadowMaterial.opacity = 0.3 * k;
  }

  dispose(): void {
    this.view.dispose();
    this.shadowGeometry.dispose();
    this.shadowMaterial.dispose();
  }
}
