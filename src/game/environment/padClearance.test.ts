import { describe, expect, it } from 'vitest';
import { getEnvironment } from '@/data/environments';
import { MISSION_CATALOG, loadMission } from '@/data/missions';
import { createProjection, projectOnPolyline } from '@/utils/math/polyline';
import { getTerrain } from './terrainCache';

/** Pad radius plus a margin so the road's shoulder never touches the slab. */
const PAD_CLEARANCE = 11 + 3;

describe.each(MISSION_CATALOG.filter((m) => m.available))('$name', (entry) => {
  const result = loadMission(entry.id);
  if (!result.ok) throw new Error(result.errors.join());
  const environment = getEnvironment(result.mission.environment);
  const terrain = getTerrain(environment);
  const pads = environment.structures.filter(
    (s) => s.kind === 'helipad' || s.kind === 'landingZone',
  );

  it.each(pads.map((p) => [p.id, p] as const))('%s is clear of roads and trails', (_, pad) => {
    const projection = createProjection();
    for (const path of terrain.data.paths) {
      projectOnPolyline(path.line, pad.position[0], pad.position[1], projection);
      const gap = projection.distance - path.definition.halfWidth;
      expect(gap, `${pad.id} vs ${path.definition.id}`).toBeGreaterThan(PAD_CLEARANCE);
    }
  });
});
