/** Graphics quality tiers. Everything a tier changes lives in its profile so it is easy to tune. */

export type QualityLevel = 'low' | 'medium' | 'high';
export const QUALITY_LEVELS: readonly QualityLevel[] = ['low', 'medium', 'high'];

export type ShadowMode =
  /** No shadows at all. */
  | 'none'
  /** Cheap fake blob shadow under characters (no shadow map). */
  | 'blob'
  /** Real, soft shadow map that follows the player. */
  | 'map';

export type AntiAliasing = 'none' | 'fxaa' | 'smaa';

export interface QualityProfile {
  readonly level: QualityLevel;
  readonly label: string;
  readonly description: string;
  /** Use the Phase 1 primitive models for the world and characters. */
  readonly primitives: boolean;
  /** PBR textured materials + HDRI image-based lighting. */
  readonly pbr: boolean;
  readonly shadows: ShadowMode;
  readonly shadowMapSize: number;
  readonly postprocessing: boolean;
  readonly bloom: boolean;
  readonly antiAliasing: AntiAliasing;
  /** Vignette + speed lines/blur at high speed. */
  readonly speedEffects: boolean;
  /** Cap on the device pixel ratio (never above 2). */
  readonly maxPixelRatio: number;
  /** Max simultaneous walking pedestrians. */
  readonly pedestrians: number;
  readonly pigeons: number;
  /** Ambient particles (dust, leaves) and footstep dust puffs. */
  readonly particles: number;
  /** Scrolling cloud shadows over the street. */
  readonly cloudShadows: boolean;
  /** Extra props per chunk (multiplier). */
  readonly propDensity: number;
}

export const QUALITY_PROFILES: Readonly<Record<QualityLevel, QualityProfile>> = {
  low: {
    level: 'low',
    label: 'Low',
    description: 'Simple shapes, no shadows or effects. Best for older phones.',
    primitives: true,
    pbr: false,
    shadows: 'none',
    shadowMapSize: 0,
    postprocessing: false,
    bloom: false,
    antiAliasing: 'none',
    speedEffects: false,
    maxPixelRatio: 1.5,
    pedestrians: 0,
    pigeons: 0,
    particles: 0,
    cloudShadows: false,
    propDensity: 0.5,
  },
  medium: {
    level: 'medium',
    label: 'Medium',
    description:
      'Realistic materials and lighting, blob shadows, light effects. Recommended for phones.',
    primitives: false,
    pbr: true,
    shadows: 'blob',
    shadowMapSize: 0,
    postprocessing: true,
    bloom: false,
    antiAliasing: 'fxaa',
    speedEffects: true,
    maxPixelRatio: 1.5,
    pedestrians: 3,
    pigeons: 4,
    particles: 40,
    cloudShadows: false,
    propDensity: 0.8,
  },
  high: {
    level: 'high',
    label: 'High',
    description:
      'Soft shadows, bloom, smooth edges and a busier street. For desktops and new phones.',
    primitives: false,
    pbr: true,
    shadows: 'map',
    shadowMapSize: 2048,
    postprocessing: true,
    bloom: true,
    antiAliasing: 'smaa',
    speedEffects: true,
    maxPixelRatio: 2,
    pedestrians: 8,
    pigeons: 8,
    particles: 120,
    cloudShadows: true,
    propDensity: 1,
  },
};

export interface DeviceHints {
  /** `matchMedia('(pointer: coarse)')` */
  coarsePointer: boolean;
  maxTouchPoints: number;
  /** `navigator.deviceMemory` (GB), when available. */
  deviceMemory?: number;
  hardwareConcurrency?: number;
  userAgent: string;
}

/** Pick a first-run quality: phones/tablets get Medium, very weak devices Low, everything else High. */
export function detectQuality(hints: DeviceHints): QualityLevel {
  const mobile =
    hints.coarsePointer ||
    hints.maxTouchPoints > 1 ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(hints.userAgent);
  const weak =
    (hints.deviceMemory !== undefined && hints.deviceMemory <= 2) ||
    (hints.hardwareConcurrency !== undefined && hints.hardwareConcurrency <= 2);
  if (weak) return 'low';
  return mobile ? 'medium' : 'high';
}

export function readDeviceHints(): DeviceHints {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    coarsePointer: typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches,
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    deviceMemory: nav.deviceMemory,
    hardwareConcurrency: nav.hardwareConcurrency,
    userAgent: nav.userAgent ?? '',
  };
}
