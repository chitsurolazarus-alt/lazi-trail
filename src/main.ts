import './ui/styles.css';
import './ui/menus.css';
import { Game } from './core/Game';
import {
  QUALITY_LEVELS,
  detectQuality,
  readDeviceHints,
  type QualityLevel,
} from './config/quality';
import { pwa } from './pwa';
import { SaveManager } from './save/SaveManager';

const root = document.getElementById('app');
if (!root) throw new Error('#app container not found');

// Dev-only model viewer (`?gallery=obstacles`); never bundled into production builds.
const galleryMode = new URLSearchParams(location.search).get('gallery');
if (import.meta.env.DEV && galleryMode) {
  const { runGallery } = await import('./dev/gallery');
  await runGallery(root, galleryMode);
} else {
  await start(root);
}

async function start(root: HTMLElement): Promise<void> {
  pwa.init();
  const save = new SaveManager();
  save.load();

  // First run: pick a sensible graphics quality for this device and remember it.
  if (save.current.settings.quality === null) {
    save.updateSettings({ quality: detectQuality(readDeviceHints()) });
  }

  // `?quality=low|medium|high` overrides the saved choice for this page load only (testing).
  const override = new URLSearchParams(location.search).get('quality');
  const level: QualityLevel =
    QUALITY_LEVELS.find((q) => q === override) ?? save.current.settings.quality ?? 'medium';

  const game = await Game.create(root, save, level);

  if (import.meta.env.DEV) {
    (window as unknown as { __lazi: Game }).__lazi = game;
  }

  // Vite hot reload: tear the old game down so GPU resources and listeners don't pile up.
  import.meta.hot?.dispose(() => game.dispose());
}
