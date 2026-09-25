import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLORS } from '../config/colors';
import type { ObstacleKind } from '../config/gameConfig';

/**
 * Placeholder low-poly models made from primitives. Each model is merged into ONE geometry with
 * baked vertex colours, so an obstacle costs a single draw call and shares a single material.
 * Swap these builders for glTF loaders later without touching the pools.
 */

function paint(geo: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const color = new THREE.Color(hex);
  const count = geo.getAttribute('position').count;
  const data = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    data[i * 3] = color.r;
    data[i * 3 + 1] = color.g;
    data[i * 3 + 2] = color.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(data, 3));
  return geo;
}

export function box(
  w: number,
  h: number,
  d: number,
  color: number,
  x = 0,
  y = 0,
  z = 0,
): THREE.BufferGeometry {
  return paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color);
}

/** Cylinder lying along the x axis (wheels). */
export function wheel(
  radius: number,
  width: number,
  color: number,
  x: number,
  y: number,
  z: number,
): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(radius, radius, width, 10);
  geo.rotateZ(Math.PI / 2).translate(x, y, z);
  return paint(geo, color);
}

export function ball(
  radius: number,
  color: number,
  x: number,
  y: number,
  z: number,
): THREE.BufferGeometry {
  return paint(new THREE.SphereGeometry(radius, 12, 10).translate(x, y, z), color);
}

export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error('Failed to merge geometries');
  return merged;
}

/** Shared material for every vertex-coloured model. */
export function createModelMaterial(): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ vertexColors: true });
}

/* ------------------------------------------------------------------ obstacles */

function stall(): THREE.BufferGeometry {
  const parts = [
    box(1.8, 0.9, 1.3, COLORS.wood, 0, 0.45, 0.05),
    box(0.45, 0.3, 0.45, COLORS.red, -0.55, 1.05, 0),
    box(0.45, 0.3, 0.45, COLORS.orange, 0, 1.05, 0.1),
    box(0.45, 0.3, 0.45, COLORS.green, 0.55, 1.05, -0.05),
    box(0.3, 0.25, 0.3, COLORS.yellow, -0.2, 1.3, 0.2),
    box(1.6, 0.4, 0.06, COLORS.deepBlue, 0, 2.3, -0.68),
    box(1.2, 0.18, 0.02, COLORS.offWhite, 0, 2.3, -0.72),
  ];
  for (const x of [-0.85, 0.85]) {
    for (const z of [-0.65, 0.65]) parts.push(box(0.1, 2.6, 0.1, COLORS.metal, x, 1.3, z));
  }
  // Striped canopy
  for (let i = 0; i < 5; i++) {
    parts.push(
      box(
        0.36,
        0.14,
        1.6,
        i % 2 === 0 ? COLORS.orange : COLORS.offWhite,
        -0.72 + i * 0.36,
        2.85,
        0,
      ),
    );
  }
  return merge(parts);
}

function cart(): THREE.BufferGeometry {
  const parts = [
    box(1.3, 0.4, 1.2, COLORS.darkWood, 0, 0.6, 0),
    box(1.3, 0.12, 0.08, COLORS.wood, 0, 0.86, -0.6),
    box(1.3, 0.12, 0.08, COLORS.wood, 0, 0.86, 0.6),
    box(0.5, 0.15, 0.5, COLORS.red, -0.3, 0.88, -0.2),
    box(0.5, 0.15, 0.5, COLORS.yellow, 0.3, 0.88, -0.2),
    box(0.5, 0.15, 0.4, COLORS.green, 0, 0.88, 0.25),
    box(0.1, 0.1, 0.6, COLORS.wood, -0.45, 0.62, 0.9),
    box(0.1, 0.1, 0.6, COLORS.wood, 0.45, 0.62, 0.9),
    wheel(0.3, 0.1, COLORS.tyre, -0.7, 0.3, 0.1),
    wheel(0.3, 0.1, COLORS.tyre, 0.7, 0.3, 0.1),
  ];
  return merge(parts);
}

