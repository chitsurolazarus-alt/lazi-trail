import * as THREE from 'three';
import { ZONES, zoneIndexAt } from '../config/zones';
import type { AssetLoader, ModelKey } from '../core/AssetLoader';
import { randRange, pickOne } from '../core/random';
import { Character } from '../entities/Character';
import { MeshBuilder } from './MeshBuilder';

/** Everyday life on the street: pedestrians walking the pavements and pigeons that scatter. */

const PED_MODELS: readonly ModelKey[] = ['ped_worker', 'ped_business', 'ped_farmer'];
const SKIN_TONES = [0x4a2c1a, 0x6b4126, 0x8a5a3c, 0xa8724a, 0xc9956b] as const;
const SHIRTS = [0xc1121f, 0x1d4ed8, 0x15803d, 0xf59e0b, 0x7c3aed, 0xf6f3ea, 0x0f766e] as const;
const PANTS = [0x1f2937, 0x374151, 0x3b2f2f, 0x44403c] as const;

const CURB = 0.18;
const PLATFORM = 1.1;
/** Peds/pigeons behind this z (metres behind the player) are recycled ahead. */
const RECYCLE_Z = 14;
const MIN_AHEAD = 70;
const MAX_AHEAD = 170;

interface Walker {
  character: Character;
  /** Track position (m). */
  s: number;
  x: number;
  y: number;
  /** +1 walks the same way Lazi runs, -1 comes toward her. */
  dir: 1 | -1;
  speed: number;
}

export class Pedestrians {
  readonly object = new THREE.Group();
  private readonly walkers: Walker[] = [];

  constructor(
    assets: AssetLoader,
    count: number,
    shadows: boolean,
    private readonly rng: () => number = Math.random,
  ) {
    for (let i = 0; i < count; i++) {
      const model = pickOne(rng, PED_MODELS);
      const recolor: Record<string, number> = {
        Skin: pickOne(rng, SKIN_TONES),
        Worker_Vest: pickOne(rng, [0xff7a1a, 0xffd23f]),
        Suit: pickOne(rng, PANTS),
        LightBlue: pickOne(rng, SHIRTS),
        Brown: pickOne(rng, PANTS),
        Brown2: pickOne(rng, PANTS),
      };
      const character = new Character(assets, { model, scale: 1, recolor, roughness: 0.9 });
      character.setShadows(shadows);
      character.play('Walk', { fade: 0, timeScale: 0.9 + rng() * 0.3 });
      this.walkers.push({ character, s: 0, x: 0, y: CURB, dir: 1, speed: 1.2 });
      this.object.add(character.root);
    }
  }

  /** Scatter everyone ahead of the start of a run. */
  reset(travelled: number): void {
    for (const w of this.walkers) this.respawn(w, travelled, randRange(this.rng, 8, MAX_AHEAD));
  }

  private respawn(w: Walker, travelled: number, ahead: number): void {
    w.s = travelled + ahead;
    const style = ZONES[zoneIndexAt(w.s)]?.style ?? 'township';
    const side = this.rng() < 0.5 ? -1 : 1;
    const onPlatform = style === 'trainyard';
    w.x = side * (onPlatform ? randRange(this.rng, 5.0, 6.8) : randRange(this.rng, 5.0, 7.0));
    w.y = onPlatform ? PLATFORM : CURB;
    w.dir = this.rng() < 0.5 ? 1 : -1;
    w.speed = randRange(this.rng, 1.0, 1.7);
    const root = w.character.root;
    root.rotation.y = w.dir === 1 ? 0 : Math.PI;
    w.character.play('Walk', { fade: 0, timeScale: 0.7 + w.speed * 0.4 });
  }

  update(dt: number, travelled: number): void {
    for (const w of this.walkers) {
      w.s += w.dir * w.speed * dt;
      const z = -(w.s - travelled);
      if (z > RECYCLE_Z) {
        this.respawn(w, travelled, randRange(this.rng, MIN_AHEAD, MAX_AHEAD));
        continue;
      }
      w.character.root.position.set(w.x, w.y, z);
      w.character.root.visible = z > -120;
      if (z > -100) w.character.update(dt);
    }
  }

  dispose(): void {
    for (const w of this.walkers) w.character.dispose();
    this.walkers.length = 0;
    this.object.removeFromParent();
  }
}

/* ------------------------------------------------------------------- pigeons */

interface Pigeon {
  root: THREE.Group;
  wingL: THREE.Mesh;
  wingR: THREE.Mesh;
  s: number;
  x: number;
  state: 'perched' | 'flying';
  vx: number;
  vy: number;
  vz: number;
  y: number;
  /** Extra track offset gained while flying (world-relative). */
  zOff: number;
  flap: number;
  peck: number;
}

