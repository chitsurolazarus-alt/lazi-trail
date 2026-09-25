import { NO_PERKS, type Perks } from '../config/characters';
import { CONFIG } from '../config/gameConfig';
import { HEAD_START, SECOND_CHANCE } from '../config/progression';
import { QUALITY_PROFILES, type QualityLevel, type QualityProfile } from '../config/quality';
import { ZONES, type ZoneDef } from '../config/zones';
import { Banner } from '../ui/Banner';
import { ZoneManager } from '../world/ZoneManager';
import { Player } from '../entities/Player';
import { Showroom } from '../entities/Showroom';
import { Chasers, type ChaseContext, type ChaserView } from '../entities/Chasers';
import { PrimitiveChasers } from '../entities/PrimitiveChasers';
import { PrimitivePlayerView } from '../entities/PrimitivePlayerView';
import { Effects } from '../systems/Effects';
import { AudioDirector } from '../systems/audio/AudioDirector';
import { AudioManager, type AudioSettings } from '../systems/audio/AudioManager';
import { footstepSurface, stepInterval } from '../systems/audio/audioLogic';
import { Vector3 } from 'three';
import { Pedestrians, Pigeons } from '../world/Life';
import { RiggedPlayerView } from '../entities/RiggedPlayerView';
import {
  PrimitiveObstacleModels,
  type ObstacleInstance,
  type ObstacleModels,
} from '../entities/Obstacle';
import { RealisticObstacleModels } from '../entities/realisticModels';
import { Progression, type ProgressEvent, type Report } from '../progression/Progression';
import type { RunStats } from '../progression/types';
import type { SaveManager } from '../save/SaveManager';
import {
  coinTouched,
  testObstacleHit,
  type CoinPoint,
  type ObstacleBox,
} from '../systems/Collision';
import { CameraRig } from '../systems/CameraRig';
import {
  chaseMeter,
  createChase,
  onCrash,
  onStumble,
  stepChase,
  type ChasePhase,
  type ChaseState,
} from '../systems/ChaseSystem';
import { getDifficulty, speedAt } from '../systems/Difficulty';
import { PathHistory } from '../systems/PathHistory';
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
import { Toasts } from '../ui/Toasts';
import { Tutorial } from '../ui/Tutorial';
import { rewardText } from '../ui/format';
import type { RoomApi, UiHost, UiSound } from '../ui/types';
import { ChunkManager } from '../world/ChunkManager';
import type { DecorFactory } from '../world/ChunkDecor';
import { Backdrop } from '../world/Backdrop';
import { Environment } from '../world/Environment';
import { MaterialLibrary } from '../world/Materials';
import { PrimitiveDecorFactory } from '../world/PrimitiveDecor';
import { PropField } from '../world/PropField';
import { RealisticDecorFactory } from '../world/ChunkDecor';
import { StreetKit } from '../world/StreetKit';
import { AssetLoader, type ProgressFn } from './AssetLoader';
import { EventBus } from './EventBus';
import { GameLoop } from './GameLoop';
import { Input, type InputAction } from './Input';
import { StateMachine } from './StateMachine';
import { smoothstep01 } from './math';
import type { GameEvents } from './events';

type GameState = 'ready' | 'playing' | 'paused' | 'gameover';

/** Only obstacles/coins within this many metres of the player are tested for collision. */
const NEAR = 3;

/** Counters for one run, handed to the progression system when it ends. */
interface RunTally {
  jumps: number;
  slides: number;
  nearMisses: number;
  stumbles: number;
  outruns: number;
  /** Track distance at the last stumble (start of the current clean stretch). */
  cleanSince: number;
  bestClean: number;
}

const freshTally = (): RunTally => ({
  jumps: 0,
  slides: 0,
  nearMisses: 0,
  stumbles: 0,
  outruns: 0,
  cleanSince: 0,
  bestClean: 0,
});

/** Everything that is rebuilt when the graphics quality changes. */
interface World {
  profile: QualityProfile;
  env: Environment;
  chunks: ChunkManager;
  player: Player;
  chasers: ChaserView;
  backdrop: Backdrop;
  decor: DecorFactory;
  props: PropField | null;
  effects: Effects;
  pedestrians: Pedestrians | null;
  pigeons: Pigeons | null;
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
  private readonly banner = new Banner();
  private readonly toasts = new Toasts();
  private readonly progress: Progression;
  private readonly tutorial: Tutorial;
  private readonly audio: AudioManager;
  private readonly director: AudioDirector;
  private audioSaveTimer = 0;
  private readonly cameraForward = new Vector3();
  private readonly zones = new ZoneManager();
  private readonly fps = FpsCounter.enabled() ? new FpsCounter() : null;
  private readonly input: Input;
  private readonly resizeObserver: ResizeObserver;
  private loop: GameLoop | null = null;

