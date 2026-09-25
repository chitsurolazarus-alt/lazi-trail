import { CONFIG } from '../../config/gameConfig';
import type { EventBus } from '../../core/EventBus';
import type { GameEvents } from '../../core/events';
import type { Chunk } from '../../world/Chunk';
import type { ChasePhase } from '../ChaseSystem';
import type { AudioManager, Vec3 } from './AudioManager';
import type { TrackName } from './MusicEngine';
import {
  HONK_RANGE,
  coinPitchSemitones,
  crossedThreshold,
  musicIntensity,
  nextStreak,
  type Surface,
} from './audioLogic';
import * as synth from './synth';
import type { SampleName } from './SampleBank';

/** Per-frame facts the director needs from the game. */
export interface AudioFrame {
  dt: number;
  playing: boolean;
  speedNorm: number;
  chase: number;
  chasePhase: ChasePhase;
  distance: number;
  travelled: number;
  playerX: number;
  camera: Vec3;
  cameraForward: Vec3;
  chunks: readonly Chunk[];
}

const rand = (n: number): number => Math.floor(Math.random() * n);

/**
 * Turns what happens in the game into sound: reacts to events, keeps the music intensity and
 * ambience in step with the run, and voices the thief, the dog and passing vehicles.
 */
export class AudioDirector {
  private streak = 0;
  private lastCoinAt = -10;
  private lastLaneSound = 0;
  private lastPhase: ChasePhase | null = null;
  private barkTimer = 1;
  private pantTimer = 0;
  private intensityTimer = 0;
  private wasPlaying = false;
  private stepFoot = 0;
  private frame: AudioFrame | null = null;
  private readonly honked = new WeakSet<object>();
  private readonly lastNearZ = new WeakMap<object, number>();
  private rumble: { panner: PannerNode; gain: GainNode } | null = null;
  private menuTimer = 0;

  constructor(
    private readonly audio: AudioManager,
    bus: EventBus<GameEvents>,
  ) {
    bus.on('laneChange', () => this.onLane());
    bus.on('jump', () => this.audio.synth((c, d, t) => synth.jump(c, d, t)));
    bus.on('slide', () => this.audio.synth((c, d, t) => synth.slide(c, d, t)));
    bus.on('land', ({ impact }) => this.onLand(impact));
    bus.on('coin', ({ gold }) => this.onCoin(gold));
    bus.on('stumble', () => this.onStumble());
    bus.on('crash', () => this.onCrash());
    bus.on('nearMiss', () => this.audio.synth((c, d, t) => synth.nearMiss(c, d, t)));
    bus.on('zoneChange', () => this.audio.synth((c, d, t) => synth.zoneSwoosh(c, d, t)));
    bus.on('shieldBreak', () => {
      this.audio.sample('clank_1', { volume: 0.9 });
      this.audio.synth((c, d, t) => synth.powerDown(c, d, t));
    });
    audio.whenReady(() => this.setupRumble());
  }

  /* ----------------------------------------------------------------- state */

  /** The track that should be playing; applied as soon as audio is available. */
  private desired: TrackName | null = null;

  private setTrack(track: TrackName, fade: number): void {
    this.desired = track;
    this.audio.whenReady(() => {
      // Only the most recent request matters if several arrived before the first tap.
      if (this.desired !== track) return;
      this.audio.music?.play(track, fade);
      if (track === 'run') this.audio.music?.setIntensity(0.15);
      this.audio.ambience?.start();
    });
  }

  /** Menu / ready screen. */
  menu(): void {
    this.setTrack('menu', 1.6);
  }

  /** Shop / character room. */
  shop(): void {
    this.setTrack('shop', 1.2);
  }

  runStart(): void {
    this.streak = 0;
    this.lastPhase = null;
    this.barkTimer = 2.5;
    window.clearTimeout(this.menuTimer);
    this.setTrack('run', 1.2);
  }

  runEnd(caught: boolean, newRecord: boolean): void {
    void caught;
    this.audio.whenReady(() => {
      this.audio.music?.sting(newRecord ? 'record' : 'gameover');
      // The run music fades away under the sting, then the menu theme returns.
      this.audio.music?.stop(2.2);
      window.clearTimeout(this.menuTimer);
      this.desired = 'menu';
      this.menuTimer = window.setTimeout(
        () => this.audio.music?.play('menu', 2),
        newRecord ? 4200 : 3400,
      );
    });
    this.silenceRumble();
  }

  pause(): void {
    this.audio.music?.duck(0.25, 3600);
  }

  resume(): void {
    this.audio.music?.duck(1, 0.4);
  }

