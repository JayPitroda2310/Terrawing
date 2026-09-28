import { createNoise2D } from '@/utils/math/noise';

const noise = createNoise2D(4711);

/**
 * Fine-scale ground relief under a wheel (stones, ruts, roots) that is too small to model in the
 * terrain mesh. Returns metres to add to the ground height at (x, z) for a surface's amplitude.
 * Three octaves: small stones (~0.5 m), ruts (~1.3 m) and gentle undulation (~3 m). Bumps are
 * biased upwards so rough ground feels like stones rather than holes.
 */
export function surfaceBump(x: number, z: number, amplitude: number): number {
  if (amplitude <= 0) return 0;
  const stones = noise(x / 0.55, z / 0.55);
  const ruts = noise(x / 1.3 + 17.1, z / 1.3 - 4.2);
  const swell = noise(x / 3.1 - 9.7, z / 3.1 + 2.3);
  const raw = stones * 0.5 + ruts * 0.32 + swell * 0.18;
  return amplitude * (raw > 0 ? raw : raw * 0.45);
}
