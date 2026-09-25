import { CONFIG } from '../config/gameConfig';
import { QUALITY_PROFILES, type QualityLevel, type QualityProfile } from '../config/quality';
import { ZONES, zoneIndexAt, type ZoneDef } from '../config/zones';
import { Player } from '../entities/Player';
import { PrimitiveObstacleModels, type ObstacleModels } from '../entities/Obstacle';
import { RealisticObstacleModels } from '../entities/realisticModels';
import type { SaveManager } from '../save/SaveManager';
import {
  coinTouched,
  resolveStumble,
  testObstacleHit,
  type CoinPoint,
  type ObstacleBox,
} from '../systems/Collision';
import { CameraRig } from '../systems/CameraRig';
import { getDifficulty, speedAt } from '../systems/Difficulty';
import { RenderPipeline } from '../systems/RenderPipeline';
import {
  addCoins,
  advanceDistance,
  createScoreState,
  multiplierForDistance,
  totalScore,
  type ScoreState,
} from '../systems/Scoring';
import { FpsCounter } from '../ui/FpsCounter';
import { Hud } from '../ui/Hud';
import { LoadingScreen } from '../ui/Loading';
import { Screens } from '../ui/Screens';
import { ChunkManager } from '../world/ChunkManager';
import type { DecorFactory } from '../world/ChunkDecor';
import { Environment } from '../world/Environment';
import { MaterialLibrary } from '../world/Materials';
import { PrimitiveDecorFactory } from '../world/PrimitiveDecor';
import { RealisticDecorFactory } from '../world/ChunkDecor';
import { StreetKit } from '../world/StreetKit';
import { AssetLoader, type ProgressFn } from './AssetLoader';
import { EventBus } from './EventBus';
import { GameLoop } from './GameLoop';
import { Input, type InputAction } from './Input';
import { StateMachine } from './StateMachine';
import type { GameEvents } from './events';

type GameState = 'ready' | 'playing' | 'paused' | 'gameover';

/** Only obstacles/coins within this many metres of the player are tested for collision. */
const NEAR = 3;

/** Everything that is rebuilt when the graphics quality changes. */
interface World {
  profile: QualityProfile;
  env: Environment;
  chunks: ChunkManager;
  player: Player;
  materials: MaterialLibrary | null;
}

export class Game {
  private readonly bus = new EventBus<GameEvents>();
  private readonly state = new StateMachine<GameState>('ready', {
    ready: ['playing'],
    playing: ['paused', 'gameover'],
    paused: ['playing', 'ready'],
    gameover: ['playing', 'ready'],
  });

  private readonly pipeline: RenderPipeline;
  private readonly rig = new CameraRig(1);
  private readonly hud: Hud;
  private readonly screens: Screens;
  private readonly loading = new LoadingScreen();
  private readonly fps = FpsCounter.enabled() ? new FpsCounter() : null;
  private readonly input: Input;
  private readonly resizeObserver: ResizeObserver;
  private loop: GameLoop | null = null;

  private assets: AssetLoader | null = null;
  private world!: World;
  /** True while the world is being rebuilt (quality change); the loop idles. */
  private busy = true;

  // Run state
  private travelled = 0;
  private elapsed = 0;
  private clock = 0;
  private score: ScoreState = createScoreState();
  private zoneIndex = 0;
  private bestZoneThisRun = 0;
  private speed = 0;
  private speedFactor = 1;
  private lastStumbleAt: number | null = null;
  private crashTime = 0;
  private gameOverShown = false;
  private spin = 0;
  /** Dev only: obstacles can't hurt. Toggle from the console via `__lazi.debugGod(true)`. */
  private god = false;

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

  private constructor(
    private readonly root: HTMLElement,
    private readonly save: SaveManager,
    private level: QualityLevel,
  ) {
    root.classList.add('game-root');
    const canvas = document.createElement('canvas');
    canvas.className = 'game-canvas';
    this.pipeline = new RenderPipeline(canvas, QUALITY_PROFILES[level]);

    this.hud = new Hud(() => this.pause());
    this.screens = new Screens({
      onStart: () => this.startRun(),
      onResume: () => this.resume(),
      onRestart: () => this.startRun(),
      onQuality: (q) => void this.setQuality(q),
    });
    this.screens.setQuality(level);
    root.append(canvas, this.hud.element, this.screens.element, this.loading.element);
    if (this.fps) root.append(this.fps.element);

    this.bus.on('stumble', () => this.rig.shake(0.35, 0.4));
    this.bus.on('crash', () => this.rig.shake(0.7, 0.6));

    this.input = new Input(root);
    this.input.onAction(this.onAction);
    document.addEventListener('visibilitychange', this.onVisibilityChange);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(root);
    this.resize();
  }

  /** Create the game, loading whatever the current quality level needs. */
  static async create(root: HTMLElement, save: SaveManager, level: QualityLevel): Promise<Game> {
    const game = new Game(root, save, level);
    game.loading.show();
    await game.buildWorld(level, (t, label) => game.loading.set(t, label));
    game.resetRun();
    game.screens.showReady();
    game.busy = false;
    game.loading.hide();
    game.loop = new GameLoop(
      (dt) => game.update(dt),
      (dt) => game.render(dt),
    );
    game.loop.start();
    return game;
  }

