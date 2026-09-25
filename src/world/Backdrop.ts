import * as THREE from 'three';
import { zoneBlendAt } from '../config/zones';
import { lerp, smoothstep01 } from '../core/math';
import type { Atmosphere } from './Atmosphere';

/**
 * Far-off scenery drawn behind everything else: Table Mountain (with Devil's Peak and Lion's
 * Head) and, later in the run, the stadium growing on the horizon. Both follow the camera so
 * they behave like infinitely distant objects, and neither takes part in depth testing.
 */

/** Table Mountain is most prominent in the Train Yard (zone 3). Per-zone visibility 0..1. */
const MOUNTAIN_VISIBILITY = [0.5, 0.55, 1, 0.5] as const;

/** Distance run (m) over which the stadium grows from a speck to full size. */
const STADIUM_APPEAR = { from: 3300, to: 5600 };

function hash(n: number): number {
  return (((Math.sin(n * 127.1) * 43758.5453) % 1) + 1) % 1;
}

/** Height (0..1) of the mountain range at u in [-1, 1]: a flat-topped mass with two neighbours. */
function ridgeHeight(u: number): number {
  const a = Math.abs(u);
  // Table: flat top with steep shoulders
  const table = 1 - smoothstep01((a - 0.52) / 0.28);
  // Devil's Peak: taller, pointier, on the left
  const devil = Math.max(0, 1 - Math.abs(u + 1.0) / 0.36) ** 1.5 * 0.92;
  // Lion's Head: low rounded dome on the right
  const lion = Math.max(0, 1 - ((u - 1.02) / 0.3) ** 2) * 0.5;
  // Rocky texture along the ridge
  const rough = (hash(Math.floor(u * 55)) - 0.5) * 0.035 + (hash(Math.floor(u * 13)) - 0.5) * 0.05;
  return Math.max(table * (0.78 + rough), devil, lion, 0.06) + rough * 0.4;
}

function buildMountain(): THREE.BufferGeometry {
  const columns = 160;
  const half = 760;
  const height = 300;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const c = new THREE.Color();
  const rows = [
    { y: -40, z: 0, color: 0x3d4d3a }, // scrub and forest at the foot
    { y: 0.22, z: -14, color: 0x55604a },
    { y: 0.6, z: -30, color: 0x6e675d }, // sandstone cliffs
    { y: 1.0, z: -44, color: 0x8a8274 }, // pale rim
  ] as const;
  for (let i = 0; i <= columns; i++) {
    const u = (i / columns) * 2.4 - 1.2;
    const x = u * half;
    const h = ridgeHeight(u) * height;
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r] as (typeof rows)[number];
      const y = r === 0 ? row.y : row.y * h;
      pos.push(x, y, row.z + hash(i * 7 + r) * 3);
      // streaky vertical colour variation, like weathered rock
      const shade = 0.88 + hash(i * 3.7 + r * 11) * 0.24;
      c.set(row.color).multiplyScalar(shade);
      col.push(c.r, c.g, c.b);
    }
  }
  const stride = rows.length;
  for (let i = 0; i < columns; i++) {
    for (let r = 0; r < stride - 1; r++) {
      const a = i * stride + r;
      const b = (i + 1) * stride + r;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function buildStadium(): {
  group: THREE.Group;
  lights: THREE.MeshBasicMaterial;
  dispose: () => void;
} {
  const group = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const track = <T extends THREE.BufferGeometry>(g: T): T => {
    geos.push(g);
    return g;
  };

  const concrete = new THREE.MeshLambertMaterial({ color: 0xc9cbd3, fog: false });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x2a2f6b, fog: false });
  const seatMat = new THREE.MeshLambertMaterial({
    color: 0x1d2350,
    fog: false,
    side: THREE.DoubleSide,
  });
  const lights = new THREE.MeshBasicMaterial({ color: 0xfff2cf, fog: false });
  const band = new THREE.MeshBasicMaterial({ color: 0xff7a1a, fog: false });
  mats.push(concrete, roofMat, seatMat, lights, band);

  const oval = (mesh: THREE.Mesh): THREE.Mesh => {
    mesh.scale.z = 1.3;
    return mesh;
  };
  const bowl = oval(
    new THREE.Mesh(track(new THREE.CylinderGeometry(96, 74, 34, 56, 1, true)), concrete),
  );
  bowl.position.y = 17;
  const inner = oval(
    new THREE.Mesh(track(new THREE.CylinderGeometry(70, 52, 30, 56, 1, true)), seatMat),
  );
  inner.position.y = 15;
  const roof = oval(
    new THREE.Mesh(track(new THREE.RingGeometry(66, 104, 56, 1).rotateX(-Math.PI / 2)), roofMat),
  );
  roof.position.y = 36;
  const stripe = oval(
    new THREE.Mesh(track(new THREE.CylinderGeometry(97.5, 97, 4, 56, 1, true)), band),
  );
  stripe.position.y = 30;
  group.add(bowl, inner, roof, stripe);

  // Four floodlight masts with clusters of glowing lamps
  for (const [x, z] of [
    [-92, -90],
    [92, -90],
    [-92, 90],
    [92, 90],
  ] as const) {
    const mast = new THREE.Mesh(track(new THREE.CylinderGeometry(1.4, 2, 70, 8)), concrete);
    mast.position.set(x, 35, z);
    const head = new THREE.Mesh(track(new THREE.BoxGeometry(22, 12, 4)), lights);
    head.position.set(x, 74, z);
    group.add(mast, head);
  }
  return {
    group,
    lights,
    dispose: () => {
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
    },
  };
}

