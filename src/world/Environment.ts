import * as THREE from 'three';
import { COLORS } from '../config/colors';
import type { QualityProfile } from '../config/quality';
import { ZONES } from '../config/zones';
import type { AssetLoader, HdriKey } from '../core/AssetLoader';
import { atmosphereAt, type Atmosphere } from './Atmosphere';
import { SkyDome } from './SkyDome';

/** Shadow frustum, in the fixed world the player runs through (the player stays near the origin). */
const SHADOW_BOUNDS = { left: -18, right: 18, top: 50, bottom: -34, near: 1, far: 80 };

/** Soft, blurry dark blobs used to fake drifting cloud shadows. */
function createCloudShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, size, size);
    for (let i = 0; i < 9; i++) {
      const x = ((i * 97) % size) + 10;
      const y = ((i * 61 + 30) % size) + 10;
      const r = 40 + ((i * 23) % 40);
      for (const [ox, oy] of [
        [0, 0],
        [size, 0],
        [-size, 0],
        [0, size],
        [0, -size],
      ] as const) {
        const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        g.addColorStop(0, 'rgba(0,0,0,0.9)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, size, size);
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1.4, 2.6);
  return tex;
}

/**
 * Scene, sky, fog and lighting. The look (sky, fog, sun, exposure, image-based light) is driven by
 * `applyAtmosphere` from the zone the player is in, blending smoothly between zones.
 */
export class Environment {
  readonly scene = new THREE.Scene();
  readonly sky = new SkyDome();
  readonly sun: THREE.DirectionalLight;

  private readonly hemi: THREE.HemisphereLight;
  private readonly ground: THREE.Mesh;
  private readonly cloudShadow: THREE.Mesh | null = null;
  private readonly cloudTexture: THREE.CanvasTexture | null = null;
  private readonly pmrem: THREE.PMREMGenerator | null;
  private readonly envMaps = new Map<HdriKey, THREE.Texture>();
  private activeEnv: HdriKey | null = null;
  private current: Atmosphere = atmosphereAt(0);
  private readonly bg = new THREE.Color();

  constructor(
    private readonly profile: QualityProfile,
    private readonly assets: AssetLoader | null,
    private readonly renderer: THREE.WebGLRenderer,
  ) {
    const first = ZONES[0];
    if (!first) throw new Error('No zones configured');
    this.scene.fog = new THREE.Fog(first.fog, first.fogNear, first.fogFar);
    this.scene.background = this.bg.set(first.sky);
    this.scene.add(this.sky.mesh);

    const pbr = profile.pbr;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x88805f, pbr ? 0.35 : 1.9);
    this.sun = new THREE.DirectionalLight(0xfff4e0, pbr ? 3.4 : 2.2);
    this.sun.position.set(-6, 12, 8);
    this.sun.target.position.set(0, 0, -10);
    this.scene.add(this.hemi, this.sun, this.sun.target);

    if (profile.shadows === 'map') {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(profile.shadowMapSize, profile.shadowMapSize);
      const c = this.sun.shadow.camera;
      Object.assign(c, SHADOW_BOUNDS);
      c.updateProjectionMatrix();
      this.sun.shadow.bias = -0.0004;
      this.sun.shadow.normalBias = 0.05;
      this.sun.shadow.radius = 3;
    }

    // Wide ground so the sides of the street never show sky.
    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 1400).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: COLORS.ground, roughness: 1, metalness: 0 }),
    );
    this.ground.position.set(0, -0.06, -450);
    this.ground.receiveShadow = profile.shadows === 'map';
    this.scene.add(this.ground);

    if (profile.cloudShadows) {
      this.cloudTexture = createCloudShadowTexture();
      this.cloudShadow = new THREE.Mesh(
        new THREE.PlaneGeometry(90, 200).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({
          map: this.cloudTexture,
          transparent: true,
          opacity: 0.22,
          depthWrite: false,
          color: 0x0a1020,
          fog: false,
        }),
      );
      this.cloudShadow.position.set(0, 0.04, -60);
      this.cloudShadow.renderOrder = 2;
      this.scene.add(this.cloudShadow);
    }

    this.pmrem = pbr ? new THREE.PMREMGenerator(renderer) : null;
    this.snapToAtmosphere(0);
  }

  /** Register everything that should show the ground plane colour (zone tint). */
  get groundMesh(): THREE.Mesh {
    return this.ground;
  }

  /** Kick off loading the remaining sky HDRIs in the background (Medium/High). */
  preloadSkies(order: readonly HdriKey[]): void {
    if (!this.assets || !this.profile.pbr) return;
    let chain: Promise<unknown> = Promise.resolve();
    for (const key of order) {
      chain = chain
        .then(() => this.assets?.loadHdri(key))
        .then(() => new Promise<void>((r) => window.setTimeout(r, 60)))
        .catch(() => undefined);
    }
  }

  /** Jump straight to the atmosphere at `distance` (new run). */
  snapToAtmosphere(distance: number): void {
    this.applyAtmosphere(atmosphereAt(distance));
  }

  /** Apply the atmosphere for the player's distance (it already eases smoothly across zones). */
  update(distance: number, cameraPos: THREE.Vector3, elapsed: number, scroll: number): void {
    this.applyAtmosphere(atmosphereAt(distance));
    this.sky.mesh.position.copy(cameraPos);
    if (this.cloudTexture) {
      this.cloudTexture.offset.set(elapsed * 0.004, scroll * 0.006);
    }
  }

  private applyAtmosphere(a: Atmosphere): void {
    this.current = a;

    const fog = this.scene.fog as THREE.Fog;
    fog.color.set(a.fog);
    fog.near = a.fogNear;
    fog.far = a.fogFar;

    this.sun.color.set(a.sunColor);
    this.sun.position.set(...a.sunPosition);
    this.hemi.color.set(a.sky);
    this.hemi.groundColor.set(0x6b5f48);

    const pbr = this.profile.pbr;
    this.sun.intensity = pbr ? a.sunIntensity : Math.min(2.4, a.sunIntensity * 0.65);
    this.hemi.intensity = pbr ? 0.3 : 1.7 - a.night * 0.8;
    this.renderer.toneMappingExposure = a.exposure;

    // Sky
    const skyA = this.assets?.hdris.get(a.hdriFrom) ?? null;
    const skyB = this.assets?.hdris.get(a.hdriTo) ?? skyA;
    if (pbr && skyA && skyB) {
      this.sky.setTextures(skyA, skyB, a.hdriMix);
      this.sky.setBrightness(1);
    } else {
      this.sky.setTextures(null, null, 0);
      this.sky.setGradient(a.sky, a.fog);
    }
    this.bg.set(a.sky);

    // Image-based lighting follows whichever HDRI currently dominates.
    if (pbr) {
      const key = a.hdriMix < 0.5 ? a.hdriFrom : a.hdriTo;
      this.setEnvironment(key);
      this.scene.environmentIntensity = a.envIntensity;
    }
  }

  private setEnvironment(key: HdriKey): void {
    if (this.activeEnv === key || !this.pmrem) return;
    let env = this.envMaps.get(key);
    if (!env) {
      const src = this.assets?.hdris.get(key);
      if (!src) return; // not loaded yet; try again next frame
      env = this.pmrem.fromEquirectangular(src).texture;
      this.envMaps.set(key, env);
    }
    this.scene.environment = env;
    this.activeEnv = key;
  }

  get atmosphere(): Atmosphere {
    return this.current;
  }

  dispose(): void {
    this.sky.dispose();
    this.ground.geometry.dispose();
    (this.ground.material as THREE.Material).dispose();
    if (this.cloudShadow) {
      this.cloudShadow.geometry.dispose();
      (this.cloudShadow.material as THREE.Material).dispose();
    }
    this.cloudTexture?.dispose();
    for (const env of this.envMaps.values()) env.dispose();
    this.envMaps.clear();
    this.pmrem?.dispose();
    this.hemi.dispose();
    this.sun.dispose();
    this.sun.shadow.map?.dispose();
  }
}
