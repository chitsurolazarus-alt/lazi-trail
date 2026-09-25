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
- Art: stylised-realistic (updated after Phase 1). PBR materials, real textures, detailed buildings, HDRI lighting, soft shadows and post-processing, while still running well on phones. Phase 1 primitives stay as low-quality fallbacks. Details are in Phase 2.
- Chasers: a thief and his dog chase Lazi from the start of every run (the thief is after Lazi's bag and medal).
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

## Phases 2 to 5 (full text, supplied after Phase 1)

Working rules from the owner:
- Build the phases in order (2 → 3 → 4 → 5). Break each phase into small steps with a commit per feature.
- After each phase run `tsc`, ESLint, all tests and `npm run build`, then summarise: what changed, how to test it, what still needs playtesting. **Wait for the owner's "continue" before starting the next phase.**
- Keep everything from Phase 1 working. Don't break save data (migrate it).
- Keep all tunable numbers in `src/config/`.
- Only CC0/CC-BY assets and royalty-free audio, every one logged in `CREDITS.md`. No copyrighted music, brands or characters.
- Quality-setting plan approved: on mobile use baked or no shadows and light post-processing; desktop gets the full treatment. Auto-detect on first run, changeable in Settings, saved in localStorage.

---

## PHASE 2 — Realistic, alive world + the chase

**Update first:** art direction is now **stylised-realistic** (done in `CLAUDE.md` / this file). Keep the Phase 1 primitives as the Low-quality fallback.

### Rendering and lighting
- `renderer.outputColorSpace = SRGBColorSpace`, **ACES Filmic tone mapping**, physically correct lighting
- **HDRI environment lighting** from a CC0 Poly Haven sky HDRI (sunny Cape Town-style morning), plus a warm directional sun with **soft shadows** (shadow camera follows the player, nearby area only)
- **Post-processing** (EffectComposer): subtle bloom, SMAA/FXAA, light vignette, small motion blur or speed lines at high speed
- Atmospheric **height fog** per zone, and a sky that suits each zone (morning, midday, golden hour, stadium evening under floodlights)
- **Quality settings: Low / Medium / High.** Auto-detect on first run (mobile → Medium), switch in Settings, save the choice. Low turns off shadows and post-processing and uses the fallback primitives.

### Realistic buildings and streets (the main focus)
- Real **CC0 / CC-BY assets**: Poly Haven (PBR textures: brick, plaster, corrugated iron, tar, pavement, concrete), Quaternius and Kenney city kits, CC-BY Sketchfab models where needed. Compress everything: **GLB + Draco/meshopt**, textures as **KTX2/Basis** or WebP at 1K max.
- **Modular building kit** so each chunk assembles varied street fronts from parts (walls, windows, doors, roofs, balconies, signage) with random colours, weathering and details. Avoid a copy-paste look.
- **Township Market:** colourful painted houses and spaza shops with corrugated-iron roofs, hand-painted signs (fictional shop names), washing lines, fences, satellite dishes, street stalls with fruit and goods
- **City Streets:** multi-storey buildings with glass shopfronts, balconies and awnings, street lights, traffic lights, billboards (fictional brands only), bus stops, trees, road markings, pavements
- **Train Yard:** platforms, overhead wires and poles, gravel, containers, fences with graffiti-style (original) art, **Table Mountain** backdrop
- **Stadium Approach:** stadium structure growing in the distance, floodlights, crowd-banner flags, big screens
- **InstancedMesh** for repeated props (lights, poles, fences, trees) and LODs or impostors for far buildings to keep draw calls low
- **Life and movement:** pedestrians walking on the pavements (simple animated background characters), pigeons that fly off as Lazi passes, flags and washing moving in the wind, parked cars, taxis hooting, dust and leaves blowing, shadows from passing clouds

### Characters and animation
- Replace the placeholder Lazi with a **rigged, realistic-proportioned athlete** (Mixamo character or a CC0 model retargeted to Mixamo animations): run, sprint, jump, roll/slide, stumble, fall, idle, celebrate
- Smooth blending with `AnimationMixer` (cross-fades, never snaps)

### The chase: thief + dog
- A **thief** (hoodie and cap, carrying a sack; cartoonish villain, never violent) and his **dog** chase Lazi, who carries his **sports bag and medal**
- **Run start:** short intro. The thief tries to grab Lazi's bag, Lazi dodges and sprints off, the chase begins with the pair close behind.
- After ~5 seconds of clean running they **fall back out of view**.
- **On a stumble** they **catch up** and appear right behind Lazi (dog barking, thief shouting). A **second stumble while they're close = caught** (game over with a "caught" animation, e.g. the dog tugging at the bag).
- They drop back again after a few clean seconds. Small **"chase meter"** in the HUD.
- **Energy Drink Boost** makes Lazi pull far ahead. When a run ends by hitting an obstacle, they run past and snatch the bag in the game-over scene.
- Animated dog (run, bark, jump) and thief (run, reach, laugh). Positions are driven by pure logic in `ChaseSystem.ts`, with unit tests.

### Zones and obstacles
- 4 zones with ZoneManager, zone banners, smooth transitions between palettes, props and fog
- Moving minibus taxis (Zone 2+) with headlights and hooters; trains with ramps (Zone 3+) with horns and sparks
- Realistic obstacle models: stalls, carts, taxis, trains, barriers
- **Juice:** camera shake, speed FOV, coin sparkle, footstep dust, landing impact, near-miss "whoosh", slow-motion on crash
- **60fps on High** on desktop and a steady frame rate on Medium on a mid-range phone. FPS counter in dev mode.
- Update `CREDITS.md` with every asset, author and licence

## PHASE 3 — Music and sound
- **AudioManager** (Web Audio / Howler.js): separate **Music**, **SFX** and **Ambience** volume channels with mute, saved to localStorage. Unlock audio on first user tap.
- **Music** (royalty-free only: Pixabay Music, OpenGameArt, Kenney, CC0/CC-BY; never copyrighted songs):
  - Menu theme: chilled, South African vibe (Amapiano/Kwaito-inspired feel)
  - In-run track: upbeat, crossfading into a more intense layer as speed rises and when chasers are close
  - Game over sting, new-record fanfare, shop/character-room loop
- **SFX:** footsteps (tar, gravel, train roof), jump, land, slide, lane-switch whoosh, coin pickup (pitch rises on streaks), power-up pickup and expiry, stumble, crash, dog bark and pant, thief shouts (non-verbal or short clean lines), taxi hooter, train horn, zone-change swoosh, UI clicks, purchase "cha-ching", unlock fanfare
- **Ambience** per zone: market chatter and radio, city traffic, train-yard clanks, stadium crowd
- **3D positional audio** for passing taxis, trains and the chasers
- Update `CREDITS.md` with every audio file and licence

## PHASE 4 — Characters, player profile and progression
### Player profile
- First launch: **"Name your runner" screen**. Player name 3–16 chars, bad-word filtered, editable in Settings. Shown on HUD, game-over screen and local leaderboard.
- Profile screen: name, **player level and XP bar**, total runs, best score, best zone, characters owned, achievements earned

### Character roster (all original South African characters)
Each has a name, short bio, unique outfit, and one small **perk**:

| Character | Bio | How to unlock | Perk |
|---|---|---|---|
| **Lazi** | Sprinter training for the big race | Free (default) | None, the all-rounder |
| **Thandi** | Netball star, quick feet | 2,500 Rand | Faster lane switches |
| **Sipho** | Footballer from the township | Reach Zone 3 | Coin magnet lasts longer |
| **Naledi** | Long jumper | 10 daily-mission streak | Higher jumps |
| **Kagiso** | Marathon runner | 15,000 Rand | Recovers from stumbles faster |
| **Bongani** | Rugby player | Complete 25 achievements | Starts each run with a shield |
| **Zola** (secret) | Mystery runner | Collect 10 "Golden Medals" found rarely during runs | Chasers start further back |

- **Outfits and skins** per character (tracksuits, team kits, colour variants) bought with Rand, plus a few rare outfits only from achievements
- **Character room:** 3D showroom, character rotates, plays idle and celebrate animations, shows perk, bio and unlock requirement. Locked characters appear as silhouettes.
- Perks small and balanced, all defined in `config/characters.ts`

### Game features players expect
- **XP and player levels:** XP every run, level-ups give rewards (Rand, outfits, profile badges)
- **Daily login rewards:** 7-day calendar, bigger reward on day 7, streak resets if a day is missed (device date)
- **Daily missions:** 3 per day, rerolls for Rand. Completing a set raises the permanent score multiplier.
- **Achievements:** 30+ (e.g. "Outrun the dog 50 times", "Reach the Stadium", "Collect 1,000 Rand in one run", "Never stumble for 2 km"), with toast popup
- **Mystery boxes:** found in runs or bought: Rand, power-up upgrades, outfit pieces or Golden Medals
- **Head Start** and **Second Chance** (continue after being caught) as items bought with Rand, no real money
- **Shop:** tabs for Characters, Outfits, Power-up upgrades, Items
- **Stats and local leaderboard:** top-10 runs with player name, character, score, distance, zone
- **Screens:** Loading → Name your runner (first time) → Main Menu (Play, Characters, Shop, Missions, Achievements, Profile, Settings) → Run/HUD → Pause → Game Over (score, XP gained, missions progress, new record) → back to menu
- **Tutorial:** first run shows swipe/key hints for lane, jump and slide, then marks itself done

### Saving (localStorage)
- Bump to **`lazitrail_save_v2`** with a **tested migration from v1**. Add player name, level/XP, owned and selected characters and outfits, achievements, mission state, login streak, Golden Medals, items and quality setting.
- Unit tests for unlock rules, XP/level curve, mission rotation, streak logic and save migration

## PHASE 5 — Power-ups, polish and deploy
- All 4 power-ups (Coin Magnet, Energy Drink Boost, Super Spikes, 2x Score) with realistic models, HUD timers and shop upgrades
- Performance pass on real phones (draw calls, texture memory, shader warm-up to avoid stutters)
- PWA (manifest + service worker) with an **"Install Lazi Trail" button** in the menu
- SEO and meta tags, Open Graph image, favicon
- **README.md:** gameplay GIF, live link, features, controls, tech stack, architecture diagram, key technical challenges and solutions (chunk streaming, pooling, chase logic, save migration), how to run it, credits
- Cloudflare Pages deploy (build command `npm run build`, output `dist`)
- Final cleanup, all tests passing, credit line "Built by Lazarus Chitsuro" → GitHub
