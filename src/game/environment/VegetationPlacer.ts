import type {
  EnvironmentDefinition,
  StructureDefinition,
} from '@/data/environments/environmentSchema';
import { SurfaceId } from '@/data/surfaces/surfaces';
import { createRandom, randomRange } from '@/utils/math/random';
import { DEG2RAD } from '@/utils/math/scalar';
import { regionWeight } from './TerrainGenerator';
import type { TerrainQuery } from './TerrainQuery';

/** Instance stride for trees: x, y, z, scale, rotation, tint. */
export const TREE_STRIDE = 6;
/** Instance stride for rocks: x, y, z, scale, rotationY, variant, tiltX, tiltZ. */
export const ROCK_STRIDE = 8;

export interface VegetationLayout {
  trees: Float32Array;
  treeCount: number;
  rocks: Float32Array;
  rockCount: number;
}

const MAX_TREE_SLOPE = 30 * DEG2RAD;
const STRUCTURE_CLEARANCE: Partial<Record<StructureDefinition['kind'], number>> = {
  cabin: 12,
  tent: 8,
  container: 8,
  antenna: 6,
  helipad: 16,
  landingZone: 16,
  carWreck: 7,
  debrisPile: 20,
  bridge: 20,
  rockShelter: 18,
  floodlight: 4,
  fallenLogs: 6,
  chargingPad: 12,
};
const ROCK_VARIANTS = 3;

function nearStructure(env: EnvironmentDefinition, x: number, z: number): boolean {
  for (const structure of env.structures) {
    const clearance = (STRUCTURE_CLEARANCE[structure.kind] ?? 6) * structure.scale;
    if (Math.hypot(x - structure.position[0], z - structure.position[1]) < clearance) return true;
  }
  return false;
}

function inClearing(env: EnvironmentDefinition, x: number, z: number): boolean {
  return env.regions.some((r) => r.kind === 'clearing' && regionWeight(r, x, z) > 0.05);
}

function forestDensity(env: EnvironmentDefinition, x: number, z: number): number {
  let density = 0;
  for (const region of env.regions) {
    if (region.kind === 'forest')
      density = Math.max(density, regionWeight(region, x, z) * region.density);
  }
  return density;
}

/**
 * Deterministically scatters trees and rocks. Placement respects surfaces, slopes, clearings and
 * structures, so paths stay drivable and landing zones stay clear.
 */
export function placeVegetation(
  env: EnvironmentDefinition,
  terrain: TerrainQuery,
): VegetationLayout {
  const random = createRandom(env.seed + 404);
  const half = terrain.data.half;
  const spacing = env.vegetation.treeSpacing;
  const trees: number[] = [];
  const rocks: number[] = [];
  const normal = { x: 0, y: 1, z: 0 };

  for (let gz = -half + spacing / 2; gz < half; gz += spacing) {
    for (let gx = -half + spacing / 2; gx < half; gx += spacing) {
      const x = gx + randomRange(random, -0.45, 0.45) * spacing;
      const z = gz + randomRange(random, -0.45, 0.45) * spacing;
      const roll = random();
      const surface = terrain.surfaceAt(x, z);
      if (surface !== SurfaceId.GRASS && surface !== SurfaceId.FOREST_FLOOR) continue;
      const y = terrain.heightAt(x, z);
      if (y > env.terrain.treeline) continue;
      terrain.normalAt(x, z, normal);
      if (Math.acos(normal.y) > MAX_TREE_SLOPE) continue;
      const density = forestDensity(env, x, z);
      const chance = density > 0 ? 0.25 + density * 0.72 : env.vegetation.scatterTreeChance;
      if (roll > chance) continue;
      if (inClearing(env, x, z) || nearStructure(env, x, z)) continue;
      const scale = randomRange(random, 0.75, 1.35) * (density > 0.5 ? 1.1 : 0.9);
      trees.push(x, y, z, scale, random() * Math.PI * 2, random());
    }
  }

  const rockSpacing = 11;
  for (let gz = -half + rockSpacing / 2; gz < half; gz += rockSpacing) {
    for (let gx = -half + rockSpacing / 2; gx < half; gx += rockSpacing) {
      const x = gx + randomRange(random, -0.5, 0.5) * rockSpacing;
      const z = gz + randomRange(random, -0.5, 0.5) * rockSpacing;
      const surface = terrain.surfaceAt(x, z);
      let chance = 0.012;
      let scaleRange: [number, number] = [0.4, 1.3];
      switch (surface) {
        case SurfaceId.ROCK:
          chance = 0.14;
          scaleRange = [0.8, 3.2];
          break;
        case SurfaceId.GRAVEL:
          chance = 0.5;
          scaleRange = [0.7, 3.4];
          break;
        case SurfaceId.MUD:
          chance = 0.08;
          scaleRange = [0.4, 1.4];
          break;
        case SurfaceId.FOREST_FLOOR:
          chance = 0.04;
          break;
        case SurfaceId.ROAD:
        case SurfaceId.TRAIL:
        case SurfaceId.PAD:
        case SurfaceId.WATER:
          chance = 0;
          break;
      }
      chance *= env.vegetation.rockDensity;
      if (random() > chance) continue;
      if (inClearing(env, x, z) || nearStructure(env, x, z)) continue;
      const scale = randomRange(random, scaleRange[0], scaleRange[1]);
      const y = terrain.heightAt(x, z) - scale * 0.25;
      rocks.push(
        x,
        y,
        z,
        scale,
        random() * Math.PI * 2,
        Math.floor(random() * ROCK_VARIANTS),
        randomRange(random, -0.3, 0.3),
        randomRange(random, -0.3, 0.3),
      );
    }
  }

  return {
    trees: new Float32Array(trees),
    treeCount: trees.length / TREE_STRIDE,
    rocks: new Float32Array(rocks),
    rockCount: rocks.length / ROCK_STRIDE,
  };
}

const layoutCache = new Map<string, VegetationLayout>();

export function getVegetation(env: EnvironmentDefinition, terrain: TerrainQuery): VegetationLayout {
  let layout = layoutCache.get(env.id);
  if (!layout) {
    layout = placeVegetation(env, terrain);
    layoutCache.set(env.id, layout);
  }
  return layout;
}
