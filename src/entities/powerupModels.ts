import * as THREE from 'three';
import type { PowerUpId } from '../config/progression';

export interface PowerUpModel {
  /** Root: positioned in the world by the pickup field. */
  object: THREE.Group;
  /** The part that spins (the halo stays put). */
  spin: THREE.Group;
  halo: THREE.Object3D;
  dispose(): void;
}

const HALO_COLOR: Record<PowerUpId, number> = {
  magnet: 0xff5a4d,
  boost: 0x4dd0ff,
  spikes: 0xffd23f,
  doubleScore: 0xffc83d,
};

/** Collects everything created so `dispose` can free it. */
class Kit {
  readonly geometries: THREE.BufferGeometry[] = [];
  readonly materials: THREE.Material[] = [];
  readonly textures: THREE.Texture[] = [];

  geo<T extends THREE.BufferGeometry>(g: T): T {
    this.geometries.push(g);
    return g;
  }

  /** A lit material that still reads on the Low profile (no environment map): a little emissive. */
  mat(
    color: number,
    opts: { metal?: number; rough?: number; glow?: number } = {},
  ): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({
      color,
      metalness: opts.metal ?? 0.2,
      roughness: opts.rough ?? 0.5,
      emissive: color,
      emissiveIntensity: opts.glow ?? 0.18,
    });
    this.materials.push(m);
    return m;
  }

  basic(color: number, opacity: number): THREE.MeshBasicMaterial {
    const m = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.materials.push(m);
    return m;
  }

  canvas(
    size: [number, number],
    draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  ) {
    const c = document.createElement('canvas');
    c.width = size[0];
    c.height = size[1];
    const ctx = c.getContext('2d');
    if (ctx) draw(ctx, size[0], size[1]);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this.textures.push(tex);
    return tex;
  }

  mesh(g: THREE.BufferGeometry, m: THREE.Material | THREE.Material[]): THREE.Mesh {
    return new THREE.Mesh(g, m);
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    for (const t of this.textures) t.dispose();
  }
}

/** Coin Magnet: a red horseshoe with silver pole tips. */
function magnet(kit: Kit, spin: THREE.Group): void {
  const red = kit.mat(0xd9252a, { rough: 0.35, metal: 0.3 });
  const silver = kit.mat(0xd8dde6, { rough: 0.25, metal: 0.6, glow: 0.3 });
  const r = 0.3;
  const arch = kit.mesh(kit.geo(new THREE.TorusGeometry(r, 0.105, 16, 32, Math.PI)), red);
  arch.position.y = -0.05;
  const legGeo = kit.geo(new THREE.CylinderGeometry(0.105, 0.105, 0.26, 20));
  const tipGeo = kit.geo(new THREE.CylinderGeometry(0.11, 0.11, 0.14, 20));
  for (const side of [-1, 1]) {
    const leg = kit.mesh(legGeo, red);
    leg.position.set(side * r, -0.18, 0);
    const tip = kit.mesh(tipGeo, silver);
    tip.position.set(side * r, -0.38, 0);
    spin.add(leg, tip);
  }
  spin.add(arch);
  spin.position.y = 0.06;
}

