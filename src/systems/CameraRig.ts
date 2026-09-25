import * as THREE from 'three';
import { CONFIG } from '../config/gameConfig';
import { damp, lerp } from '../core/math';

const C = CONFIG.camera;

/** Third-person chase camera: sits behind and above Lazi, eases sideways, widens FOV with speed. */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;

  private x = 0;
  private y = 0;
  private fov: number = C.fovBase;
  private shakeMagnitude = 0;
  private shakeDuration = 0;
  private shakeTime = 0;
  private impactDip = 0;
  private fovPulse = 0;
  private readonly lookTarget = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(C.fovBase, aspect, 0.4, 2600);
    this.camera.position.set(0, C.height, C.distance);
    this.camera.lookAt(0, C.lookHeight, C.lookAheadZ);
  }

  /**
   * Tall (portrait) screens see much less sideways, so the outer lanes would sit on the very
   * edge. Below `PORTRAIT_ASPECT` the camera pulls back/up and widens its FOV to keep all three
   * lanes comfortably on screen. 0 on landscape, up to 1 on a narrow phone.
   */
  private portrait = 0;

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.portrait = Math.min(
      1,
      Math.max(0, (C.portraitAspect - aspect) / (C.portraitAspect - 0.45)),
    );
    this.camera.updateProjectionMatrix();
  }

  /** Kick the camera. Magnitude is in metres; it decays over `duration` seconds. */
  shake(magnitude: number, duration: number): void {
    this.shakeMagnitude = magnitude;
    this.shakeDuration = duration;
    this.shakeTime = duration;
  }

  /** A quick downward bump (landing). */
  impact(amount: number): void {
    this.impactDip = Math.min(0.5, this.impactDip + amount);
  }

  /** A brief widening of the field of view (near miss, boost). */
  pulse(degrees: number): void {
    this.fovPulse = Math.max(this.fovPulse, degrees);
  }

  /** `speedNorm` is 0..1 (current speed relative to the cap). */
  update(dt: number, playerX: number, playerY: number, speedNorm: number): void {
    this.x = damp(this.x, playerX * C.followX, C.smoothing, dt);
    this.y = damp(this.y, playerY * 0.35, C.smoothing, dt);

    let shakeX = 0;
    let shakeY = 0;
    if (this.shakeTime > 0) {
      this.shakeTime = Math.max(0, this.shakeTime - dt);
      const decay = (this.shakeTime / this.shakeDuration) ** 2;
      const amp = this.shakeMagnitude * decay;
      const t = this.shakeTime * 60;
      shakeX = Math.sin(t * 1.7) * amp;
      shakeY = Math.cos(t * 2.3) * amp;
    }

    this.impactDip = damp(this.impactDip, 0, 9, dt);
    this.fovPulse = damp(this.fovPulse, 0, 6, dt);
    this.camera.position.set(
      this.x + shakeX,
      C.height * (1 + this.portrait * C.portraitPullBack) + this.y + shakeY - this.impactDip,
      C.distance * (1 + this.portrait * C.portraitPullBack),
    );
    this.lookTarget.set(this.x * 0.6, C.lookHeight + this.y * 0.5, C.lookAheadZ);
    this.camera.lookAt(this.lookTarget);

    const targetFov =
      lerp(C.fovBase, C.fovMax, speedNorm) + this.fovPulse + this.portrait * C.portraitFovBoost;
    this.fov = damp(this.fov, targetFov, 3, dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  reset(): void {
    this.x = 0;
    this.y = 0;
    this.fov = C.fovBase;
    this.shakeTime = 0;
    this.impactDip = 0;
    this.fovPulse = 0;
    this.camera.fov = C.fovBase;
    this.camera.updateProjectionMatrix();
  }
}
