import * as THREE from 'three';
import type { AssetLoader, SurfaceKey } from '../core/AssetLoader';
import { SignAtlas } from './SignAtlas';

/** Metres of world space one texture repeat covers, per surface (drives UV scaling in the kit). */
export const SURFACE_TILE: Readonly<Record<SurfaceKey, number>> = {
  road: 5,
  pavement: 2.5,
  brick: 3,
  plaster: 3,
  concrete: 4,
  corrugated: 2.2,
  gravel: 4,
  rust: 3,
  metal: 2.5,
  wood: 2,
  ground: 5,
  rock: 14,
  boxmetal: 2.2,
};

/** Uniforms shared by every atmosphere-patched material. */
export const atmosphere = {
  time: { value: 0 },
  fogHeightFalloff: { value: 0.045 },
  fogHeightMix: { value: 0.85 },
  /** 0 = day, 1 = night: scales window / lamp glow. */
  night: { value: 0 },
};

/**
 * Adds height-based fog (denser near the ground, thinning up the buildings) and optional wind
 * sway to a standard material. Works with InstancedMesh.
 */
export function patchAtmosphere(material: THREE.Material, wind = 0): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = atmosphere.time;
    shader.uniforms.uFogHeightFalloff = atmosphere.fogHeightFalloff;
    shader.uniforms.uFogHeightMix = atmosphere.fogHeightMix;
    shader.uniforms.uWind = { value: wind };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uTime;
         uniform float uWind;
         varying float vFogWorldY;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         if (uWind > 0.0) {
           float phase = uTime * 2.6 + transformed.x * 1.7 + transformed.y * 0.9;
           transformed.z += sin(phase) * uWind * (0.35 + uv.x);
           transformed.y += cos(phase * 0.8) * uWind * 0.25 * uv.x;
         }`,
      )
      .replace(
        '#include <fog_vertex>',
        `#include <fog_vertex>
         vFogWorldY = (inverse(viewMatrix) * mvPosition).y;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uFogHeightFalloff;
         uniform float uFogHeightMix;
         varying float vFogWorldY;`,
      )
      .replace(
        '#include <fog_fragment>',
        `#ifdef USE_FOG
           float hf = exp(-max(vFogWorldY, 0.0) * uFogHeightFalloff);
           float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
           fogFactor = clamp(fogFactor * mix(1.0, 0.3 + hf * 1.3, uFogHeightMix), 0.0, 1.0);
           gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
         #endif`,
      );
  };
  material.customProgramCacheKey = () => `atmo${wind > 0 ? 'W' : ''}`;
}

export type MaterialKey =
  | SurfaceKey
  | 'glass'
  | 'glassLit'
  | 'matte'
  | 'paint'
  | 'sign'
  | 'foliage'
  | 'lamp'
  | 'cloth'
  | 'markings';

/**
 * Every shared material the realistic world uses. PBR surfaces come from the loaded Poly Haven
 * textures; the rest are plain standard materials driven by vertex colours.
 */
export class MaterialLibrary {
  private readonly surfaces = new Map<SurfaceKey, THREE.MeshStandardMaterial>();
  readonly glass: THREE.MeshStandardMaterial;
  readonly glassLit: THREE.MeshStandardMaterial;
  readonly matte: THREE.MeshStandardMaterial;
  readonly paint: THREE.MeshStandardMaterial;
  readonly foliage: THREE.MeshStandardMaterial;
  readonly lamp: THREE.MeshStandardMaterial;
  readonly markings: THREE.MeshStandardMaterial;
  readonly sign: THREE.MeshStandardMaterial;
  /** Flags / washing: vertex-colour cloth that waves in the wind. */
  readonly cloth: THREE.MeshStandardMaterial;
  private readonly signAtlas = new SignAtlas();

