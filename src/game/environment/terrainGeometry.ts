import { BufferAttribute, BufferGeometry } from 'three';
import type { SurfaceId } from '@/data/surfaces/surfaces';
import { SURFACE_LAYER, TERRAIN_LAYER, TERRAIN_LAYERS } from '@/data/visualAssets';
import { createNoise2D } from '@/utils/math/noise';
import { smoothstep } from '@/utils/math/scalar';
import type { TerrainData } from './TerrainData';

const LAYERS = TERRAIN_LAYERS.length;
const SNOW_START = 150;
const SNOW_FULL = 200;
/** Neighbourhood radius (in grid cells) used to soften the edges between surfaces. */
const BLEND_RADIUS = 1;
/** Slopes steeper than this blend in rock regardless of the surface type. */
const ROCK_SLOPE = { start: 0.5, full: 0.85 };

/**
 * Builds the terrain BufferGeometry from grid data. The index layout mirrors `sampleGridHeight`
 * (triangles a-c-b and b-c-d per cell) so rendering matches CPU queries and physics.
 *
 * Attributes:
 *  - `color`   macro tint (subtle brightness/hue variation, darker under forest)
 *  - `splatA`  texture-layer weights 0–3, `splatB` weights 4–7 (sum to 1)
 */
export function buildTerrainGeometry(data: TerrainData): BufferGeometry {
  const n = data.verticesPerSide;
  const count = n * n;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const splatA = new Float32Array(count * 4);
  const splatB = new Float32Array(count * 4);
  const noise = createNoise2D(91);
  const weights = new Float32Array(LAYERS);
  const treeline = data.treeline ?? Infinity;

  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const index = iz * n + ix;
      const x = -data.half + ix * data.cellSize;
      const z = -data.half + iz * data.cellSize;
      const y = data.heights[index]!;
      positions[index * 3] = x;
      positions[index * 3 + 1] = y;
      positions[index * 3 + 2] = z;

      // Soft surface boundaries: average the layers of neighbouring cells.
      weights.fill(0);
      let samples = 0;
      for (let dz = -BLEND_RADIUS; dz <= BLEND_RADIUS; dz++) {
        for (let dx = -BLEND_RADIUS; dx <= BLEND_RADIUS; dx++) {
          const jx = Math.min(n - 1, Math.max(0, ix + dx));
          const jz = Math.min(n - 1, Math.max(0, iz + dz));
          const layer = SURFACE_LAYER[data.surfaces[jz * n + jx] as SurfaceId];
          const w = dx === 0 && dz === 0 ? 2 : 1;
          weights[layer]! += w;
          samples += w;
        }
      }
      for (let l = 0; l < LAYERS; l++) weights[l]! /= samples;

      // Steep ground shows bare rock; high ground collects snow.
      const slope = data.slopes[index]!;
      const rock = smoothstep(
        ROCK_SLOPE.start,
        ROCK_SLOPE.full,
        slope + noise(x / 25, z / 25) * 0.1,
      );
      const snow =
        smoothstep(SNOW_START, SNOW_FULL, y + noise(x / 30, z / 30) * 18) *
        (1 - smoothstep(0.7, 1.1, slope));
      // Grass turns to alpine meadow towards and above the treeline.
      const alpine = smoothstep(treeline - 20, treeline + 25, y + noise(x / 45, z / 45) * 15);
      moveLayer(weights, TERRAIN_LAYER.GRASS, TERRAIN_LAYER.ALPINE, alpine);
      blendTowards(weights, TERRAIN_LAYER.ROCK, rock);
      blendTowards(weights, TERRAIN_LAYER.SNOW, snow);

      for (let l = 0; l < 4; l++) {
        splatA[index * 4 + l] = weights[l]!;
        splatB[index * 4 + l] = weights[l + 4]!;
      }

      // Macro tint breaks up texture repetition over large distances: broad light/dark patches,
      // sediment strata banding across rock faces, and damper, darker ground in hollows.
      const variation =
        noise(x / 220, z / 220) * 0.09 +
        noise(x / 60, z / 60) * 0.08 +
        noise(x / 14, z / 14) * 0.04;
      const strata =
        (0.5 + 0.5 * Math.sin(y * 0.45 + noise(x / 50, z / 50) * 3.5)) *
        weights[TERRAIN_LAYER.ROCK]!;
      const shade = 1 + variation - weights[TERRAIN_LAYER.FOREST]! * 0.12 - strata * 0.14;
      // Charred ground after a fire: near-black ash with a faint warm cast.
      const scorch = data.scorch?.[index] ?? 0;
      const char = 1 - scorch * (0.72 + noise(x / 7, z / 7) * 0.12);
      colors[index * 3] = shade * char * (1 + noise(x / 90 + 3, z / 90) * 0.04 + scorch * 0.08);
      colors[index * 3 + 1] = shade * char;
      colors[index * 3 + 2] = shade * char * (1 - noise(x / 90, z / 90 + 5) * 0.04 - scorch * 0.06);
    }
  }

  const cells = n - 1;
  const indices = new Uint32Array(cells * cells * 6);
  let k = 0;
  for (let iz = 0; iz < cells; iz++) {
    for (let ix = 0; ix < cells; ix++) {
      const a = iz * n + ix;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      indices[k++] = a;
      indices[k++] = c;
      indices[k++] = b;
      indices[k++] = b;
      indices[k++] = c;
      indices[k++] = d;
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.setAttribute('splatA', new BufferAttribute(splatA, 4));
  geometry.setAttribute('splatB', new BufferAttribute(splatB, 4));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}

/** Moves `amount` of the total weight onto `layer`, keeping the sum at 1. */
function blendTowards(weights: Float32Array, layer: number, amount: number): void {
  if (amount <= 0) return;
  for (let l = 0; l < weights.length; l++) weights[l]! *= 1 - amount;
  weights[layer]! += amount;
}

/** Moves a fraction of layer `from`'s weight onto layer `to` (weights keep summing to 1). */
function moveLayer(weights: Float32Array, from: number, to: number, amount: number): void {
  if (amount <= 0) return;
  const moved = weights[from]! * amount;
  weights[from]! -= moved;
  weights[to]! += moved;
}
