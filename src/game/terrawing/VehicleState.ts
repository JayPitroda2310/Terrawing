import type { RigState, VehicleConfig } from '@/data/vehicles';
import { SurfaceId } from '@/data/surfaces/surfaces';
import type { VehicleMode } from '@/game/core/GameState';

/**
 * Mutable, high-frequency vehicle state. Lives outside React and is written every physics step.
 * Heading convention: yaw 0 faces north (-Z); positive yaw turns clockwise when seen from above
 * (towards east / +X).
 */
export interface VehicleState {
  mode: VehicleMode;
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  heading: number;
  yawRate: number;
  /** Signed speed along the heading, m/s. */
  forwardSpeed: number;
  /** Horizontal speed magnitude, m/s. */
  speed: number;
  verticalSpeed: number;
  /** Height above whatever is directly below (terrain or structures). */
  altitudeAGL: number;
  /** Height above the terrain datum (sea level analogue). */
  altitudeASL: number;
  grounded: boolean;
  groundNormal: { x: number; y: number; z: number };
  surface: SurfaceId;
  inWater: boolean;
  /** Visual-only attitude layered on top of physics yaw. */
  visualPitch: number;
  visualRoll: number;
  /** Normalised control inputs, for animation and audio. */
  throttle: number;
  steer: number;
  lift: number;
  rig: RigState;
  payload: string | null;
  /** Remaining time on the current transform phase etc. is kept by controllers. */
  hovering: boolean;
}

export function createVehicleState(
  config: VehicleConfig,
  mode: VehicleMode,
  x: number,
  y: number,
  z: number,
  heading: number,
): VehicleState {
  return {
    mode,
    position: { x, y, z },
    velocity: { x: 0, y: 0, z: 0 },
    heading,
    yawRate: 0,
    forwardSpeed: 0,
    speed: 0,
    verticalSpeed: 0,
    altitudeAGL: 0,
    altitudeASL: y,
    grounded: true,
    groundNormal: { x: 0, y: 1, z: 0 },
    surface: SurfaceId.PAD,
    inWater: false,
    visualPitch: 0,
    visualRoll: 0,
    throttle: 0,
    steer: 0,
    lift: 0,
    rig: { ...(mode === 'FLIGHT' ? config.rig.flight : config.rig.rover) },
    payload: null,
    hovering: false,
  };
}

/** Forward unit vector on the XZ plane for a heading. */
export function headingForward(
  heading: number,
  out: { x: number; z: number },
): { x: number; z: number } {
  out.x = Math.sin(heading);
  out.z = -Math.cos(heading);
  return out;
}

/** Desired body velocity produced by a controller for this step. */
export interface VelocityCommand {
  x: number;
  y: number;
  z: number;
  yawRate: number;
  /** Gravity scale to apply to the rigid body (0 while hovering). */
  gravityScale: number;
}

export function createVelocityCommand(): VelocityCommand {
  return { x: 0, y: 0, z: 0, yawRate: 0, gravityScale: 1 };
}
