import './ui/styles.css';
import { Game } from './core/Game';

const root = document.getElementById('app');
if (!root) throw new Error('#app container not found');

const game = new Game(root);

if (import.meta.env.DEV) {
  (window as unknown as { __lazi: Game }).__lazi = game;
}

// Vite hot reload: tear the old game down so GPU resources and listeners don't pile up.
import.meta.hot?.dispose(() => game.dispose());
