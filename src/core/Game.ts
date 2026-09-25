import * as THREE from 'three';
import { CONFIG } from '../config/gameConfig';
import { ZONES, zoneIndexAt } from '../config/zones';
import { Player } from '../entities/Player';
import {
  coinTouched,
  resolveStumble,
  testObstacleHit,
  type CoinPoint,
  type ObstacleBox,
} from '../systems/Collision';
import { CameraRig } from '../systems/CameraRig';
import { getDifficulty, speedAt } from '../systems/Difficulty';
import {
  addCoins,
  advanceDistance,
  createScoreState,
  multiplierForDistance,
  totalScore,
  type ScoreState,
} from '../systems/Scoring';
import { Hud } from '../ui/Hud';
import { Screens } from '../ui/Screens';
import { ChunkManager } from '../world/ChunkManager';
import { Environment } from '../world/Environment';
import { EventBus } from './EventBus';
import { GameLoop } from './GameLoop';
import { Input, type InputAction } from './Input';
import { StateMachine } from './StateMachine';
import type { GameEvents } from './events';

type GameState = 'ready' | 'playing' | 'paused' | 'gameover';

const MAX_DPR = 2;
/** Only obstacles/coins within this many metres of the player are tested for collision. */
const NEAR = 3;

export class Game {
  private readonly bus = new EventBus<GameEvents>();
  private readonly state = new StateMachine<GameState>('ready', {
    ready: ['playing'],
    playing: ['paused', 'gameover'],
    paused: ['playing', 'ready'],
    gameover: ['playing', 'ready'],
  });

  private readonly renderer: THREE.WebGLRenderer;
  private readonly env: Environment;
  private readonly rig: CameraRig;
  private readonly player: Player;
  private readonly chunks: ChunkManager;
  private readonly hud: Hud;
  private readonly screens: Screens;
  private readonly input: Input;
  private readonly loop: GameLoop;
  private readonly resizeObserver: ResizeObserver;

  // Run state
  private travelled = 0;
  private elapsed = 0;
  private score: ScoreState = createScoreState();
  private zoneIndex = 0;
  private speed = 0;
  private speedFactor = 1;
  private lastStumbleAt: number | null = null;
  private crashTime = 0;
  private gameOverShown = false;
  private spin = 0;

  // Scratch objects reused every frame to avoid allocations in the hot path.
  private readonly obstacleBox: ObstacleBox = {
    x: 0,
    s: 0,
    length: 0,
    halfWidth: 0,
    yMin: 0,
    yMax: 0,
  };
  private readonly coinPoint: CoinPoint = { x: 0, s: 0, y: 0 };

