import type { InputAction } from '../core/Input';
import { el } from './dom';

interface Step {
  /** Actions that complete this step. */
  actions: InputAction[];
  touch: string;
  keys: string;
}

const STEPS: Step[] = [
  {
    actions: ['left', 'right'],
    touch: 'Swipe left or right to change lane',
    keys: 'Press A / D or the arrow keys to change lane',
  },
  { actions: ['jump'], touch: 'Swipe up to jump', keys: 'Press W, Up or Space to jump' },
  { actions: ['slide'], touch: 'Swipe down to slide', keys: 'Press S or Down to slide' },
];

/** How long a hint waits for the player before moving on anyway (seconds). */
const HINT_TIMEOUT = 10;
const FINISH_HOLD = 2.2;

/**
 * First-run coaching: three short hints (lane, jump, slide) shown over the first seconds of the
 * first run, each finishing when the player does it. Calls `onDone` once all are done, and the
 * caller records that so it never shows again.
 */
export class Tutorial {
  readonly element = el('div', 'tutorial');
  private step = -1;
  private timer = 0;
  private finishing = false;
  private active = false;
  private readonly touch =
    typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

  constructor(private readonly onDone: () => void) {
    this.element.hidden = true;
    this.element.setAttribute('role', 'status');
    this.element.setAttribute('aria-live', 'polite');
  }

  get running(): boolean {
    return this.active;
  }

  start(): void {
    this.active = true;
    this.finishing = false;
    this.step = -1;
    this.timer = 2.5; // let the run get going before the first hint
    this.element.hidden = true;
  }

  /** Stop without finishing (the run ended early). */
  stop(): void {
    this.active = false;
    this.element.hidden = true;
  }

  action(action: InputAction): void {
    if (!this.active || this.finishing || this.step < 0) return;
    if (STEPS[this.step]?.actions.includes(action)) this.next();
  }

  update(dt: number): void {
    if (!this.active) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    if (this.finishing) {
      this.active = false;
      this.element.hidden = true;
      this.onDone();
    } else if (this.step < 0) this.next();
    else this.next(); // timed out waiting: move on
  }

  private next(): void {
    this.step++;
    const step = STEPS[this.step];
    if (!step) {
      this.finishing = true;
      this.timer = FINISH_HOLD;
      this.show('Nice! Now run to the stadium.', true);
      return;
    }
    this.timer = HINT_TIMEOUT;
    this.show(this.touch ? step.touch : step.keys, false);
  }

  private show(text: string, done: boolean): void {
    this.element.hidden = false;
    this.element.textContent = text;
    this.element.classList.toggle('tutorial-done', done);
    this.element.classList.remove('tutorial-in');
    void this.element.offsetWidth;
    this.element.classList.add('tutorial-in');
  }
}
