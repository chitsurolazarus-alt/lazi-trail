import * as THREE from 'three';
import type { CharacterId } from '../config/characters';
import { getCharacter } from '../config/characters';
import type { AssetLoader } from '../core/AssetLoader';
import type { PlayerPose } from './PlayerView';
import { RiggedPlayerView } from './RiggedPlayerView';

const IDLE_POSE: PlayerPose = {
  alive: true,
  grounded: true,
  sliding: false,
  running: false,
  speedNorm: 0,
  lean: 0,
  y: 0,
  vy: 0,
};

/**
 * The character room: a small stage with a podium where the selected runner slowly turns, idles,
 * and celebrates when picked or unlocked. Locked characters show as a dark silhouette.
 * It owns its own scene and camera; the game renders it instead of the street while it is open.
 */
export class Showroom {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(28, 1, 0.1, 60);

  private readonly stage = new THREE.Group();
  private view: RiggedPlayerView | null = null;
  private silhouetteMaterial: THREE.MeshBasicMaterial | null = null;
  private spin = 0.35;
  private spinVelocity = 0.35;
  private celebrateTimer = 0;
  private locked = false;
  private request = 0;
  private readonly disposables: Array<{ dispose(): void }> = [];

  constructor(private readonly assets: AssetLoader) {
    this.scene.background = this.makeBackdrop();

    this.scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x1b2b52, 1.5));
    const key = new THREE.DirectionalLight(0xfff1de, 3.2);
    key.position.set(-2.5, 4, 4);
    const rim = new THREE.DirectionalLight(0xff7a1a, 3.4);
    rim.position.set(3, 2.5, -3.5);
    const fill = new THREE.DirectionalLight(0x6fa0ff, 1.1);
    fill.position.set(4, 1, 3);
    this.scene.add(key, rim, fill);

    const podiumGeo = new THREE.CylinderGeometry(0.95, 1.05, 0.14, 56);
    const podiumMat = new THREE.MeshStandardMaterial({
      color: 0x14346b,
      roughness: 0.55,
      metalness: 0.3,
    });
    const podium = new THREE.Mesh(podiumGeo, podiumMat);
    podium.position.y = -0.07;
    const ringGeo = new THREE.TorusGeometry(0.98, 0.03, 12, 72).rotateX(Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xff7a1a });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.005;
    const floorGeo = new THREE.CircleGeometry(6, 48).rotateX(-Math.PI / 2);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0c2249,
      roughness: 0.9,
      metalness: 0,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.y = -0.15;
    this.scene.add(podium, ring, floor, this.stage);
    this.disposables.push(podiumGeo, podiumMat, ringGeo, ringMat, floorGeo, floorMat);

    this.camera.position.set(0, 1.25, 5.2);
    this.camera.lookAt(0, 0.95, 0);
  }

  private makeBackdrop(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const g = ctx.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, '#12397a');
      g.addColorStop(0.55, '#0b2a5b');
      g.addColorStop(1, '#061735');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 16, 256);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.disposables.push(tex);
    return tex;
  }

  /** Frame the runner to one side on wide screens (menu panel on the other) or above the panel on tall ones. */
  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    if (width > height * 1.15) {
      this.camera.setViewOffset(width, height, -width * 0.2, 0, width, height);
    } else {
      this.camera.setViewOffset(width, height, 0, height * 0.2, width, height);
    }
    // Keep the whole runner in shot on narrow screens.
    this.camera.position.z = width > height * 1.15 ? 5.2 : 7.8;
    this.camera.updateProjectionMatrix();
  }

  /** Show a character in an outfit; `locked` renders a silhouette instead. */
  async show(characterId: CharacterId, outfitId: string, locked: boolean): Promise<void> {
    const ticket = ++this.request;
    const def = getCharacter(characterId);
    await this.assets.loadModel(def.model);
    if (ticket !== this.request) return; // a newer request superseded this one
    this.clearView();
    const view = new RiggedPlayerView(this.assets, characterId, outfitId);
    view.setShadows(false);
    if (locked) this.silhouette(view);
    this.view = view;
    this.locked = locked;
    this.stage.add(view.object);
    this.celebrateTimer = 0;
  }

  private silhouette(view: RiggedPlayerView): void {
    this.silhouetteMaterial ??= new THREE.MeshBasicMaterial({ color: 0x050d1e });
    const mat = this.silhouetteMaterial;
    view.object.traverse((o) => {
      if (o instanceof THREE.Mesh) o.material = mat;
    });
    view.bag.object.visible = false;
    view.medal.object.visible = false;
  }

  private clearView(): void {
    if (!this.view) return;
    this.stage.remove(this.view.object);
    this.view.dispose();
    this.view = null;
  }

  /** A short wave (picked / unlocked). */
  celebrate(): void {
    if (!this.view || this.locked) return;
    this.view.trigger('celebrate');
    this.celebrateTimer = 2.4;
  }

  /** Drag to turn the runner. */
  rotate(dx: number): void {
    this.spin += dx * 0.012;
    this.spinVelocity = 0;
  }

  update(dt: number): void {
    // After a drag the slow turntable spin eases back in.
    this.spinVelocity += (0.35 - this.spinVelocity) * Math.min(1, dt * 0.6);
    this.spin += this.spinVelocity * dt;
    this.stage.rotation.y = this.spin;
    if (this.celebrateTimer > 0) {
      this.celebrateTimer -= dt;
      if (this.celebrateTimer <= 0) this.view?.reset();
    }
    this.view?.update(dt, IDLE_POSE);
  }

  dispose(): void {
    this.request++;
    this.clearView();
    this.silhouetteMaterial?.dispose();
    for (const d of this.disposables) d.dispose();
  }
}
