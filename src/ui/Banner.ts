/** Big centred announcement (zone changes). One at a time; a new one replaces the old. */
export class Banner {
  readonly element = document.createElement('div');
  private timer = 0;

  constructor() {
    this.element.className = 'banner';
    // Announced politely to screen readers without stealing focus.
    this.element.setAttribute('role', 'status');
    this.element.setAttribute('aria-live', 'polite');
  }

  show(text: string, seconds = 2.8): void {
    window.clearTimeout(this.timer);
    this.element.textContent = text;
    // Restart the CSS animation.
    this.element.classList.remove('banner-show');
    void this.element.offsetWidth;
    this.element.classList.add('banner-show');
    this.timer = window.setTimeout(() => this.hide(), seconds * 1000);
  }

  hide(): void {
    window.clearTimeout(this.timer);
    this.element.classList.remove('banner-show');
    this.element.textContent = '';
  }
}
