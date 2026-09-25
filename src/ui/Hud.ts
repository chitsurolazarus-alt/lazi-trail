export interface HudValues {
  score: number;
  coins: number;
  distance: number;
  multiplier: number;
  zone: string;
  /** 0 = the thief is far behind, 1 = he has her. */
  chase: number;
}

/** In-run overlay. DOM is only touched when a value actually changes. */
export class Hud {
  readonly element = document.createElement('div');

  private readonly score = this.stat('hud-score', 'Score');
  private readonly coins = this.stat('hud-coins', 'Rand');
  private readonly distance = this.stat('hud-distance', 'Distance');
  private readonly multiplier = document.createElement('div');
  private readonly zone = document.createElement('div');
  private readonly chaseBar = document.createElement('div');
  private readonly chaseFill = document.createElement('div');
  private readonly pauseButton = document.createElement('button');
  private last: Partial<HudValues> = {};

  constructor(onPause: () => void) {
    this.element.className = 'hud';
    this.element.hidden = true;

    const left = document.createElement('div');
    left.className = 'hud-col';
    left.append(this.score.root, this.coins.root);

    const right = document.createElement('div');
    right.className = 'hud-col hud-right';
    this.multiplier.className = 'hud-mult';
    this.zone.className = 'hud-zone';
    this.chaseBar.className = 'hud-chase';
    this.chaseBar.setAttribute('role', 'meter');
    this.chaseBar.setAttribute('aria-label', 'Chase: how close the thief is');
    this.chaseBar.setAttribute('aria-valuemin', '0');
    this.chaseBar.setAttribute('aria-valuemax', '100');
    const chaseLabel = document.createElement('span');
    chaseLabel.className = 'hud-chase-label';
    chaseLabel.textContent = 'Thief';
    this.chaseFill.className = 'hud-chase-fill';
    const track = document.createElement('div');
    track.className = 'hud-chase-track';
    track.append(this.chaseFill);
    this.chaseBar.append(chaseLabel, track);
    right.append(this.multiplier, this.distance.root, this.zone, this.chaseBar);

    this.pauseButton.className = 'hud-pause';
    this.pauseButton.type = 'button';
    this.pauseButton.setAttribute('aria-label', 'Pause');
    this.pauseButton.textContent = 'II';
    this.pauseButton.addEventListener('click', onPause);

    this.element.append(left, right, this.pauseButton);
  }

  show(visible: boolean): void {
    this.element.hidden = !visible;
  }

  update(values: HudValues): void {
    const last = this.last;
    if (values.score !== last.score) this.score.value.textContent = values.score.toLocaleString();
    if (values.coins !== last.coins) this.coins.value.textContent = String(values.coins);
    if (values.distance !== last.distance) this.distance.value.textContent = `${values.distance} m`;
    if (values.multiplier !== last.multiplier) {
      this.multiplier.textContent = `x${values.multiplier}`;
    }
    if (values.zone !== last.zone) this.zone.textContent = values.zone;
    const pct = Math.round(values.chase * 100);
    if (pct !== Math.round((last.chase ?? -1) * 100)) {
      this.chaseFill.style.width = `${pct}%`;
      this.chaseFill.dataset.level = pct > 66 ? 'high' : pct > 33 ? 'mid' : 'low';
      this.chaseBar.setAttribute('aria-valuenow', String(pct));
    }
    this.last = values;
  }

  private stat(className: string, label: string): { root: HTMLElement; value: HTMLElement } {
    const root = document.createElement('div');
    root.className = `hud-stat ${className}`;
    const labelEl = document.createElement('span');
    labelEl.className = 'hud-label';
    labelEl.textContent = label;
    const value = document.createElement('span');
    value.className = 'hud-value';
    value.textContent = '0';
    root.append(labelEl, value);
    return { root, value };
  }
}