/** Pigeons peck on the pavement and burst into flight as Lazi runs past. */
export class Pigeons {
  readonly object = new THREE.Group();
  private readonly birds: Pigeon[] = [];
  private readonly bodyGeometry: THREE.BufferGeometry;
  private readonly wingGeometry: THREE.BufferGeometry;
  private readonly material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    side: THREE.DoubleSide,
  });

  constructor(
    count: number,
    private readonly rng: () => number = Math.random,
  ) {
    const body = new MeshBuilder();
    body.blob(0, 0.16, 0, 0.11, 0.09, 0.17, 0x8d919a, 1);
    body.blob(0, 0.24, -0.15, 0.06, 0.06, 0.06, 0x767a83, 1);
    body.blob(0, 0.19, -0.1, 0.08, 0.05, 0.06, 0x3f7d6a, 1);
    body.box(0, 0.235, -0.22, 0.025, 0.02, 0.05, 0xf2a03d);
    body.box(0, 0.13, 0.19, 0.06, 0.02, 0.1, 0x6a6e76);
    this.bodyGeometry = body.build();
    const wing = new MeshBuilder();
    wing.box(0.13, 0, 0, 0.26, 0.015, 0.16, 0x7b7f88);
    this.wingGeometry = wing.build();

    for (let i = 0; i < count; i++) {
      const root = new THREE.Group();
      root.add(new THREE.Mesh(this.bodyGeometry, this.material));
      const wingL = new THREE.Mesh(this.wingGeometry, this.material);
      const wingR = new THREE.Mesh(this.wingGeometry, this.material);
      wingL.position.set(0.05, 0.2, 0);
      wingR.position.set(-0.05, 0.2, 0);
      wingR.scale.x = -1;
      root.add(wingL, wingR);
      this.object.add(root);
      this.birds.push({
        root,
        wingL,
        wingR,
        s: 0,
        x: 0,
        state: 'perched',
        vx: 0,
        vy: 0,
        vz: 0,
        y: CURB,
        zOff: 0,
        flap: 0,
        peck: 0,
      });
    }
  }

  reset(travelled: number): void {
    for (const b of this.birds) this.perch(b, travelled, randRange(this.rng, 20, 160));
  }

  private perch(b: Pigeon, travelled: number, ahead: number): void {
    b.s = travelled + ahead;
    const style = ZONES[zoneIndexAt(b.s)]?.style ?? 'township';
    b.x = (this.rng() < 0.5 ? -1 : 1) * randRange(this.rng, 4.6, 7.0);
    b.y = style === 'trainyard' ? PLATFORM : CURB;
    b.state = 'perched';
    b.zOff = 0;
    b.flap = 0;
    b.root.rotation.set(0, this.rng() * Math.PI * 2, 0);
    b.wingL.rotation.z = b.wingR.rotation.z = 0.5;
    b.root.scale.setScalar(1);
  }

  update(dt: number, travelled: number): void {
    for (const b of this.birds) {
      let z = -(b.s - travelled) + b.zOff;
      if (b.state === 'perched') {
        b.peck += dt * (3 + this.rng());
        b.root.position.set(b.x, b.y, z);
        b.root.rotation.x = Math.sin(b.peck) > 0.7 ? 0.5 : 0;
        // Scared off when Lazi gets close.
        if (z > -9 && z < 4) {
          b.state = 'flying';
          b.vx = (this.rng() - 0.5) * 6;
          b.vy = 3 + this.rng() * 2;
          b.vz = -(4 + this.rng() * 5);
          b.flap = this.rng() * 6;
          b.root.rotation.x = 0;
          b.root.rotation.y = Math.atan2(-b.vx, -b.vz);
        }
      } else {
        b.flap += dt * 30;
        const beat = Math.sin(b.flap) * 1.0;
        b.wingL.rotation.z = beat;
        b.wingR.rotation.z = -beat;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.zOff += b.vz * dt;
        b.vy = Math.max(0.5, b.vy - 0.8 * dt);
        z = -(b.s - travelled) + b.zOff;
        b.root.position.set(b.x, b.y, z);
        if (z > RECYCLE_Z || b.y > 30)
          this.perch(b, travelled, randRange(this.rng, MIN_AHEAD, MAX_AHEAD));
        continue;
      }
      if (z > RECYCLE_Z) this.perch(b, travelled, randRange(this.rng, MIN_AHEAD, MAX_AHEAD));
    }
  }

  dispose(): void {
    this.bodyGeometry.dispose();
    this.wingGeometry.dispose();
    this.material.dispose();
    this.object.removeFromParent();
  }
}
