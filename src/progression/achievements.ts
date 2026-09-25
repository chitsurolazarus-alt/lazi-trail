import { CHARACTERS } from '../config/characters';
import type { SaveData } from '../save/schema';
import { levelFromXp } from './xp';

/** Numbers about the player that achievements can watch. All are read from the save. */
export type StatKey =
  | 'runs'
  | 'outruns'
  | 'jumps'
  | 'slides'
  | 'nearMisses'
  | 'stumbles'
  | 'caught'
  | 'missionsCompleted'
  | 'setsCompleted'
  | 'missionStreak'
  | 'boxesOpened'
  | 'purchases'
  | 'bestScore'
  | 'bestDistance'
  | 'bestZone'
  | 'bestRunCoins'
  | 'bestNoStumble'
  | 'totalCoins'
  | 'totalDistance'
  | 'level'
  | 'charactersOwned'
  | 'outfitsOwned'
  | 'medals'
  | 'loginDays'
  | 'loginDay';

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  stat: StatKey;
  target: number;
  /** Rand paid when earned (rare ones pay more). */
  rand: number;
  /** Rare achievements also unlock outfits or unusual bragging rights. */
  rare?: boolean;
}

export function statValue(save: SaveData, key: StatKey): number {
  const c = save.counters;
  switch (key) {
    case 'runs':
      return save.stats.runs;
    case 'outruns':
      return c.outruns;
    case 'jumps':
      return c.jumps;
    case 'slides':
      return c.slides;
    case 'nearMisses':
      return c.nearMisses;
    case 'stumbles':
      return c.stumbles;
    case 'caught':
      return c.caught;
    case 'missionsCompleted':
      return c.missionsCompleted;
    case 'setsCompleted':
      return save.missions.setsCompleted;
    case 'missionStreak':
      return save.missions.bestStreak;
    case 'boxesOpened':
      return c.boxesOpened;
    case 'purchases':
      return c.purchases;
    case 'bestScore':
      return save.highScore;
    case 'bestDistance':
      return save.bestDistance;
    case 'bestZone':
      return save.bestZone + 1;
    case 'bestRunCoins':
      return c.bestRunCoins;
    case 'bestNoStumble':
      return c.bestNoStumble;
    case 'totalCoins':
      return save.stats.totalCoins;
    case 'totalDistance':
      return save.stats.totalDistance;
    case 'level':
      return levelFromXp(save.player.xp).level;
    case 'charactersOwned':
      return save.characters.owned.length;
    case 'outfitsOwned':
      return save.outfits.owned.length;
    case 'medals':
      return save.goldenMedals;
    case 'loginDays':
      return save.login.total;
    case 'loginDay':
      return save.login.day;
  }
}

