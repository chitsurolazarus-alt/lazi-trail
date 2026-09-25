import type * as THREE from 'three';

/** Tiny dev overlay: frames per second, draw calls and triangles. Only shown in dev / `?debug`. */
export class FpsCounter {
  readonly element = document.createElement('div');
  private frames = 0;
  private elapsed = 0;

  constructor() {
    this.element.className = 'fps-counter';
    this.element.setAttribute('aria-hidden', 'true');
    this.element.textContent = 'FPS …';
  }

  static enabled(): boolean {
    return import.meta.env.DEV || new URLSearchParams(location.search).has('debug');
  }

  tick(dt: number, info: THREE.WebGLInfo, extra = ''): void {
    this.frames++;
    this.elapsed += dt;
    if (this.elapsed < 0.5) return;
    const fps = Math.round(this.frames / this.elapsed);
    this.element.textContent = `${fps} FPS · ${info.render.calls} calls · ${(info.render.triangles / 1000).toFixed(0)}k tris${extra ? ` · ${extra}` : ''}`;
    this.frames = 0;
    this.elapsed = 0;
  }
}
