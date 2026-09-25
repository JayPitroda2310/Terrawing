import { BufferAttribute, BufferGeometry, Color } from 'three';
import { SurfaceId } from '@/data/surfaces/surfaces';
import { createNoise2D } from '@/utils/math/noise';
import { clamp01, smoothstep } from '@/utils/math/scalar';
import type { TerrainData } from './TerrainData';

/** Wet, overcast alpine palette. */
const SURFACE_COLORS: Readonly<Record<SurfaceId, string>> = {
  [SurfaceId.GRASS]: '#46522f',
  [SurfaceId.FOREST_FLOOR]: '#363624',
  [SurfaceId.ROCK]: '#66655f',
  [SurfaceId.MUD]: '#3b3124',
  [SurfaceId.GRAVEL]: '#655d51',
  [SurfaceId.ROAD]: '#303234',
  [SurfaceId.TRAIL]: '#4f4436',
  [SurfaceId.WATER]: '#2b2a24',
  [SurfaceId.PAD]: '#3a3d40',
};
const SNOW_COLOR = new Color('#d5dade');
const SNOW_START = 150;
const SNOW_FULL = 200;

/**
 * Builds the terrain BufferGeometry from grid data. The index layout mirrors `sampleGridHeight`
 * (triangles a-c-b and b-c-d per cell) so rendering matches CPU queries and physics.
 */
export function buildTerrainGeometry(data: TerrainData): BufferGeometry {
  const n = data.verticesPerSide;
  const positions = new Float32Array(n * n * 3);
  const colors = new Float32Array(n * n * 3);
  const palette = Object.fromEntries(
    Object.entries(SURFACE_COLORS).map(([id, hex]) => [id, new Color(hex)]),
  ) as Record<string, Color>;
  const noise = createNoise2D(91);
  const color = new Color();

  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const index = iz * n + ix;
      const x = -data.half + ix * data.cellSize;
      const z = -data.half + iz * data.cellSize;
      const y = data.heights[index]!;
      positions[index * 3] = x;
      positions[index * 3 + 1] = y;
      positions[index * 3 + 2] = z;

      const surface = data.surfaces[index]!;
      color.copy(palette[surface]!);
      const variation = noise(x / 45, z / 45) * 0.12 + noise(x / 9, z / 9) * 0.05;
      color.multiplyScalar(1 + variation);
      const slope = data.slopes[index]!;
      if (surface === SurfaceId.GRASS || surface === SurfaceId.FOREST_FLOOR) {
        // Steeper grassy slopes show more rock and bare earth.
        color.lerp(palette[SurfaceId.ROCK]!, smoothstep(0.35, 0.65, slope) * 0.6);
      }
      if (surface === SurfaceId.ROCK) color.multiplyScalar(0.9 + clamp01((y - 40) / 200) * 0.25);
      const snow =
        smoothstep(SNOW_START, SNOW_FULL, y + noise(x / 30, z / 30) * 18) *
        (1 - smoothstep(0.7, 1.1, slope));
      if (snow > 0) color.lerp(SNOW_COLOR, snow);
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
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
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}
