/** 2D polyline helpers on the XZ plane. Used for roads, rivers and trails. */
export type Vec2Tuple = readonly [number, number];

export interface PolylineProjection {
  /** Distance from the query point to the polyline. */
  distance: number;
  /** Normalized position along the whole polyline, 0..1. */
  t: number;
  /** Closest point on the polyline. */
  x: number;
  z: number;
  /** Index of the closest segment. */
  segment: number;
}

export interface Polyline {
  readonly points: readonly Vec2Tuple[];
  readonly cumulative: Float64Array;
  readonly length: number;
}

export function createPolyline(points: readonly Vec2Tuple[]): Polyline {
  const cumulative = new Float64Array(points.length);
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    length += Math.hypot(b[0] - a[0], b[1] - a[1]);
    cumulative[i] = length;
  }
  return { points, cumulative, length };
}

export function createProjection(): PolylineProjection {
  return { distance: 0, t: 0, x: 0, z: 0, segment: 0 };
}

/** Projects a point onto a polyline, writing into `out` to avoid allocations. */
export function projectOnPolyline(
  line: Polyline,
  x: number,
  z: number,
  out: PolylineProjection,
): PolylineProjection {
  let best = Infinity;
  const { points, cumulative } = line;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const lenSq = dx * dx + dz * dz;
    let s = lenSq > 0 ? ((x - a[0]) * dx + (z - a[1]) * dz) / lenSq : 0;
    s = s < 0 ? 0 : s > 1 ? 1 : s;
    const px = a[0] + dx * s;
    const pz = a[1] + dz * s;
    const d = (x - px) * (x - px) + (z - pz) * (z - pz);
    if (d < best) {
      best = d;
      out.x = px;
      out.z = pz;
      out.segment = i;
      out.t = line.length > 0 ? (cumulative[i]! + Math.sqrt(lenSq) * s) / line.length : 0;
    }
  }
  out.distance = Math.sqrt(best);
  return out;
}

/** Samples the point at normalized distance t along the polyline. */
export function samplePolyline(line: Polyline, t: number, out: { x: number; z: number }): void {
  const target = Math.min(Math.max(t, 0), 1) * line.length;
  const { points, cumulative } = line;
  for (let i = 0; i < points.length - 1; i++) {
    const end = cumulative[i + 1]!;
    if (target <= end || i === points.length - 2) {
      const start = cumulative[i]!;
      const s = end > start ? (target - start) / (end - start) : 0;
      const a = points[i]!;
      const b = points[i + 1]!;
      out.x = a[0] + (b[0] - a[0]) * s;
      out.z = a[1] + (b[1] - a[1]) * s;
      return;
    }
  }
}

/** Resamples a polyline using Catmull-Rom smoothing for nicer ribbons and curves. */
export function smoothPolyline(points: readonly Vec2Tuple[], subdivisions: number): Vec2Tuple[] {
  if (points.length < 3) return [...points];
  const result: Vec2Tuple[] = [];
  const get = (i: number) => points[Math.min(Math.max(i, 0), points.length - 1)]!;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
    for (let s = 0; s < subdivisions; s++) {
      const t = s / subdivisions;
      const t2 = t * t;
      const t3 = t2 * t;
      const cr = (a: number, b: number, c: number, d: number) =>
        0.5 *
        (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      result.push([cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  result.push(points[points.length - 1]!);
  return result;
}
