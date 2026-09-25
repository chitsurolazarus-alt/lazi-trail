/** Tunables for the automatic resolution scaler. */
export const ADAPTIVE = {
  /** Never render below this fraction of the normal resolution. */
  minScale: 0.6,
  /** Scale change per adjustment. */
  step: 0.1,
  /** Average frame time (ms) above which resolution is lowered (about 40 fps). */
  slowMs: 25,
  /** Average frame time (ms) below which resolution may be raised again (about 55 fps). */
  fastMs: 18,
  /** Seconds of frames averaged before deciding. */
  window: 1.5,
  /** Seconds to wait after a change so the new cost settles before judging it. */
  cooldown: 2.5,
} as const;

/**
 * Keeps the game smooth on slow devices by trading resolution for frame rate. It watches the
 * average frame time and, with hysteresis, lowers the render scale in small steps when frames
 * are slow and raises it again when there is plenty of headroom. Pure logic: `update` returns the
 * new scale only when it changes.
 */
export class AdaptiveScale {
  private scale = 1;
  private elapsed = 0;
  private frames = 0;
  private cooldown: number = ADAPTIVE.cooldown;

  get current(): number {
    return this.scale;
  }

  /** Forget history (a menu or a pause hides the true cost of gameplay). */
  reset(): void {
    this.elapsed = 0;
    this.frames = 0;
    this.cooldown = ADAPTIVE.cooldown;
  }

  /** Feed one frame's duration in seconds. Returns the new scale if it changed, else null. */
  update(dt: number): number | null {
    if (this.cooldown > 0) {
      this.cooldown -= dt;
      return null;
    }
    this.elapsed += dt;
    this.frames++;
    if (this.elapsed < ADAPTIVE.window) return null;
    const avgMs = (this.elapsed / this.frames) * 1000;
    this.elapsed = 0;
    this.frames = 0;

    let next = this.scale;
    if (avgMs > ADAPTIVE.slowMs) next = Math.max(ADAPTIVE.minScale, this.scale - ADAPTIVE.step);
    else if (avgMs < ADAPTIVE.fastMs) next = Math.min(1, this.scale + ADAPTIVE.step);
    next = Math.round(next * 100) / 100;
    if (next === this.scale) return null;
    this.scale = next;
    this.cooldown = ADAPTIVE.cooldown;
    return next;
  }
}