  private assets: AssetLoader | null = null;
  private world!: World;
  /** The character room (created the first time a room screen opens). */
  private showroom: Showroom | null = null;
  private roomActive = false;
  /** `character:outfit` currently worn by the player view. */
  private loadoutKey = '';
  private loadoutQueue: Promise<void> = Promise.resolve();
  /** True while the world is being rebuilt (quality change); the loop idles. */
  private busy = true;

  // Run state
  private travelled = 0;
  private elapsed = 0;
  private clock = 0;
  private score: ScoreState = createScoreState();
  private speed = 0;
  private speedFactor = 1;
  private chase: ChaseState = createChase();
  private readonly path = new PathHistory();
  private readonly chaseCtx = {
    chase: this.chase,
    path: this.path,
    travelled: 0,
    speedNorm: 0,
    player: null as unknown as Player,
    laziView: null as RiggedPlayerView | null,
  } satisfies ChaseContext;
  private crashTime = 0;
  private gameOverShown = false;

  // Progression / perks for the current run
  private perks: Perks = { ...NO_PERKS };
  private scoreBonus = 1;
  private shield = false;
  /** Seconds of Head Start (or later Energy Drink) sprint left: fast and invincible. */
  private boostTime = 0;
  /** Seconds of invincibility after a Second Chance. */
  private invincible = 0;
  private tally: RunTally = freshTally();
  private lastChasePhase: ChasePhase = 'intro';
  private crashCaught = false;
  private secondChanceUsed = false;
  private secondChanceOffered = false;
  private secondChancePrompted = false;
  private runFinalized = false;
  private starting = false;
  private runReport: Report | null = null;
  private spin = 0;
  /** Dev only: obstacles can't hurt. Toggle from the console via `__lazi.debugGod(true)`. */
  private god = false;
  private stepTimer = 0;
  private sparkTimer = 0;
  private warmTimer = 1;
  /** World scroll speed (m/s) this frame, for particles. */
  private worldSpeed = 0;

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

    const s = save.current.settings;
    this.audio = new AudioManager(
      {
        musicVolume: s.musicVolume,
        sfxVolume: s.sfxVolume,
        ambienceVolume: s.ambienceVolume,
        muted: s.muted,
      },
      (state) => this.persistAudio(state),
    );
    // Browsers only allow sound after a user gesture: the first tap or key press starts audio.
    this.audio.installUnlock(window);
    this.director = new AudioDirector(this.audio, this.bus);

    this.hud = new Hud(
      () => this.pause(),
      (muted) => this.setMuted(muted),
    );
    this.hud.setMuted(s.muted);

    this.progress = new Progression(save);
    this.progress.onEvent((e) => this.onProgressEvent(e));
    this.tutorial = new Tutorial(() => this.progress.markTutorialDone());
    this.screens = new Screens(this.makeUiHost());
    root.addEventListener('click', this.onUiClick);
    root.append(
      canvas,
      this.hud.element,
      this.banner.element,
      this.tutorial.element,
      this.screens.element,
      this.toasts.element,
      this.loading.element,
    );
    if (this.fps) root.append(this.fps.element);

