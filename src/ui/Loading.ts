/** Full-screen loading overlay with a progress bar. */
export class LoadingScreen {
  readonly element = document.createElement('div');
  private readonly bar = document.createElement('div');
  private readonly label = document.createElement('p');
  private readonly track = document.createElement('div');

  constructor() {
    this.element.className = 'loading';
    const title = document.createElement('h1');
    title.className = 'title';
    title.textContent = 'Lazi Trail';

    this.track.className = 'loading-track';
    this.track.setAttribute('role', 'progressbar');
    this.track.setAttribute('aria-label', 'Loading');
    this.track.setAttribute('aria-valuemin', '0');
    this.track.setAttribute('aria-valuemax', '100');
    this.bar.className = 'loading-bar';
    this.track.append(this.bar);

    this.label.className = 'loading-label';
    this.element.append(title, this.track, this.label);
    this.set(0, 'Warming up');
  }

  set(fraction: number, label: string): void {
    const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
    this.bar.style.width = `${pct}%`;
    this.track.setAttribute('aria-valuenow', String(pct));
    this.label.textContent = `${label}…`;
  }

  show(): void {
    this.element.hidden = false;
    this.element.classList.remove('loading-out');
  }

  /** Fade out, then hide. */
  hide(): void {
    this.element.classList.add('loading-out');
    window.setTimeout(() => {
      this.element.hidden = true;
    }, 400);
  }
}