  /** A UI sound. */
  ui(kind: 'click' | 'select' | 'back' | 'confirm' | 'error' | 'toggle'): void {
    this.audio.sample(`ui_${kind}` as SampleName, { volume: 0.7 });
  }

  purchase(): void {
    this.audio.sample(('cash_' + rand(3)) as SampleName, { volume: 0.8 });
    this.audio.synth((c, d, t) => synth.chaChing(c, d, t), 0.05);
  }

  unlock(): void {
    this.audio.synth((c, d, t) => synth.unlockFanfare(c, d, t));
  }

  powerUp(): void {
    this.audio.synth((c, d, t) => synth.powerUp(c, d, t));
  }

  powerDown(): void {
    this.audio.synth((c, d, t) => synth.powerDown(c, d, t));
  }

  /* ---------------------------------------------------------------- footsteps */

  footstep(surface: Surface, speedNorm: number): void {
    this.stepFoot = (this.stepFoot + 1) % 2;
    const n = surface === 'tar' ? 4 : 3;
    const name = `step_${surface}_${rand(n)}` as SampleName;
    this.audio.sample(name, {
      volume: (surface === 'metal' ? 0.18 : 0.3) + speedNorm * 0.18,
      rate: (this.stepFoot === 0 ? 0.96 : 1.04) * (0.94 + Math.random() * 0.12),
    });
  }

  /* -------------------------------------------------------------------- events */

  private onLane(): void {
    const now = performance.now();
    if (now - this.lastLaneSound < 90) return;
    this.lastLaneSound = now;
    this.audio.synth((c, d, t) => synth.whoosh(c, d, t, 0.35));
  }

  private onLand(impact: number): void {
    if (impact < 6) return;
    const heavy = impact > 20;
    this.audio.sample(heavy ? 'land_heavy' : (`land_${rand(2)}` as SampleName), {
      volume: Math.min(1, 0.35 + impact / 40),
    });
  }

  private onCoin(gold: boolean): void {
    const now = this.audio.ctx?.currentTime ?? 0;
    this.streak = nextStreak(this.streak, now - this.lastCoinAt);
    this.lastCoinAt = now;
    const semis = coinPitchSemitones(this.streak);
    this.audio.synth((c, d, t) => synth.coin(c, d, t, semis, gold));
  }

  private onStumble(): void {
    this.audio.sample(`stumble_${rand(2)}` as SampleName, { volume: 0.85 });
    this.audio.synth((c, d, t) => synth.oof(c, d, t), 0.02);
  }

  private onCrash(): void {
    this.audio.sample('crash_metal', { volume: 0.9 });
    this.audio.sample(Math.random() < 0.5 ? 'crash_wood' : 'crash_plank', {
      volume: 0.8,
      when: (this.audio.ctx?.currentTime ?? 0) + 0.03,
    });
    this.audio.synth((c, d, t) => synth.oof(c, d, t), 0.05);
  }

  /* -------------------------------------------------------------------- frame */

  update(f: AudioFrame): void {
    this.frame = f;
    this.audio.updateListener(f.camera, f.cameraForward);
    if (!this.audio.unlocked) return;
    this.audio.ambience?.update(f.distance);

    if (f.playing) {
      this.updateMusic(f);
      this.updateChasers(f);
      this.updateVehicles(f);
    } else if (this.wasPlaying) {
      this.silenceRumble();
    }
    this.wasPlaying = f.playing;
  }

  private updateMusic(f: AudioFrame): void {
    this.intensityTimer -= f.dt;
    if (this.intensityTimer > 0) return;
    this.intensityTimer = 0.25;
    this.audio.music?.setIntensity(musicIntensity({ speedNorm: f.speedNorm, chase: f.chase }));
  }

  private thiefPos(f: AudioFrame): Vec3 {
    return { x: f.playerX, y: 1.2, z: f.chasePhase === 'caught' ? 1 : this.chaseZ(f) };
  }

  private chaseZ(f: AudioFrame): number {
    // The chase meter is 1 at the close gap and 0 at the far gap.
    const c = CONFIG.chase;
    return c.closeGap + (1 - f.chase) * (c.farGap - c.closeGap);
  }

