import * as THREE from 'three';
import { CONFIG } from '../config/gameConfig';
import type { AssetLoader } from '../core/AssetLoader';
import { damp } from '../core/math';
import type { ChaseState } from '../systems/ChaseSystem';
import type { PathHistory } from '../systems/PathHistory';
import { Character } from './Character';
import type { Player } from './Player';
import { createCap, createSack, type Prop } from './props';
import type { RiggedPlayerView } from './RiggedPlayerView';

const C = CONFIG.chase;

/** The thief: dark hoodie, black jeans, cap. Colours by material name. */
const THIEF_RECOLOR = {
  Purple: 0x2c2f3a,
  LightBlue: 0x16171c,
  White: 0x3a3c44,
  Skin: 0xb98058,
  Hair: 0x1a120d,
} as const;

/** Scale that brings the (much bigger) dog model down to a street dog's size. */
const DOG_SCALE = 0.21;
/** Beyond this gap the pair are behind the camera, so we skip drawing and animating them. */
const VISIBLE_GAP = 16;

/** What the game needs from the chasers (rigged version, or primitive on Low). */
export interface ChaserView {
  readonly root: THREE.Object3D;
  reset(): void;
  update(dt: number, ctx: ChaseContext): void;
  dispose(): void;
}

export interface ChaseContext {
  chase: ChaseState;
  path: PathHistory;
  /** Track distance the player has run. */
  travelled: number;
  speedNorm: number;
  player: Player;
  /** Set when the run ended in the bag-snatch scene. */
  laziView: RiggedPlayerView | null;
}

/**
 * The thief and his dog. Their positions come from the pure chase logic + Lazi's recorded path;
 * this class turns that into animated characters and plays the end-of-run scenes.
 */
export class Chasers implements ChaserView {
  readonly root = new THREE.Group();
  private readonly thief: Character;
  private readonly dog: Character;
  private readonly cap: Prop;
  private readonly sack: Prop;

  private thiefClip = '';
  private dogClip = '';
  private sceneTime = 0;
  private bagStolen = false;
  /** Scene time at which the bag changed hands. */
  private contactAt = 0;
  private gapOverride: number | null = null;
  private introReach = 0;

  constructor(assets: AssetLoader, shadows: boolean) {
    this.thief = new Character(assets, {
      model: 'thief',
      scale: 1,
      recolor: THIEF_RECOLOR,
      roughness: 0.85,
    });
    this.dog = new Character(assets, { model: 'dog', scale: DOG_SCALE, roughness: 0.9 });
    this.root.add(this.thief.root, this.dog.root);

    this.cap = createCap();
    this.sack = createSack();
    this.thief.root.add(this.cap.object, this.sack.object);
    this.mountThiefProps();
    this.thief.setShadows(shadows);
    this.dog.setShadows(shadows);
    this.root.visible = false;
  }

  /** Cap on the head, sack in the right hand: placed in model space, then bound to bones. */
  private mountThiefProps(): void {
    const t = this.thief;
    t.root.updateMatrixWorld(true);
    const head = t.bone('Head');
    const hand = t.bone('WristR');
    const p = new THREE.Vector3();
    if (head) {
      head.getWorldPosition(p);
      t.root.worldToLocal(p);
      this.cap.object.position.set(p.x, p.y + 0.14, p.z);
      head.attach(this.cap.object);
    }
    if (hand) {
      hand.getWorldPosition(p);
      t.root.worldToLocal(p);
      this.sack.object.position.set(p.x, p.y - 0.28, p.z);
      hand.attach(this.sack.object);
    }
  }

  reset(): void {
    this.sceneTime = 0;
    this.bagStolen = false;
    this.contactAt = 0;
    this.sack.object.visible = true;
    this.gapOverride = null;
    this.introReach = 0;
    this.thiefClip = '';
    this.dogClip = '';
    this.root.visible = false;
  }

  /** Where the pair are right now (for the snatch scene). */
  get gap(): number {
    return this.gapOverride ?? 0;
  }

