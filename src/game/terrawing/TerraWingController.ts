import type { VehicleConfig } from '@/data/vehicles';
import { SurfaceId } from '@/data/surfaces/surfaces';
import type { TransformDirection, VehicleMode } from '@/game/core/GameState';
import type { TerrainQuery } from '@/game/environment/TerrainQuery';
import type { ControlAxes } from '@/game/input/InputManager';
import {
  createBodySample,
  type BodyMode,
  type GroundHit,
  type Quat,
  type VehicleBody,
} from '@/game/physics/VehicleBody';
import { headingToQuaternion, slerp } from '@/utils/math/quat';
import { FlightController, type FlightEnvironment } from './FlightController';
import { RoverController, type RoverEnvironment } from './RoverController';
import { TransformationController, type TransformStepResult } from './TransformationController';
import {
  createVehicleState,
  createVelocityCommand,
  type VehicleState,
  type VelocityCommand,
} from './VehicleState';

const GRAVITY = 9.81;
const GROUND_PROBE_DISTANCE = 400;
const GROUND_PROBE_LIFT = 0.5;
const GROUNDED_DISTANCE = 0.3;
/** Water deeper than this counts as "in the water" for the rover. */
const WATER_DEPTH_THRESHOLD = 0.35;
/**
 * If whatever is directly below sits this far above the terrain (tree canopy, debris, rooftop),
 * the vehicle may not land there.
 */
const LANDING_OBSTRUCTION_LIMIT = 1.5;
/** Rate at which the chassis levels itself when switching from wheels to rotors (1/s). */
const UPRIGHT_RATE = 5;
/** Suspension bottoming (m/s of compression) is converted to an impact speed by this factor. */
const BOTTOM_OUT_IMPACT = 2.2;
/** Boundary push strength in rover mode (the value is a velocity; this makes it a force). */
const ROVER_PUSH_GAIN = 3;
/** Impacts may exceed the previous speed by this factor (rebound). */
const IMPACT_SPEED_MARGIN = 1.15;

const BRAKE_AXES: ControlAxes = { throttle: 0, steer: 0, lift: 0, strafe: 0, brake: true };

export type ControlMode = 'flight' | 'rover' | 'transform' | 'hold';

/**
 * Owns TerraWing's vehicle-level behaviour: reads the physics body, runs the controller for the
 * current mode, detects impacts, and writes the velocity command back to the body.
 */
export class TerraWingController {
  readonly state: VehicleState;
  readonly flight: FlightController;
  readonly rover: RoverController;
  readonly transformation: TransformationController;
  readonly command: VelocityCommand = createVelocityCommand();
  /** Velocity the body should have next step if nothing but our own forces act on it. */
  private readonly expected = { x: 0, y: 0, z: 0 };
  private hasExpected = false;
  private pendingBottomOut = 0;
  /** Speed at the previous step; a collision cannot change velocity by much more than this. */
  private previousSpeed = 0;
  private bodyMode: BodyMode = 'flight';
  private readonly rotation: Quat = { x: 0, y: 0, z: 0, w: 1 };
  private readonly sample = createBodySample();
  private readonly hit: GroundHit = { distance: 0, normal: { x: 0, y: 1, z: 0 } };
  private body: VehicleBody | null = null;
  /** Height of the surface below the vehicle above the bare terrain (0 on open ground). */
  private landingObstruction = 0;

  constructor(
    readonly config: VehicleConfig,
    private readonly terrain: TerrainQuery,
    mode: VehicleMode,
    x: number,
    z: number,
    heading: number,
  ) {
    const y = terrain.heightAt(x, z);
    this.state = createVehicleState(config, mode, x, y, z, heading);
    this.flight = new FlightController(config.flight);
    this.rover = new RoverController(config.rover);
    this.transformation = new TransformationController(config.transform);
  }

  get attached(): boolean {
    return this.body !== null;
  }

  attach(body: VehicleBody): void {
    this.body = body;
    this.hasExpected = false;
    this.bodyMode = this.state.mode === 'ROVER' ? 'rover' : 'flight';
    body.setMode(this.bodyMode);
    this.rover.reset();
  }

  /** Which physics model is active: rotor flight or wheeled rover. */
  get physicsMode(): BodyMode {
    return this.bodyMode;
  }

  private setBodyMode(mode: BodyMode): void {
    if (!this.body || mode === this.bodyMode) return;
    this.bodyMode = mode;
    this.body.setMode(mode);
    this.rover.reset();
    this.hasExpected = false;
  }

