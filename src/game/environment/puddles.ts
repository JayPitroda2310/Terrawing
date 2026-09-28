import { SurfaceId } from '@/data/surfaces/surfaces';
import type { TerrainQuery } from './TerrainQuery';

/**
 * CPU mirror of the puddle pattern the road and terrain shaders draw (see NOISE_GLSL `tw_pfbm2`,
 * Roads.tsx and Terrain.tsx), so physics and spray happen exactly where puddles are visible.
 */

/** 32-bit float rounding, to match the GPU's arithmetic step by step. */
const f32 = Math.fround;
const fract = (v: number) => f32(v - Math.floor(v));

/** Mirror of GLSL `tw_phash` (hash12 without sine), evaluated in 32-bit floats. */
function hash(x: number, y: number): number {
  let a = fract(f32(x * f32(0.1031)));
  let b = fract(f32(y * f32(0.1031)));
  let c = fract(f32(x * f32(0.1031)));
  const k = f32(19.19);
  const d = f32(f32(a * f32(b + k)) + f32(b * f32(c + k)) + f32(c * f32(a + k)));
  a = fract(f32(a + d));
  b = fract(f32(b + d));
  c = fract(f32(c + d));
  return fract(f32(f32(f32(a + b) * c) * f32(7.13)));
}

function valueNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = f32(x - ix);
  const fy = f32(y - iy);
  const ux = f32(fx * fx * (3 - 2 * fx));
  const uy = f32(fy * fy * (3 - 2 * fy));
  const a = hash(ix, iy);
  const b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1);
  const d = hash(ix + 1, iy + 1);
  const top = a + (b - a) * ux;
  const bottom = c + (d - c) * ux;
  return top + (bottom - top) * uy;
}

function fbm2(x: number, y: number): number {
  x = f32(x);
  y = f32(y);
  return (valueNoise(x, y) * 0.5 + valueNoise(f32(x * 2.03), f32(y * 2.03)) * 0.25) / 0.75;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Deepest standing water in a puddle (m). */
export const PUDDLE_MAX_DEPTH = 0.06;

/**
 * Puddle coverage 0..1 at (x, z): road puddles always; on mud, gravel and trails the puddles
 * grow with how soaked the ground is (`wetness` 0..1). Steep ground holds no water.
 */
export function puddleAt(terrain: TerrainQuery, x: number, z: number, wetness: number): number {
  const surface = terrain.surfaceAt(x, z);
  if (surface === SurfaceId.ROAD) return smoothstep(0.62, 0.7, fbm2(f32(x * 0.18), f32(z * 0.18)));
  if (surface !== SurfaceId.MUD && surface !== SurfaceId.GRAVEL && surface !== SurfaceId.TRAIL)
    return 0;
  const shaderWetness = 0.15 + wetness * 0.85;
  const puddle =
    smoothstep(0.55, 0.75, fbm2(f32(f32(x * 0.08) + 7), f32(f32(z * 0.08) + 7))) * shaderWetness;
  if (puddle <= 0) return 0;
  const normal = { x: 0, y: 1, z: 0 };
  terrain.normalAt(x, z, normal);
  return puddle * smoothstep(0.8, 0.95, normal.y);
}
