import * as THREE from 'three';
import { COLORS } from '../config/colors';
import { CONFIG } from '../config/gameConfig';
import type { ZoneDef } from '../config/zones';
import { damp } from '../core/math';

/** Scene, sky, fog and lighting. Sky/fog colours ease toward the current zone's palette. */
export class Environment {
  readonly scene = new THREE.Scene();

  private readonly skyTarget = new THREE.Color();
  private readonly fogTarget = new THREE.Color();
  private readonly ground: THREE.Mesh;
  private readonly hemi = new THREE.HemisphereLight(0xffffff, 0x88805f, 1.9);
  private readonly sun = new THREE.DirectionalLight(0xfff4e0, 2.2);

  constructor(zone: ZoneDef) {
    this.scene.background = new THREE.Color(zone.sky);
    this.scene.fog = new THREE.Fog(zone.fog, CONFIG.world.fogNear, CONFIG.world.fogFar);
    this.skyTarget.set(zone.sky);
    this.fogTarget.set(zone.fog);

    this.sun.position.set(-6, 12, 8);
    this.scene.add(this.hemi, this.sun);

    // Wide ground under everything so the sides of the street never show sky.
    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(600, 900).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: COLORS.ground }),
    );
    this.ground.position.set(0, -0.05, -300);
    this.scene.add(this.ground);
  }

  /** Jump straight to a zone's palette (new run). */
  snapToZone(zone: ZoneDef): void {
    this.setZone(zone);
    (this.scene.background as THREE.Color).copy(this.skyTarget);
    (this.scene.fog as THREE.Fog).color.copy(this.fogTarget);
  }

  setZone(zone: ZoneDef): void {
    this.skyTarget.set(zone.sky);
    this.fogTarget.set(zone.fog);
  }

  update(dt: number): void {
    const sky = this.scene.background as THREE.Color;
    const fog = (this.scene.fog as THREE.Fog).color;
    for (const [current, target] of [
      [sky, this.skyTarget],
      [fog, this.fogTarget],
    ] as const) {
      current.r = damp(current.r, target.r, 1.5, dt);
      current.g = damp(current.g, target.g, 1.5, dt);
      current.b = damp(current.b, target.b, 1.5, dt);
    }
  }

  dispose(): void {
    this.ground.geometry.dispose();
    (this.ground.material as THREE.Material).dispose();
    this.hemi.dispose();
    this.sun.dispose();
  }
}
