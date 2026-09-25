import * as THREE from 'three';
import { OBSTACLE_DEFS, type ObstacleKind } from '../config/gameConfig';
import { QUALITY_PROFILES } from '../config/quality';
import { AssetLoader } from '../core/AssetLoader';
import { RealisticObstacleModels } from '../entities/realisticModels';
import { RenderPipeline } from '../systems/RenderPipeline';
import { Environment } from '../world/Environment';
import { MaterialLibrary } from '../world/Materials';

/**
 * Dev-only model viewer: `?gallery=obstacles`. Lays every obstacle out in a row under the game's
 * real lighting so models can be checked up close (and screenshotted).
 * Extra URL params: `cam=x,y,z` and `look=x,y,z` to place the camera, `zone=0..3`.
 */
export async function runGallery(root: HTMLElement, mode: string): Promise<void> {
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

  const camera = new THREE.PerspectiveCamera(45, root.clientWidth / root.clientHeight, 0.1, 400);
  camera.position.copy(vec('cam', [10, 6, 22]));
  camera.lookAt(vec('look', [10, 1.5, 0]));

  const clock = new THREE.Clock();
  const tick = (): void => {
    const dt = clock.getDelta();
    materials.update(clock.elapsedTime, env.atmosphere.night);
    env.update(zoneDistance, camera.position, clock.elapsedTime, 0);
    pipeline.render(env.scene, camera, dt, 0, env.atmosphere.bloom);
    requestAnimationFrame(tick);
  };
  tick();
  (window as unknown as { __galleryReady: boolean }).__galleryReady = true;
}