  /** Switch graphics quality: rebuilds the scene, saves the choice. Only from the menus. */
  async setQuality(level: QualityLevel): Promise<void> {
    if (level === this.level || this.busy || this.state.is('playing')) return;
    this.busy = true;
    this.loading.show();
    this.level = level;
    this.save.updateSettings({ quality: level });
    this.screens.setQuality(level);
    await this.buildWorld(level, (t, label) => this.loading.set(t, label));
    this.resetRun();
    this.busy = false;
    this.loading.hide();
  }

  /** Read-only view of the run, handy for debugging and browser tests. */
  snapshot(): {
    state: string;
    distance: number;
    elapsed: number;
    score: number;
    coins: number;
    quality: string;
  } {
    return {
      state: this.state.current,
      distance: this.score.distance,
      elapsed: this.elapsed,
      score: totalScore(this.score),
      coins: this.score.coins,
      quality: this.level,
    };
  }

  debugGod(on: boolean): void {
    this.god = on;
  }

  /** Dev helper: jump the run forward (used to look at later zones). */
  debugSkipTo(distance: number): void {
    this.travelled = distance;
    this.score = { ...this.score, distance };
    this.zoneIndex = zoneIndexAt(distance);
    this.world.chunks.reset((Math.random() * 0xffffffff) >>> 0);
    this.world.chunks.update(distance, getDifficulty(this.elapsed));
    this.world.env.snapToAtmosphere(distance);
  }

  dispose(): void {
    this.loop?.stop();
    this.input.dispose();
    this.resizeObserver.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.bus.clear();
    this.disposeWorld();
    this.assets?.dispose();
    this.pipeline.dispose();
    this.root.replaceChildren();
    this.root.classList.remove('game-root');
  }

  /* ------------------------------------------------------------ world build */

  private async ensureAssets(onProgress?: ProgressFn): Promise<AssetLoader> {
    this.assets ??= new AssetLoader(Math.min(8, this.pipeline.maxAnisotropy));
    const assets = this.assets;
    await assets.loadSurfaces(onProgress, [0, 0.55]);
    await assets.loadModels(onProgress, [0.55, 0.9]);
    onProgress?.(0.9, 'Painting the sky');
    await assets.loadHdri('morning');
    onProgress?.(1, 'Ready');
    return assets;
  }

  private async buildWorld(level: QualityLevel, onProgress?: ProgressFn): Promise<void> {
    const profile = QUALITY_PROFILES[level];
    if (this.world) this.disposeWorld();
    this.pipeline.setProfile(profile);

    let materials: MaterialLibrary | null = null;
    let decor: DecorFactory;
    let obstacleModels: ObstacleModels;
    let assets: AssetLoader | null = null;

    if (profile.primitives) {
      onProgress?.(0.5, 'Setting up');
      decor = new PrimitiveDecorFactory();
      obstacleModels = new PrimitiveObstacleModels();
    } else {
      assets = await this.ensureAssets(onProgress);
      materials = new MaterialLibrary(assets);
      decor = new RealisticDecorFactory(
        new StreetKit(materials),
        materials,
        profile.shadows === 'map',
      );
      obstacleModels = new RealisticObstacleModels(materials);
    }

    const env = new Environment(profile, assets, this.pipeline.renderer);
    const shadows = profile.shadows === 'map';
    const chunks = new ChunkManager(env.scene, decor, obstacleModels, shadows);
    const player = new Player(this.bus, profile);
    env.scene.add(player.root);

    this.world = { profile, env, chunks, player, materials };
    env.preloadSkies(['midday', 'golden', 'evening']);
    this.resize();
  }

  private disposeWorld(): void {
    const w = this.world;
    w.chunks.dispose();
    w.player.dispose();
    w.env.dispose();
    w.materials?.dispose();
  }

  /* ------------------------------------------------------------------ flow */

  private startRun(): void {
    if (this.busy) return;
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
    this.bestZoneThisRun = 0;
    this.speed = speedAt(0);
    this.speedFactor = 1;
    this.lastStumbleAt = null;
    this.crashTime = 0;
    this.gameOverShown = false;

    const w = this.world;
    w.player.reset();
    this.rig.reset();
    w.env.snapToAtmosphere(0);
    w.chunks.reset((Math.random() * 0xffffffff) >>> 0);
    w.chunks.update(0, getDifficulty(0));
    this.rig.update(1, 0, 0, 0);
    this.hud.show(false);
    this.updateHud();
  }

  private crash(): void {
    if (!this.state.transition('gameover')) return;
    this.world.player.crash();
    this.bus.emit('crash');
    this.crashTime = 0;
    this.finishRun();
  }

  /** Save the run's result (once). */
  private runRecord: { newRecord: boolean; best: number } = { newRecord: false, best: 0 };

