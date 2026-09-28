import type { VelocityCommand } from '@/game/terrawing/VehicleState';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface GroundHit {
  distance: number;
  normal: Vec3;
}

export interface BodySample {
  position: Vec3;
  velocity: Vec3;
  heading: number;
}

/**
 * flight: upright, yaw-only rotation, spherical collider, velocity-controlled.
 * rover:  free 6-DOF rigid body on raycast suspension, chassis collider, force-controlled.
 */
export type BodyMode = 'flight' | 'rover';

/**
 * Abstraction over the physics engine's vehicle body. Gameplay code talks to this interface, so
 * controllers and the session can be unit tested with a fake body and the engine can be swapped.
 */
export interface VehicleBody {
  read(out: BodySample): BodySample;
  /** Applies a velocity command (flight / transformation). */
  write(command: VelocityCommand): void;
  /** Casts a ray straight down from (x, y, z), ignoring the vehicle itself. */
  probeGround(
    x: number,
    y: number,
    z: number,
    maxDistance: number,
    out: GroundHit,
  ): GroundHit | null;
  teleport(x: number, y: number, z: number, heading: number): void;

  setMode(mode: BodyMode): void;
  readonly mass: number;
  rotation(out: Quat): Quat;
  setRotation(rotation: Quat): void;
  angularVelocity(out: Vec3): Vec3;
  setAngularVelocity(velocity: Vec3): void;
  /** Velocity of a world-space point rigidly attached to the body. */
  pointVelocity(point: Vec3, out: Vec3): Vec3;
  applyImpulse(impulse: Vec3): void;
  applyImpulseAtPoint(impulse: Vec3, point: Vec3): void;
  /** Casts a ray in any direction, ignoring the vehicle itself. */
  castRay(origin: Vec3, direction: Vec3, maxDistance: number, out: GroundHit): GroundHit | null;
}

export function createBodySample(): BodySample {
  return { position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, heading: 0 };
}