export class Backdrop {
  readonly object = new THREE.Group();
  private readonly mountain: THREE.Mesh;
  private readonly mountainMaterial: THREE.MeshLambertMaterial;
  private readonly stadium: ReturnType<typeof buildStadium>;
  private readonly haze = new THREE.Color();

  constructor() {
    this.mountainMaterial = new THREE.MeshLambertMaterial({
      vertexColors: true,
      fog: false,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mountain = new THREE.Mesh(buildMountain(), this.mountainMaterial);
    this.mountain.position.set(-40, -20, -1150);
    this.mountain.renderOrder = -900;
    this.mountain.frustumCulled = false;
    this.object.add(this.mountain);

    this.stadium = buildStadium();
    this.stadium.group.renderOrder = -880;
    this.stadium.group.traverse((o) => {
      o.renderOrder = -880;
      o.frustumCulled = false;
      if (o instanceof THREE.Mesh) {
        const m = o.material as THREE.Material;
        m.depthTest = false;
        m.depthWrite = false;
      }
    });
    this.stadium.group.visible = false;
    this.object.add(this.stadium.group);
  }

  /** Follow the camera and fade/grow with the zone and distance run. */
  update(camera: THREE.Camera, distance: number, atmosphere: Atmosphere): void {
    this.object.position.copy(camera.position);

    const { from, to, t } = zoneBlendAt(distance);
    const visibility = lerp(MOUNTAIN_VISIBILITY[from] ?? 0.5, MOUNTAIN_VISIBILITY[to] ?? 0.5, t);
    // Atmospheric haze: it is very far away, so it always takes on some of the fog colour, and
    // fades further into it in zones where it should be less prominent.
    this.haze.set(atmosphere.fog);
    this.mountainMaterial.color
      .setRGB(0.85, 0.85, 0.85)
      .lerp(this.haze, 0.38 + (1 - visibility) * 0.5);

    // Stadium: a small distant speck that grows and moves closer as Lazi nears it.
    const p = smoothstep01(
      (distance - STADIUM_APPEAR.from) / (STADIUM_APPEAR.to - STADIUM_APPEAR.from),
    );
    this.stadium.group.visible = distance > STADIUM_APPEAR.from - 200;
    const scale = lerp(0.14, 1, p);
    this.stadium.group.scale.setScalar(scale);
    this.stadium.group.position.set(150 * (1 - p * 0.55), 0, lerp(-1150, -430, p));
    const glow = 0.5 + atmosphere.night * 1.4;
    this.stadium.lights.color.setRGB(glow, glow * 0.95, glow * 0.8);
  }

  dispose(): void {
    this.mountain.geometry.dispose();
    this.mountainMaterial.dispose();
    this.stadium.dispose();
    this.object.removeFromParent();
  }
}
