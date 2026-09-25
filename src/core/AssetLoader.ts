import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

/** Poly Haven PBR surfaces, packed by tools/fetch-assets.mjs as <key>_diff / _nor / _arm .webp */
export const SURFACE_KEYS = [
  'road',
  'pavement',
  'brick',
  'plaster',
  'concrete',
  'corrugated',
  'gravel',
  'rust',
  'metal',
  'wood',
  'ground',
  'rock',
  'boxmetal',
] as const;
export type SurfaceKey = (typeof SURFACE_KEYS)[number];

export const MODEL_KEYS = [
  'lazi',
  'thief',
  'dog',
  'ped_worker',
  'ped_business',
  'ped_farmer',
] as const;

/** Playable characters other than Lazi. Loaded on demand (each is ~0.5 MB). */
export const CHARACTER_MODEL_KEYS = ['char_woman2', 'char_punk', 'char_adventurer'] as const;
export type ModelKey = (typeof MODEL_KEYS)[number] | (typeof CHARACTER_MODEL_KEYS)[number];

export const HDRI_KEYS = ['morning', 'midday', 'golden', 'evening'] as const;
export type HdriKey = (typeof HDRI_KEYS)[number];

export interface PbrTextures {
  diff: THREE.Texture;
  nor: THREE.Texture;
  /** Packed: R = ambient occlusion, G = roughness, B = metalness. */
  arm: THREE.Texture;
}

export type ProgressFn = (fraction: number, label: string) => void;

const base = (): string => import.meta.env.BASE_URL;

/**
 * Loads and owns the game's heavy assets (textures, rigged models, HDRI skies).
 * Everything is loaded on demand and cached, and `dispose()` frees the GPU memory.
 */
export class AssetLoader {
  readonly surfaces = new Map<SurfaceKey, PbrTextures>();
  readonly models = new Map<ModelKey, GLTF>();
  readonly hdris = new Map<HdriKey, THREE.DataTexture>();

  private readonly textureLoader = new THREE.TextureLoader();
  private readonly gltfLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  private readonly rgbeLoader = new HDRLoader();
  private readonly pendingHdri = new Map<HdriKey, Promise<THREE.DataTexture>>();
  private readonly pendingModels = new Map<ModelKey, Promise<GLTF>>();

  constructor(private readonly maxAnisotropy: number) {}

  async loadSurfaces(onProgress?: ProgressFn, span: [number, number] = [0, 1]): Promise<void> {
    const todo = SURFACE_KEYS.filter((k) => !this.surfaces.has(k));
    let done = 0;
    await Promise.all(
      todo.map(async (key) => {
        const [diff, nor, arm] = await Promise.all([
          this.loadTexture(`textures/${key}_diff.webp`, true),
          this.loadTexture(`textures/${key}_nor.webp`, false),
          this.loadTexture(`textures/${key}_arm.webp`, false),
        ]);
        this.surfaces.set(key, { diff, nor, arm });
        done++;
        report(onProgress, span, done / todo.length, 'Laying the streets');
      }),
    );
  }

  async loadModels(onProgress?: ProgressFn, span: [number, number] = [0, 1]): Promise<void> {
    const todo = MODEL_KEYS.filter((k) => !this.models.has(k));
    let done = 0;
    await Promise.all(
      todo.map(async (key) => {
        const gltf = await this.gltfLoader.loadAsync(`${base()}assets/models/${key}.glb`);
        this.models.set(key, gltf);
        done++;
        report(onProgress, span, done / todo.length, 'Meeting the neighbours');
      }),
    );
  }

  /** Load one extra model (a playable character) on demand; concurrent calls share one request. */
  loadModel(key: ModelKey): Promise<GLTF> {
    const cached = this.models.get(key);
    if (cached) return Promise.resolve(cached);
    let pending = this.pendingModels.get(key);
    if (!pending) {
      pending = this.gltfLoader.loadAsync(`${base()}assets/models/${key}.glb`).then((gltf) => {
        this.models.set(key, gltf);
        return gltf;
      });
      this.pendingModels.set(key, pending);
    }
    return pending;
  }

  /** Load one equirectangular HDR sky (cached; concurrent calls share one request). */
  loadHdri(key: HdriKey): Promise<THREE.DataTexture> {
    const cached = this.hdris.get(key);
    if (cached) return Promise.resolve(cached);
    let pending = this.pendingHdri.get(key);
    if (!pending) {
      pending = this.rgbeLoader.loadAsync(`${base()}assets/hdri/${key}_1k.hdr`).then((tex) => {
        tex.mapping = THREE.EquirectangularReflectionMapping;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        this.hdris.set(key, tex);
        return tex;
      });
      this.pendingHdri.set(key, pending);
    }
    return pending;
  }

  private async loadTexture(path: string, srgb: boolean): Promise<THREE.Texture> {
    const tex = await this.textureLoader.loadAsync(`${base()}assets/${path}`);
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = this.maxAnisotropy;
    return tex;
  }

  dispose(): void {
    for (const set of this.surfaces.values()) {
      set.diff.dispose();
      set.nor.dispose();
      set.arm.dispose();
    }
    for (const tex of this.hdris.values()) tex.dispose();
    for (const gltf of this.models.values()) {
      gltf.scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) m.dispose();
        }
      });
    }
    this.surfaces.clear();
    this.models.clear();
    this.hdris.clear();
    this.pendingHdri.clear();
    this.pendingModels.clear();
  }
}

function report(
  fn: ProgressFn | undefined,
  span: [number, number],
  t: number,
  label: string,
): void {
  fn?.(span[0] + (span[1] - span[0]) * t, label);
}
