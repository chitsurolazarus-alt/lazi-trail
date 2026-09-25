# Lazi Trail — project context

Original 3D endless runner (portfolio project by Lazarus Chitsuro, GitHub `chitsurolazarus-alt`). Do NOT copy Subway Surfers characters/names/assets. Full spec: `LAZI_TRAIL_PROMPT.md`.

## Stack
Three.js + Vite + TypeScript (strict), Vitest, ESLint + Prettier. No backend. Deploy: Cloudflare Pages (`npm run build` → `dist/`).
Commands: `npm run dev | test | build | lint | format`.

## Rules
- All persistence through ONE `SaveManager`, key `lazitrail_save_v1`; every read/write in try/catch; save only at key moments, never per frame.
- All tunable numbers live in `src/config/gameConfig.ts`.
- Game logic (scoring, difficulty, obstacle generator, save schema) = pure functions with unit tests in `tests/`.
- Pool everything that spawns; dispose geometries/materials; cap DPR at 2; pause when tab hidden.
- Generator must always leave at least one passable path.
- UI = HTML/CSS overlay over the canvas; menus keyboard-accessible.
- No `any` unless justified. Small, meaningful commits per feature.

## Look
Bright cartoon low-poly. Orange `#FF7A1A`, Deep Blue `#0B2A5B`, white/off-white text. Credit "Built by Lazarus Chitsuro" → https://github.com/chitsurolazarus-alt on menu + game over.
Zones: 1 Township Market (0–1000m), 2 City Streets (1000–2500m), 3 Train Yard (2500–4500m), 4 Stadium Approach (4500m+).

## Structure
```
src/
  main.ts
  core/      Game, GameLoop, StateMachine, EventBus, Input, AssetLoader
  world/     ChunkManager, ZoneManager, ObstacleGenerator, ObjectPool, Environment
  entities/  Player, Obstacle, Coin, PowerUp
  systems/   Collision, Scoring, Difficulty, PowerUpSystem, Audio, CameraRig
  save/      SaveManager, schema
  ui/        overlay screens + HUD
  config/    gameConfig, zones, colors
tests/       scoring, difficulty, obstacleGenerator, saveManager
public/assets/{models,audio,textures}
```

## Phases
1 Playable core · 2 Look/feel/zones · 3 Menus/shop/saving · 4 Power-ups/missions · 5 Portfolio polish/deploy.
Phase status: see git log.