const a = (
  id: string,
  name: string,
  description: string,
  stat: StatKey,
  target: number,
  rand = 100,
  rare = false,
): AchievementDef => ({ id, name, description, stat, target, rand, rare });

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  // Getting started
  a('first_run', 'First Steps', 'Finish your first run.', 'runs', 1, 50),
  a('runs_10', 'Regular', 'Play 10 runs.', 'runs', 10, 100),
  a('runs_50', 'Dedicated', 'Play 50 runs.', 'runs', 50, 200),
  a('runs_200', 'Trail Addict', 'Play 200 runs.', 'runs', 200, 500, true),
  // The chase
  a('outrun_10', 'Fast Feet', 'Outrun the dog 10 times.', 'outruns', 10, 100),
  a('outrun_50', 'Dog Whisperer', 'Outrun the dog 50 times.', 'outruns', 50, 250),
  a('outrun_250', 'Untouchable', 'Outrun the dog 250 times.', 'outruns', 250, 600, true),
  a('caught_1', 'Lesson Learned', 'Get caught by the thief.', 'caught', 1, 50),
  a('stumble_50', 'Bumps and Bruises', 'Stumble 50 times.', 'stumbles', 50, 100),
  // Distance and zones
  a('city', 'City Slicker', 'Reach the City Streets.', 'bestZone', 2, 100),
  a('trainyard', 'Off the Rails', 'Reach the Train Yard.', 'bestZone', 3, 150),
  a('stadium', 'Reach the Stadium', 'Reach the Stadium Approach.', 'bestZone', 4, 400, true),
  a('dist_1k', 'Kilometre Club', 'Run 1,000 m in one run.', 'bestDistance', 1000, 100),
  a('dist_3k', 'Long Haul', 'Run 3,000 m in one run.', 'bestDistance', 3000, 250),
  a('dist_5k', 'Marathon Spirit', 'Run 5,000 m in one run.', 'bestDistance', 5000, 500, true),
  a('total_dist_50k', 'Around the Block', 'Run 50 km in total.', 'totalDistance', 50000, 300),
  a('no_stumble_1k', 'Smooth Runner', 'Never stumble for 1 km.', 'bestNoStumble', 1000, 150),
  a('no_stumble_2k', 'Never Stumble', 'Never stumble for 2 km.', 'bestNoStumble', 2000, 350, true),
  // Score and Rand
  a('score_10k', 'Five Figures', 'Score 10,000 in one run.', 'bestScore', 10000, 100),
  a('score_50k', 'High Roller', 'Score 50,000 in one run.', 'bestScore', 50000, 300),
  a(
    'score_150k',
    'Legend of the Trail',
    'Score 150,000 in one run.',
    'bestScore',
    150000,
    600,
    true,
  ),
  a('rand_run_300', 'Pocket Change', 'Collect 300 Rand in one run.', 'bestRunCoins', 300, 100),
  a(
    'rand_run_1000',
    'Rand Rush',
    'Collect 1,000 Rand in one run.',
    'bestRunCoins',
    1000,
    400,
    true,
  ),
  a('rand_total_5k', 'Saving Up', 'Collect 5,000 Rand in total.', 'totalCoins', 5000, 150),
  a('rand_total_50k', 'Money Bags', 'Collect 50,000 Rand in total.', 'totalCoins', 50000, 500),
  // Moves
  a('near_50', 'Close Shave', 'Get 50 near misses.', 'nearMisses', 50, 150),
  a('near_250', 'Needle Threader', 'Get 250 near misses.', 'nearMisses', 250, 350),
  a('jumps_500', 'Skyward', 'Jump 500 times.', 'jumps', 500, 250, true),
  a('slides_250', 'Slide Master', 'Slide 250 times.', 'slides', 250, 250),
  // Missions
  a('mission_5', 'On a Mission', 'Complete 5 daily missions.', 'missionsCompleted', 5, 100),
  a('mission_50', 'Mission Control', 'Complete 50 daily missions.', 'missionsCompleted', 50, 400),
  a('set_1', 'Full Set', 'Complete all three daily missions in one day.', 'setsCompleted', 1, 150),
  a('set_10', 'Multiplier Maker', 'Complete 10 full mission sets.', 'setsCompleted', 10, 400),
  a(
    'streak_3',
    'Three in a Row',
    'Complete the daily set 3 days in a row.',
    'missionStreak',
    3,
    200,
  ),
  // Collecting
  a('box_1', 'Lucky Dip', 'Open a mystery box.', 'boxesOpened', 1, 50),
  a('box_10', 'Box Collector', 'Open 10 mystery boxes.', 'boxesOpened', 10, 250),
  a('buy_1', 'First Purchase', 'Buy something in the shop.', 'purchases', 1, 50),
  a('chars_3', 'Growing Squad', 'Own 3 characters.', 'charactersOwned', 3, 200),
  a(
    'chars_all',
    'Full Squad',
    'Own every character.',
    'charactersOwned',
    CHARACTERS.length,
    600,
    true,
  ),
  a('outfits_5', 'Wardrobe', 'Unlock 5 outfits.', 'outfitsOwned', 5, 250),
  a('medal_1', 'Shiny', 'Find a Golden Medal.', 'medals', 1, 100),
  a('medal_10', 'Medal Hunter', 'Collect 10 Golden Medals.', 'medals', 10, 500, true),
  // Progress
  a('level_5', 'Level 5', 'Reach player level 5.', 'level', 5, 150),
  a('level_10', 'Level 10', 'Reach player level 10.', 'level', 10, 300),
  a('level_25', 'Level 25', 'Reach player level 25.', 'level', 25, 700, true),
  a('login_7', 'Weekly Regular', 'Claim daily rewards on 7 days.', 'loginDays', 7, 200),
  a('login_day7', 'Full Calendar', 'Claim the day 7 login reward.', 'loginDay', 7, 300),
];

export function getAchievement(id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((x) => x.id === id);
}

export function achievementProgress(
  save: SaveData,
  def: AchievementDef,
): { value: number; target: number; done: boolean } {
  const value = Math.min(def.target, statValue(save, def.stat));
  return { value, target: def.target, done: save.achievements[def.id] !== undefined };
}

/** Achievements whose target has been reached but that are not yet recorded in the save. */
export function newlyEarned(save: SaveData): AchievementDef[] {
  return ACHIEVEMENTS.filter(
    (def) => save.achievements[def.id] === undefined && statValue(save, def.stat) >= def.target,
  );
}
