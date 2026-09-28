import type {
  EnvironmentDefinition,
  StructureDefinition,
} from '@/data/environments/environmentSchema';
import { SurfaceId } from '@/data/surfaces/surfaces';
import { createRandom, randomRange } from '@/utils/math/random';
import { createProjection, projectOnPolyline } from '@/utils/math/polyline';
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
  /** Fire-killed trees (same stride as `trees`). */
  burntTrees: Float32Array;
  burntTreeCount: number;
}

const MAX_TREE_SLOPE = 30 * DEG2RAD;
/** Cleared verge either side of roads and trails so the rover's chassis fits between trunks. */
const PATH_VERGE = 3;
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
  house: 12,
  collapsedHouse: 14,
  flag: 4,
  windsock: 4,
  chargingPad: 12,
};
const ROCK_VARIANTS = 3;
/** Steepest ground a loose boulder can rest on. */
const MAX_ROCK_SLOPE = 48 * DEG2RAD;
/** How far (as a fraction of the boulder's radius) rocks sink below the lowest footprint point. */
const ROCK_SINK = 0.06;
/** Must match the renderer's tilt factor (Rocks.tsx) so stored tilts become real angles. */
export const ROCK_TILT_SCALE = 0.4;

function nearStructure(env: EnvironmentDefinition, x: number, z: number): boolean {
  for (const structure of env.structures) {
    const clearance = (STRUCTURE_CLEARANCE[structure.kind] ?? 6) * structure.scale;
    if (Math.hypot(x - structure.position[0], z - structure.position[1]) < clearance) return true;
  }
  return false;
}

const projection = createProjection();

/** True when (x, z) lies on a road or trail, including its cleared verge. */
function onPath(terrain: TerrainQuery, x: number, z: number): boolean {
  for (const path of terrain.data.paths) {
    const limit = path.definition.halfWidth + PATH_VERGE;
    if (projectOnPolyline(path.line, x, z, projection).distance < limit) return true;
  }
  return false;
}

function inClearing(env: EnvironmentDefinition, x: number, z: number): boolean {
  return env.regions.some((r) => r.kind === 'clearing' && regionWeight(r, x, z) > 0.05);
}

function burntDensity(env: EnvironmentDefinition, x: number, z: number): number {
  let density = 0;
  for (const region of env.regions) {
    if (region.kind === 'burnt')
      density = Math.max(density, regionWeight(region, x, z) * region.density);
  }
  return density;
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
  const burntTrees: number[] = [];
  const normal = { x: 0, y: 1, z: 0 };

  for (let gz = -half + spacing / 2; gz < half; gz += spacing) {
    for (let gx = -half + spacing / 2; gx < half; gx += spacing) {
      const x = gx + randomRange(random, -0.45, 0.45) * spacing;
      const z = gz + randomRange(random, -0.45, 0.45) * spacing;
      const roll = random();
      const surface = terrain.surfaceAt(x, z);
      const burnt = burntDensity(env, x, z);
      if (burnt > 0.3) {
        // Burnt forest: bare, charred trunks instead of living trees.
        const y = terrain.heightAt(x, z);
        if (roll > 0.2 + burnt * 0.45 || y > env.terrain.treeline) continue;
        if (surface === SurfaceId.ROAD || surface === SurfaceId.TRAIL) continue;
        if (inClearing(env, x, z) || nearStructure(env, x, z) || onPath(terrain, x, z)) continue;
        const scale = randomRange(random, 0.7, 1.3);
        burntTrees.push(x, y, z, scale, random() * Math.PI * 2, random());
        continue;
      }
      if (surface !== SurfaceId.GRASS && surface !== SurfaceId.FOREST_FLOOR) continue;
      const y = terrain.heightAt(x, z);
      if (y > env.terrain.treeline) continue;
      terrain.normalAt(x, z, normal);
      if (Math.acos(normal.y) > MAX_TREE_SLOPE) continue;
      const density = forestDensity(env, x, z);
      const chance = density > 0 ? 0.25 + density * 0.72 : env.vegetation.scatterTreeChance;
      if (roll > chance) continue;
      if (inClearing(env, x, z) || nearStructure(env, x, z) || onPath(terrain, x, z)) continue;
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
      if (inClearing(env, x, z) || nearStructure(env, x, z) || onPath(terrain, x, z)) continue;
      const scale = randomRange(random, scaleRange[0], scaleRange[1]);
      // A boulder can't rest on a near-vertical face.
      terrain.normalAt(x, z, normal);
      if (Math.acos(normal.y) > MAX_ROCK_SLOPE) continue;
      // Seat it at the lowest ground under its footprint (the model's radius is `scale`) and sink
      // it in a little, so no side hangs in the air on a slope; the uphill side is buried instead.
      let ground = terrain.heightAt(x, z);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        ground = Math.min(
          ground,
          terrain.heightAt(x + Math.cos(a) * scale * 0.85, z + Math.sin(a) * scale * 0.85),
        );
      }
      const y = ground - scale * ROCK_SINK;
      // Lean with the slope (stored tilts are scaled by the renderer's tilt factor).
      const tiltX = Math.atan2(normal.z, normal.y) * 0.8;
      const tiltZ = -Math.atan2(normal.x, normal.y) * 0.8;
      rocks.push(
        x,
        y,
        z,
        scale,
        random() * Math.PI * 2,
        Math.floor(random() * ROCK_VARIANTS),
        tiltX / ROCK_TILT_SCALE + randomRange(random, -0.15, 0.15),
        tiltZ / ROCK_TILT_SCALE + randomRange(random, -0.15, 0.15),
      );
    }
  }

  return {
    trees: new Float32Array(trees),
    treeCount: trees.length / TREE_STRIDE,
    rocks: new Float32Array(rocks),
    rockCount: rocks.length / ROCK_STRIDE,
    burntTrees: new Float32Array(burntTrees),
    burntTreeCount: burntTrees.length / TREE_STRIDE,
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
