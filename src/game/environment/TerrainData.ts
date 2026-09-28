import type { SurfaceId } from '@/data/surfaces/surfaces';
import type { Polyline } from '@/utils/math/polyline';
import type { PathDefinition } from '@/data/environments/environmentSchema';

/** A road/trail after generation: smoothed centreline plus its height profile. */
export interface GeneratedPath {
  readonly definition: PathDefinition;
  readonly kind: 'road' | 'trail';
  readonly line: Polyline;
  /** Height of the path surface sampled uniformly along `line` (index / (length-1) = t). */
  readonly profile: Float32Array;
}

export interface GeneratedRiver {
  readonly line: Polyline;
  readonly halfWidth: number;
  readonly levelStart: number;
  readonly levelEnd: number;
}

/**
 * Grid-based terrain description. Heights are stored per vertex, row-major by Z:
 *   index = iz * verticesPerSide + ix
 *   x = -half + ix * cellSize, z = -half + iz * cellSize
 * The render mesh, physics trimesh and CPU height queries all use this exact grid and the same
 * triangulation, so what the player sees is what the physics collides with.
 */
export interface TerrainData {
  readonly size: number;
  readonly resolution: number;
  readonly verticesPerSide: number;
  readonly cellSize: number;
  readonly half: number;
  readonly heights: Float32Array;
  readonly surfaces: Uint8Array;
  /** Per-vertex slope in radians. */
  readonly slopes: Float32Array;
  readonly river: GeneratedRiver;
  readonly paths: readonly GeneratedPath[];
  /** Flood-water surface height covering all lower ground, or null when there is no flood. */
  readonly floodLevel?: number | null;
  /** Per-vertex 0..1 fire scorch, present only when the environment has burnt regions. */
  readonly scorch?: Float32Array;
  /** Height above which trees give way to alpine meadow and rock. */
  readonly treeline?: number;
  readonly minHeight: number;
  readonly maxHeight: number;
}

export type { SurfaceId };
