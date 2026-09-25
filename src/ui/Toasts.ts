import { el, icon, type IconName } from './dom';

export interface ToastSpec {
  title: string;
  text?: string;
  icon?: IconName;
  kind?: 'achievement' | 'level' | 'unlock' | 'mission' | 'info';
}

const MAX_VISIBLE = 3;
const LIFETIME_MS = 4200;

/** Pop-up notices (achievements, level-ups, unlocks). New ones queue behind the visible three. */
export class Toasts {
  readonly element = el('div', 'toasts');
  private queue: ToastSpec[] = [];
  private visible = 0;

  constructor() {
    this.element.setAttribute('role', 'status');
    this.element.setAttribute('aria-live', 'polite');
  }

  show(spec: ToastSpec): void {
    this.queue.push(spec);
    this.pump();
  }

  private pump(): void {
    while (this.visible < MAX_VISIBLE && this.queue.length > 0) {
      const spec = this.queue.shift() as ToastSpec;
      this.visible++;
      const node = el('div', `toast toast-${spec.kind ?? 'info'}`);
      if (spec.icon) node.append(icon(spec.icon));
      const body = el('div', 'toast-body');
      body.append(el('strong', undefined, spec.title));
      if (spec.text) body.append(el('span', undefined, spec.text));
      node.append(body);
      this.element.append(node);
      window.setTimeout(() => {
        node.classList.add('toast-out');
        window.setTimeout(() => {
          node.remove();
          this.visible--;
          this.pump();
        }, 350);
      }, LIFETIME_MS);
    }
  }

  clear(): void {
    this.queue = [];
    this.element.replaceChildren();
    this.visible = 0;
  }
}
