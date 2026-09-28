import type { VehicleConfig } from '@/data/vehicles';
import type { ControlAxes } from '@/game/input/InputManager';
import { clamp, damp, DEG2RAD, moveTowards } from '@/utils/math/scalar';
import { headingForward, type VehicleState, type VelocityCommand } from './VehicleState';

export interface FlightEnvironment {
  /** Air movement (m/s); `y` is rain downdraft / turbulence. */
  wind: { x: number; y?: number; z: number };
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
/** Share of unintended sideways drift shown as bank. */
const DRIFT_BANK_WEIGHT = 0.25;

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
    const stickInput = Math.max(Math.abs(axes.throttle), Math.abs(axes.strafe));
    const windExposure =
      c.windInfluence * (HOVER_WIND_FRACTION + (1 - HOVER_WIND_FRACTION) * stickInput);
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

    // Roll input slides the drone sideways without turning the nose.
    const targetLateral = axes.strafe * c.strafeSpeed + windLateral;
    const lateralAccelerating =
      Math.abs(targetLateral) > Math.abs(currentLateral) &&
      Math.sign(targetLateral) === Math.sign(currentLateral || targetLateral);
    const lateralRate = lateralAccelerating ? c.acceleration : c.deceleration;
    const nextLateral = moveTowards(currentLateral, targetLateral, lateralRate * dt);

    // Yaw with a little inertia.
    state.yawRate = damp(state.yawRate, axes.steer * c.yawRate, c.yawResponse, dt);

    // Vertical: climb/descend with ceiling and landing assist.
    // Rain downdraft and turbulence push the drone vertically; altitude hold only partly cancels it.
    const liftInput = Math.abs(axes.lift);
    const verticalGust =
      (env.wind.y ?? 0) *
      c.windInfluence *
      (HOVER_WIND_FRACTION + (1 - HOVER_WIND_FRACTION) * liftInput);
    let targetVertical = axes.lift * c.verticalSpeed + verticalGust;
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

    // Visual attitude: like a real multirotor, the body tilts towards where it is going.
    // Pitch follows forward speed/acceleration, roll follows sideways speed/acceleration and
    // turns, and climbing or descending adds a slight nose-up / nose-down cue.
    const pitchLimit = c.pitchAngleDeg * DEG2RAD;
    const bankLimit = c.bankAngleDeg * DEG2RAD;
    const accel = (nextForward - currentForward) / Math.max(dt, 1e-4);
    const lateralAccel = (nextLateral - currentLateral) / Math.max(dt, 1e-4);
    const speedRatio = clamp(nextForward / c.maxSpeed, -1, 1);
    const lateralRatio = clamp(nextLateral / c.strafeSpeed, -1, 1);
    const climbRatio = clamp(nextVertical / c.verticalSpeed, -1, 1);
    const targetPitch = clamp(
      -speedRatio * pitchLimit - accel * ACCEL_TILT_GAIN + climbRatio * c.climbTiltDeg * DEG2RAD,
      -pitchLimit * 1.3,
      pitchLimit * 1.1,
    );
    const turnBank = (state.yawRate / c.yawRate) * (0.25 + 0.5 * Math.abs(speedRatio));
    // Deliberate slides bank fully; incidental drift (e.g. while turning) only slightly.
    const slideWeight = axes.strafe !== 0 ? 1 : DRIFT_BANK_WEIGHT;
    const slideBank = (lateralRatio + lateralAccel * ACCEL_TILT_GAIN * 0.5) * slideWeight;
    const targetRoll = -clamp(turnBank * 0.6 + slideBank, -1.2, 1.2) * bankLimit;
    state.visualPitch = damp(state.visualPitch, targetPitch, VISUAL_TILT_RESPONSE, dt);
    state.visualRoll = damp(state.visualRoll, targetRoll, VISUAL_TILT_RESPONSE, dt);
    state.hovering = Math.hypot(out.x, out.z) < c.hoverSpeedThreshold;
  }
}