/** Energy Drink: a blue can with an orange bolt and a silver top. */
function energyDrink(kit: Kit, spin: THREE.Group): void {
  const label = kit.canvas([256, 128], (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#12397a');
    g.addColorStop(1, '#0b2a5b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ff7a1a';
    for (const x of [64, 192]) {
      ctx.beginPath();
      ctx.moveTo(x + 6, 12);
      ctx.lineTo(x - 22, 70);
      ctx.lineTo(x - 2, 70);
      ctx.lineTo(x - 10, 116);
      ctx.lineTo(x + 26, 54);
      ctx.lineTo(x + 6, 54);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#f6f3ea';
    ctx.fillRect(0, 0, w, 8);
    ctx.fillRect(0, h - 8, w, 8);
  });
  const body = kit.mat(0xffffff, { rough: 0.3, metal: 0.35, glow: 0.12 });
  body.map = label;
  body.emissiveMap = label;
  const silver = kit.mat(0xcfd6e0, { rough: 0.25, metal: 0.65, glow: 0.3 });
  const can = kit.mesh(kit.geo(new THREE.CylinderGeometry(0.19, 0.19, 0.6, 32, 1, true)), body);
  const bottom = kit.mesh(kit.geo(new THREE.CylinderGeometry(0.19, 0.17, 0.04, 32)), silver);
  bottom.position.y = -0.31;
  const top = kit.mesh(kit.geo(new THREE.CylinderGeometry(0.15, 0.19, 0.06, 32)), silver);
  top.position.y = 0.33;
  const lid = kit.mesh(kit.geo(new THREE.CylinderGeometry(0.135, 0.135, 0.03, 32)), silver);
  lid.position.y = 0.375;
  const tab = kit.mesh(kit.geo(new THREE.TorusGeometry(0.05, 0.012, 8, 16)), silver);
  tab.rotation.x = Math.PI / 2;
  tab.position.set(0.03, 0.395, 0);
  const tilt = new THREE.Group();
  tilt.rotation.z = 0.28;
  tilt.add(can, bottom, top, lid, tab);
  spin.add(tilt);
}

/** Super Spikes: an orange running spike with a white stripe and gold spikes. */
function spikes(kit: Kit, spin: THREE.Group): void {
  const orange = kit.mat(0xff7a1a, { rough: 0.55, metal: 0.05 });
  const white = kit.mat(0xf6f3ea, { rough: 0.6, metal: 0, glow: 0.22 });
  const dark = kit.mat(0x14213d, { rough: 0.7, metal: 0 });
  const gold = kit.mat(0xffc83d, { rough: 0.3, metal: 0.6, glow: 0.3 });
  const shoe = new THREE.Group();
  const sole = kit.mesh(kit.geo(new THREE.BoxGeometry(0.3, 0.06, 0.78)), white);
  const heel = kit.mesh(kit.geo(new THREE.BoxGeometry(0.28, 0.22, 0.3)), orange);
  heel.position.set(0, 0.14, -0.22);
  const mid = kit.mesh(kit.geo(new THREE.BoxGeometry(0.27, 0.15, 0.3)), orange);
  mid.position.set(0, 0.105, 0.05);
  const toe = kit.mesh(kit.geo(new THREE.SphereGeometry(0.15, 20, 14)), orange);
  toe.scale.set(0.95, 0.62, 1.5);
  toe.position.set(0, 0.1, 0.28);
  const collar = kit.mesh(kit.geo(new THREE.BoxGeometry(0.3, 0.06, 0.3)), dark);
  collar.position.set(0, 0.27, -0.22);
  const stripe = kit.mesh(kit.geo(new THREE.BoxGeometry(0.29, 0.035, 0.36)), white);
  stripe.position.set(0, 0.14, 0.04);
  stripe.rotation.x = -0.25;
  shoe.add(sole, heel, mid, toe, collar, stripe);
  const spikeGeo = kit.geo(new THREE.ConeGeometry(0.03, 0.1, 8));
  for (const [x, z] of [
    [-0.09, 0.18],
    [0.09, 0.18],
    [-0.09, 0.34],
    [0.09, 0.34],
    [-0.07, -0.25],
    [0.07, -0.25],
  ] as const) {
    const spike = kit.mesh(spikeGeo, gold);
    spike.rotation.x = Math.PI;
    spike.position.set(x, -0.08, z);
    shoe.add(spike);
  }
  shoe.rotation.y = Math.PI / 2;
  shoe.position.y = -0.05;
  spin.add(shoe);
}

/** 2x Score: a gold token with a raised "2x". */
function doubleScore(kit: Kit, spin: THREE.Group): void {
  const face = kit.canvas([256, 256], (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
    g.addColorStop(0, '#ffe07a');
    g.addColorStop(1, '#f0a81c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#b37a00';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2 - 34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#7a4b00';
    ctx.font = '900 118px "Trebuchet MS","Segoe UI",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('2x', w / 2 + 2, h / 2 + 6);
  });
  const side = kit.mat(0xd9931a, { rough: 0.3, metal: 0.6, glow: 0.25 });
  const faceMat = kit.mat(0xffffff, { rough: 0.35, metal: 0.25, glow: 0.35 });
  faceMat.map = face;
  faceMat.emissiveMap = face;
  const coin = kit.mesh(kit.geo(new THREE.CylinderGeometry(0.42, 0.42, 0.09, 48)), [
    side,
    faceMat,
    faceMat,
  ]);
  coin.rotation.x = Math.PI / 2;
  const rim = kit.mesh(kit.geo(new THREE.TorusGeometry(0.42, 0.03, 10, 48)), side);
  spin.add(coin, rim);
}

/** Build one power-up model (with its halo) at the origin, ~0.9 m across. */
export function buildPowerUpModel(kind: PowerUpId): PowerUpModel {
  const kit = new Kit();
  const object = new THREE.Group();
  const spin = new THREE.Group();
  if (kind === 'magnet') magnet(kit, spin);
  else if (kind === 'boost') energyDrink(kit, spin);
  else if (kind === 'spikes') spikes(kit, spin);
  else doubleScore(kit, spin);

  // Halo: a soft ring and glow behind the model, facing the camera.
  const halo = new THREE.Group();
  const ring = kit.mesh(
    kit.geo(new THREE.RingGeometry(0.62, 0.72, 40)),
    kit.basic(HALO_COLOR[kind], 0.55),
  );
  const glow = kit.mesh(
    kit.geo(new THREE.CircleGeometry(0.62, 40)),
    kit.basic(HALO_COLOR[kind], 0.07),
  );
  halo.add(ring, glow);
  halo.position.z = -0.05;
  object.add(halo, spin);
  object.traverse((o) => {
    o.frustumCulled = true;
  });
  return {
    object,
    spin,
    halo,
    dispose: () => {
      object.removeFromParent();
      kit.dispose();
    },
  };
}
