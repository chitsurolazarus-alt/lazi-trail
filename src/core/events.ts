/** Events broadcast on the game's EventBus (`void` = no payload). */
export interface GameEvents {
  laneChange: void;
  jump: void;
  slide: void;
  /** A coin was collected; `value` is what it was worth. */
  coin: { value: number };
  stumble: void;
  crash: void;
  zoneChange: { index: number };
}
