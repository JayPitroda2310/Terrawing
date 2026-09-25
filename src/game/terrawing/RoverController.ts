import type { VehicleConfig } from '@/data/vehicles';
import { getSurface } from '@/data/surfaces/surfaces';
import type { ControlAxes } from '@/game/input/InputManager';
import { clamp, damp, DEG2RAD, moveTowards } from '@/utils/math/scalar';
import { headingForward, type VehicleState, type VelocityCommand } from './VehicleState';

export interface RoverEnvironment {
  /** Multiplier from weather (wet ground). */
  tractionMultiplier: number;
}

const GROUND_STICK_SPEED = 0.3;
const VISUAL_ALIGN_RESPONSE = 8;
const STEER_RESPONSE = 7;
/** Portion of the steering authority available when stationary (lets the rover pivot slowly). */
const PIVOT_AUTHORITY = 0.15;

const forward = { x: 0, z: 0 };

/**
 * Ground vehicle model. Surface type, slope and weather modulate top speed and traction; low
 * traction lets lateral velocity persist (sliding on mud). Vertical motion comes from physics.
 */
export class RoverController {
  /** Effective top speed after surface/slope modifiers — exposed for HUD and tests. */
  effectiveMaxSpeed = 0;

  constructor(private readonly config: VehicleConfig['rover']) {}

  update(
    state: VehicleState,
    axes: ControlAxes,
    env: RoverEnvironment,
    dt: number,
    out: VelocityCommand,
  ): void {
    const c = this.config;
    const surface = getSurface(state.surface);
    const traction = clamp(surface.traction * env.tractionMultiplier, 0.05, 1);
    headingForward(state.heading, forward);
    const rightX = -forward.z;
    const rightZ = forward.x;
    const n = state.groundNormal;

    const currentForward = state.velocity.x * forward.x + state.velocity.z * forward.z;
    const currentLateral = state.velocity.x * rightX + state.velocity.z * rightZ;

    // Uphill gradient along the heading (rise over run).
    const ny = Math.max(n.y, 0.2);
    const gradient = -(n.x * forward.x + n.z * forward.z) / ny;
    const climbLimit = Math.tan(c.maxClimbSlopeDeg * DEG2RAD);
    const uphill = Math.sign(axes.throttle || 1) * gradient;
    const slopeFactor = uphill > 0 ? 1 - Math.pow(clamp(uphill / climbLimit, 0, 1), 1.5) : 1;

    this.effectiveMaxSpeed = c.maxSpeed * surface.speedMultiplier * slopeFactor;
    let targetForward =
      axes.throttle >= 0
        ? axes.throttle * this.effectiveMaxSpeed
        : axes.throttle * c.reverseSpeed * surface.speedMultiplier * slopeFactor;

    let rate: number;
    if (axes.brake) {
      targetForward = 0;
      rate = c.brakeDeceleration * traction;
    } else if (axes.throttle === 0) {
      rate = c.coastDeceleration;
    } else {
      rate = c.acceleration * (0.4 + 0.6 * traction);
    }
    const nextForward = state.grounded
      ? moveTowards(currentForward, targetForward, rate * dt)
      : currentForward;
    const grip = c.lateralGrip * traction;
    const nextLateral = state.grounded ? damp(currentLateral, 0, grip, dt) : currentLateral;

    const authority = clamp(Math.abs(nextForward) / c.steerSpeedReference, PIVOT_AUTHORITY, 1);
    const direction = nextForward < -0.2 ? -1 : 1;
    const targetYaw = axes.steer * c.steerRate * authority * direction;
    state.yawRate = damp(state.yawRate, state.grounded ? targetYaw : 0, STEER_RESPONSE, dt);

    out.x = forward.x * nextForward + rightX * nextLateral;
    out.z = forward.z * nextForward + rightZ * nextLateral;
    // Follow the ground plane when grounded so the rover neither bounces nor launches off crests.
    out.y = state.grounded
      ? -(n.x * out.x + n.z * out.z) / ny - GROUND_STICK_SPEED
      : state.velocity.y;
    out.yawRate = state.yawRate;
    out.gravityScale = 1;

    // Align the chassis visually with the terrain.
    const nf = n.x * forward.x + n.z * forward.z;
    const nr = n.x * rightX + n.z * rightZ;
    const targetPitch = state.grounded ? Math.atan2(-nf, ny) : state.visualPitch;
    const targetRoll = state.grounded ? Math.atan2(-nr, ny) : state.visualRoll;
    state.visualPitch = damp(state.visualPitch, targetPitch, VISUAL_ALIGN_RESPONSE, dt);
    state.visualRoll = damp(state.visualRoll, targetRoll, VISUAL_ALIGN_RESPONSE, dt);
    state.hovering = false;
  }
}