  detach(): void {
    this.body = null;
  }

  /** Reads the body and refreshes derived state. Returns the impact speed since the last step. */
  sync(dt: number): number {
    if (!this.body) return 0;
    const s = this.state;
    this.body.read(this.sample);
    s.position.x = this.sample.position.x;
    s.position.y = this.sample.position.y;
    s.position.z = this.sample.position.z;
    s.velocity.x = this.sample.velocity.x;
    s.velocity.y = this.sample.velocity.y;
    s.velocity.z = this.sample.velocity.z;
    s.heading = this.sample.heading;

    s.speed = Math.hypot(s.velocity.x, s.velocity.z);
    s.forwardSpeed = s.velocity.x * Math.sin(s.heading) - s.velocity.z * Math.cos(s.heading);
    s.verticalSpeed = s.velocity.y;

    const terrainHeight = this.terrain.heightAt(s.position.x, s.position.z);
    const hit = this.body.probeGround(
      s.position.x,
      s.position.y + GROUND_PROBE_LIFT,
      s.position.z,
      GROUND_PROBE_DISTANCE,
      this.hit,
    );
    if (hit) {
      s.altitudeAGL = Math.max(0, hit.distance - GROUND_PROBE_LIFT);
      s.groundNormal.x = hit.normal.x;
      s.groundNormal.y = hit.normal.y;
      s.groundNormal.z = hit.normal.z;
    } else {
      s.altitudeAGL = Math.max(0, s.position.y - terrainHeight);
      this.terrain.normalAt(s.position.x, s.position.z, s.groundNormal);
    }
    this.landingObstruction = s.position.y - s.altitudeAGL - terrainHeight;
    s.altitudeASL = s.position.y;
    s.grounded = s.altitudeAGL < GROUNDED_DISTANCE;

    const water = this.terrain.waterLevelAt(s.position.x, s.position.z);
    s.inWater = water !== null && water - s.position.y > WATER_DEPTH_THRESHOLD;
    s.surface = s.inWater ? SurfaceId.WATER : this.terrain.surfaceAt(s.position.x, s.position.z);

    return this.measureImpact(dt);
  }

  step(
    control: ControlMode,
    axes: ControlAxes,
    flightEnv: FlightEnvironment,
    roverEnv: RoverEnvironment,
    dt: number,
  ): TransformStepResult | null {
    const s = this.state;
    s.throttle = axes.throttle;
    s.steer = axes.steer;
    s.lift = axes.lift;
    let result: TransformStepResult | null = null;

    if (control === 'transform') {
      result = this.transformation.update(s, dt, this.command);
      // Leaving the ground: rotors take over from the suspension once the chassis starts rising.
      if (result.type === 'phase' && this.transformation.currentDirection === 'toFlight') {
        this.setBodyMode('flight');
      }
    }

    if (this.bodyMode === 'rover') {
      // On wheels everything is force-based; cinematics and transformations simply hold the brakes.
      const roverAxes = control === 'rover' ? axes : BRAKE_AXES;
      const step = this.rover.update(s, roverAxes, roverEnv, dt, this.body!);
      const m = this.body!.mass;
      this.expected.x = s.velocity.x + step.impulse.x / m;
      this.expected.y = s.velocity.y + step.impulse.y / m - GRAVITY * dt;
      this.expected.z = s.velocity.z + step.impulse.z / m;
      this.hasExpected = true;
      this.pendingBottomOut = step.bottomOut;
      s.yawRate = 0;
      return result;
    }

    switch (control) {
      case 'flight':
        this.flight.update(s, axes, flightEnv, dt, this.command);
        break;
      case 'rover':
        // Wheels not yet down (mid-transformation): hold position.
        this.hold(dt);
        break;
      case 'transform':
        break;
      case 'hold':
        this.hold(dt);
        break;
    }
    this.levelChassis(dt);
    return result;
  }

  /** In rotor flight the body is kept upright; after leaving the ground it levels smoothly. */
  private levelChassis(dt: number): void {
    if (!this.body) return;
    const q = this.body.rotation(this.rotation);
    if (Math.abs(q.x) < 1e-4 && Math.abs(q.z) < 1e-4) return;
    const upright = headingToQuaternion(this.state.heading);
    this.body.setRotation(slerp(q, upright, 1 - Math.exp(-UPRIGHT_RATE * dt), q));
  }

