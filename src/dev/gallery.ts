import * as THREE from 'three';
import { OBSTACLE_DEFS, type ObstacleKind } from '../config/gameConfig';
import { QUALITY_PROFILES } from '../config/quality';
import { AssetLoader } from '../core/AssetLoader';
import { RealisticObstacleModels } from '../entities/realisticModels';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { RiggedPlayerView } from '../entities/RiggedPlayerView';
import { Chasers } from '../entities/Chasers';
import { PathHistory } from '../systems/PathHistory';
import { createChase, type ChaseState } from '../systems/ChaseSystem';
import type { PlayerPose } from '../entities/PlayerView';
import { RenderPipeline } from '../systems/RenderPipeline';
import { Environment } from '../world/Environment';
import { MaterialLibrary } from '../world/Materials';

/**
 * Dev-only model viewer: `?gallery=obstacles`. Lays every obstacle out in a row under the game's
 * real lighting so models can be checked up close (and screenshotted).
 * Extra URL params: `cam=x,y,z` and `look=x,y,z` to place the camera, `zone=0..3`.
 */
/** Render each synth voice and music layer offline and report levels (`?gallery=audio`). */
async function runAudioReport(): Promise<void> {
  const [{ MusicEngine }, synth, logic] = await Promise.all([
    import('../systems/audio/MusicEngine'),
    import('../systems/audio/synth'),
    import('../systems/audio/audioLogic'),
  ]);
  const rate = 44100;
  const measure = async (
    seconds: number,
    build: (ctx: OfflineAudioContext, dest: AudioNode) => void,
  ): Promise<{ peak: number; rms: number; nan: boolean }> => {
    const ctx = new OfflineAudioContext(1, rate * seconds, rate);
    build(ctx, ctx.destination);
    const data = (await ctx.startRendering()).getChannelData(0);
    let peak = 0;
    let sum = 0;
    let nan = false;
    for (const v of data) {
      if (Number.isNaN(v)) nan = true;
      peak = Math.max(peak, Math.abs(v));
      sum += v * v;
    }
    return { peak: +peak.toFixed(3), rms: +Math.sqrt(sum / data.length).toFixed(4), nan };
  };
  const report: Record<string, unknown> = {};
  const voices: Record<string, (c: OfflineAudioContext, d: AudioNode) => void> = {
    jump: (c, d) => synth.jump(c, d, 0.05),
    slide: (c, d) => synth.slide(c, d, 0.05),
    whoosh: (c, d) => synth.whoosh(c, d, 0.05),
    nearMiss: (c, d) => synth.nearMiss(c, d, 0.05),
    coin0: (c, d) => synth.coin(c, d, 0.05, 0),
    coin24: (c, d) => synth.coin(c, d, 0.05, 24, true),
    powerUp: (c, d) => synth.powerUp(c, d, 0.05),
    fanfare: (c, d) => synth.unlockFanfare(c, d, 0.05),
    chaChing: (c, d) => synth.chaChing(c, d, 0.05),
    zoneSwoosh: (c, d) => synth.zoneSwoosh(c, d, 0.05),
    hooter: (c, d) => synth.taxiHooter(c, d, 0.05),
    trainHorn: (c, d) => synth.trainHorn(c, d, 0.05),
    pant: (c, d) => synth.pant(c, d, 0.05),
    thiefHey: (c, d) => synth.thiefShout(c, d, 0.05, 'hey'),
    thiefOi: (c, d) => synth.thiefShout(c, d, 0.05, 'oi'),
    laugh: (c, d) => synth.thiefLaugh(c, d, 0.05),
    oof: (c, d) => synth.oof(c, d, 0.05),
    logDrum: (c, d) => synth.logDrum(c, d, 0.05, 33),
    kick: (c, d) => synth.kick(c, d, 0.05),
    piano: (c, d) => synth.piano(c, d, 0.05, [57, 60, 64]),
  };
  for (const [name, fn] of Object.entries(voices)) report[name] = await measure(2.5, fn);

  // Music: schedule 8 bars of a track at a chosen intensity straight through the engine's scheduler.
  const music = async (track: 'menu' | 'run' | 'shop', intensity: number): Promise<unknown> =>
    measure(16, (ctx, dest) => {
      const engine = new MusicEngine(ctx as unknown as AudioContext, dest);
      engine.play(track, 0.001);
      engine.setIntensity(intensity);
      const e = engine as unknown as {
        scheduleStep(t: string, l: unknown, s: number, at: number): void;
        layers: unknown;
        stepDur: number;
      };
      for (let step = 0; step < logic.STEPS_PER_BAR * 8; step++)
        e.scheduleStep(track, e.layers, step, 0.05 + step * e.stepDur);
      window.clearInterval((engine as unknown as { timer: number }).timer);
    });
  report.music_run_low = await music('run', 0.1);
  report.music_run_mid = await music('run', 0.5);
  report.music_run_full = await music('run', 1);
  report.music_menu = await music('menu', 0);
  report.music_shop = await music('shop', 0);
  (window as unknown as { __audioReport: unknown }).__audioReport = report;
}

