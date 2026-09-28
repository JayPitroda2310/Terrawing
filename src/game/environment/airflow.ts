import type { Vector3 } from 'three';

/** Air velocity (m/s) at a world position: weather wind plus local effects such as rotor wash. */
export type AirflowSampler = (x: number, y: number, z: number, out: Vector3) => Vector3;

let current: AirflowSampler | null = null;

/** Registered by the world so anything (cloth, flags, particles) can sample the local airflow. */
export function setAirflowSampler(sampler: AirflowSampler | null): void {
  current = sampler;
}

export function sampleAirflow(x: number, y: number, z: number, out: Vector3): Vector3 {
  return current ? current(x, y, z, out) : out.set(0, 0, 0);
}
