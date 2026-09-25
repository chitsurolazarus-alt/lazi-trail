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
  private readonly muteButton = document.createElement('button');
  private readonly player = document.createElement('div');
  private readonly shield = document.createElement('div');
  private readonly powers = document.createElement('div');
  private readonly powerChips = new Map<
    string,
    { root: HTMLElement; fill: HTMLElement; last: number }
  >();
  private last: Partial<HudValues> = {};

  constructor(onPause: () => void, onMute: (muted: boolean) => void) {
    this.element.className = 'hud';
    this.element.hidden = true;

    const left = document.createElement('div');
    left.className = 'hud-col';
    this.player.className = 'hud-player';
    this.shield.className = 'hud-shield';
    this.shield.hidden = true;
    this.shield.setAttribute('role', 'img');
    this.shield.setAttribute('aria-label', 'Shield active');
    this.shield.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l8 3v6c0 5-3.4 9-8 11-4.6-2-8-6-8-11V5z"/></svg><span>Shield</span>';
    this.powers.className = 'hud-powers';
    left.append(this.player, this.score.root, this.coins.root, this.shield, this.powers);

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

    this.muteButton.className = 'hud-mute';
    this.muteButton.type = 'button';
    this.muteButton.addEventListener('click', () =>
      onMute(this.muteButton.getAttribute('aria-pressed') !== 'true'),
    );
    this.setMuted(false);

    this.element.append(left, right, this.pauseButton, this.muteButton);
  }

  /** Who is running: shown top-left ("Thabo · Lv 4"). */
  setPlayer(name: string, level: number): void {
    this.player.textContent = `${name} · Lv ${level}`;
  }

  /** Active power-ups with a draining bar each. DOM is touched only when a bar moves a step. */
  setPowerUps(items: ReadonlyArray<{ id: string; label: string; fraction: number }>): void {
    const live = new Set(items.map((i) => i.id));
    for (const [id, chip] of this.powerChips) {
      if (live.has(id)) continue;
      chip.root.remove();
      this.powerChips.delete(id);
    }
    for (const item of items) {
      let chip = this.powerChips.get(item.id);
      if (!chip) {
        const root = document.createElement('div');
        root.className = `hud-power hud-power-${item.id}`;
        const label = document.createElement('span');
        label.textContent = item.label;
        const track = document.createElement('div');
        track.className = 'hud-power-track';
        const fill = document.createElement('div');
        fill.className = 'hud-power-fill';
        track.append(fill);
        root.append(label, track);
        this.powers.append(root);
        chip = { root, fill, last: -1 };
        this.powerChips.set(item.id, chip);
      }
      const pct = Math.round(Math.min(1, Math.max(0, item.fraction)) * 50) * 2;
      if (pct !== chip.last) {
        chip.fill.style.width = `${pct}%`;
        chip.root.classList.toggle('hud-power-low', pct < 25);
        chip.last = pct;
      }
    }
  }

  setShield(active: boolean): void {
    this.shield.hidden = !active;
  }

  /** Reflect the current mute state on the speaker button. */
  setMuted(muted: boolean): void {
    this.muteButton.setAttribute('aria-pressed', String(muted));
    this.muteButton.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
    const wave = muted
      ? '<path d="M16.5 8.5l-1.4 1.4L16.7 11.5l-1.6 1.6 1.4 1.4 1.6-1.6 1.6 1.6 1.4-1.4-1.6-1.6 1.6-1.6-1.4-1.4-1.6 1.6z"/>'
      : '<path d="M15.5 8.5a5 5 0 010 7l-1.1-1.1a3.4 3.4 0 000-4.8z"/><path d="M18 6a8.5 8.5 0 010 12l-1.1-1.1a6.9 6.9 0 000-9.8z"/>';
    this.muteButton.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/>${wave}</svg>`;
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
      // Whole numbers stay 'x3'; a mission bonus shows as 'x3.15'.
      this.multiplier.textContent = `x${Number(values.multiplier.toFixed(2))}`;
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
