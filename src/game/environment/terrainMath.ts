import { lerp } from '@/utils/math/scalar';
import type { GeneratedRiver } from './TerrainData';

/**
 * Height lookup that matches the mesh triangulation exactly.
 * Each cell (a=top-left, b=top-right, c=bottom-left, d=bottom-right) is split along the b–c diagonal
 * into triangles (a, c, b) and (b, c, d).
 */
export function sampleGridHeight(
  heights: Float32Array,
  verticesPerSide: number,
  cellSize: number,
  half: number,
  x: number,
  z: number,
): number {
  const max = verticesPerSide - 1;
  let gx = (x + half) / cellSize;
  let gz = (z + half) / cellSize;
  gx = gx < 0 ? 0 : gx > max ? max : gx;
  gz = gz < 0 ? 0 : gz > max ? max : gz;
  let ix = Math.floor(gx);
  let iz = Math.floor(gz);
  if (ix >= max) ix = max - 1;
  if (iz >= max) iz = max - 1;
  const fx = gx - ix;
  const fz = gz - iz;
  const a = heights[iz * verticesPerSide + ix]!;
  const b = heights[iz * verticesPerSide + ix + 1]!;
  const c = heights[(iz + 1) * verticesPerSide + ix]!;
  const d = heights[(iz + 1) * verticesPerSide + ix + 1]!;
  if (fx + fz <= 1) return a + (b - a) * fx + (c - a) * fz;
  return d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
}

/** Linear lookup into a uniformly sampled profile. */
export function sampleProfile(profile: Float32Array, t: number): number {
  const f = Math.min(Math.max(t, 0), 1) * (profile.length - 1);
  const i = Math.floor(f);
  const a = profile[i]!;
  const b = profile[Math.min(i + 1, profile.length - 1)]!;
  return a + (b - a) * (f - i);
}

export function riverLevelAt(river: GeneratedRiver, t: number): number {
  return lerp(river.levelStart, river.levelEnd, t);
}