  constructor(assets: AssetLoader) {
    for (const [key, set] of assets.surfaces) {
      const m = new THREE.MeshStandardMaterial({
        map: set.diff,
        normalMap: set.nor,
        aoMap: set.arm,
        roughnessMap: set.arm,
        metalnessMap: set.arm,
        vertexColors: true,
        roughness: 1,
        metalness: 1,
        normalScale: new THREE.Vector2(0.9, 0.9),
      });
      // The packed ARM texture is authoritative; keep the multipliers at 1.
      // Painted / weathered sheet metal reads as duller than raw steel.
      const metalScale: Partial<Record<SurfaceKey, number>> = {
        corrugated: 0.45,
        rust: 0.5,
        boxmetal: 0.55,
        metal: 0.8,
      };
      m.metalness = metalScale[key] ?? 1;
      patchAtmosphere(m);
      this.surfaces.set(key, m);
    }

    this.glass = new THREE.MeshStandardMaterial({
      color: 0x24384f,
      roughness: 0.06,
      metalness: 0.85,
      envMapIntensity: 1.4,
    });
    this.glassLit = new THREE.MeshStandardMaterial({
      color: 0x24384f,
      roughness: 0.15,
      metalness: 0.4,
      emissive: new THREE.Color(0xffc978),
      emissiveIntensity: 0,
    });
    this.matte = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.05,
    });
    this.paint = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.32,
      metalness: 0.45,
    });
    this.foliage = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0,
    });
    this.lamp = new THREE.MeshStandardMaterial({
      color: 0xfff1c9,
      emissive: new THREE.Color(0xffe2a0),
      emissiveIntensity: 1.2,
      roughness: 0.4,
    });
    this.markings = new THREE.MeshStandardMaterial({
      color: 0xf2efe4,
      roughness: 0.7,
      metalness: 0,
    });
    this.markings.polygonOffset = true;
    this.markings.polygonOffsetFactor = -2;
    this.sign = new THREE.MeshStandardMaterial({
      map: this.signAtlas.texture,
      emissiveMap: this.signAtlas.texture,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0,
      roughness: 0.6,
      metalness: 0.05,
    });
    this.cloth = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      side: THREE.DoubleSide,
    });

    for (const m of [
      this.glass,
      this.glassLit,
      this.matte,
      this.paint,
      this.foliage,
      this.lamp,
      this.markings,
      this.sign,
    ]) {
      patchAtmosphere(m);
    }
    patchAtmosphere(this.cloth, 0.12);
  }

  get signs(): SignAtlas {
    return this.signAtlas;
  }

  get(key: MaterialKey): THREE.MeshStandardMaterial {
    switch (key) {
      case 'glass':
        return this.glass;
      case 'glassLit':
        return this.glassLit;
      case 'matte':
        return this.matte;
      case 'paint':
        return this.paint;
      case 'sign':
        return this.sign;
      case 'foliage':
        return this.foliage;
      case 'lamp':
        return this.lamp;
      case 'markings':
        return this.markings;
      case 'cloth':
        return this.cloth;
      default: {
        const m = this.surfaces.get(key);
        if (!m) throw new Error(`Surface material "${key}" is not loaded`);
        return m;
      }
    }
  }

  /** Per-frame: night factor drives window and lamp glow. */
  update(time: number, night: number): void {
    atmosphere.time.value = time;
    atmosphere.night.value = night;
    this.glassLit.emissiveIntensity = night * 0.85;
    this.lamp.emissiveIntensity = 0.5 + night * 3.5;
    this.sign.emissiveIntensity = 0.04 + night * 0.9;
  }

  dispose(): void {
    for (const m of this.surfaces.values()) m.dispose();
    for (const m of [
      this.glass,
      this.glassLit,
      this.matte,
      this.paint,
      this.foliage,
      this.lamp,
      this.markings,
      this.sign,
      this.cloth,
    ]) {
      m.dispose();
    }
    this.signAtlas.dispose();
    this.surfaces.clear();
  }
}
