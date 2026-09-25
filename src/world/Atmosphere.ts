import { ZONES, zoneBlendAt, type ZoneDef } from '../config/zones';
import type { HdriKey } from '../core/AssetLoader';
import { lerp } from '../core/math';

/** Everything about the look of the air/lighting at one moment, blended between two zones. */
export interface Atmosphere {
  sky: number;
  fog: number;
  fogNear: number;
  fogFar: number;
  sunColor: number;
  sunIntensity: number;
  sunPosition: [number, number, number];
  envIntensity: number;
  exposure: number;
  night: number;
  bloom: number;
  /** The two HDRI skies being crossfaded and how far along (0..1) the fade is. */
  hdriFrom: HdriKey;
  hdriTo: HdriKey;
  hdriMix: number;
}

export function lerpHex(a: number, b: number, t: number): number {
  const r = Math.round(lerp((a >> 16) & 255, (b >> 16) & 255, t));
  const g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, t));
  const bl = Math.round(lerp(a & 255, b & 255, t));
  return (r << 16) | (g << 8) | bl;
}

export function blendZones(a: ZoneDef, b: ZoneDef, t: number): Atmosphere {
  return {
    sky: lerpHex(a.sky, b.sky, t),
    fog: lerpHex(a.fog, b.fog, t),
    fogNear: lerp(a.fogNear, b.fogNear, t),
    fogFar: lerp(a.fogFar, b.fogFar, t),
    sunColor: lerpHex(a.sunColor, b.sunColor, t),
    sunIntensity: lerp(a.sunIntensity, b.sunIntensity, t),
    sunPosition: [
      lerp(a.sunPosition[0], b.sunPosition[0], t),
      lerp(a.sunPosition[1], b.sunPosition[1], t),
      lerp(a.sunPosition[2], b.sunPosition[2], t),
    ],
    envIntensity: lerp(a.envIntensity, b.envIntensity, t),
    exposure: lerp(a.exposure, b.exposure, t),
    night: lerp(a.night, b.night, t),
    bloom: lerp(a.bloom, b.bloom, t),
    hdriFrom: a.hdri,
    hdriTo: b.hdri,
    hdriMix: t,
  };
}

/** The atmosphere at a given distance run: steady inside a zone, easing across each boundary. */
export function atmosphereAt(distance: number): Atmosphere {
  const { from, to, t } = zoneBlendAt(distance);
  return blendZones(ZONES[from] as ZoneDef, ZONES[to] as ZoneDef, t);
}