  private finishRun(): void {
    const result = this.save.recordRun({
      score: totalScore(this.score),
      distance: this.score.distance,
      coins: this.score.coins,
      zone: this.bestZoneThisRun,
    });
    this.runRecord = {
      newRecord: result.newHighScore,
      best: this.save.current.highScore,
    };
  }

  /* ---------------------------------------------------------------- update */

  private update(dt: number): void {
    if (this.busy) return;
    this.clock += dt;
    this.spin += dt * 4;
    this.world.chunks.animateCoins(this.spin);

    switch (this.state.current) {
      case 'playing':
        this.updatePlaying(dt);
        break;
      case 'gameover':
        this.updateCrashed(dt);
        break;
      case 'ready':
        this.world.player.update(dt, 0, false);
        this.rig.update(dt, this.world.player.x, this.world.player.y, 0);
        break;
      case 'paused':
        break;
    }

    const w = this.world;
    w.env.update(this.travelled, this.rig.camera.position, this.clock, this.travelled);
    w.materials?.update(this.clock, w.env.atmosphere.night);
  }

  private updatePlaying(dt: number): void {
    const w = this.world;
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

    w.player.update(
      dt,
      this.speed / CONFIG.difficulty.maxSpeed,
      true,
      w.chunks.groundAt(w.player.x, this.travelled),
    );
    this.updateZone();
    w.chunks.update(this.travelled, difficulty);
    this.checkCollisions();

    this.rig.update(dt, w.player.x, w.player.y, this.speed / CONFIG.difficulty.maxSpeed);
    this.updateHud();
  }

  /** After a crash the world rolls to a stop, then the game-over screen appears. */
  private updateCrashed(dt: number): void {
    const w = this.world;
    this.crashTime += dt;
    const brake = Math.max(0, 1 - this.crashTime / CONFIG.crash.stopTime);
    this.travelled += this.speed * brake * dt;
    w.chunks.update(this.travelled, getDifficulty(this.elapsed));

    w.player.update(dt, 0, false);
    this.rig.update(dt, w.player.x, w.player.y, 0);

    if (!this.gameOverShown && this.crashTime >= CONFIG.crash.screenDelay) {
      this.gameOverShown = true;
      this.hud.show(false);
      this.screens.showGameOver({
        score: totalScore(this.score),
        distance: Math.floor(this.score.distance),
        coins: this.score.coins,
        zone: this.currentZone().name,
        best: this.runRecord.best,
        newRecord: this.runRecord.newRecord,
      });
    }
  }

  private render(dt: number): void {
    if (this.busy) return;
    const w = this.world;
    this.pipeline.render(w.env.scene, this.rig.camera, dt, this.fxSpeed(), w.env.atmosphere.bloom);
    this.fps?.tick(dt, this.pipeline.renderer.info, this.level);
  }

  /** 0 until the run is properly fast, then up to 1 at top speed (drives blur / speed lines). */
  private fxSpeed(): number {
    if (!this.state.is('playing')) return 0;
    const D = CONFIG.difficulty;
    return Math.min(1, Math.max(0, (this.speed - D.easyEndSpeed) / (D.maxSpeed - D.easyEndSpeed)));
  }

  private currentZone(): ZoneDef {
    return ZONES[this.zoneIndex] as ZoneDef;
  }

  private updateZone(): void {
    const index = zoneIndexAt(this.score.distance);
    if (index === this.zoneIndex) return;
    this.zoneIndex = index;
    this.bestZoneThisRun = Math.max(this.bestZoneThisRun, index);
    this.bus.emit('zoneChange', { index });
  }

  private checkCollisions(): void {
    const w = this.world;
    const box = w.player.getBox(this.travelled);
    const ob = this.obstacleBox;
    const cp = this.coinPoint;

    for (const chunk of w.chunks.chunks) {
      for (const o of chunk.obstacles) {
        if (o.hit || o.s > this.travelled + NEAR || o.s + o.def.length < this.travelled - NEAR) {
          continue;
        }
        ob.x = o.x;
        ob.s = o.s;
        ob.length = o.def.length;
        ob.halfWidth = o.def.halfWidth;
        ob.yMin = o.def.yMin;
        ob.yMax = o.def.yMax;
        ob.ramp = o.def.ramp?.length ?? 0;

        const hit = testObstacleHit(box, ob);
        if (hit === 'none' || this.god) continue;
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
    this.world.player.bounceBack();
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
    if (this.busy) return;
    const playing = this.state.is('playing');
    const player = this.world.player;
    switch (action) {
      case 'left':
        if (playing) player.moveLeft();
        break;
      case 'right':
        if (playing) player.moveRight();
        break;
      case 'jump':
        if (playing) player.jump();
        break;
      case 'slide':
        if (playing) player.slide();
        break;
      case 'confirm':
        if (playing) player.jump();
        else if (this.state.is('ready') || (this.state.is('gameover') && this.gameOverShown)) {
          this.startRun();
        } else if (this.state.is('paused')) this.resume();
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
    this.pipeline.resize(width, height);
    this.rig.setAspect(width / height);
  }
}