  /** Writes the current command to the physics body. Extra velocity (e.g. boundary push) is added. */
  apply(extraX = 0, extraZ = 0): void {
    if (!this.body) return;
    if (this.bodyMode === 'rover') {
      if (extraX !== 0 || extraZ !== 0) {
        const m = this.body.mass;
        const impulse = {
          x: (extraX * m * ROVER_PUSH_GAIN) / 60,
          y: 0,
          z: (extraZ * m * ROVER_PUSH_GAIN) / 60,
        };
        this.body.applyImpulse(impulse);
        this.expected.x += impulse.x / m;
        this.expected.z += impulse.z / m;
      }
      return;
    }
    this.command.x += extraX;
    this.command.z += extraZ;
    this.body.write(this.command);
    this.expected.x = this.command.x;
    this.expected.y = this.command.y - GRAVITY * this.command.gravityScale * (1 / 60);
    this.expected.z = this.command.z;
    this.hasExpected = true;
  }

  requestTransform(direction: TransformDirection): string | null {
    const s = this.state;
    const reason = this.transformation.check(direction, {
      mode: s.mode,
      altitudeAGL: s.altitudeAGL,
      groundSlopeRad: this.groundSlopeBelow(),
      overWater: this.terrain.waterLevelAt(s.position.x, s.position.z) !== null,
      obstructed: this.landingObstruction > LANDING_OBSTRUCTION_LIMIT,
      speed: s.speed,
    });
    if (reason) return reason;
    this.transformation.begin(direction, s.rig);
    return null;
  }

  finishTransform(direction: TransformDirection): VehicleMode {
    const mode: VehicleMode = direction === 'toRover' ? 'ROVER' : 'FLIGHT';
    this.state.mode = mode;
    if (mode === 'ROVER') this.setBodyMode('rover');
    Object.assign(
      this.state.rig,
      mode === 'ROVER' ? this.config.rig.rover : this.config.rig.flight,
    );
    return mode;
  }

  teleport(x: number, z: number, heightAboveGround: number): void {
    const y = this.terrain.heightAt(x, z) + heightAboveGround;
    this.body?.teleport(x, y, z, this.state.heading);
    this.state.position.x = x;
    this.state.position.y = y;
    this.state.position.z = z;
    this.hasExpected = false;
    this.rover.reset();
  }

  /** Keeps the vehicle stationary (cinematics, interactions): hovering in flight, braking on wheels. */
  private hold(dt: number): void {
    const s = this.state;
    const settle = 8 * dt;
    const towards = (v: number) => (Math.abs(v) <= settle ? 0 : v - Math.sign(v) * settle);
    this.command.x = towards(s.velocity.x);
    this.command.z = towards(s.velocity.z);
    this.command.yawRate = 0;
    s.yawRate = 0;
    if (s.mode === 'FLIGHT') {
      this.command.y = towards(s.velocity.y);
      this.command.gravityScale = 0;
    } else {
      this.command.y = s.velocity.y;
      this.command.gravityScale = 1;
    }
  }

  private groundSlopeBelow(): number {
    const n = { x: 0, y: 1, z: 0 };
    this.terrain.normalAt(this.state.position.x, this.state.position.z, n);
    return Math.acos(Math.min(1, n.y));
  }

  /**
   * Collision detection: the difference between the velocity our own forces should have produced
   * and what physics delivered is an external impact (rock, wall, hard landing). Suspension
   * bottoming out also counts.
   */
  private measureImpact(_dt: number): number {
    const bottomOut = this.pendingBottomOut * BOTTOM_OUT_IMPACT;
    this.pendingBottomOut = 0;
    if (!this.hasExpected) {
      const v = this.state.velocity;
      this.previousSpeed = Math.hypot(v.x, v.y, v.z);
      return bottomOut;
    }
    const v = this.state.velocity;
    const e = this.expected;
    const deviation = Math.hypot(v.x - e.x, v.y - e.y, v.z - e.z);
    // Solver position corrections (e.g. the chassis sinking into a boulder) can spike velocity;
    // a real impact is bounded by the closing speed, so cap it there.
    const plausible = Math.min(deviation, this.previousSpeed * IMPACT_SPEED_MARGIN + 1);
    this.previousSpeed = Math.hypot(v.x, v.y, v.z);
    return Math.max(bottomOut, plausible);
  }
}
