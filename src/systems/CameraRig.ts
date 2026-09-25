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
  private readonly lookTarget = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(C.fovBase, aspect, 0.1, 400);
    this.camera.position.set(0, C.height, C.distance);
    this.camera.lookAt(0, C.lookHeight, C.lookAheadZ);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Kick the camera. Magnitude is in metres; it decays over `duration` seconds. */
  shake(magnitude: number, duration: number): void {
    this.shakeMagnitude = magnitude;
    this.shakeDuration = duration;
    this.shakeTime = duration;
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

    this.camera.position.set(this.x + shakeX, C.height + this.y + shakeY, C.distance);
    this.lookTarget.set(this.x * 0.6, C.lookHeight + this.y * 0.5, C.lookAheadZ);
    this.camera.lookAt(this.lookTarget);

    const targetFov = lerp(C.fovBase, C.fovMax, speedNorm);
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
    this.camera.fov = C.fovBase;
    this.camera.updateProjectionMatrix();
  }
}
