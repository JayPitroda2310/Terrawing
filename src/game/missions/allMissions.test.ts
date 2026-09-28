import { describe, expect, it } from 'vitest';
import { getEnvironment } from '@/data/environments';
import { loadMission, MISSION_CATALOG } from '@/data/missions';
import { SurfaceId } from '@/data/surfaces/surfaces';
import { getTerrain } from '@/game/environment/terrainCache';
import type { TerrainQuery } from '@/game/environment/TerrainQuery';
import type { MissionDefinition } from './MissionDefinition';

const MAX_SURVIVOR_SLOPE_DEG = 20;
const MAX_LANDING_SLOPE_DEG = 12;
const LANDING_SEARCH_RADIUS = 45;

function slopeDeg(terrain: TerrainQuery, x: number, z: number): number {
  const normal = { x: 0, y: 1, z: 0 };
  terrain.normalAt(x, z, normal);
  return (Math.acos(normal.y) * 180) / Math.PI;
}

function dry(terrain: TerrainQuery, x: number, z: number): boolean {
  return terrain.waterLevelAt(x, z) === null && terrain.surfaceAt(x, z) !== SurfaceId.WATER;
}

function flightDamage(mission: MissionDefinition, x: number, z: number): number {
  return mission.hazards
    .filter((h) => Math.hypot(x - h.position[0], z - h.position[1]) <= h.radius)
    .reduce((sum, h) => sum + h.damagePerSecond.FLIGHT, 0);
}

/** A flat, dry spot outside flight hazards where TerraWing can land near (x, z). */
function findLanding(mission: MissionDefinition, terrain: TerrainQuery, x: number, z: number) {
  for (let r = 0; r <= LANDING_SEARCH_RADIUS; r += 3) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      if (
        slopeDeg(terrain, px, pz) < MAX_LANDING_SLOPE_DEG &&
        dry(terrain, px, pz) &&
        flightDamage(mission, px, pz) === 0
      )
        return { x: px, z: pz };
    }
  }
  return null;
}

describe.each(MISSION_CATALOG.filter((entry) => entry.available))('$code $name', (entry) => {
  const result = loadMission(entry.id);
  it('has valid mission data', () => {
    expect(result.ok ? [] : result.errors).toEqual([]);
  });
  if (!result.ok) return;
  const mission = result.mission;
  const environment = getEnvironment(mission.environment);
  const terrain = getTerrain(environment);

  it('starts on dry, level ground', () => {
    const [x, z] = mission.spawn.position;
    expect(dry(terrain, x, z)).toBe(true);
    expect(slopeDeg(terrain, x, z)).toBeLessThan(MAX_LANDING_SLOPE_DEG);
  });

  it('has dry, level base and extraction zones', () => {
    for (const zone of mission.zones.filter((z) => z.kind !== 'area')) {
      const [x, z] = zone.position;
      expect(dry(terrain, x, z), zone.id).toBe(true);
      expect(slopeDeg(terrain, x, z), zone.id).toBeLessThan(MAX_LANDING_SLOPE_DEG);
    }
    for (const supply of mission.supplies) {
      expect(dry(terrain, ...supply.position), supply.id).toBe(true);
    }
  });

  it.each(mission.survivors.map((s) => [s.id, s] as const))('%s can be rescued', (_, survivor) => {
    const [x, z] = survivor.position;
    if (survivor.access === 'air') {
      // Rooftop: the survivor stands above any water.
      const level = terrain.waterLevelAt(x, z) ?? -Infinity;
      expect(terrain.heightAt(x, z) + survivor.elevation).toBeGreaterThan(level + 1);
      expect(flightDamage(mission, x, z)).toBe(0);
      return;
    }
    expect(dry(terrain, x, z)).toBe(true);
    expect(slopeDeg(terrain, x, z)).toBeLessThan(MAX_SURVIVOR_SLOPE_DEG);
    expect(findLanding(mission, terrain, x, z), 'landing spot nearby').not.toBeNull();
  });
});
