import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import type { AssetLoader, ModelKey } from '../core/AssetLoader';

export interface CharacterSpec {
  model: ModelKey;
  /** Uniform scale applied to the loaded model (models are authored at different sizes). */
  scale: number;
  /** Turn the model to face -Z (the running direction). The Quaternius rigs face +Z. */
  faceForward?: boolean;
  /** Override material colours by material name. */
  recolor?: Readonly<Record<string, number>>;
  /** Meshes to hide by name (hard hats, farm hats that ship with the base model). */
  hide?: readonly string[];
  /** Extra shine reduction so the flat-shaded low-poly bodies don't look plastic. */
  roughness?: number;
}

export interface PlayOptions {
  /** Cross-fade seconds (default 0.18). */
  fade?: number;
  loop?: 'repeat' | 'once' | 'clamp';
  timeScale?: number;
  /** Start from `time` seconds into the clip (e.g. to freeze a mid-stride pose). */
  startAt?: number;
  /** Restart the clip even if it is already playing. */
  restart?: boolean;
}

/**
 * A rigged, animated character: a cloned skeleton with its own materials (so each one can be
 * recoloured) and an AnimationMixer that always cross-fades between clips, never snapping.
 */
export class Character {
  readonly root = new THREE.Group();
  readonly model: THREE.Object3D;

  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private readonly materials: THREE.Material[] = [];
  private current: THREE.AnimationAction | null = null;
  private currentName = '';
  private readonly onFinished = new Set<(name: string) => void>();

  constructor(assets: AssetLoader, spec: CharacterSpec) {
    const gltf = assets.models.get(spec.model);
    if (!gltf) throw new Error(`Model "${spec.model}" is not loaded`);
    this.model = cloneSkinned(gltf.scene);
    this.model.scale.setScalar(spec.scale);
    if (spec.faceForward !== false) this.model.rotation.y = Math.PI;
    this.root.add(this.model);

    // Give this character its own materials so recolouring one doesn't affect the others.
    this.model.traverse((o) => {
      if (!(o instanceof THREE.Mesh || o instanceof THREE.SkinnedMesh)) return;
      o.frustumCulled = false; // skinned bounds are unreliable; there are only a handful
      if (spec.hide?.includes(o.name)) o.visible = false;
      const list = Array.isArray(o.material) ? o.material : [o.material];
      const cloned = list.map((m) => {
        const c = m.clone() as THREE.MeshStandardMaterial;
        const color = spec.recolor?.[c.name];
        if (color !== undefined && c.color) c.color.set(color);
        if (spec.roughness !== undefined && 'roughness' in c) c.roughness = spec.roughness;
        if ('metalness' in c) c.metalness = 0;
        this.materials.push(c);
        return c;
      });
      o.material = Array.isArray(o.material) ? cloned : (cloned[0] as THREE.Material);
    });

    this.mixer = new THREE.AnimationMixer(this.model);
    for (const clip of gltf.animations) this.actions.set(clip.name, this.mixer.clipAction(clip));
    this.mixer.addEventListener('finished', (e) => {
      const name = (e as unknown as { action: THREE.AnimationAction }).action.getClip().name;
      for (const fn of this.onFinished) fn(name);
    });
  }

  has(name: string): boolean {
    return this.actions.has(name);
  }

  get playing(): string {
    return this.currentName;
  }

  duration(name: string): number {
    return this.actions.get(name)?.getClip().duration ?? 0;
  }

  onClipFinished(fn: (name: string) => void): void {
    this.onFinished.add(fn);
  }

  /** Cross-fade to a clip. Playing the same clip again only adjusts its speed (unless `restart`). */
  play(name: string, opt: PlayOptions = {}): void {
    const next = this.actions.get(name);
    if (!next) return;
    if (next === this.current && !opt.restart) {
      if (opt.timeScale !== undefined) next.timeScale = opt.timeScale;
      return;
    }
    const fade = opt.fade ?? 0.18;
    next.reset();
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.timeScale = opt.timeScale ?? 1;
    const loop = opt.loop ?? 'repeat';
    next.setLoop(
      loop === 'repeat' ? THREE.LoopRepeat : THREE.LoopOnce,
      loop === 'repeat' ? Infinity : 1,
    );
    next.clampWhenFinished = loop !== 'repeat';
    if (opt.startAt !== undefined) next.time = opt.startAt;
    next.play();
    if (this.current && this.current !== next) this.current.crossFadeTo(next, fade, false);
    else next.fadeIn(fade);
    this.current = next;
    this.currentName = name;
  }

  /** Hold the current pose (used to freeze a mid-stride leap for the jump). */
  freeze(): void {
    if (this.current) this.current.timeScale = 0;
  }

  update(dt: number): void {
    this.mixer.update(dt);
  }

  /** Find a bone by (sanitised) name, e.g. `Chest`, `UpperArmR`. */
  bone(name: string): THREE.Object3D | null {
    return this.model.getObjectByName(name) ?? null;
  }

  setShadows(cast: boolean): void {
    this.model.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = cast;
    });
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model);
    for (const m of this.materials) m.dispose();
    this.root.removeFromParent();
  }
}