export async function runGallery(root: HTMLElement, mode: string): Promise<void> {
  if (mode === 'audio') {
    await runAudioReport();
    return;
  }
  const params = new URLSearchParams(location.search);
  const vec = (name: string, fallback: [number, number, number]): THREE.Vector3 => {
    const v = params.get(name)?.split(',').map(Number) ?? fallback;
    return new THREE.Vector3(v[0], v[1], v[2]);
  };
  const profile = QUALITY_PROFILES.high;

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'width:100%;height:100%;display:block';
  root.append(canvas);
  const pipeline = new RenderPipeline(canvas, profile);
  pipeline.resize(root.clientWidth, root.clientHeight);

  const assets = new AssetLoader(4);
  await assets.loadSurfaces();
  await assets.loadModels();
  await Promise.all([
    assets.loadHdri('morning'),
    assets.loadHdri('midday'),
    assets.loadHdri('golden'),
    assets.loadHdri('evening'),
  ]);
  const materials = new MaterialLibrary(assets);
  const env = new Environment(profile, assets, pipeline.renderer);
  const zoneDistance = [0, 1200, 2700, 4700][Number(params.get('zone') ?? 0)] ?? 0;
  env.snapToAtmosphere(zoneDistance);

  // ground
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2),
    materials.get('road'),
  );
  floor.receiveShadow = true;
  env.scene.add(floor);

  if (mode === 'obstacles') {
    const models = new RealisticObstacleModels(materials);
    const kinds = Object.keys(OBSTACLE_DEFS) as ObstacleKind[];
    let x = 0;
    for (const kind of kinds) {
      const def = OBSTACLE_DEFS[kind];
      const object = models.create(kind);
      object.traverse((o) => {
        o.castShadow = true;
        o.receiveShadow = true;
      });
      const ramp = def.ramp?.length ?? 0;
      object.position.set(x, 0, 0);
      // Show moving vehicles facing the camera (they are turned round in the game).
      if (def.moving) object.rotation.y = Math.PI;
      env.scene.add(object);
      x += Math.max(3.2, def.halfWidth * 2 + 1.4) + (ramp > 0 ? 1.5 : 0);
    }
  }

  const mixers: THREE.AnimationMixer[] = [];
  if (mode === 'characters') {
    const keys = ['lazi', 'thief', 'dog', 'ped_worker', 'ped_business', 'ped_farmer'] as const;
    const wanted = params.get('clip');
    let x = 0;
    for (const key of keys) {
      const gltf = assets.models.get(key);
      if (!gltf) continue;
      const root = cloneSkinned(gltf.scene) as THREE.Object3D;
      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      console.log(
        key,
        'size',
        size.x.toFixed(2),
        size.y.toFixed(2),
        size.z.toFixed(2),
        'clips',
        gltf.animations.map((a) => `${a.name}:${a.duration.toFixed(2)}`).join(','),
      );
      root.position.set(x, 0, 0);
      env.scene.add(root);
      const mixer = new THREE.AnimationMixer(root);
      const clip = gltf.animations.find((a) => a.name === wanted) ?? gltf.animations[0];
      if (clip) mixer.clipAction(clip).play();
      mixers.push(mixer);
      const mats = new Set<string>();
      root.traverse((o) => {
        if (o instanceof THREE.Mesh)
          for (const m of Array.isArray(o.material) ? o.material : [o.material])
            mats.add(`${o.name}/${m.name}`);
      });
      console.log(key, 'meshes/materials', [...mats].join(' | '));
      x += 1.8;
    }
  }

  let laziView: RiggedPlayerView | null = null;
  const laziPose: PlayerPose = {
    alive: true,
    grounded: true,
    sliding: false,
    running: true,
    speedNorm: 0.3,
    lean: 0,
    y: 0,
    vy: 0,
  };
  if (mode === 'lazi') {
    laziView = new RiggedPlayerView(assets);
    env.scene.add(laziView.object);
    const state = params.get('pose') ?? 'run';
    if (state === 'air') {
      laziPose.grounded = false;
      laziView.trigger('jump');
    }
    if (state === 'slide') {
      laziPose.sliding = true;
      laziView.trigger('slide');
    }
    if (state === 'stumble') laziView.trigger('stumble');
    if (state === 'crash') {
      laziPose.alive = false;
      laziView.trigger('crash');
    }
    if (state === 'idle') laziPose.running = false;
    laziView.setShadows(true);
  }

  let chasers: Chasers | null = null;
  const chase: ChaseState = createChase();
  const path = new PathHistory();
  if (mode === 'chasers') {
    for (let i = 0; i <= 400; i++) path.record(i * 0.25, 0, 0);
    chasers = new Chasers(assets, true);
    env.scene.add(chasers.root);
    const phase = (params.get('phase') ?? 'close') as ChaseState['phase'];
    chase.phase = phase;
    chase.gap = Number(params.get('gap') ?? 4);
  }

  const camera = new THREE.PerspectiveCamera(45, root.clientWidth / root.clientHeight, 0.1, 400);
  camera.position.copy(vec('cam', [10, 6, 22]));
  camera.lookAt(vec('look', [10, 1.5, 0]));

  const clock = new THREE.Clock();
  const tick = (): void => {
    const dt = clock.getDelta();
    for (const m of mixers) m.update(dt);
    laziView?.update(dt, laziPose);
    if (chasers) {
      chasers.update(dt, {
        chase,
        path,
        travelled: 100,
        speedNorm: 0.3,
        player: { x: 0, y: 0 } as never,
        laziView: null,
      });
    }
    materials.update(clock.elapsedTime, env.atmosphere.night);
    env.update(zoneDistance, camera.position, clock.elapsedTime, 0);
    pipeline.render(env.scene, camera, dt, 0, env.atmosphere.bloom);
    requestAnimationFrame(tick);
  };
  tick();
  (window as unknown as { __galleryReady: boolean }).__galleryReady = true;
}
