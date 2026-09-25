/** Events broadcast on the game's EventBus (`void` = no payload). */
export interface GameEvents {
  laneChange: void;
  jump: void;
  slide: void;
  /** A coin was collected; `value` is what it was worth, x/y/z where it was (world space). */
  coin: { value: number; x: number; y: number; z: number; gold: boolean };
  /** Lazi touched down; `impact` is her downward speed in m/s. */
  land: { impact: number };
  /** An obstacle whizzed past within a hair's breadth (no hit). */
  nearMiss: void;
  stumble: void;
  crash: void;
  zoneChange: { index: number };
  /** The Bongani-style shield soaked up a hit. */
  shieldBreak: void;
}
