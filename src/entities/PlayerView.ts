import type * as THREE from 'three';

/** What the player is doing right now; the view turns this into animation. */
export interface PlayerPose {
  alive: boolean;
  grounded: boolean;
  sliding: boolean;
  /** False on the menu (idle pose). */
  running: boolean;
  /** 0..1 run speed relative to the cap. */
  speedNorm: number;
  /** -1..1 sideways lean while changing lanes. */
  lean: number;
  y: number;
  vy: number;
}

export type PlayerEvent =
  | 'jump'
  | 'slide'
  | 'land'
  | 'stumble'
  /** Ran into an obstacle. */
  | 'crash'
  /** The thief and his dog caught up (second stumble while they were close). */
  | 'caught'
  | 'celebrate';

/** The visual side of the player. Physics lives in `Player`; a view only draws it. */
export interface PlayerView {
  readonly object: THREE.Object3D;
  update(dt: number, pose: PlayerPose): void;
  trigger(event: PlayerEvent): void;
  reset(): void;
  setShadows(cast: boolean): void;
  dispose(): void;
}