function awning(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const x of [-0.9, 0.9]) {
    for (const z of [-0.7, 0.7]) parts.push(box(0.1, 1.7, 0.1, COLORS.metal, x, 0.85, z));
  }
  for (let i = 0; i < 5; i++) {
    const color = i % 2 === 0 ? COLORS.orange : COLORS.offWhite;
    parts.push(box(0.38, 0.12, 1.8, color, -0.76 + i * 0.38, 1.78, 0));
    parts.push(box(0.38, 0.28, 0.05, color, -0.76 + i * 0.38, 1.6, -0.9));
  }
  // Fruit on the ground under the awning (kept low so a slide clears it)
  parts.push(box(0.5, 0.18, 0.5, COLORS.crate, -0.6, 0.09, 0));
  parts.push(box(0.5, 0.18, 0.5, COLORS.crate, 0.6, 0.09, 0));
  return merge(parts);
}

function taxi(): THREE.BufferGeometry {
  const parts = [
    box(2.0, 0.9, 5.4, COLORS.white, 0, 0.85, 0),
    box(1.94, 0.95, 4.6, COLORS.white, 0, 1.75, 0.2),
    box(2.02, 0.28, 5.42, COLORS.deepBlue, 0, 0.55, 0),
    box(2.02, 0.22, 5.42, COLORS.orange, 0, 0.95, 0),
    box(2.0, 0.5, 4.2, COLORS.glass, 0, 1.8, 0.2),
    box(1.8, 0.55, 0.05, COLORS.glass, 0, 1.78, -2.1),
    box(1.9, 0.1, 4.5, COLORS.white, 0, 2.27, 0.2),
    box(0.7, 0.2, 0.3, COLORS.yellow, 0, 2.4, -1.2),
    box(0.3, 0.2, 0.06, COLORS.yellow, -0.6, 0.9, -2.72),
    box(0.3, 0.2, 0.06, COLORS.yellow, 0.6, 0.9, -2.72),
    box(2.05, 0.2, 0.15, COLORS.tyre, 0, 0.5, -2.72),
  ];
  for (const z of [-1.0, 0.4, 1.8]) parts.push(box(2.03, 0.55, 0.12, COLORS.white, 0, 1.8, z));
  for (const x of [-0.95, 0.95]) {
    for (const z of [-1.7, 1.7]) parts.push(wheel(0.38, 0.25, COLORS.tyre, x, 0.38, z));
  }
  return merge(parts);
}

/** Sloped slab rising toward -Z, used for ramps (far end on the ground, near end at `height`). */
function rampSlab(
  width: number,
  height: number,
  length: number,
  zEnd: number,
  color: number,
): THREE.BufferGeometry {
  const slope = Math.hypot(length, height);
  const geo = new THREE.BoxGeometry(width, 0.16, slope);
  geo.rotateX(Math.atan2(height, length));
  geo.translate(0, height / 2, zEnd + length / 2);
  return paint(geo, color);
}

function barrier(): THREE.BufferGeometry {
  const parts = [
    box(0.12, 0.9, 0.5, COLORS.metal, -0.8, 0.45, 0),
    box(0.12, 0.9, 0.5, COLORS.metal, 0.8, 0.45, 0),
  ];
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 8; j++) {
      parts.push(
        box(
          0.23,
          0.3,
          0.1,
          j % 2 === 0 ? COLORS.orange : COLORS.white,
          -0.8 + j * 0.23 + 0.1,
          0.55 + i * 0.32,
          0.03,
        ),
      );
    }
  }
  return merge(parts);
}

function taxiRamp(): THREE.BufferGeometry {
  return merge([taxi(), rampSlab(1.9, 2.4, 8, 2.75, COLORS.darkWood)]);
}

