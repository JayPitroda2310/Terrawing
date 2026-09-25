import type { VehicleConfig } from '@/data/vehicles';
import type { ControlAxes } from '@/game/input/InputManager';
import { clamp, damp, DEG2RAD, moveTowards } from '@/utils/math/scalar';
import { headingForward, type VehicleState, type VelocityCommand } from './VehicleState';

export interface FlightEnvironment {
  wind: { x: number; z: number };
  /** Height of the terrain datum directly below (for the service ceiling). */
  serviceCeiling: number;
}

/** Below this AGL, descent speed is limited so landings are soft instead of damaging. */
const LANDING_ASSIST_HEIGHT = 4;
const LANDING_ASSIST_MIN_SPEED = 1.4;
const VISUAL_TILT_RESPONSE = 4;
const ACCEL_TILT_GAIN = 0.035;
/** Fraction of wind drift that remains while hovering with position hold. */
const HOVER_WIND_FRACTION = 0.15;

const forward = { x: 0, z: 0 };

/**
 * Arcade-leaning quadcopter model: velocity-level control with separate acceleration and
 * deceleration, hover stabilisation, wind drift, soft ceiling and a landing assist.
 * Visual banking is computed here but applied to the model only (physics yaw-only).
 */
export class FlightController {
  constructor(private readonly config: VehicleConfig['flight']) {}

  update(
    state: VehicleState,
    axes: ControlAxes,
    env: FlightEnvironment,
    dt: number,
    out: VelocityCommand,
  ): void {
    const c = this.config;
    headingForward(state.heading, forward);
    const rightX = -forward.z;
    const rightZ = forward.x;

    const currentForward = state.velocity.x * forward.x + state.velocity.z * forward.z;
    const currentLateral = state.velocity.x * rightX + state.velocity.z * rightZ;
    // Position hold counters most wind drift while hovering; wind bites harder in forward flight.
    const windExposure =
      c.windInfluence * (HOVER_WIND_FRACTION + (1 - HOVER_WIND_FRACTION) * Math.abs(axes.throttle));
    const windForward = (env.wind.x * forward.x + env.wind.z * forward.z) * windExposure;
    const windLateral = (env.wind.x * rightX + env.wind.z * rightZ) * windExposure;

    const targetForward =
      (axes.throttle >= 0 ? axes.throttle * c.maxSpeed : axes.throttle * c.reverseSpeed) +
      windForward;
    const accelerating =
      Math.abs(targetForward) > Math.abs(currentForward) &&
      Math.sign(targetForward) === Math.sign(currentForward || targetForward);
    const forwardRate = accelerating ? c.acceleration : c.deceleration;
    const nextForward = moveTowards(currentForward, targetForward, forwardRate * dt);
    const nextLateral = moveTowards(currentLateral, windLateral, c.deceleration * dt);

    // Yaw with a little inertia.
    state.yawRate = damp(state.yawRate, axes.steer * c.yawRate, c.yawResponse, dt);

    // Vertical: climb/descend with ceiling and landing assist.
    let targetVertical = axes.lift * c.verticalSpeed;
    if (state.altitudeAGL > c.maxAltitudeAGL || state.position.y > env.serviceCeiling) {
      targetVertical = Math.min(targetVertical, -1);
    }
    if (targetVertical < 0 && state.altitudeAGL < LANDING_ASSIST_HEIGHT) {
      const limit = Math.max(LANDING_ASSIST_MIN_SPEED, state.altitudeAGL * 1.2);
      targetVertical = Math.max(targetVertical, -limit);
    }
    const nextVertical = moveTowards(state.velocity.y, targetVertical, c.verticalAcceleration * dt);

    out.x = forward.x * nextForward + rightX * nextLateral;
    out.z = forward.z * nextForward + rightZ * nextLateral;
    out.y = nextVertical;
    out.yawRate = state.yawRate;
    out.gravityScale = 0;

    // Visual attitude: nose down with speed and acceleration, bank into turns.
    const accel = (nextForward - currentForward) / Math.max(dt, 1e-4);
    const speedRatio = clamp(nextForward / c.maxSpeed, -1, 1);
    const targetPitch = clamp(
      -speedRatio * c.pitchAngleDeg * DEG2RAD - accel * ACCEL_TILT_GAIN,
      -c.pitchAngleDeg * DEG2RAD * 1.4,
      c.pitchAngleDeg * DEG2RAD,
    );
    const turnBank = (state.yawRate / c.yawRate) * (0.35 + 0.65 * Math.abs(speedRatio));
    const lateralBank = nextLateral / c.maxSpeed;
    const targetRoll = -clamp(turnBank + lateralBank, -1, 1) * c.bankAngleDeg * DEG2RAD;
    state.visualPitch = damp(state.visualPitch, targetPitch, VISUAL_TILT_RESPONSE, dt);
    state.visualRoll = damp(state.visualRoll, targetRoll, VISUAL_TILT_RESPONSE, dt);
    state.hovering = Math.hypot(out.x, out.z) < c.hoverSpeedThreshold;
  }
}
