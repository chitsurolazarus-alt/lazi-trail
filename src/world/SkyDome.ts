import * as THREE from 'three';

const VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * p;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform sampler2D tA;
  uniform sampler2D tB;
  uniform float uMix;
  uniform float uUseTex;
  uniform float uRotation;
  uniform float uBrightness;
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  varying vec3 vDir;

  const float PI = 3.14159265359;

  vec2 dirToUv(vec3 d) {
    float a = atan(d.z, d.x) + uRotation;
    return vec2(a / (2.0 * PI) + 0.5, asin(clamp(d.y, -1.0, 1.0)) / PI + 0.5);
  }

  void main() {
    vec3 d = normalize(vDir);
    vec3 col;
    if (uUseTex > 0.5) {
      vec2 uv = dirToUv(d);
      col = mix(texture2D(tA, uv).rgb, texture2D(tB, uv).rgb, uMix) * uBrightness;
    } else {
      float h = clamp(d.y, 0.0, 1.0);
      col = mix(uHorizon, uZenith, pow(h, 0.55));
    }
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * Big inverted sphere that follows the camera. With HDRI textures it crossfades two skies
 * (zone transitions); without them (Low quality) it draws a simple horizon→zenith gradient.
 */
export class SkyDome {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;
  private readonly fallback = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);

  constructor() {
    this.fallback.needsUpdate = true;
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      uniforms: {
        tA: { value: this.fallback },
        tB: { value: this.fallback },
        uMix: { value: 0 },
        uUseTex: { value: 0 },
        uRotation: { value: 0 },
        uBrightness: { value: 1 },
        uZenith: { value: new THREE.Color(0x4a90d9) },
        uHorizon: { value: new THREE.Color(0xd7e6f0) },
      },
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), this.material);
    this.mesh.renderOrder = -1000;
    this.mesh.frustumCulled = false;
  }

  setTextures(a: THREE.Texture | null, b: THREE.Texture | null, mix: number): void {
    const u = this.material.uniforms;
    if (a && b) {
      (u.tA as THREE.IUniform).value = a;
      (u.tB as THREE.IUniform).value = b;
      (u.uMix as THREE.IUniform).value = mix;
      (u.uUseTex as THREE.IUniform).value = 1;
    } else {
      (u.uUseTex as THREE.IUniform).value = 0;
    }
  }

  setGradient(zenith: number, horizon: number): void {
    (this.material.uniforms.uZenith as THREE.IUniform<THREE.Color>).value.set(zenith);
    (this.material.uniforms.uHorizon as THREE.IUniform<THREE.Color>).value.set(horizon);
  }

  setRotation(radians: number): void {
    (this.material.uniforms.uRotation as THREE.IUniform).value = radians;
  }

  setBrightness(v: number): void {
    (this.material.uniforms.uBrightness as THREE.IUniform).value = v;
  }

  followCamera(camera: THREE.Camera): void {
    this.mesh.position.copy(camera.position);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.fallback.dispose();
  }
}
