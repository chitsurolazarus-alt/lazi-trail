import * as THREE from 'three';
import { CONFIG } from '../config/gameConfig';
import type { AssetLoader } from '../core/AssetLoader';
import { damp } from '../core/math';
import { Character } from './Character';
import type { PlayerEvent, PlayerPose, PlayerView } from './PlayerView';
import { createMedal, createSportsBag, type Prop } from './props';

/** Lazi's look: orange tee, deep-blue shorts, orange running spikes. Colours per material name. */
export const LAZI_RECOLOR = {
  LightBrown: 0xff7a1a, // tee
  LightBlue: 0x0b2a5b, // shorts
  Red_Dark: 0xff7a1a, // spikes
  White: 0xc9c5ba, // soles
  Skin: 0x6b4126,
  Skin_Darker: 0x5a3520,
  Hair: 0x0c0806,
  Eyebrows: 0x0c0806,
} as const;

/** Where in the Run cycle (seconds) legs and arms are most spread: used as the mid-air leap pose. */
const LEAP_FRAME = 0.2;

type State = 'idle' | 'run' | 'air' | 'slide' | 'crash' | 'celebrate';

/**
 * Lazi as a rigged, animated athlete. Cross-fades between Idle / Run / Roll (slide) / a frozen
 * leap pose (jump) / flinch (stumble) / fall (crash) and keeps her bag and medal attached to
 * the skeleton so they move with her.
 */
export class RiggedPlayerView implements PlayerView {
  readonly object = new THREE.Group();
  readonly character: Character;
  readonly bag: Prop;
  readonly medal: Prop;

  private state: State = 'idle';
  private stumbleTimer = 0;
  private bagAttached = true;

  constructor(assets: AssetLoader) {
    this.character = new Character(assets, {
      model: 'lazi',
      scale: 1,
      recolor: LAZI_RECOLOR,
      roughness: 0.8,
    });
    this.object.add(this.character.root);
    this.bag = createSportsBag();
    this.medal = createMedal();
    this.character.root.add(this.bag.object, this.medal.object);
    this.mountProps();
    this.character.play('Idle_Neutral', { fade: 0 });
  }

  /** Place the props in model space, then bind them to bones so they follow the animation. */
  private mountProps(): void {
    const c = this.character;
    // Model faces -Z, so the back is +Z. Chest is around y = 1.25 m.
    this.bag.object.position.set(0, 1.2, 0.22);
    this.bag.object.scale.setScalar(0.85);
    this.medal.object.position.set(0, 1.5, -0.13);
    c.root.updateMatrixWorld(true);
    const chest = c.bone('Chest') ?? c.bone('Torso');
    if (chest) {
      chest.attach(this.bag.object);
      chest.attach(this.medal.object);
    }
  }

  /** The thief snatches the bag: detach it so another character can carry it. */
  releaseBag(): THREE.Object3D {
    this.bagAttached = false;
    return this.bag.object;
  }

  get hasBag(): boolean {
    return this.bagAttached;
  }

  trigger(event: PlayerEvent): void {
    const c = this.character;
    switch (event) {
      case 'jump':
        this.state = 'air';
        c.play('Run', { startAt: LEAP_FRAME, timeScale: 0, fade: 0.08, restart: true });
        break;
      case 'slide':
        this.state = 'slide';
        c.play('Roll', {
          loop: 'clamp',
          timeScale: c.duration('Roll') / CONFIG.player.slideTime,
          fade: 0.06,
          restart: true,
        });
        break;
      case 'stumble':
        this.stumbleTimer = 0.5;
        c.play('HitRecieve', { loop: 'clamp', fade: 0.05, restart: true, timeScale: 1.1 });
        break;
      case 'crash':
        this.state = 'crash';
        c.play('Death', { loop: 'clamp', fade: 0.06, restart: true, timeScale: 1.25 });
        break;
      case 'caught':
        this.state = 'crash';
        c.play('HitRecieve_2', { loop: 'clamp', fade: 0.08, restart: true });
        break;
      case 'celebrate':
        this.state = 'celebrate';
        c.play('Wave', { fade: 0.2 });
        break;
      case 'land':
        // handled by the state check in update()
        break;
    }
  }

  reset(): void {
    this.state = 'idle';
    this.stumbleTimer = 0;
    this.object.rotation.set(0, 0, 0);
    if (!this.bagAttached) {
      // Put the bag back on Lazi for the next run.
      const chest = this.character.bone('Chest') ?? this.character.bone('Torso');
      chest?.attach(this.bag.object);
      this.bagAttached = true;
    }
    this.character.play('Idle_Neutral', { fade: 0, restart: true });
  }

  setShadows(cast: boolean): void {
    this.character.setShadows(cast);
    this.bag.object.traverse((o) => (o.castShadow = cast));
  }

  update(dt: number, pose: PlayerPose): void {
    const c = this.character;
    const lean = this.object;
    lean.rotation.z = damp(lean.rotation.z, -pose.lean * 0.25, 20, dt);

    if (this.state === 'crash') {
      c.update(dt);
      return;
    }
    if (this.state === 'celebrate') {
      c.update(dt);
      return;
    }
    if (this.stumbleTimer > 0) {
      this.stumbleTimer -= dt;
      c.update(dt);
      return;
    }

    const want: State = !pose.running
      ? 'idle'
      : pose.sliding
        ? 'slide'
        : !pose.grounded
          ? 'air'
          : 'run';
    if (want !== this.state) {
      this.state = want;
      if (want === 'idle') c.play('Idle_Neutral', { fade: 0.25 });
      else if (want === 'air')
        c.play('Run', { startAt: LEAP_FRAME, timeScale: 0, fade: 0.1, restart: true });
      else if (want === 'run')
        c.play('Run', { timeScale: 1.3 + pose.speedNorm * 1.6, fade: 0.12, restart: true });
      // 'slide' is started by the trigger so the roll always begins at frame 0
    }
    if (this.state === 'run') c.play('Run', { timeScale: 1.3 + pose.speedNorm * 1.6 });
    c.update(dt);
  }

  dispose(): void {
    this.bag.dispose();
    this.medal.dispose();
    this.character.dispose();
  }
}
