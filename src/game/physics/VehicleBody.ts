import type { VelocityCommand } from '@/game/terrawing/VehicleState';

export interface GroundHit {
  distance: number;
  normal: { x: number; y: number; z: number };
}

export interface BodySample {
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  heading: number;
}

/**
 * Abstraction over the physics engine's vehicle body. Gameplay code talks to this interface, so
 * controllers and the session can be unit tested with a fake body and the engine can be swapped.
 */
export interface VehicleBody {
  read(out: BodySample): BodySample;
  /** Applies the controller command. `heading` keeps the body's yaw authoritative. */
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
}

export function createBodySample(): BodySample {
  return { position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, heading: 0 };
}