  constructor(private readonly root: HTMLElement) {
    root.classList.add('game-root');

    const canvas = document.createElement('canvas');
    canvas.className = 'game-canvas';
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });

    this.env = new Environment(ZONES[0] as (typeof ZONES)[number]);
    this.rig = new CameraRig(1);
    this.player = new Player(this.bus);
    this.env.scene.add(this.player.root);
    this.chunks = new ChunkManager(this.env.scene);

    this.hud = new Hud(() => this.pause());
    this.screens = new Screens({
      onStart: () => this.startRun(),
      onResume: () => this.resume(),
      onRestart: () => this.startRun(),
    });
    root.append(canvas, this.hud.element, this.screens.element);

    this.bus.on('stumble', () => this.rig.shake(0.35, 0.4));
    this.bus.on('crash', () => this.rig.shake(0.7, 0.6));
    this.bus.on('zoneChange', ({ index }) =>
      this.env.setZone(ZONES[index] as (typeof ZONES)[number]),
    );

    this.input = new Input(root);
    this.input.onAction(this.onAction);
    document.addEventListener('visibilitychange', this.onVisibilityChange);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(root);
    this.resize();

    this.resetRun();
    this.screens.showReady();

    this.loop = new GameLoop(
      (dt) => this.update(dt),
      () => this.renderer.render(this.env.scene, this.rig.camera),
    );
    this.loop.start();
  }

  /** Read-only view of the run, handy for debugging and browser tests. */
  snapshot(): { state: string; distance: number; elapsed: number; score: number; coins: number } {
    return {
      state: this.state.current,
      distance: this.score.distance,
      elapsed: this.elapsed,
      score: totalScore(this.score),
      coins: this.score.coins,
    };
  }

  dispose(): void {
    this.loop.stop();
    this.input.dispose();
    this.resizeObserver.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.bus.clear();
    this.chunks.dispose();
    this.player.dispose();
    this.env.dispose();
    this.renderer.dispose();
    this.root.replaceChildren();
    this.root.classList.remove('game-root');
  }

  /* ------------------------------------------------------------------ flow */

  private startRun(): void {
    if (this.state.is('paused')) this.state.transition('ready');
    this.resetRun();
    if (!this.state.transition('playing')) return;
    this.screens.hide();
    this.hud.show(true);
  }

  private pause(): void {
    if (!this.state.transition('paused')) return;
    this.screens.showPaused();
  }

  private resume(): void {
    if (!this.state.transition('playing')) return;
    this.screens.hide();
  }

  private resetRun(): void {
    this.travelled = 0;
    this.elapsed = 0;
    this.score = createScoreState();
    this.zoneIndex = 0;
    this.speed = speedAt(0);
    this.speedFactor = 1;
    this.lastStumbleAt = null;
    this.crashTime = 0;
    this.gameOverShown = false;

    this.player.reset();
    this.rig.reset();
    this.env.snapToZone(ZONES[0] as (typeof ZONES)[number]);
    this.chunks.reset((Math.random() * 0xffffffff) >>> 0);
    this.chunks.update(0, getDifficulty(0), ZONES[0] as (typeof ZONES)[number]);
    this.rig.update(1, 0, 0, 0);
    this.hud.show(false);
    this.updateHud();
  }

  private crash(): void {
    if (!this.state.transition('gameover')) return;
    this.player.crash();
    this.bus.emit('crash');
    this.crashTime = 0;
  }

  /* ---------------------------------------------------------------- update */

  private update(dt: number): void {
    this.spin += dt * 4;
    this.env.update(dt);
    this.chunks.animateCoins(this.spin);

    switch (this.state.current) {
      case 'playing':
        this.updatePlaying(dt);
        break;
      case 'gameover':
        this.updateCrashed(dt);
        break;
      case 'ready':
        this.player.update(dt, 0, false);
        break;
      case 'paused':
        break;
    }
  }

  private updatePlaying(dt: number): void {
    this.elapsed += dt;
    const difficulty = getDifficulty(this.elapsed);

    const C = CONFIG.collision;
    this.speedFactor = Math.min(
      1,
      this.speedFactor + ((1 - C.stumbleSlowFactor) / C.stumbleRecover) * dt,
    );
    this.speed = difficulty.speed * this.speedFactor;

    const meters = this.speed * dt;
    this.travelled += meters;
    this.score = advanceDistance(this.score, meters);

    this.player.update(dt, this.speed / CONFIG.difficulty.maxSpeed, true);
    this.updateZone();
    this.chunks.update(this.travelled, difficulty, this.currentZone());
    this.checkCollisions();

    this.rig.update(dt, this.player.x, this.player.y, this.speed / CONFIG.difficulty.maxSpeed);
    this.updateHud();
  }

  /** After a crash the world rolls to a stop, then the game-over screen appears. */
  private updateCrashed(dt: number): void {
    this.crashTime += dt;
    const brake = Math.max(0, 1 - this.crashTime / CONFIG.crash.stopTime);
    this.travelled += this.speed * brake * dt;
    this.chunks.update(this.travelled, getDifficulty(this.elapsed), this.currentZone());

    this.player.update(dt, 0, false);
    this.rig.update(dt, this.player.x, this.player.y, 0);

    if (!this.gameOverShown && this.crashTime >= CONFIG.crash.screenDelay) {
      this.gameOverShown = true;
      this.hud.show(false);
      this.screens.showGameOver({
        score: totalScore(this.score),
        distance: Math.floor(this.score.distance),
        coins: this.score.coins,
        zone: this.currentZone().name,
      });
    }
  }

  private currentZone(): (typeof ZONES)[number] {
    return ZONES[this.zoneIndex] as (typeof ZONES)[number];
  }

  private updateZone(): void {
    const index = zoneIndexAt(this.score.distance);
    if (index === this.zoneIndex) return;
    this.zoneIndex = index;
    this.bus.emit('zoneChange', { index });
  }

  private checkCollisions(): void {
    const box = this.player.getBox(this.travelled);
    const ob = this.obstacleBox;
    const cp = this.coinPoint;

    for (const chunk of this.chunks.chunks) {
      for (const o of chunk.obstacles) {
        if (o.hit || o.s > this.travelled + NEAR || o.s + o.def.length < this.travelled - NEAR)
          continue;
        ob.x = o.x;
        ob.s = o.s;
        ob.length = o.def.length;
        ob.halfWidth = o.def.halfWidth;
        ob.yMin = o.def.yMin;
        ob.yMax = o.def.yMax;

        const hit = testObstacleHit(box, ob);
        if (hit === 'none') continue;
        o.hit = true;
        if (hit === 'front' || resolveStumble(this.lastStumbleAt, this.elapsed) === 'crash') {
          this.crash();
          return;
        }
        this.stumble();
      }

      for (const c of chunk.coins) {
        if (c.collected || Math.abs(c.s - this.travelled) > NEAR) continue;
        cp.x = c.x;
        cp.s = c.s;
        cp.y = c.y;
        if (!coinTouched(box, cp)) continue;
        c.collected = true;
        c.mesh.visible = false;
        const value = c.kind === 'gold' ? CONFIG.scoring.goldValue : CONFIG.scoring.silverValue;
        this.score = addCoins(this.score, value);
        this.bus.emit('coin', { value });
      }
    }
  }

  private stumble(): void {
    this.lastStumbleAt = this.elapsed;
    this.speedFactor = CONFIG.collision.stumbleSlowFactor;
    this.player.bounceBack();
    this.bus.emit('stumble');
  }

  private updateHud(): void {
    this.hud.update({
      score: totalScore(this.score),
      coins: this.score.coins,
      distance: Math.floor(this.score.distance),
      multiplier: multiplierForDistance(this.score.distance),
      zone: this.currentZone().name,
    });
  }

  /* ---------------------------------------------------------------- events */

  private onAction = (action: InputAction): void => {
    const playing = this.state.is('playing');
    switch (action) {
      case 'left':
        if (playing) this.player.moveLeft();
        break;
      case 'right':
        if (playing) this.player.moveRight();
        break;
      case 'jump':
        if (playing) this.player.jump();
        break;
      case 'slide':
        if (playing) this.player.slide();
        break;
      case 'confirm':
        if (playing) this.player.jump();
        else if (this.state.is('ready') || (this.state.is('gameover') && this.gameOverShown))
          this.startRun();
        else if (this.state.is('paused')) this.resume();
        break;
      case 'pause':
        if (playing) this.pause();
        else if (this.state.is('paused')) this.resume();
        break;
    }
  };

  private onVisibilityChange = (): void => {
    if (document.hidden && this.state.is('playing')) this.pause();
  };

  private resize(): void {
    const width = Math.max(1, this.root.clientWidth);
    const height = Math.max(1, this.root.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR));
    this.renderer.setSize(width, height, false);
    this.rig.setAspect(width / height);
  }
}
