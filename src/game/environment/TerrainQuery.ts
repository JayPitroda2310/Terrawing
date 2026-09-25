import { SurfaceId } from '@/data/surfaces/surfaces';
import { createProjection, projectOnPolyline } from '@/utils/math/polyline';
import { riverLevelAt, sampleGridHeight } from './terrainMath';

export { sampleGridHeight };
import type { TerrainData } from './TerrainData';

export interface MutableVec3 {
  x: number;
  y: number;
  z: number;
}

const NORMAL_EPSILON = 1.5;

/** Read-only spatial queries over generated terrain. Safe to call every physics step. */
export class TerrainQuery {
  private readonly projection = createProjection();

  constructor(readonly data: TerrainData) {}

  heightAt(x: number, z: number): number {
    const d = this.data;
    return sampleGridHeight(d.heights, d.verticesPerSide, d.cellSize, d.half, x, z);
  }

  /** Writes the (unit) surface normal at x,z into `out`. */
  normalAt(x: number, z: number, out: MutableVec3): MutableVec3 {
    const e = NORMAL_EPSILON;
    const hl = this.heightAt(x - e, z);
    const hr = this.heightAt(x + e, z);
    const hd = this.heightAt(x, z - e);
    const hu = this.heightAt(x, z + e);
    const nx = hl - hr;
    const nz = hd - hu;
    const ny = 2 * e;
    const length = Math.hypot(nx, ny, nz);
    out.x = nx / length;
    out.y = ny / length;
    out.z = nz / length;
    return out;
  }

  surfaceAt(x: number, z: number): SurfaceId {
    const d = this.data;
    const ix = Math.round((x + d.half) / d.cellSize);
    const iz = Math.round((z + d.half) / d.cellSize);
    if (ix < 0 || iz < 0 || ix >= d.verticesPerSide || iz >= d.verticesPerSide)
      return SurfaceId.ROCK;
    return d.surfaces[iz * d.verticesPerSide + ix] as SurfaceId;
  }

  /** Water surface height if (x, z) is over the river, otherwise null. */
  waterLevelAt(x: number, z: number): number | null {
    const river = this.data.river;
    projectOnPolyline(river.line, x, z, this.projection);
    if (this.projection.distance > river.halfWidth) return null;
    return riverLevelAt(river, this.projection.t);
  }

  /** Writes the closest point on the river centreline (with water level as y) into `out`. */
  nearestRiverPoint(x: number, z: number, out: MutableVec3): MutableVec3 {
    const river = this.data.river;
    projectOnPolyline(river.line, x, z, this.projection);
    out.x = this.projection.x;
    out.z = this.projection.z;
    out.y = riverLevelAt(river, this.projection.t);
    return out;
  }

  distanceToRiver(x: number, z: number): number {
    return projectOnPolyline(this.data.river.line, x, z, this.projection).distance;
  }

  /**
   * Fraction (0..1) of a straight line that is obstructed by terrain. Used for radio line-of-sight.
   */
  occlusion(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    samples: number,
  ): number {
    let blocked = 0;
    let depth = 0;
    for (let i = 1; i < samples; i++) {
      const t = i / samples;
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t;
      const z = az + (bz - az) * t;
      const ground = this.heightAt(x, z);
      if (ground > y) {
        blocked++;
        depth = Math.max(depth, ground - y);
      }
    }
    // Weight by both how much of the path is blocked and how deep the obstruction is.
    const coverage = blocked / Math.max(1, samples - 1);
    return Math.min(1, coverage * 1.6 + Math.min(depth / 60, 0.6));
  }

  isInsideMap(x: number, z: number, margin = 0): boolean {
    const h = this.data.half - margin;
    return x >= -h && x <= h && z >= -h && z <= h;
  }
}
