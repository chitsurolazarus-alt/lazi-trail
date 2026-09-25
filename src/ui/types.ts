import type { CharacterId } from '../config/characters';
import type { QualityLevel } from '../config/quality';
import type { Progression, Report } from '../progression/Progression';
import type { AudioSettings, Channel } from '../systems/audio/AudioManager';
import type { Toasts } from './Toasts';

export type UiSound =
  'click' | 'select' | 'back' | 'confirm' | 'error' | 'toggle' | 'purchase' | 'unlock';

/** The 3D character room, as the screens see it. */
export interface RoomApi {
  /** Start showing the room (call once when entering a room screen). */
  open(): void;
  close(): void;
  show(character: CharacterId, outfit: string, locked: boolean): Promise<void>;
  celebrate(): void;
  rotate(dx: number): void;
}

/** What the run ended with, for the game-over screen. */
export interface RunSummary {
  score: number;
  best: number;
  distance: number;
  coins: number;
  zone: string;
  newRecord: boolean;
  caught: boolean;
  report: Report;
}

/** Everything the screens need from the game. Keeps `ui/` free of game internals. */
export interface UiHost {
  readonly progress: Progression;
  readonly toasts: Toasts;
  readonly room: RoomApi;
  sound(kind: UiSound): void;

  getAudio(): AudioSettings;
  setVolume(channel: Channel, value: number): void;
  previewVolume(channel: Channel): void;
  setMuted(muted: boolean): void;

  getQuality(): QualityLevel;
  setQuality(level: QualityLevel): void;

  /** Which music should play while a screen is open. */
  music(track: 'menu' | 'shop'): void;

  startRun(options: { headStart: boolean }): void;
  resume(): void;
  restart(): void;
  quitToMenu(): void;
  /** Second Chance prompt answer. */
  secondChance(accept: boolean): void;

  /** The selected character or outfit changed: rebuild the runner. */
  loadoutChanged(): void;
  resetProgress(): void;
  replayTutorial(): void;
}
