export type InputAction = 'left' | 'right' | 'jump' | 'slide' | 'pause' | 'confirm';

const KEY_MAP: Readonly<Record<string, InputAction>> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'jump',
  KeyW: 'jump',
  ArrowDown: 'slide',
  KeyS: 'slide',
  Space: 'confirm',
  Enter: 'confirm',
  Escape: 'pause',
  KeyP: 'pause',
};

/** Minimum finger travel (px) before a drag counts as a swipe. */
const SWIPE_THRESHOLD = 28;

/** Keyboard + swipe input, reported as discrete actions. */
export class Input {
  private listeners = new Set<(action: InputAction) => void>();
  private pointerId: number | null = null;
  private startX = 0;
  private startY = 0;

  constructor(private readonly target: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('pointerdown', this.onPointerDown);
    target.addEventListener('pointermove', this.onPointerMove);
    target.addEventListener('pointerup', this.onPointerEnd);
    target.addEventListener('pointercancel', this.onPointerEnd);
  }

  onAction(listener: (action: InputAction) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('pointerdown', this.onPointerDown);
    this.target.removeEventListener('pointermove', this.onPointerMove);
    this.target.removeEventListener('pointerup', this.onPointerEnd);
    this.target.removeEventListener('pointercancel', this.onPointerEnd);
    this.listeners.clear();
  }

  private emit(action: InputAction): void {
    for (const listener of this.listeners) listener(action);
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    const action = KEY_MAP[event.code];
    if (!action || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    const active = document.activeElement;
    // Typing in a text field or nudging a slider must not steer the runner.
    if (
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement ||
      active instanceof HTMLSelectElement
    ) {
      return;
    }
    const onButton = active instanceof HTMLButtonElement || active instanceof HTMLAnchorElement;
    // Let a focused button/link handle Space/Enter natively so it doesn't fire twice.
    if (action === 'confirm' && onButton) return;
    event.preventDefault();
    this.emit(action);
  };

  private onPointerDown = (event: PointerEvent): void => {
    // Menus scroll and click normally; only the bare game view counts as a swipe pad.
    if ((event.target as HTMLElement).closest('button, a, input, .screens')) return;
    this.pointerId = event.pointerId;
    this.startX = event.clientX;
    this.startY = event.clientY;
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    const dx = event.clientX - this.startX;
    const dy = event.clientY - this.startY;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD) return;
    if (Math.abs(dx) > Math.abs(dy)) this.emit(dx < 0 ? 'left' : 'right');
    else this.emit(dy < 0 ? 'jump' : 'slide');
    // Re-anchor so one long drag can chain several swipes.
    this.startX = event.clientX;
    this.startY = event.clientY;
  };

  private onPointerEnd = (event: PointerEvent): void => {
    if (event.pointerId === this.pointerId) this.pointerId = null;
  };
}
