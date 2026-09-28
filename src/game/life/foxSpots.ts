import { SurfaceId } from '@/data/surfaces/surfaces';
import type { GameSession } from '@/game/core/GameSession';
import { createRandom } from '@/utils/math/random';
import type { FoxSpec } from './Wildlife';

/** Deterministic fox territories: open meadow, off the roads, away from the base. */
export function pickFoxSpots(session: GameSession, count: number, seed: number): FoxSpec[] {
  const random = createRandom(seed);
  const base = session.zones.get('base')?.position ?? { x: 0, z: 0 };
  const spots: FoxSpec[] = [];
  for (let attempt = 0; attempt < 400 && spots.length < count; attempt++) {
    const x = (random() - 0.5) * 700;
    const z = (random() - 0.5) * 700;
    if (Math.hypot(x - base.x, z - base.z) < 70) continue;
    const surface = session.terrain.surfaceAt(x, z);
    if (surface !== SurfaceId.GRASS && surface !== SurfaceId.FOREST_FLOOR) continue;
    if (session.terrain.waterLevelAt(x, z) !== null) continue;
    spots.push({ x, z, radius: 25, seed: seed + attempt });
  }
  return spots;
}
