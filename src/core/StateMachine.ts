export class StateMachine<S extends string> {
  private state: S;
  private listeners: Array<(to: S, from: S) => void> = [];

  constructor(
    initial: S,
    private readonly transitions: Readonly<Record<S, readonly S[]>>,
  ) {
    this.state = initial;
  }

  get current(): S {
    return this.state;
  }

  is(...states: S[]): boolean {
    return states.includes(this.state);
  }

  can(to: S): boolean {
    return this.transitions[this.state].includes(to);
  }

  /** Move to `to` if the transition is allowed. Returns whether it happened. */
  transition(to: S): boolean {
    if (!this.can(to)) return false;
    const from = this.state;
    this.state = to;
    for (const listener of this.listeners) listener(to, from);
    return true;
  }

  onChange(listener: (to: S, from: S) => void): void {
    this.listeners.push(listener);
  }
}