    this.bus.on('stumble', () => this.rig.shake(0.35, 0.4));
    this.bus.on('crash', () => this.rig.shake(0.7, 0.6));
    this.bus.on('land', ({ impact }) => this.onLand(impact));
    this.bus.on('coin', ({ x, y, z, gold }) => this.world.effects.sparkle(x, y, z, gold));
    this.bus.on('nearMiss', () => {
      this.rig.pulse(4);
      this.tally.nearMisses++;
    });
    this.bus.on('jump', () => this.tally.jumps++);
    this.bus.on('slide', () => this.tally.slides++);
    this.bus.on('shieldBreak', () => {
      this.rig.shake(0.35, 0.3);
      this.hud.setShield(false);
    });
    this.bus.on('zoneChange', ({ index }) =>
      this.banner.show(ZoneManager.bannerText(ZONES[index] as ZoneDef)),
    );

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
    game.director.menu();
    game.busy = false;
    game.loading.hide();
    // Grant anything a migrated save already qualifies for, then show the first screen.
    game.progress.settleNow();
    game.screens.showStart();
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
    await this.buildWorld(level, (t, label) => this.loading.set(t, label));
    this.resetRun();
    this.busy = false;
    this.loading.hide();
    this.screens.refresh();
  }

  /** Read-only view of the run, handy for debugging and browser tests. */
  snapshot(): {
    state: string;
    distance: number;
    elapsed: number;
    score: number;
    coins: number;
    quality: string;
    drawCalls: number;
    triangles: number;
    geometries: number;
    textures: number;
    audio: { unlocked: boolean; track: string | null; samplesReady: boolean; muted: boolean };
  } {
    const info = this.pipeline.renderer.info.render;
    const memory = this.pipeline.renderer.info.memory;
    return {
      drawCalls: info.calls,
      triangles: info.triangles,
      geometries: memory.geometries,
      textures: memory.textures,
      audio: {
        unlocked: this.audio.unlocked,
        track: this.audio.music?.current ?? null,
        samplesReady: this.audio.samples?.ready ?? false,
        muted: this.audio.settings.muted,
      },
      state: this.state.current,
      distance: this.score.distance,
      elapsed: this.elapsed,
      score: totalScore(this.score),
      coins: this.score.coins,
      quality: this.level,
    };
  }

  /** Dev helper: run the simulation forward without rendering (`seconds` of game time). */
  debugAdvance(seconds: number, step = 1 / 60): void {
    for (let t = 0; t < seconds; t += step) this.update(step);
  }

  /** Dev helper: end the run right now, as if Lazi was caught (true) or hit an obstacle (false). */
  debugCrash(caught: boolean): void {
    if (caught) {
      this.chase.phase = 'close';
      this.chase.gap = CONFIG.chase.closeGap;
      onStumble(this.chase);
    }
    this.crash(caught);
  }

  /** Dev helper: the progression service (`__lazi.debugProgression()`). */
  debugProgression(): Progression {
    return this.progress;
  }

  debugGod(on: boolean): void {
    this.god = on;
  }

  /** Dev helper: jump the run forward (used to look at later zones). */
  debugSkipTo(distance: number): void {
    this.travelled = distance;
    this.score = { ...this.score, distance };
    this.zones.reset(distance);
    this.world.chunks.reset((Math.random() * 0xffffffff) >>> 0);
    this.world.chunks.update(distance, getDifficulty(this.elapsed));
    this.world.env.snapToAtmosphere(distance);
  }

  dispose(): void {
    this.loop?.stop();
    this.input.dispose();
    this.root.removeEventListener('click', this.onUiClick);
    this.director.dispose();
    this.audio.dispose();
    this.showroom?.dispose();
    this.toasts.clear();
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
    const props = materials ? new PropField(materials, shadows, profile.propDensity) : null;
    if (props) env.scene.add(props.object);
    const chunks = new ChunkManager(env.scene, decor, obstacleModels, shadows, props);
    const runner = this.progress.selectedCharacter;
    const outfit = this.progress.selectedOutfitId(runner.id);
    let view: RiggedPlayerView | PrimitivePlayerView;
    if (assets && !profile.primitives) {
      await assets.loadModel(runner.model);
      view = new RiggedPlayerView(assets, runner.id, outfit);
    } else view = new PrimitivePlayerView();
    this.loadoutKey = `${runner.id}:${outfit}`;
    const player = new Player(this.bus, profile, view);
    env.scene.add(player.root);
    const chasers: ChaserView =
      assets && !profile.primitives ? new Chasers(assets, shadows) : new PrimitiveChasers();
    env.scene.add(chasers.root);
    const backdrop = new Backdrop();
    env.scene.add(backdrop.object);
    const effects = new Effects(profile.particles);
    env.scene.add(effects.object);
    const pedestrians =
      assets && !profile.primitives && profile.pedestrians > 0
        ? new Pedestrians(assets, profile.pedestrians, shadows)
        : null;
    const pigeons =
      !profile.primitives && profile.pigeons > 0 ? new Pigeons(profile.pigeons) : null;
    if (pedestrians) env.scene.add(pedestrians.object);
    if (pigeons) env.scene.add(pigeons.object);

    this.world = {
      profile,
      env,
      chunks,
      player,
      chasers,
      backdrop,
      decor,
      props,
      effects,
      pedestrians,
      pigeons,
      materials,
    };
    env.preloadSkies(['midday', 'golden', 'evening']);
    this.resize();
  }

  private disposeWorld(): void {
    const w = this.world;
    w.chunks.dispose();
    w.player.dispose();
    w.chasers.dispose();
    w.backdrop.dispose();
    w.props?.dispose();
    w.effects.dispose();
    w.pedestrians?.dispose();
    w.pigeons?.dispose();
    w.env.dispose();
    w.materials?.dispose();
  }

  /* ------------------------------------------------------------------ flow */

  /** Begin a run (from the menu, Play again, or the pause menu's Restart). */
  private startRun(headStart = false): void {
    if (this.busy || this.starting) return;
    this.starting = true;
    // Wait for any pending character swap so the right runner is on the track.
    void this.loadoutQueue.then(() => {
      this.starting = false;
      this.beginRun(headStart);
    });
  }

  private beginRun(headStart: boolean): void {
    if (this.state.is('paused')) this.state.transition('ready');
    const useHead = headStart && this.progress.useItem('headStart');
    this.resetRun();
    if (!this.state.transition('playing')) return;
    this.boostTime = useHead ? HEAD_START.duration : 0;
    this.screens.hide();
    this.hud.show(true);
    this.banner.show(ZoneManager.bannerText(this.currentZone()));
    this.director.runStart();
    if (!this.progress.data.player.tutorialDone) this.tutorial.start();
  }

  private pause(): void {
    if (!this.state.transition('paused')) return;
    this.screens.paused();
    this.director.pause();
  }

  private resume(): void {
    if (!this.state.transition('playing')) return;
    this.screens.hide();
    this.director.resume();
  }

  /** Back to the main menu from the pause or game-over screen. */
  private quitToMenu(): void {
    if (this.state.is('paused') || this.state.is('gameover')) this.state.transition('ready');
    else if (!this.state.is('ready')) return;
    if (!this.runFinalized && this.secondChanceOffered) this.finalizeRun();
    this.resetRun();
    this.director.menu();
    this.screens.menu();
  }

  /* ------------------------------------------------------- menu plumbing */

  private makeUiHost(): UiHost {
    const room: RoomApi = {
      open: () => this.openRoom(),
      close: () => {
        this.roomActive = false;
      },
      show: async (character, outfit, locked) => {
        const showroom = await this.ensureShowroom();
        await showroom.show(character, outfit, locked);
      },
      celebrate: () => this.showroom?.celebrate(),
      rotate: (dx) => this.showroom?.rotate(dx),
    };
    return {
      progress: this.progress,
      toasts: this.toasts,
      room,
      sound: (kind) => this.uiSound(kind),
      getAudio: () => ({ ...this.audio.settings }),
      setVolume: (channel, value) => this.audio.setVolume(channel, value),
      previewVolume: (channel) => {
        if (channel === 'sfx') this.director.ui('select');
      },
      setMuted: (muted) => this.setMuted(muted),
      getQuality: () => this.level,
      setQuality: (level) => void this.setQuality(level),
      music: (track) => (track === 'shop' ? this.director.shop() : this.director.menu()),
      startRun: ({ headStart }) => this.startRun(headStart),
      resume: () => this.resume(),
      restart: () => this.startRun(false),
      quitToMenu: () => this.quitToMenu(),
      secondChance: (accept) => this.answerSecondChance(accept),
      loadoutChanged: () => this.applyLoadout(),
      resetProgress: () => this.resetProgress(),
      replayTutorial: () => this.progress.resetTutorial(),
    };
  }

  private uiSound(kind: UiSound): void {
    if (kind === 'purchase') this.director.purchase();
    else if (kind === 'unlock') this.director.unlock();
    else this.director.ui(kind);
  }

  /** Toasts and fanfare for the things progression reports. */
  private onProgressEvent(e: ProgressEvent): void {
    switch (e.type) {
      case 'achievement':
        this.toasts.show({
          title: 'Achievement unlocked',
          text: e.def.name,
          icon: 'trophy',
          kind: 'achievement',
        });
        this.director.unlock();
        break;
      case 'levelUp':
        this.toasts.show({
          title: `Level ${e.level}!`,
          text: rewardText(e.reward),
          icon: 'star',
          kind: 'level',
        });
        break;
      case 'unlock':
        this.toasts.show({
          title: e.note.kind === 'character' ? 'New runner unlocked' : 'New outfit unlocked',
          text: e.note.name,
          icon: 'star',
          kind: 'unlock',
        });
        this.director.unlock();
        break;
      case 'missionDone':
        this.toasts.show({
          title: 'Mission complete',
          text: `+R ${e.mission.reward}`,
          icon: 'check',
          kind: 'mission',
        });
        break;
      case 'setDone':
        this.toasts.show({
          title: 'Daily set complete!',
          text: 'Permanent score boost increased.',
          icon: 'bolt',
          kind: 'mission',
        });
        break;
    }
  }

  /** Make the world's runner match the selected character and outfit (queued, so swaps never overlap). */
  private applyLoadout(): void {
    this.loadoutQueue = this.loadoutQueue.then(async () => {
      const runner = this.progress.selectedCharacter;
      const outfit = this.progress.selectedOutfitId(runner.id);
      const key = `${runner.id}:${outfit}`;
      if (key === this.loadoutKey || this.busy) return;
      const assets = this.assets;
      if (!assets || this.world.profile.primitives) {
        this.loadoutKey = key;
        return;
      }
      await assets.loadModel(runner.model);
      this.world.player.setView(new RiggedPlayerView(assets, runner.id, outfit));
      this.loadoutKey = key;
    });
  }

  private async ensureShowroom(): Promise<Showroom> {
    this.assets ??= new AssetLoader(Math.min(8, this.pipeline.maxAnisotropy));
    if (!this.showroom) {
      this.showroom = new Showroom(this.assets);
      this.showroom.resize(Math.max(1, this.root.clientWidth), Math.max(1, this.root.clientHeight));
    }
    return this.showroom;
  }

  private openRoom(): void {
    this.roomActive = true;
    void this.ensureShowroom();
  }

  private resetProgress(): void {
    this.save.reset();
    this.applyLoadout();
    this.progress.ensureMissions();
    this.screens.name(true);
  }

  private setMuted(muted: boolean): void {
    this.audio.setMuted(muted);
    this.hud.setMuted(muted);
    this.director.ui('toggle');
  }

  /** Save volume/mute changes shortly after the last one (sliders fire many events while dragged). */
  private persistAudio(state: AudioSettings): void {
    window.clearTimeout(this.audioSaveTimer);
    this.audioSaveTimer = window.setTimeout(() => {
      this.save.updateSettings({
        musicVolume: state.musicVolume,
        sfxVolume: state.sfxVolume,
        ambienceVolume: state.ambienceVolume,
        muted: state.muted,
      });
    }, 400);
  }

  /** Button click sounds for every menu/HUD control (delegated so new screens get them for free). */
  private onUiClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('.btn, .radio, .hud-pause')) this.director.ui('click');
  };

  private resetRun(): void {
    this.travelled = 0;
    this.elapsed = 0;
    this.score = createScoreState();
    this.zones.reset(0);
    this.banner.hide();
    this.speed = speedAt(0);
    this.speedFactor = 1;
    this.perks = this.progress.perks();
    this.scoreBonus = this.progress.scoreBonus();
    this.chase = createChase(this.perks.chaseGapMul);
    this.lastChasePhase = this.chase.phase;
    this.path.reset();
    this.crashTime = 0;
    this.gameOverShown = false;
    this.shield = this.perks.startShield;
    this.boostTime = 0;
    this.invincible = 0;
    this.tally = freshTally();
    this.crashCaught = false;
    this.secondChanceUsed = false;
    this.secondChanceOffered = false;
    this.secondChancePrompted = false;
    this.runFinalized = false;
    this.runReport = null;
    this.tutorial.stop();
    this.hud.setShield(this.shield);
    this.hud.setPlayer(this.progress.name ?? 'Runner', this.progress.level.level);

    const w = this.world;
    w.player.setPerks(this.perks);
    w.player.reset();
    w.chasers.reset();
    w.effects.clear();
    w.pedestrians?.reset(0);
    w.pigeons?.reset(0);
    this.stepTimer = 0;
    this.path.record(0, 0, 0);
    this.rig.reset();
    w.env.snapToAtmosphere(0);
    w.chunks.reset((Math.random() * 0xffffffff) >>> 0);
    w.chunks.update(0, getDifficulty(0));
    this.rig.update(1, 0, 0, 0);
    this.hud.show(false);
    this.updateHud();
  }

  /** Game over. `caught` = the chasers got her; otherwise she hit an obstacle. */
  private crash(caught: boolean): void {
    if (!this.state.transition('gameover')) return;
    if (!caught) onCrash(this.chase);
    this.world.player.crash(caught);
    this.bus.emit('crash');
    this.crashTime = 0;
    this.crashCaught = caught;
    this.tutorial.stop();
    // With a Second Chance in the bag the run isn't over yet: ask before recording it.
    this.secondChanceOffered = !this.secondChanceUsed && this.progress.data.items.secondChance > 0;
    if (!this.secondChanceOffered) this.finalizeRun();
  }

  /** Record the run and play the end-of-run music (once). */
  private finalizeRun(): void {
    if (this.runFinalized) return;
    this.runFinalized = true;
    this.secondChanceOffered = false;
    this.finishRun();
    this.director.runEnd(this.crashCaught, this.runRecord.newRecord);
  }

  private runRecord: { newRecord: boolean; best: number } = { newRecord: false, best: 0 };

  /** Bank the run with the progression system (XP, missions, achievements, leaderboard). */
  private finishRun(): void {
    const t = this.tally;
    const stats: RunStats = {
      score: totalScore(this.score),
      distance: this.score.distance,
      coins: this.score.coins,
      zone: this.zones.bestIndex,
      jumps: t.jumps,
      slides: t.slides,
      nearMisses: t.nearMisses,
      stumbles: t.stumbles,
      outruns: t.outruns,
      noStumble: Math.max(t.bestClean, this.score.distance - t.cleanSince),
      caught: this.crashCaught,
      character: this.progress.selectedCharacter.id,
      name: this.progress.name ?? 'Runner',
    };
    this.runReport = this.progress.applyRun(stats);
    this.runRecord = {
      newRecord: this.runReport.newHighScore,
      best: this.save.current.highScore,
    };
  }

  private answerSecondChance(accept: boolean): void {
    if (!this.state.is('gameover') || !this.secondChanceOffered) return;
    if (accept && this.progress.useItem('secondChance')) this.revive();
    else this.finalizeRun(); // the game-over screen appears on the next frame
  }

  /** Second Chance: stand back up, shake off the thief, and run on briefly invincible. */
  private revive(): void {
    const w = this.world;
    this.secondChanceUsed = true;
    this.secondChanceOffered = false;
    this.secondChancePrompted = false;
    if (!this.state.transition('playing')) return;
    this.screens.hide();
    this.hud.show(true);
    w.player.revive();
    this.chase = createChase(this.perks.chaseGapMul);
    this.chase.phase = 'far';
    this.chase.gap = CONFIG.chase.farGap;
    this.lastChasePhase = 'far';
    w.chasers.reset();
    this.speedFactor = CONFIG.collision.stumbleSlowFactor;
    this.invincible = SECOND_CHANCE.invincible;
    this.tally.cleanSince = this.score.distance;
    // Clear the way ahead so she isn't run straight into the same obstacle.
    for (const chunk of w.chunks.chunks) {
      for (const o of chunk.obstacles) {
        if (o.s > this.travelled - 5 && o.s < this.travelled + SECOND_CHANCE.clearAhead)
          o.hit = true;
      }
    }
    this.crashTime = 0;
    this.gameOverShown = false;
    this.director.resume();
  }

  /* ---------------------------------------------------------------- update */

  private update(rawDt: number): void {
    if (this.busy) return;
    // A crash plays out in slow motion, easing back to normal speed.
    let dt = rawDt;
    if (this.state.is('gameover')) {
      const c = CONFIG.crash;
      dt *= c.slowMoScale + (1 - c.slowMoScale) * smoothstep01(this.crashTime / c.slowMoTime);
    }
    if (this.roomActive && this.showroom && this.state.is('ready')) {
      // The character room replaces the street while it is open.
      this.showroom.update(rawDt);
      this.updateAudio(rawDt);
      return;
    }
    this.worldSpeed = 0;
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
    this.warmUpScenery(dt);
    this.trainSparks(dt);
    w.effects.update(dt, this.worldSpeed, this.rig.camera);
    w.pedestrians?.update(dt, this.travelled);
    w.pigeons?.update(dt, this.travelled);
    w.env.update(this.travelled, this.rig.camera.position, this.clock, this.travelled);
    w.backdrop.update(this.rig.camera, this.travelled, w.env.atmosphere);
    w.materials?.update(this.clock, w.env.atmosphere.night);
    this.updateAudio(dt);
  }

  private updateAudio(dt: number): void {
    const cam = this.rig.camera;
    cam.getWorldDirection(this.cameraForward);
    this.director.update({
      dt,
      playing: this.state.is('playing'),
      speedNorm: this.speed / CONFIG.difficulty.maxSpeed,
      chase: chaseMeter(this.chase),
      chasePhase: this.chase.phase,
      distance: this.travelled,
      travelled: this.travelled,
      playerX: this.world.player.x,
      camera: cam.position,
      cameraForward: this.cameraForward,
      chunks: this.world.chunks.chunks,
    });
  }

  private updatePlaying(dt: number): void {
    const w = this.world;
    this.elapsed += dt;
    const difficulty = getDifficulty(this.elapsed);

    const C = CONFIG.collision;
    const recover = C.stumbleRecover * this.perks.stumbleRecoverMul;
    this.speedFactor = Math.min(1, this.speedFactor + ((1 - C.stumbleSlowFactor) / recover) * dt);
    if (this.boostTime > 0) this.boostTime = Math.max(0, this.boostTime - dt);
    if (this.invincible > 0) this.invincible = Math.max(0, this.invincible - dt);
    const boostMul = this.boostTime > 0 ? HEAD_START.speedMul : 1;
    this.speed = difficulty.speed * this.speedFactor * this.introFactor() * boostMul;

    const meters = this.speed * dt;
    this.worldSpeed = this.speed;
    this.travelled += meters;
    this.score = advanceDistance(this.score, meters, this.scoreBonus);
    this.tutorial.update(dt);

    const ground = w.chunks.groundAt(w.player.x, this.travelled);
    w.player.update(dt, this.speed / CONFIG.difficulty.maxSpeed, true, ground);
    this.footsteps(dt, ground);
    this.updateZone();
    w.chunks.update(this.travelled, difficulty);
    this.path.record(this.travelled, w.player.x, w.player.y);
    stepChase(this.chase, dt, this.boostTime > 0);
    // Shaking the thief off again after they closed in counts as an outrun.
    if (this.lastChasePhase === 'dropping' && this.chase.phase === 'far') this.tally.outruns++;
    this.lastChasePhase = this.chase.phase;
    this.checkCollisions();
    this.updateChasers(dt);

    this.rig.update(dt, w.player.x, w.player.y, this.speed / CONFIG.difficulty.maxSpeed);
    this.updateHud();
  }

  /** After a crash the world rolls to a stop, then the game-over screen appears. */
  private updateCrashed(dt: number): void {
    const w = this.world;
    this.crashTime += dt;
    const brake = Math.max(0, 1 - this.crashTime / CONFIG.crash.stopTime);
    this.worldSpeed = this.speed * brake;
    this.travelled += this.worldSpeed * dt;
    w.chunks.update(this.travelled, getDifficulty(this.elapsed));

    w.player.update(dt, 0, false);
    this.updateChasers(dt);
    this.rig.update(dt, w.player.x, w.player.y, 0);

    if (!this.gameOverShown && this.crashTime >= CONFIG.crash.screenDelay) {
      if (this.secondChanceOffered) {
        if (!this.secondChancePrompted) {
          this.secondChancePrompted = true;
          this.hud.show(false);
          this.screens.secondChance(
            this.progress.data.items.secondChance,
            SECOND_CHANCE.promptSeconds,
          );
        }
      } else if (this.runFinalized && this.runReport) {
        this.gameOverShown = true;
        this.hud.show(false);
        this.screens.gameOver({
          score: totalScore(this.score),
          distance: Math.floor(this.score.distance),
          coins: this.score.coins,
          zone: this.currentZone().name,
          best: this.runRecord.best,
          newRecord: this.runRecord.newRecord,
          caught: this.crashCaught,
          report: this.runReport,
        });
      }
    }
  }

  private render(dt: number): void {
    if (this.busy) return;
    if (this.roomActive && this.showroom && this.state.is('ready')) {
      this.pipeline.render(this.showroom.scene, this.showroom.camera, dt, 0, 0.3);
      this.fps?.tick(dt, this.pipeline.renderer.info, this.level);
      return;
    }
    const w = this.world;
    this.pipeline.render(w.env.scene, this.rig.camera, dt, this.fxSpeed(), w.env.atmosphere.bloom);
    this.fps?.tick(dt, this.pipeline.renderer.info, this.level);
  }

  /** Lazi sprints off at the start: speed eases up over the chase intro. */
  private introFactor(): number {
    const c = CONFIG.chase;
    return (
      c.introSpeedStart + (1 - c.introSpeedStart) * smoothstep01(this.elapsed / c.introDuration)
    );
  }

  private updateChasers(dt: number): void {
    const w = this.world;
    const ctx = this.chaseCtx;
    ctx.chase = this.chase;
    ctx.travelled = this.travelled;
    ctx.speedNorm = this.speed / CONFIG.difficulty.maxSpeed;
    ctx.player = w.player;
    ctx.laziView = w.player.view instanceof RiggedPlayerView ? w.player.view : null;
    w.chasers.update(dt, ctx);
  }

  /** 0 until the run is properly fast, then up to 1 at top speed (drives blur / speed lines). */
  private fxSpeed(): number {
    if (!this.state.is('playing')) return 0;
    const D = CONFIG.difficulty;
    return Math.min(1, Math.max(0, (this.speed - D.easyEndSpeed) / (D.maxSpeed - D.easyEndSpeed)));
  }

  private currentZone(): ZoneDef {
    return this.zones.zone;
  }

  private updateZone(): void {
    const entered = this.zones.update(this.score.distance);
    if (entered !== null) this.bus.emit('zoneChange', { index: entered });
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
        if (hit === 'none') {
          this.checkNearMiss(o, box.x);
          continue;
        }
        if (this.god || this.boostTime > 0 || this.invincible > 0) continue;
        o.hit = true;
        if (this.shield) {
          this.shield = false;
          this.bus.emit('shieldBreak');
          continue;
        }
        if (hit === 'front') {
          this.crash(false);
          return;
        }
        if (onStumble(this.chase)) {
          this.crash(true);
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
        const value = c.kind === 'gold' ? CONFIG.scoring.goldValue : CONFIG.scoring.silverValue;
        this.score = addCoins(this.score, value);
        this.bus.emit('coin', {
          value,
          x: c.x,
          y: c.y,
          z: -(c.s - this.travelled),
          gold: c.kind === 'gold',
        });
      }
    }
  }

  /** Whoosh: a lane-blocking obstacle passed within a hand's breadth of Lazi. */
  private checkNearMiss(o: ObstacleInstance, playerX: number): void {
    if (o.nearMissed || o.def.requirement !== 'lane' || this.speed < 12) return;
    const gap = Math.abs(playerX - o.x) - (CONFIG.player.halfWidth + o.def.halfWidth);
    if (gap < 0.35 && gap > -0.001) {
      o.nearMissed = true;
      this.bus.emit('nearMiss');
    }
  }

  /**
   * Build the street scenery for the later zones a little at a time while the player is busy in
   * zone 1, so entering a new zone never stalls a frame building geometry.
   */
  private warmUpScenery(dt: number): void {
    this.warmTimer -= dt;
    if (this.warmTimer > 0) return;
    this.warmTimer = 0.3;
    for (let zone = 1; zone < ZONES.length; zone++) {
      if (this.world.decor.warm(zone)) return;
    }
  }

  /** Sparks flying off the wheels of trains that are heading toward Lazi. */
  private trainSparks(dt: number): void {
    if (this.world.profile.particles <= 0) return;
    this.sparkTimer -= dt;
    if (this.sparkTimer > 0) return;
    this.sparkTimer = 0.1;
    for (const chunk of this.world.chunks.chunks) {
      for (const o of chunk.movers) {
        if (o.def.kind !== 'trainMoving') continue;
        // World z of the train's near end; it extends `length` metres further away (-z).
        const nearZ = this.travelled - o.s;
        if (nearZ > 6 || nearZ < -110) continue;
        const z = nearZ - Math.random() * o.def.length;
        const side = Math.random() < 0.5 ? -1 : 1;
        this.world.effects.railSparks(o.x + side * 1.0, z);
      }
    }
  }

  /** Footstep dust while running, heavier while sliding. */
  private footsteps(dt: number, ground: number): void {
    const p = this.world.player;
    if (!p.isGrounded) return;
    this.stepTimer -= dt;
    if (this.stepTimer > 0) return;
    const speedNorm = this.speed / CONFIG.difficulty.maxSpeed;
    this.stepTimer = stepInterval(speedNorm);
    this.world.effects.dust(p.x, ground, 0.3, p.isSliding ? 1.4 : 0.55);
    if (!p.isSliding) {
      this.director.footstep(
        footstepSurface(this.currentZone().ground, ground, p.onRoof),
        speedNorm,
      );
    }
  }

  private onLand(impact: number): void {
    if (impact < 6) return;
    const w = this.world;
    const k = Math.min(1, impact / 25);
    w.effects.landing(w.player.x, w.player.y, 0.1, k);
    this.rig.impact(0.06 + 0.16 * k);
  }

  private stumble(): void {
    this.tally.stumbles++;
    this.tally.bestClean = Math.max(
      this.tally.bestClean,
      this.score.distance - this.tally.cleanSince,
    );
    this.tally.cleanSince = this.score.distance;
    this.speedFactor = CONFIG.collision.stumbleSlowFactor;
    this.world.player.bounceBack();
    this.bus.emit('stumble');
  }

  private updateHud(): void {
    this.hud.update({
      score: totalScore(this.score),
      coins: this.score.coins,
      distance: Math.floor(this.score.distance),
      multiplier: multiplierForDistance(this.score.distance, this.scoreBonus),
      zone: this.currentZone().name,
      chase: chaseMeter(this.chase),
    });
  }

  /* ---------------------------------------------------------------- events */

  private onAction = (action: InputAction): void => {
    if (this.busy) return;
    const playing = this.state.is('playing');
    const player = this.world.player;
    if (playing) this.tutorial.action(action);
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
        // Menus use real buttons (Enter/Space activate the focused one); in a run Space jumps.
        if (playing) player.jump();
        else if (this.state.is('paused')) this.resume();
        break;
      case 'pause':
        if (playing) this.pause();
        else if (this.state.is('paused')) this.resume();
        break;
    }
  };

  private onVisibilityChange = (): void => {
    if (document.hidden) {
      if (this.state.is('playing')) this.pause();
      this.audio.suspend();
    } else {
      this.audio.resume();
    }
  };

  private resize(): void {
    const width = Math.max(1, this.root.clientWidth);
    const height = Math.max(1, this.root.clientHeight);
    this.pipeline.resize(width, height);
    this.rig.setAspect(width / height);
    this.showroom?.resize(width, height);
  }
}
