import type { VehicleConfig } from '@/data/vehicles';
import { SurfaceId } from '@/data/surfaces/surfaces';
import type { TransformDirection, VehicleMode } from '@/game/core/GameState';
import type { TerrainQuery } from '@/game/environment/TerrainQuery';
import type { ControlAxes } from '@/game/input/InputManager';
import { createBodySample, type GroundHit, type VehicleBody } from '@/game/physics/VehicleBody';
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
  private readonly lastCommand: VelocityCommand = createVelocityCommand();
  private hasLastCommand = false;
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
    this.hasLastCommand = false;
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
    switch (control) {
      case 'flight':
        this.flight.update(s, axes, flightEnv, dt, this.command);
        break;
      case 'rover':
        this.rover.update(s, axes, roverEnv, dt, this.command);
        break;
      case 'transform':
        result = this.transformation.update(s, dt, this.command);
        break;
      case 'hold':
        this.hold(dt);
        break;
    }
    return result;
  }

  /** Writes the current command to the physics body. Extra velocity (e.g. boundary push) is added. */
  apply(extraX = 0, extraZ = 0): void {
    if (!this.body) return;
    this.command.x += extraX;
    this.command.z += extraZ;
    this.body.write(this.command);
    this.lastCommand.x = this.command.x;
    this.lastCommand.y = this.command.y;
    this.lastCommand.z = this.command.z;
    this.lastCommand.gravityScale = this.command.gravityScale;
    this.hasLastCommand = true;
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
    this.hasLastCommand = false;
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

  /** Difference between the velocity we asked for and what physics delivered = collision. */
  private measureImpact(dt: number): number {
    if (!this.hasLastCommand) return 0;
    const v = this.state.velocity;
    const expectedY = this.lastCommand.y - GRAVITY * this.lastCommand.gravityScale * dt;
    return Math.hypot(v.x - this.lastCommand.x, v.y - expectedY, v.z - this.lastCommand.z);
  }
}
