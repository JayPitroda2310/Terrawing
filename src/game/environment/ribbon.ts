import { BufferAttribute, BufferGeometry } from 'three';
import type { Polyline } from '@/utils/math/polyline';
import { samplePolyline } from '@/utils/math/polyline';

export interface RibbonOptions {
  line: Polyline;
  halfWidth: number;
  /** Sample spacing along the line, metres. */
  spacing: number;
  /** Height of the ribbon centre at normalised position t. */
  heightAt: (t: number, x: number, z: number) => number;
  /** Returning false omits the segment ending at t (used for broken road sections). */
  include?: (t: number, x: number, z: number) => boolean;
  /** Metres of length per V texture unit. */
  vScale: number;
}

/**
 * Builds a flat ribbon mesh following a polyline — used for the river surface and road decks.
 * UV.x runs 0..1 across the ribbon, UV.y along its length.
 */
export function buildRibbon(options: RibbonOptions): BufferGeometry {
  const { line, halfWidth, spacing, heightAt, include, vScale } = options;
  const samples = Math.max(2, Math.ceil(line.length / spacing) + 1);
  const positions = new Float32Array(samples * 2 * 3);
  const uvs = new Float32Array(samples * 2 * 2);
  const point = { x: 0, z: 0 };
  const ahead = { x: 0, z: 0 };
  const behind = { x: 0, z: 0 };
  const keep: boolean[] = [];

  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    samplePolyline(line, t, point);
    samplePolyline(line, Math.min(1, t + 0.002), ahead);
    samplePolyline(line, Math.max(0, t - 0.002), behind);
    let tx = ahead.x - behind.x;
    let tz = ahead.z - behind.z;
    const length = Math.hypot(tx, tz) || 1;
    tx /= length;
    tz /= length;
    // Perpendicular (right-hand).
    const px = -tz;
    const pz = tx;
    const y = heightAt(t, point.x, point.z);
    const base = i * 6;
    positions[base] = point.x - px * halfWidth;
    positions[base + 1] = y;
    positions[base + 2] = point.z - pz * halfWidth;
    positions[base + 3] = point.x + px * halfWidth;
    positions[base + 4] = y;
    positions[base + 5] = point.z + pz * halfWidth;
    const v = (t * line.length) / vScale;
    uvs[i * 4] = 0;
    uvs[i * 4 + 1] = v;
    uvs[i * 4 + 2] = 1;
    uvs[i * 4 + 3] = v;
    keep.push(include ? include(t, point.x, point.z) : true);
  }

  const indices: number[] = [];
  for (let i = 0; i < samples - 1; i++) {
    if (!keep[i] || !keep[i + 1]) continue;
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, c, b, b, c, d);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
