import { CREDIT } from '../config/gameConfig';

export interface RunSummary {
  score: number;
  distance: number;
  coins: number;
  zone: string;
}

export interface ScreenHandlers {
  onStart: () => void;
  onResume: () => void;
  onRestart: () => void;
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

/** Minimal full-screen overlays: ready, paused, game over. (Full menu system arrives in Phase 3.) */
export class Screens {
  readonly element = el('div', 'screens');

  constructor(private readonly handlers: ScreenHandlers) {
    this.element.hidden = true;
  }

  hide(): void {
    this.element.hidden = true;
    this.element.replaceChildren();
  }

  showReady(): void {
    const panel = this.open('Lazi Trail', 'Run the streets. Reach the stadium.');
    panel.append(
      this.controlsHint(),
      this.actions(button('Play', this.handlers.onStart)),
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
    const stats = el('dl', 'summary');
    const rows: Array<[string, string]> = [
      ['Score', summary.score.toLocaleString()],
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
