import { SurfaceId } from '@/data/surfaces/surfaces';
import { createProjection, projectOnPolyline, samplePolyline } from '@/utils/math/polyline';
import { riverLevelAt, riverSpeedAt, sampleGridHeight } from './terrainMath';

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
  private readonly ahead = { x: 0, z: 0 };
  private readonly behind = { x: 0, z: 0 };

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

  /** Water surface height if (x, z) is over the river or flood water, otherwise null. */
  waterLevelAt(x: number, z: number): number | null {
    const river = this.data.river;
    projectOnPolyline(river.line, x, z, this.projection);
    const riverLevel =
      this.projection.distance > river.halfWidth ? null : riverLevelAt(river, this.projection.t);
    const flood = this.data.floodLevel;
    if (flood == null || this.heightAt(x, z) >= flood) return riverLevel;
    return riverLevel === null ? flood : Math.max(flood, riverLevel);
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

  /**
   * Surface water velocity (m/s, XZ) at a point: fastest in mid-channel, slowing towards the banks;
   * flood water off the channel drifts slowly downstream. Zero on dry ground.
   */
  flowAt(x: number, z: number, out: MutableVec3): MutableVec3 {
    out.x = 0;
    out.y = 0;
    out.z = 0;
    const river = this.data.river;
    projectOnPolyline(river.line, x, z, this.projection);
    const t = this.projection.t;
    const distance = this.projection.distance;
    const flooded = this.data.floodLevel != null && this.heightAt(x, z) < this.data.floodLevel;
    if (distance > river.halfWidth && !flooded) return out;
    samplePolyline(river.line, Math.min(1, t + 0.002), this.ahead);
    samplePolyline(river.line, Math.max(0, t - 0.002), this.behind);
    let tx = this.ahead.x - this.behind.x;
    let tz = this.ahead.z - this.behind.z;
    const length = Math.hypot(tx, tz) || 1;
    tx /= length;
    tz /= length;
    const across = Math.min(1, distance / river.halfWidth);
    const speed =
      distance <= river.halfWidth
        ? riverSpeedAt(river, t) * (0.25 + 0.75 * (1 - across * across))
        : 0.3;
    out.x = tx * speed;
    out.z = tz * speed;
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
