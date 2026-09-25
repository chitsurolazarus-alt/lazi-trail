import * as THREE from 'three';

/**
 * Small camera-facing particles: footstep and landing dust, coin sparkle, drifting leaves.
 * Two InstancedMeshes (normal blending for dust/leaves, additive for sparks), all pooled: a fixed
 * array of particles is recycled, so nothing is allocated while running.
 */

const CAP_SOFT = 160;
const CAP_SPARK = 80;

interface Particle {
  alive: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  size: number;
  grow: number;
  gravity: number;
  drag: number;
  r: number;
  g: number;
  b: number;
  /** false = follows the world (scrolls with the road); true = fixed in space (sparks) */
  spark: boolean;
}

function softTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Effects {
  readonly object = new THREE.Group();
  private readonly soft: THREE.InstancedMesh;
  private readonly spark: THREE.InstancedMesh;
  private readonly softParticles: Particle[] = [];
  private readonly sparkParticles: Particle[] = [];
  private readonly geometry = new THREE.PlaneGeometry(1, 1);
  private readonly texture = softTexture();
  private readonly softMaterial: THREE.MeshBasicMaterial;
  private readonly sparkMaterial: THREE.MeshBasicMaterial;
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly color = new THREE.Color();
  private readonly scale = new THREE.Vector3();
  private readonly position = new THREE.Vector3();
  private softCursor = 0;
  private sparkCursor = 0;
  private ambientTimer = 0;

  /** `ambient` = how many drifting leaves/dust motes to keep alive (0 disables them). */
  constructor(private readonly ambient: number) {
    this.softMaterial = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      fog: true,
      opacity: 0.85,
    });
    this.sparkMaterial = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.soft = new THREE.InstancedMesh(this.geometry, this.softMaterial, CAP_SOFT);
    this.spark = new THREE.InstancedMesh(this.geometry, this.sparkMaterial, CAP_SPARK);
    for (const mesh of [this.soft, this.spark]) {
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(mesh.instanceMatrix.count * 3),
        3,
      );
      this.object.add(mesh);
    }
    for (let i = 0; i < CAP_SOFT; i++) this.softParticles.push(blank());
    for (let i = 0; i < CAP_SPARK; i++) this.sparkParticles.push({ ...blank(), spark: true });
  }

  /** A puff of dust at the feet. */
  dust(x: number, y: number, z: number, strength = 1, color = 0xcfc3ae): void {
    const n = Math.ceil(3 * strength);
    for (let i = 0; i < n; i++) {
      const p = this.take(this.softParticles, this.softCursor++ % CAP_SOFT);
      this.color.set(color);
      spawn(p, {
        x: x + (Math.random() - 0.5) * 0.4,
        y: y + 0.05,
        z: z + (Math.random() - 0.5) * 0.3,
        vx: (Math.random() - 0.5) * 1.6,
        vy: 0.5 + Math.random() * 0.9,
        vz: (Math.random() - 0.3) * 1.0,
        life: 0.45 + Math.random() * 0.3,
        size: 0.22 + Math.random() * 0.16,
        grow: 1.6,
        gravity: -0.6,
        drag: 2.2,
        c: this.color,
      });
    }
  }

  /** A ring of dust when landing hard. */
  landing(x: number, y: number, z: number, strength: number): void {
    const n = 8 + Math.round(strength * 6);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const p = this.take(this.softParticles, this.softCursor++ % CAP_SOFT);
      this.color.set(0xd8ccb6);
      spawn(p, {
        x,
        y: y + 0.08,
        z,
        vx: Math.cos(a) * (1.8 + strength),
        vy: 0.4 + Math.random() * 0.5,
        vz: Math.sin(a) * (1.8 + strength) * 0.6,
        life: 0.5,
        size: 0.3,
        grow: 1.8,
        gravity: -0.5,
        drag: 3,
        c: this.color,
      });
    }
  }

  /** Golden sparkle where a coin was collected. */
  sparkle(x: number, y: number, z: number, gold: boolean): void {
    for (let i = 0; i < 9; i++) {
      const p = this.take(this.sparkParticles, this.sparkCursor++ % CAP_SPARK);
      this.color.set(gold ? 0xffd23f : 0xdff3ff);
      const a = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 2.2;
      spawn(p, {
        x,
        y,
        z,
        vx: Math.cos(a) * sp,
        vy: Math.random() * 2.5 + 0.6,
        vz: Math.sin(a) * sp * 0.6,
        life: 0.4 + Math.random() * 0.25,
        size: 0.16 + Math.random() * 0.1,
        grow: 0.2,
        gravity: 5,
        drag: 1.5,
        c: this.color,
        spark: true,
      });
    }
  }

  /** A few sparks flung off a train wheel/rail (world position). */
  railSparks(x: number, z: number): void {
    for (let i = 0; i < 4; i++) {
      const p = this.take(this.sparkParticles, this.sparkCursor++ % CAP_SPARK);
      this.color.set(Math.random() < 0.5 ? 0xffd27a : 0xfff2cf);
      spawn(p, {
        x: x + (Math.random() - 0.5) * 0.2,
        y: 0.25,
        z,
        vx: (Math.random() - 0.5) * 3,
        vy: 1 + Math.random() * 2.2,
        vz: (Math.random() - 0.5) * 3,
        life: 0.3 + Math.random() * 0.25,
        size: 0.09 + Math.random() * 0.06,
        grow: 0,
        gravity: 9,
        drag: 0.8,
        c: this.color,
        spark: true,
      });
    }
  }

  /** Advance particles. `worldSpeed` (m/s) scrolls world-bound particles toward the camera. */
  update(dt: number, worldSpeed: number, camera: THREE.Camera): void {
    // Ambient leaves and dust motes drifting across the street.
    if (this.ambient > 0) {
      this.ambientTimer -= dt;
      if (this.ambientTimer <= 0) {
        this.ambientTimer = 1.6 / Math.max(1, this.ambient / 20);
        this.emitLeaf();
      }
    }
    this.quaternion.copy(camera.quaternion);
    this.flush(this.soft, this.softParticles, dt, worldSpeed);
    this.flush(this.spark, this.sparkParticles, dt, worldSpeed);
  }

  private emitLeaf(): void {
    const p = this.take(this.softParticles, this.softCursor++ % CAP_SOFT);
    this.color.set(Math.random() < 0.5 ? 0x8a9a45 : 0xa8865a);
    spawn(p, {
      x: -9 + Math.random() * 3,
      y: 0.6 + Math.random() * 2.4,
      z: -40 - Math.random() * 60,
      vx: 2.2 + Math.random() * 1.6,
      vy: Math.random() * 0.4 - 0.15,
      vz: 0,
      life: 7,
      size: 0.09 + Math.random() * 0.06,
      grow: 0,
      gravity: 0.05,
      drag: 0,
      c: this.color,
    });
  }

  private take(list: Particle[], index: number): Particle {
    return list[index] as Particle;
  }

  private flush(mesh: THREE.InstancedMesh, list: Particle[], dt: number, worldSpeed: number): void {
    let n = 0;
    for (const p of list) {
      if (!p.alive) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.alive = false;
        continue;
      }
      const drag = Math.exp(-p.drag * dt);
      p.vx *= drag;
      p.vz *= drag;
      p.vy = p.vy * (p.drag > 0 ? drag : 1) - p.gravity * dt;
      p.x += p.vx * dt;
      p.y = Math.max(0.03, p.y + p.vy * dt);
      // World-bound particles ride the scrolling road; sparks stay where they burst.
      p.z += p.vz * dt + (p.spark ? 0 : worldSpeed * dt);
      const t = p.age / p.life;
      const fade = 1 - t * t;
      const size = (p.size + p.grow * p.size * t) * (p.grow > 0 ? fade + 0.2 : 1);
      this.position.set(p.x, p.y, p.z);
      this.scale.set(size, size, size);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      mesh.setMatrixAt(n, this.matrix);
      this.color.setRGB(
        p.r * (p.spark ? fade : 1),
        p.g * (p.spark ? fade : 1),
        p.b * (p.spark ? fade : 1),
      );
      mesh.setColorAt(n, this.color);
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  clear(): void {
    for (const p of this.softParticles) p.alive = false;
    for (const p of this.sparkParticles) p.alive = false;
    this.soft.count = 0;
    this.spark.count = 0;
  }

  dispose(): void {
    this.geometry.dispose();
    this.texture.dispose();
    this.softMaterial.dispose();
    this.sparkMaterial.dispose();
    this.soft.dispose();
    this.spark.dispose();
    this.object.removeFromParent();
  }
}

function blank(): Particle {
  return {
    alive: false,
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    age: 0,
    life: 1,
    size: 0.2,
    grow: 0,
    gravity: 0,
    drag: 0,
    r: 1,
    g: 1,
    b: 1,
    spark: false,
  };
}

interface SpawnArgs {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  size: number;
  grow: number;
  gravity: number;
  drag: number;
  c: THREE.Color;
  spark?: boolean;
}

function spawn(p: Particle, a: SpawnArgs): void {
  p.alive = true;
  p.x = a.x;
  p.y = a.y;
  p.z = a.z;
  p.vx = a.vx;
  p.vy = a.vy;
  p.vz = a.vz;
  p.age = 0;
  p.life = a.life;
  p.size = a.size;
  p.grow = a.grow;
  p.gravity = a.gravity;
  p.drag = a.drag;
  p.r = a.c.r;
  p.g = a.c.g;
  p.b = a.c.b;
  p.spark = a.spark ?? false;
}