  update(dt: number, ctx: ChaseContext): void {
    const { chase, path, travelled, speedNorm, player, laziView } = ctx;

    // Snatch scene: the world has stopped; the pair run up to Lazi under their own steam.
    if (chase.phase === 'snatch' || chase.phase === 'caught') this.sceneTime += dt;
    let gap = chase.gap;
    if (chase.phase === 'snatch') {
      this.gapOverride ??= chase.gap;
      this.gapOverride -= C.snatchSpeed * dt;
      gap = this.gapOverride;
    }

    const visible = gap < VISIBLE_GAP && gap > -60;
    this.root.visible = visible && (chase.phase !== 'far' || gap < VISIBLE_GAP);
    if (!this.root.visible) return;

    // ---- Thief -------------------------------------------------------------------------
    const ahead = gap < 0;
    const pt = path.sample(travelled - Math.max(gap, 0));
    let tx = pt.x;
    let ty = pt.y;
    if (chase.phase === 'snatch') {
      // Run in alongside her on the way past.
      tx = damp(this.thief.root.position.x, player.x + (ahead ? 0.9 : 0.5), 8, dt);
      ty = player.y;
    }
    this.thief.root.position.set(tx, ty, gap);

    if (chase.phase === 'intro') this.introReach += dt;
    this.animateThief(chase, speedNorm, gap, laziView);

    // ---- Dog ---------------------------------------------------------------------------
    const dogGap = gap - C.dogLead;
    const pd = path.sample(travelled - Math.max(dogGap, 0));
    const dx = chase.phase === 'snatch' ? tx - 0.9 : pd.x - 0.55;
    this.dog.root.position.set(dx, chase.phase === 'snatch' ? ty : pd.y, dogGap);
    this.animateDog(chase, speedNorm, pd.y);

    this.thief.update(dt);
    this.dog.update(dt);
  }

  private animateThief(
    chase: ChaseState,
    speedNorm: number,
    gap: number,
    laziView: RiggedPlayerView | null,
  ): void {
    const t = this.thief;
    const run = { timeScale: 1.25 + speedNorm * 1.4 + (chase.phase === 'catching' ? 0.9 : 0) };
    switch (chase.phase) {
      case 'intro':
        // Lunges for the bag, then gives chase.
        if (this.introReach < 0.9) this.setThiefClip('Interact', { timeScale: 1.1 });
        else this.setThiefClip('Run', run);
        break;
      case 'snatch': {
        if (!this.bagStolen && gap <= 0.5) {
          this.bagStolen = true;
          this.contactAt = this.sceneTime;
          this.stealBag(laziView);
          this.setThiefClip('Interact', { timeScale: 1.6, loop: 'clamp', restart: true });
        } else if (
          this.bagStolen &&
          this.sceneTime - this.contactAt > t.duration('Interact') / 1.6
        ) {
          this.setThiefClip('Run', { timeScale: 2.2 }); // off with the prize
        } else if (!this.bagStolen) {
          this.setThiefClip('Run', { timeScale: 2.0 });
        }
        break;
      }
      case 'caught': {
        if (!this.bagStolen && this.sceneTime > 0.9) {
          this.bagStolen = true;
          this.stealBag(laziView);
        }
        this.setThiefClip(this.bagStolen ? 'Wave' : 'Interact', { timeScale: 1.2 });
        break;
      }
      default:
        this.setThiefClip('Run', run);
    }
  }

  private animateDog(chase: ChaseState, speedNorm: number, pathY: number): void {
    if (chase.phase === 'caught') {
      this.setDogClip('Attack', { timeScale: 1.4 }); // barking and tugging at the bag
    } else if (chase.phase === 'catching') {
      this.setDogClip('Attack', { timeScale: 1.6 });
    } else if (pathY > 0.4) {
      this.setDogClip('Gallop_Jump', { timeScale: 1.2 });
    } else {
      this.setDogClip('Gallop', { timeScale: 1.3 + speedNorm * 1.5 });
    }
  }

  private setThiefClip(
    name: string,
    opt: { timeScale?: number; loop?: 'repeat' | 'once' | 'clamp'; restart?: boolean } = {},
  ): void {
    const key = `${name}`;
    if (this.thiefClip === key && !opt.restart) {
      this.thief.play(name, { timeScale: opt.timeScale });
      return;
    }
    this.thiefClip = key;
    this.thief.play(name, { fade: 0.12, ...opt });
  }

  private setDogClip(name: string, opt: { timeScale?: number } = {}): void {
    if (this.dogClip === name) {
      this.dog.play(name, { timeScale: opt.timeScale });
      return;
    }
    this.dogClip = name;
    this.dog.play(name, { fade: 0.12, ...opt });
  }

  /** Move Lazi's bag into the thief's hand (it keeps its world position for a frame, then follows him). */
  private stealBag(laziView: RiggedPlayerView | null): void {
    if (!laziView) return;
    const bag = laziView.releaseBag();
    const hand = this.thief.bone('WristR');
    if (hand) hand.attach(bag);
    this.sack.object.visible = false; // he's swapped his empty sack for the real prize
  }

  dispose(): void {
    this.cap.dispose();
    this.sack.dispose();
    this.thief.dispose();
    this.dog.dispose();
    this.root.removeFromParent();
  }
}
