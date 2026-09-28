/** Minimal allocation-free quaternion helpers for plain {x,y,z,w} objects. */
export interface QuatLike {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/** Rotates vector (vx, vy, vz) by unit quaternion q, writing into `out`. */
export function rotateVector<T extends Vec3Like>(
  q: QuatLike,
  vx: number,
  vy: number,
  vz: number,
  out: T,
): T {
  // t = 2 * cross(q.xyz, v); v' = v + w * t + cross(q.xyz, t)
  const tx = 2 * (q.y * vz - q.z * vy);
  const ty = 2 * (q.z * vx - q.x * vz);
  const tz = 2 * (q.x * vy - q.y * vx);
  out.x = vx + q.w * tx + (q.y * tz - q.z * ty);
  out.y = vy + q.w * ty + (q.z * tx - q.x * tz);
  out.z = vz + q.w * tz + (q.x * ty - q.y * tx);
  return out;
}

/** Yaw-only rotation for a heading (0 = facing -Z/north, positive = clockwise from above). */
export function headingToQuaternion(heading: number): QuatLike {
  const half = -heading / 2;
  return { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) };
}

/** Heading of the body's forward axis (-Z) projected onto the ground plane. Works when tilted. */
export function quaternionToHeading(q: QuatLike): number {
  const fx = -2 * (q.x * q.z + q.w * q.y);
  const fz = -(1 - 2 * (q.x * q.x + q.y * q.y));
  return Math.atan2(fx, -fz);
}

/** Normalised spherical interpolation, written into `out`. */
export function slerp(a: QuatLike, b: QuatLike, t: number, out: QuatLike): QuatLike {
  let bx = b.x;
  let by = b.y;
  let bz = b.z;
  let bw = b.w;
  let cos = a.x * bx + a.y * by + a.z * bz + a.w * bw;
  if (cos < 0) {
    cos = -cos;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  let k0 = 1 - t;
  let k1 = t;
  if (cos < 0.9995) {
    const angle = Math.acos(cos);
    const sin = Math.sin(angle);
    k0 = Math.sin((1 - t) * angle) / sin;
    k1 = Math.sin(t * angle) / sin;
  }
  out.x = a.x * k0 + bx * k1;
  out.y = a.y * k0 + by * k1;
  out.z = a.z * k0 + bz * k1;
  out.w = a.w * k0 + bw * k1;
  const length = Math.hypot(out.x, out.y, out.z, out.w) || 1;
  out.x /= length;
  out.y /= length;
  out.z /= length;
  out.w /= length;
  return out;
}
