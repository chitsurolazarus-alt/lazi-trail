/** Generic free-list pool: `acquire` reuses a released object before creating a new one. */
export class ObjectPool<T> {
  private readonly free: T[] = [];

  constructor(
    private readonly create: () => T,
    private readonly reset?: (item: T) => void,
    prewarm = 0,
  ) {
    for (let i = 0; i < prewarm; i++) this.free.push(create());
  }

  acquire(): T {
    return this.free.pop() ?? this.create();
  }

  release(item: T): void {
    this.reset?.(item);
    this.free.push(item);
  }

  get available(): number {
    return this.free.length;
  }

  /** Drop all pooled items, handing each to `dispose` first. */
  clear(dispose?: (item: T) => void): void {
    if (dispose) for (const item of this.free) dispose(item);
    this.free.length = 0;
  }
}