function trainBody(withRamp: boolean): THREE.BufferGeometry {
  const parts = [
    box(2.3, 3.0, 20, 0xd7dade, 0, 1.9, 0),
    box(2.34, 0.5, 20.02, COLORS.deepBlue, 0, 0.95, 0),
    box(2.36, 0.2, 20.04, COLORS.orange, 0, 1.4, 0),
    box(2.1, 0.2, 20, 0xb9bec5, 0, 3.5, 0),
    box(2.0, 0.5, 20, COLORS.tyre, 0, 0.3, 0),
  ];
  for (let i = -4; i <= 4; i++) parts.push(box(2.38, 0.8, 1.4, COLORS.glass, 0, 2.5, i * 2.1));
  if (withRamp) parts.push(rampSlab(2.0, 3.6, 12, 10, COLORS.darkWood));
  return merge(parts);
}

const OBSTACLE_BUILDERS: Readonly<Record<ObstacleKind, () => THREE.BufferGeometry>> = {
  stall,
  cart,
  awning,
  barrier,
  taxi,
  taxiRamp,
  taxiMoving: taxi,
  trainParked: () => trainBody(true),
  trainMoving: () => trainBody(false),
};

export function buildObstacleGeometry(kind: ObstacleKind): THREE.BufferGeometry {
  return OBSTACLE_BUILDERS[kind]();
}

/* ----------------------------------------------------------------------- Lazi */

export interface LaziGeometries {
  body: THREE.BufferGeometry;
  /** Limbs are modelled hanging down from their pivot at the origin. */
  leg: THREE.BufferGeometry;
  arm: THREE.BufferGeometry;
}

export function buildLaziGeometries(): LaziGeometries {
  const body = merge([
    box(0.58, 0.62, 0.32, COLORS.orange, 0, 1.06, 0), // shirt
    box(0.3, 0.3, 0.02, COLORS.white, 0, 1.08, 0.17), // race bib on the back
    box(0.6, 0.28, 0.34, COLORS.deepBlue, 0, 0.72, 0), // shorts
    ball(0.21, COLORS.skin, 0, 1.52, 0), // head
    box(0.36, 0.12, 0.36, COLORS.hair, 0, 1.66, 0.02), // hair
    box(0.4, 0.06, 0.4, COLORS.orange, 0, 1.56, 0), // headband
  ]);
  const leg = merge([
    box(0.18, 0.7, 0.2, COLORS.skin, 0, -0.35, 0),
    box(0.22, 0.12, 0.34, COLORS.orange, 0, -0.68, -0.05), // running spikes
  ]);
  const arm = merge([box(0.14, 0.56, 0.14, COLORS.skin, 0, -0.26, 0)]);
  return { body, leg, arm };
}

/* ---------------------------------------------------------------------- coins */

function coinFaceTexture(fill: number, rim: number, mark: string): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const css = (hex: number): string => `#${hex.toString(16).padStart(6, '0')}`;
    ctx.fillStyle = css(rim);
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = css(fill);
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = css(rim);
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 20, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = css(rim);
    ctx.font = 'bold 70px "Trebuchet MS", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(mark, size / 2, size / 2 + 4);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export interface CoinAssets {
  geometry: THREE.CylinderGeometry;
  materials: Record<'gold' | 'silver', THREE.Material[]>;
  dispose(): void;
}

/** Coin cylinder facing the camera, with a Rand "R" stamped on both faces. */
export function createCoinAssets(): CoinAssets {
  const geometry = new THREE.CylinderGeometry(0.42, 0.42, 0.1, 20);
  geometry.rotateX(Math.PI / 2);

  const textures: THREE.Texture[] = [];
  const make = (fill: number, rim: number): THREE.Material[] => {
    const face = coinFaceTexture(fill, rim, 'R');
    textures.push(face);
    return [
      new THREE.MeshBasicMaterial({ color: rim }),
      new THREE.MeshBasicMaterial({ map: face }),
      new THREE.MeshBasicMaterial({ map: face }),
    ];
  };
  const materials = {
    gold: make(COLORS.coinGold, COLORS.coinGoldRim),
    silver: make(COLORS.coinSilver, COLORS.coinSilverRim),
  };

  return {
    geometry,
    materials,
    dispose() {
      geometry.dispose();
      for (const set of Object.values(materials)) for (const m of set) m.dispose();
      for (const t of textures) t.dispose();
    },
  };
}
