# Lazi Trail — Claude Code Build Prompt

> Copy of the original build prompt, kept for future sessions. Phases are pasted one at a time; test (`npm run dev`) and commit after each.

## STEP 0 — Create the project root

Root folder `lazi-trail` on Desktop; Vite vanilla TS; `three`, `@types/three`, `vitest`, `eslint`, `prettier`. Root files: package.json (scripts dev/build/preview/test/lint/format), index.html, tsconfig.json (strict), vite.config.ts, .gitignore, .prettierrc, eslint.config.js, README.md, CREDITS.md, CLAUDE.md, this prompt. Empty `src/` subfolders, `tests/`, `public/assets/{models,audio,textures}`. `git init`, first commit "chore: project scaffold", remote `https://github.com/chitsurolazarus-alt/lazi-trail.git` (don't push until told).

## PROJECT BRIEF

Build **Lazi Trail**, an original 3D endless-runner browser game (do NOT copy Subway Surfers characters, names, assets or art). Portfolio project for Lazarus Chitsuro (GitHub: `chitsurolazarus-alt`) — code quality, structure, performance and README matter as much as gameplay.

### Tech stack

Three.js + Vite + TypeScript (strict). No backend; persistence via localStorage through a single `SaveManager`. Vitest for pure game logic. Deploy: Cloudflare Pages (static `dist/`). Smooth on mobile and desktop (60fps on mid-range phones).

### Story & identity

- **Lazi**, a young South African athlete training through the city for the big race (stadium is the dream).
- Setting: township market, city streets, train yard, stadium approach, Table Mountain in the distance.
- Art: bright cartoon low-poly; primitives first, swappable later for CC0 models (Kenney, Quaternius, Poly Pizza) and Mixamo animations.
- Colours: Orange `#FF7A1A`, Deep Blue `#0B2A5B`, white/off-white text.
- Credit on main menu and game-over: "Built by Lazarus Chitsuro" → `https://github.com/chitsurolazarus-alt`.

### Core gameplay

- 3 lanes. Arrow keys / WASD; swipe on mobile. Left/Right = lane change (smooth tween), Up = jump, Down = slide (fast-fall in air).
- Camera behind and slightly above Lazi, smooth follow, slight FOV increase with speed.
- Endless world: chunks generated ahead, recycled behind (object pooling, no constant allocations).
- Collectible Rand coins (gold/silver with "R"), in lines, arcs over obstacles, lane-switch patterns.
- Difficulty: gentle for ~60s, then speed and density increase smoothly to a cap.
- Collision: front hit = crash → game over. Side-clip = stumble (camera shake); second stumble within a few seconds = crash.
- Score = distance × multiplier + coins. HUD: score, coins, multiplier, zone.

### Zones (endless, change with distance; banner on entry e.g. "ZONE 2 — CITY STREETS")

1. Township Market (0–1000m) — stalls, fruit/vendor carts, parked minibus taxis. Easy.
2. City Streets (1000–2500m) — moving minibus taxis (some oncoming), more stalls/carts, taller buildings.
3. Train Yard (2500–4500m) — Metrorail-style trains (parked with ramps to run on top, moving to dodge), Table Mountain backdrop.
4. Stadium Approach (4500m+) — everything mixed, top speed, stadium lights.
   Each zone: own palette, props, fog colour. Best zone reached is saved.

### Obstacles

Street stalls (switch lane); carts (low: jump; some with awning: slide); minibus taxis (parked: switch lane or jump on roof via ramp; moving: dodge); trains (Zone 3+; parked with ramps, moving). Generator must always leave at least one passable path.

### Power-ups (Phase 4)

Coin Magnet (10s), Energy Drink Boost (speed + invincibility, 5s), Super Spikes (higher jumps, 10s), 2x Score (15s). HUD timers. Durations upgradable in shop.

### Screens

Loading → Main Menu → Gameplay (HUD) → Pause → Game Over → Shop → Settings → Stats/Local Leaderboard.

### Persistence

One `SaveManager`; one versioned key `lazitrail_save_v1`. Stores high score, best distance, best zone, total Rand, unlocked/selected outfits, power-up upgrade levels, settings (music/SFX volume, controls hint), stats (runs, total coins, total distance), local top-10 leaderboard (score, distance, zone, date). Every read/write in try/catch with defaults fallback. Save only at game over, purchase, settings change. Schema migration hook; "Reset progress" in Settings with confirm.

### Architecture

```
src/
  main.ts
  core/        Game.ts, GameLoop.ts, StateMachine.ts, EventBus.ts, Input.ts, AssetLoader.ts
  world/       ChunkManager.ts, ZoneManager.ts, ObstacleGenerator.ts, ObjectPool.ts, Environment.ts
  entities/    Player.ts, Obstacle.ts, Coin.ts, PowerUp.ts
  systems/     Collision.ts, Scoring.ts, Difficulty.ts, PowerUpSystem.ts, Audio.ts, CameraRig.ts
  save/        SaveManager.ts, schema.ts
  ui/          HTML/CSS overlay screens + HUD
  config/      gameConfig.ts, zones.ts, colors.ts
tests/         scoring, difficulty, obstacleGenerator, saveManager
public/assets/ models/, audio/, textures/
```

Pure functions for logic; HTML/CSS overlay UI; fixed-timestep or delta-clamped loop; pause on tab hidden.

### Quality bar

Strict TS, ESLint + Prettier, no unjustified `any`; no leaks (dispose, pool); responsive canvas, DPR cap 2; accessible menus; small meaningful commits.

## PHASE 1 — Playable core (placeholder shapes)

Scene, lighting, fog, camera rig, resize; Lazi placeholder with lane switching, jump, slide, gravity; keyboard + swipe; endless chunk track with pooling; placeholder obstacles (stall, cart, parked taxi) and Rand coins; collision, stumble, crash, game over + restart; scoring, coins, difficulty ramp; minimal HUD; unit tests for scoring and difficulty. Stop when fully playable, then say how to run.

## PHASE 2 — Look, feel & zones

4 zones via ZoneManager, banners, palettes, props, fog; moving taxis (Z2+), trains with ramps (Z3+); CC0 models where available (primitives fallback), Lazi run/jump/slide animations; Table Mountain, buildings, street details; audio (music loop + SFX: coin, jump, slide, stumble, crash, zone change) with volume; juice (shake, speed FOV, coin sparkle, dust); CREDITS.md.

## PHASE 3 — Menus, shop & saving

Loading screen with progress, Main Menu (Play, Shop, Stats, Settings), Pause, Game Over (score, best, new-record banner); SaveManager + unit tests; Shop (outfits/colour skins for Rand); Stats with local top-10; Settings (volumes, controls hint, reset); credit line; brand styling; text logo.

## PHASE 4 — Power-ups & missions

All 4 power-ups with spawn logic, HUD timers, shop upgrades; 3 rotating daily missions raising score multiplier, saved in localStorage.

## PHASE 5 — Portfolio polish & deploy

Performance pass (draw calls, instancing, textures; test on mobile); PWA; SEO/OG/favicon; README (GIF, live link, controls, features, stack, architecture diagram, challenges & solutions, local run, credits); Cloudflare Pages instructions (`npm run build`, output `dist`); final cleanup and tests.