  /** The dog barks, pants and the thief shouts, from where they are behind Lazi. */
  private updateChasers(f: AudioFrame): void {
    const phase = f.chasePhase;
    if (phase !== this.lastPhase) {
      const first = this.lastPhase === null;
      this.lastPhase = phase;
      const at = this.thiefPos(f);
      if (phase === 'intro' && first) {
        this.audio.synth((c, d, t) => synth.thiefShout(c, d, t, 'hey'), 0.25);
        this.bark(f, 0.5);
      } else if (phase === 'catching') {
        this.audio.spatial(at, (c, d, t) => synth.thiefShout(c, d, t, 'oi'));
        this.bark(f, 0.1);
        this.bark(f, 0.45);
      } else if (phase === 'caught') {
        this.audio.spatial({ ...at, z: 1 }, (c, d, t) => synth.thiefLaugh(c, d, t), {
          delay: 0.9,
          seconds: 3,
        });
        this.bark(f, 0.2);
        this.bark(f, 0.6);
      } else if (phase === 'snatch') {
        this.audio.spatial({ ...at, z: 2 }, (c, d, t) => synth.thiefLaugh(c, d, t), {
          delay: 1.0,
          seconds: 3,
        });
        this.bark(f, 0.3);
      }
    }

    if (phase === 'close' || phase === 'catching' || phase === 'intro') {
      this.barkTimer -= f.dt;
      if (this.barkTimer <= 0) {
        this.barkTimer = 1.4 + Math.random() * 1.6;
        this.bark(f, 0);
      }
      this.pantTimer -= f.dt;
      if (this.pantTimer <= 0) {
        this.pantTimer = 0.42;
        const strength = 0.4 + f.chase * 0.9;
        const dog = { x: f.playerX - 0.55, y: 0.4, z: this.chaseZ(f) - CONFIG.chase.dogLead };
        this.audio.spatial(dog, (c, d, t) => synth.pant(c, d, t, strength), { seconds: 1 });
      }
    }
  }

  private bark(f: AudioFrame, delay: number): void {
    const dog = { x: f.playerX - 0.55, y: 0.5, z: this.chaseZ(f) - CONFIG.chase.dogLead };
    this.audio.spatial(
      dog,
      (_c, d, t) => {
        this.audio.samples?.play(`bark_${rand(2)}` as SampleName, d, {
          volume: 1.1,
          rate: 0.95 + Math.random() * 0.15,
          when: t,
        });
      },
      { delay, seconds: 1.5 },
    );
  }

  /** Taxi hooters and train horns as vehicles approach, and a rumble that follows the nearest. */
  private updateVehicles(f: AudioFrame): void {
    let nearest: { x: number; z: number; big: boolean } | null = null;
    for (const chunk of f.chunks) {
      for (const o of chunk.movers) {
        const kind = o.def.kind;
        if (kind !== 'taxiMoving' && kind !== 'trainMoving') continue;
        // Distance ahead of Lazi to the vehicle's near end (positive = still ahead).
        const ahead = o.s - f.travelled;
        const prev = this.lastNearZ.get(o) ?? Infinity;
        this.lastNearZ.set(o, ahead);
        const range = HONK_RANGE[kind];
        if (!this.honked.has(o) && crossedThreshold(prev, ahead, range)) {
          this.honked.add(o);
          const follow = (): Vec3 => ({ x: o.x, y: 1.6, z: -(o.s - (this.frame?.travelled ?? 0)) });
          const start = follow();
          if (kind === 'taxiMoving')
            this.audio.spatial(start, (c, d, t) => synth.taxiHooter(c, d, t), {
              follow,
              seconds: 1.4,
            });
          else
            this.audio.spatial(start, (c, d, t) => synth.trainHorn(c, d, t), {
              follow,
              seconds: 2.4,
            });
        }
        if (ahead > -10 && ahead < 90 && (!nearest || ahead < -nearest.z)) {
          nearest = { x: o.x, z: -ahead, big: kind === 'trainMoving' };
        }
      }
    }
    this.updateRumble(nearest);
  }

  private setupRumble(): void {
    const ctx = this.audio.ctx;
    const panner = this.audio.createPanner('sfx');
    if (!ctx || !panner) return;
    const src = synth.noiseSource(ctx, true);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 170;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(lp).connect(gain).connect(panner);
    src.start();
    this.rumble = { panner, gain };
  }

  private updateRumble(nearest: { x: number; z: number; big: boolean } | null): void {
    const r = this.rumble;
    const ctx = this.audio.ctx;
    if (!r || !ctx) return;
    if (!nearest) {
      r.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
      return;
    }
    const dist = Math.max(1, -nearest.z);
    const level = Math.min(1, 45 / (dist + 10)) * (nearest.big ? 0.9 : 0.5);
    r.gain.gain.setTargetAtTime(level, ctx.currentTime, 0.15);
    if (r.panner.positionX) {
      r.panner.positionX.value = nearest.x;
      r.panner.positionY.value = 1;
      r.panner.positionZ.value = nearest.z;
    }
  }

  private silenceRumble(): void {
    const ctx = this.audio.ctx;
    if (this.rumble && ctx) this.rumble.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
  }

  dispose(): void {
    window.clearTimeout(this.menuTimer);
  }
}
