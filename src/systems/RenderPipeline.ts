import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import type { QualityProfile } from '../config/quality';
import { SpeedFxPass } from './SpeedFxPass';

/**
 * Owns the WebGL renderer and (depending on the quality profile) the post-processing chain:
 *   Render → Bloom → Speed FX (vignette / blur / lines) → Output (ACES tone map, sRGB) → FXAA/SMAA
 * On Low it renders straight to the screen with the same tone mapping.
 */
export class RenderPipeline {
  readonly renderer: THREE.WebGLRenderer;

  private profile: QualityProfile;
  private composer: EffectComposer | null = null;
  private renderPass: RenderPass | null = null;
  private bloom: UnrealBloomPass | null = null;
  private speedFx: SpeedFxPass | null = null;
  private fxaa: ShaderPass | null = null;
  private width = 1;
  private height = 1;
  private time = 0;

  constructor(
    readonly canvas: HTMLCanvasElement,
    profile: QualityProfile,
  ) {
    this.profile = profile;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      // MSAA only on the plain (Low) path; the post chain uses FXAA/SMAA instead.
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.configureShadows();
    this.buildComposer();
  }

  get maxAnisotropy(): number {
    return this.renderer.capabilities.getMaxAnisotropy();
  }

  setProfile(profile: QualityProfile): void {
    this.profile = profile;
    this.configureShadows();
    this.disposeComposer();
    this.buildComposer();
    this.applySize();
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.applySize();
  }

  /** `speedNorm` 0..1 drives the blur/lines; `bloomStrength` comes from the zone atmosphere. */
  render(
    scene: THREE.Scene,
    camera: THREE.Camera,
    dt: number,
    speedNorm: number,
    bloomStrength: number,
  ): void {
    this.time += dt;
    if (!this.composer || !this.renderPass) {
      this.renderer.render(scene, camera);
      return;
    }
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    if (this.bloom) this.bloom.strength = bloomStrength;
    if (this.speedFx) {
      this.speedFx.setSpeed(this.profile.speedEffects ? speedNorm : 0);
      this.speedFx.tick(this.time, this.width / this.height);
    }
    this.composer.render(dt);
  }

  dispose(): void {
    this.disposeComposer();
    this.renderer.dispose();
  }

  private configureShadows(): void {
    const on = this.profile.shadows === 'map';
    this.renderer.shadowMap.enabled = on;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.needsUpdate = true;
  }

  private pixelRatio(): number {
    return Math.min(window.devicePixelRatio || 1, this.profile.maxPixelRatio, 2);
  }

  private buildComposer(): void {
    const p = this.profile;
    if (!p.postprocessing) return;

    const target = new THREE.WebGLRenderTarget(this.width, this.height, {
      type: THREE.HalfFloatType,
      samples: 0,
    });
    const composer = new EffectComposer(this.renderer, target);
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    composer.addPass(this.renderPass);

    if (p.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(this.width, this.height), 0.3, 0.5, 1.6);
      composer.addPass(this.bloom);
    }

    this.speedFx = new SpeedFxPass(p.speedEffects);
    composer.addPass(this.speedFx);
    composer.addPass(new OutputPass());

    if (p.antiAliasing === 'fxaa') {
      this.fxaa = new ShaderPass(FXAAShader);
      composer.addPass(this.fxaa);
    } else if (p.antiAliasing === 'smaa') {
      composer.addPass(new SMAAPass());
    }
    this.composer = composer;
  }

  private disposeComposer(): void {
    if (this.composer) {
      for (const pass of this.composer.passes) pass.dispose?.();
      this.composer.renderTarget1.dispose();
      this.composer.renderTarget2.dispose();
    }
    this.composer = null;
    this.renderPass = null;
    this.bloom = null;
    this.speedFx = null;
    this.fxaa = null;
  }

  private applySize(): void {
    const ratio = this.pixelRatio();
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(this.width, this.height, false);
    if (this.composer) {
      this.composer.setPixelRatio(ratio);
      this.composer.setSize(this.width, this.height);
    }
    if (this.fxaa) {
      const uniforms = this.fxaa.material.uniforms as Record<string, THREE.IUniform>;
      (uniforms.resolution as THREE.IUniform<THREE.Vector2>).value.set(
        1 / (this.width * ratio),
        1 / (this.height * ratio),
      );
    }
  }
}
