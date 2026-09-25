import { CREDIT } from '../config/gameConfig';
import { QUALITY_LEVELS, QUALITY_PROFILES, type QualityLevel } from '../config/quality';

export interface RunSummary {
  score: number;
  distance: number;
  coins: number;
  zone: string;
  best: number;
  newRecord: boolean;
}

export interface ScreenHandlers {
  onStart: () => void;
  onResume: () => void;
  onRestart: () => void;
  /** Player picked a graphics quality in Settings. */
  onQuality: (level: QualityLevel) => void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label: string, onClick: () => void, secondary = false): HTMLButtonElement {
  const b = el('button', secondary ? 'btn btn-secondary' : 'btn', label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

function creditLink(): HTMLAnchorElement {
  const a = el('a', 'credit', CREDIT.text);
  a.href = CREDIT.url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

/** Minimal full-screen overlays: ready, paused, game over, settings. */
export class Screens {
  readonly element = el('div', 'screens');
  private quality: QualityLevel = 'high';

  constructor(private readonly handlers: ScreenHandlers) {
    this.element.hidden = true;
  }

  hide(): void {
    this.element.hidden = true;
    this.element.replaceChildren();
  }

  setQuality(level: QualityLevel): void {
    this.quality = level;
  }

  showReady(): void {
    const panel = this.open('Lazi Trail', 'Run the streets. Reach the stadium.');
    panel.append(
      this.controlsHint(),
      this.actions(
        button('Play', this.handlers.onStart),
        button('Settings', () => this.showSettings(() => this.showReady()), true),
      ),
      creditLink(),
    );
    this.focusPrimary();
  }

  showPaused(): void {
    const panel = this.open('Paused');
    panel.append(
      this.actions(
        button('Resume', this.handlers.onResume),
        button('Restart', this.handlers.onRestart, true),
      ),
    );
    this.focusPrimary();
  }

  showGameOver(summary: RunSummary): void {
    const panel = this.open('Game Over');
    if (summary.newRecord) panel.append(el('p', 'record', 'New record!'));
    const stats = el('dl', 'summary');
    const rows: Array<[string, string]> = [
      ['Score', summary.score.toLocaleString()],
      ['Best', summary.best.toLocaleString()],
      ['Distance', `${summary.distance} m`],
      ['Rand', String(summary.coins)],
      ['Zone', summary.zone],
    ];
    for (const [label, value] of rows) {
      const row = el('div', 'summary-row');
      row.append(el('dt', undefined, label), el('dd', undefined, value));
      stats.append(row);
    }
    panel.append(stats, this.actions(button('Play again', this.handlers.onRestart)), creditLink());
    this.focusPrimary();
  }

  /** Graphics quality picker (Phase 4 grows this into the full Settings screen). */
  showSettings(onBack: () => void): void {
    const panel = this.open('Settings');
    const group = el('div', 'radio-group');
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', 'Graphics quality');
    for (const level of QUALITY_LEVELS) {
      const profile = QUALITY_PROFILES[level];
      const option = el('button', 'radio');
      option.type = 'button';
      option.setAttribute('role', 'radio');
      option.setAttribute('aria-checked', String(level === this.quality));
      option.append(
        el('strong', undefined, profile.label),
        el('span', undefined, profile.description),
      );
      option.addEventListener('click', () => {
        this.quality = level;
        for (const b of group.querySelectorAll('.radio')) b.setAttribute('aria-checked', 'false');
        option.setAttribute('aria-checked', 'true');
        this.handlers.onQuality(level);
      });
      group.append(option);
    }
    panel.append(
      el('h2', 'section', 'Graphics quality'),
      group,
      this.actions(button('Back', onBack)),
    );
    group.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
  }

  private open(title: string, subtitle?: string): HTMLElement {
    this.element.replaceChildren();
    this.element.hidden = false;
    const panel = el('div', 'panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', title);
    panel.append(el('h1', 'title', title));
    if (subtitle) panel.append(el('p', 'subtitle', subtitle));
    this.element.append(panel);
    return panel;
  }

  private actions(...buttons: HTMLButtonElement[]): HTMLElement {
    const row = el('div', 'actions');
    row.append(...buttons);
    return row;
  }

  private controlsHint(): HTMLElement {
    const hint = el('ul', 'controls');
    for (const line of [
      'Arrows / A D  -  change lane',
      'Up / W / Space  -  jump',
      'Down / S  -  slide (or fast-fall)',
      'On a phone: swipe',
    ]) {
      hint.append(el('li', undefined, line));
    }
    return hint;
  }

  private focusPrimary(): void {
    this.element.querySelector<HTMLButtonElement>('.btn')?.focus();
  }
}
