import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/**
 * One cheap full-screen pass: a light vignette always, and — as the runner speeds up — a soft
 * radial blur plus streaking speed lines around the edges of the screen.
 */
const SpeedFxShader = {
  name: 'SpeedFxShader',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uSpeed: { value: 0 },
    uTime: { value: 0 },
    uVignette: { value: 0.32 },
    uLines: { value: 1 },
    uAspect: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uSpeed;
    uniform float uTime;
    uniform float uVignette;
    uniform float uLines;
    uniform float uAspect;
    varying vec2 vUv;

    float hash(float n) { return fract(sin(n * 91.3458) * 47453.5453); }

    void main() {
      vec2 c = vUv - 0.5;
      vec2 cc = vec2(c.x * uAspect, c.y);
      float r = length(cc);
      float angle = atan(cc.y, cc.x);

      // Radial blur toward the centre, stronger at the edges and at speed.
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      float blur = uSpeed * smoothstep(0.2, 0.75, r) * 0.05;
      if (blur > 0.0005) {
        vec3 acc = col;
        for (int i = 1; i <= 4; i++) {
          acc += texture2D(tDiffuse, vUv - c * blur * float(i)).rgb;
        }
        col = acc / 5.0;
      }

      // Speed lines: thin streaks around the edge, flickering with time.
      if (uLines > 0.5 && uSpeed > 0.05) {
        float slot = floor(angle * 26.0);
        float cell = hash(slot + floor(uTime * 14.0));
        float width = 0.10 + 0.5 * hash(slot * 1.7);
        float streak = smoothstep(0.5 - width, 0.5, fract(angle * 26.0))
                     * (1.0 - smoothstep(0.5, 0.5 + width, fract(angle * 26.0)));
        float mask = smoothstep(0.42, 0.78, r) * step(0.55, cell);
        col += vec3(1.0) * streak * mask * uSpeed * 0.16;
      }

      // Vignette
      float v = smoothstep(0.35, 0.95, r);
      col *= 1.0 - v * uVignette * (0.8 + uSpeed * 0.6);

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class SpeedFxPass extends ShaderPass {
  constructor(speedLines: boolean) {
    super(SpeedFxShader);
    this.uniforms.uLines.value = speedLines ? 1 : 0;
  }

  setSpeed(norm: number): void {
    this.uniforms.uSpeed.value = norm;
  }

  tick(time: number, aspect: number): void {
    this.uniforms.uTime.value = time;
    this.uniforms.uAspect.value = aspect;
  }
}
