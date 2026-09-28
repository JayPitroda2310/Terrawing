import type { VehicleConfig } from '@/data/vehicles';
import { getSurface, SurfaceId } from '@/data/surfaces/surfaces';
import type { TerrainQuery } from '@/game/environment/TerrainQuery';
import type { ControlAxes } from '@/game/input/InputManager';
import type { GroundHit, Quat, Vec3, VehicleBody } from '@/game/physics/VehicleBody';
import { rotateVector } from '@/utils/math/quat';
import { clamp, damp, DEG2RAD } from '@/utils/math/scalar';
import { surfaceBump } from './surfaceBumps';
import type { VehicleState } from './VehicleState';

export type RoverConfig = VehicleConfig['rover'];

export interface RoverEnvironment {
  /** Multiplier from weather (wet ground). */
  tractionMultiplier: number;
  /** Puddle coverage 0..1 under a point (standing water on roads, mud, gravel, trails). */
  puddleAt?: (x: number, z: number) => number;
  terrain: TerrainQuery;
}

export interface RoverStepResult {
  /** Sum of the linear impulses this controller applied (for impact detection). */
  impulse: Vec3;
  /** Fastest suspension compression that hit the bump stops this step (m/s), 0 if none. */
  bottomOut: number;
}

const GRAVITY = 9.81;
/** Above this height over the terrain surface, a wheel is standing on an obstacle (rock, log). */
const OBSTACLE_HEIGHT = 0.25;
/** Aquaplaning: onset speed (m/s), range to full effect, and grip lost at full effect. */
const AQUAPLANE_ONSET = 7;
const AQUAPLANE_RANGE = 6;
const AQUAPLANE_GRIP_LOSS = 0.55;
/** Extra rolling resistance coefficient in a full puddle (water displacement). */
const PUDDLE_DRAG = 0.05;
/** Water depth (m) over which the hull goes from dry to fully submerged. */
const HULL_DEPTH = 1.3;
/** Fraction of the rover's weight carried by buoyancy when fully submerged (it still sinks). */
const BUOYANCY = 0.55;
/** Tyre forces act slightly above the contact patch, as on a real car, to temper body roll. */
const FORCE_LIFT = 0.15;
const BUMP_STOP_START = 0.85;
const BOTTOM_OUT_SPEED = 1.2;
/** Fastest the suspension can compress or extend (m/s). */
const MAX_SUSPENSION_SPEED = 4;
/** At speed the steering lock is reduced (fraction removed at top speed). */
const HIGH_SPEED_STEER_REDUCTION = 0.55;
/** Rover counts as capsized when its up axis is flatter than this. */
const CAPSIZE_UP = 0.35;
const SELF_RIGHT_RATE = 2.2;
const REVERSE_FORCE_SCALE = 0.6;
/** Below this speed with no throttle the brakes engage automatically (m/s). */
const HILL_HOLD_SPEED = 1;
/** Forward speed above which pressing reverse brakes first. */
const REVERSE_BRAKE_SPEED = 1;

/** Per-surface wheel counts, reused every step. */
const surfaceVotes = new Uint8Array(16);

const scratch = {
  q: { x: 0, y: 0, z: 1, w: 0 } as Quat,
  up: { x: 0, y: 1, z: 0 },
  fwd: { x: 0, y: 0, z: -1 },
  right: { x: 1, y: 0, z: 0 },
  mount: { x: 0, y: 0, z: 0 },
  down: { x: 0, y: -1, z: 0 },
  contact: { x: 0, y: 0, z: 0 },
  wheelFwd: { x: 0, y: 0, z: 0 },
  wheelRight: { x: 0, y: 0, z: 0 },
  velocity: { x: 0, y: 0, z: 0 },
  impulse: { x: 0, y: 0, z: 0 },
  flow: { x: 0, y: 0, z: 0 },
  angvel: { x: 0, y: 0, z: 0 },
  hit: { distance: 0, normal: { x: 0, y: 1, z: 0 } } as GroundHit,
};

interface WheelScratch {
  contact: boolean;
  distance: number;
  compression: number;
  previous: number;
  force: number;
  hitX: number;
  hitY: number;
  hitZ: number;
  nx: number;
  ny: number;
  nz: number;
  surface: SurfaceId;
}

/**
 * Physics-based ground vehicle. Each wheel is a raycast suspension (spring, damper, bump stop)
 * over the terrain plus fine surface bumps. Tyre forces are limited by each wheel's load and the
 * surface friction (friction circle), so grip, wheelspin, sliding and body roll all emerge from
 * the simulation instead of being scripted.
 */
export class RoverController {
  /** Top speed allowed by the current surfaces (exposed for tests and HUD). */
  effectiveMaxSpeed = 0;
  private steer = 0;
  private capsizedFor = 0;
  private readonly wheels: WheelScratch[] = Array.from({ length: 4 }, () => ({
    contact: false,
    distance: 0,
    compression: 0,
    previous: 0,
    force: 0,
    hitX: 0,
    hitY: 0,
    hitZ: 0,
    nx: 0,
    ny: 1,
    nz: 0,
    surface: SurfaceId.GRASS as SurfaceId,
  }));
  private readonly result: RoverStepResult = { impulse: { x: 0, y: 0, z: 0 }, bottomOut: 0 };

  constructor(private readonly config: RoverConfig) {}

  /** Wheel mount point in body space. Order: front-right, front-left, rear-right, rear-left. */
  static wheelLocal(config: RoverConfig, index: number): Vec3 {
    const w = config.wheel;
    return {
      x: (index % 2 === 0 ? 1 : -1) * w.trackHalf,
      y: w.mountHeight,
      z: index < 2 ? -w.axleOffset : w.axleOffset,
    };
  }

  /** Resets suspension memory (after teleports or mode changes). */
  reset(): void {
    for (const wheel of this.wheels) wheel.previous = 0;
    this.capsizedFor = 0;
  }

  update(
    state: VehicleState,
    axes: ControlAxes,
    env: RoverEnvironment,
    dt: number,
    body: VehicleBody,
  ): RoverStepResult {
    const c = this.config;
    const s = scratch;
    const result = this.result;
    result.impulse.x = result.impulse.y = result.impulse.z = 0;
    result.bottomOut = 0;

    body.rotation(s.q);
    rotateVector(s.q, 0, 1, 0, s.up);
    rotateVector(s.q, 0, 0, -1, s.fwd);
    rotateVector(s.q, 1, 0, 0, s.right);
    s.down.x = -s.up.x;
    s.down.y = -s.up.y;
    s.down.z = -s.up.z;

    const speedFwd = dot(state.velocity, s.fwd);
    const wheelMass = body.mass / 4;
    const reach = c.suspension.restLength + c.wheel.radius;

    // --- 1. Suspension: raycast every wheel and compute its spring force.
    let contacts = 0;
    let speedFactor = 0;
    for (let i = 0; i < 4; i++) {
      const wheel = this.wheels[i]!;
      this.mountPoint(state, i, s.mount);
      const hit = body.castRay(s.mount, s.down, reach + 0.3, s.hit);
      if (!hit || hit.distance > reach + 0.05) {
        wheel.contact = false;
        wheel.compression = 0;
        wheel.previous = 0;
        wheel.force = 0;
        continue;
      }
      wheel.contact = true;
      wheel.distance = hit.distance;
      wheel.hitX = s.mount.x + s.down.x * hit.distance;
      wheel.hitY = s.mount.y + s.down.y * hit.distance;
      wheel.hitZ = s.mount.z + s.down.z * hit.distance;
      wheel.nx = hit.normal.x;
      wheel.ny = hit.normal.y;
      wheel.nz = hit.normal.z;
      const ground = env.terrain.heightAt(wheel.hitX, wheel.hitZ);
      wheel.surface =
        wheel.hitY > ground + OBSTACLE_HEIGHT
          ? SurfaceId.ROCK
          : state.inWater
            ? SurfaceId.WATER
            : env.terrain.surfaceAt(wheel.hitX, wheel.hitZ);
      const props = getSurface(wheel.surface);
      const bump = surfaceBump(wheel.hitX, wheel.hitZ, props.bumpAmplitude);
      const compression = clamp(reach - hit.distance + bump, 0, c.suspension.restLength);
      // A wheel has mass: when its ray jumps onto a stone edge the suspension cannot follow
      // instantly, so the damper sees a bounded compression speed.
      const velocity = clamp(
        (compression - wheel.previous) / dt,
        -MAX_SUSPENSION_SPEED,
        MAX_SUSPENSION_SPEED,
      );
      wheel.previous = compression;
      wheel.compression = compression;

      let force = c.suspension.stiffness * compression + c.suspension.damping * velocity;
      const stopStart = c.suspension.restLength * BUMP_STOP_START;
      if (compression > stopStart) {
        force += c.suspension.stiffness * c.suspension.bumpStop * (compression - stopStart);
        // Bottoming out: how fast the chassis itself is moving into the ground.
        const closing = -(
          state.velocity.x * hit.normal.x +
          state.velocity.y * hit.normal.y +
          state.velocity.z * hit.normal.z
        );
        if (closing > BOTTOM_OUT_SPEED) result.bottomOut = Math.max(result.bottomOut, closing);
      }
      wheel.force = Math.max(0, force);
      contacts++;
      speedFactor += props.speedMultiplier;
    }

    // Anti-roll bar: resist left/right compression differences on each axle.
    for (const [a, b] of [
      [0, 1],
      [2, 3],
    ] as const) {
      const wa = this.wheels[a]!;
      const wb = this.wheels[b]!;
      if (!wa.contact || !wb.contact) continue;
      const roll = (wa.compression - wb.compression) * c.suspension.antiRoll;
      wa.force = Math.max(0, wa.force + roll);
      wb.force = Math.max(0, wb.force - roll);
    }

    // --- 2. Drivetrain and steering.
    this.effectiveMaxSpeed = contacts > 0 ? c.maxSpeed * (speedFactor / contacts) : c.maxSpeed;
    const speedRatio = clamp(Math.abs(speedFwd) / c.maxSpeed, 0, 1);
    const steerTarget =
      axes.steer * c.maxSteerDeg * DEG2RAD * (1 - HIGH_SPEED_STEER_REDUCTION * speedRatio);
    this.steer = damp(this.steer, steerTarget, c.steerResponse, dt);

    let driveForce = 0;
    // Hill-hold: with no throttle at walking pace the brakes hold the rover on slopes.
    const holding = axes.throttle === 0 && Math.abs(speedFwd) < HILL_HOLD_SPEED;
    let braking = axes.brake || holding;
    if (!braking && axes.throttle > 0) {
      const ratio = clamp(speedFwd / this.effectiveMaxSpeed, 0, 1.2);
      driveForce = axes.throttle * c.engineForce * Math.max(0, 1 - ratio * ratio);
    } else if (!braking && axes.throttle < 0) {
      if (speedFwd > REVERSE_BRAKE_SPEED) braking = true;
      else {
        const ratio = clamp(-speedFwd / c.reverseSpeed, 0, 1.2);
        driveForce =
          axes.throttle * c.engineForce * REVERSE_FORCE_SCALE * Math.max(0, 1 - ratio * ratio);
      }
    }

    // --- 3. Tyre forces per wheel (friction circle).
    let slipTotal = 0;
    let gripTotal = 0;
    let activity = 0;
    for (let i = 0; i < 4; i++) {
      const wheel = this.wheels[i]!;
      if (!wheel.contact) continue;
      const load = wheel.force;
      this.mountPoint(state, i, s.mount);

      // Suspension pushes along the chassis up axis at the mount.
      s.impulse.x = s.up.x * load * dt;
      s.impulse.y = s.up.y * load * dt;
      s.impulse.z = s.up.z * load * dt;
      body.applyImpulseAtPoint(s.impulse, s.mount);
      addTo(result.impulse, s.impulse);

      // Wheel heading: front wheels steer.
      const steer = i < 2 ? this.steer : 0;
      const cos = Math.cos(steer);
      const sin = Math.sin(steer);
      s.wheelFwd.x = s.fwd.x * cos + s.right.x * sin;
      s.wheelFwd.y = s.fwd.y * cos + s.right.y * sin;
      s.wheelFwd.z = s.fwd.z * cos + s.right.z * sin;
      // Project onto the contact plane.
      const along = s.wheelFwd.x * wheel.nx + s.wheelFwd.y * wheel.ny + s.wheelFwd.z * wheel.nz;
      s.wheelFwd.x -= wheel.nx * along;
      s.wheelFwd.y -= wheel.ny * along;
      s.wheelFwd.z -= wheel.nz * along;
      normalize(s.wheelFwd);
      // right = forward × normal
      s.wheelRight.x = s.wheelFwd.y * wheel.nz - s.wheelFwd.z * wheel.ny;
      s.wheelRight.y = s.wheelFwd.z * wheel.nx - s.wheelFwd.x * wheel.nz;
      s.wheelRight.z = s.wheelFwd.x * wheel.ny - s.wheelFwd.y * wheel.nx;

      s.contact.x = wheel.hitX + s.up.x * FORCE_LIFT;
      s.contact.y = wheel.hitY + s.up.y * FORCE_LIFT;
      s.contact.z = wheel.hitZ + s.up.z * FORCE_LIFT;
      body.pointVelocity(s.contact, s.velocity);
      const vLong = dot(s.velocity, s.wheelFwd);
      const vLat = dot(s.velocity, s.wheelRight);

      const props = getSurface(wheel.surface);
      // Standing water: a tyre pushing through it at speed rides up on a film of water
      // (aquaplaning), losing grip progressively above ~30 km/h in a full puddle.
      const puddle = env.puddleAt ? env.puddleAt(wheel.hitX, wheel.hitZ) : 0;
      state.wheels[i]!.puddle = puddle;
      const speedAbs = Math.abs(vLong);
      const aquaplane = puddle * clamp((speedAbs - AQUAPLANE_ONSET) / AQUAPLANE_RANGE, 0, 1);
      const mu =
        c.tireGrip *
        props.traction *
        env.tractionMultiplier *
        (1 - AQUAPLANE_GRIP_LOSS * aquaplane);
      const maxImpulse = mu * load * dt;

      let longImpulse = (driveForce / 4) * dt;
      if (braking) {
        longImpulse =
          -Math.sign(vLong) * Math.min(Math.abs(vLong) * wheelMass, (c.brakeForce / 4) * dt);
      }
      // Rolling resistance (mud and water drag much more than asphalt).
      longImpulse -=
        Math.sign(vLong) *
        Math.min(
          Math.abs(vLong) * wheelMass,
          // Rolling resistance, plus the water the tyre has to push aside (grows with speed²).
          (props.rollingResistance + puddle * PUDDLE_DRAG * (1 + (speedAbs * speedAbs) / 60)) *
            load *
            dt,
        );
      const latImpulse = -vLat * wheelMass * c.lateralStiffness;

      const demand = Math.hypot(longImpulse, latImpulse);
      let scale = 1;
      if (demand > maxImpulse && demand > 0) scale = maxImpulse / demand;
      const slip = 1 - scale;
      s.impulse.x = (s.wheelFwd.x * longImpulse + s.wheelRight.x * latImpulse) * scale;
      s.impulse.y = (s.wheelFwd.y * longImpulse + s.wheelRight.y * latImpulse) * scale;
      s.impulse.z = (s.wheelFwd.z * longImpulse + s.wheelRight.z * latImpulse) * scale;
      body.applyImpulseAtPoint(s.impulse, s.contact);
      addTo(result.impulse, s.impulse);

      // Telemetry for visuals, audio and HUD.
      const wheelState = state.wheels[i]!;
      const spinBoost = slip > 0.05 && driveForce !== 0 ? Math.sign(driveForce) * slip * 12 : 0;
      wheelState.spin += ((vLong + spinBoost) / c.wheel.radius) * dt;
      wheelState.slip = slip;
      slipTotal += slip;
      gripTotal += mu;
      activity += Math.abs(wheel.compression - wheelState.compression) / dt;
    }

    // Water: buoyancy lifts the hull (taking load, and so grip, off the tyres) and the current
    // drags the rover along with it rather than just slowing it down.
    const waterLevel = env.terrain.waterLevelAt(state.position.x, state.position.z);
    if (waterLevel !== null && waterLevel > state.position.y + 0.1) {
      const submerged = clamp((waterLevel - state.position.y) / HULL_DEPTH, 0, 1);
      env.terrain.flowAt?.(state.position.x, state.position.z, s.flow);
      const drag = c.waterDrag * submerged * dt;
      s.impulse.x = (s.flow.x - state.velocity.x) * drag;
      s.impulse.y =
        (c.mass.total * GRAVITY * BUOYANCY * submerged -
          state.velocity.y * c.waterDrag * 0.5 * submerged) *
        dt;
      s.impulse.z = (s.flow.z - state.velocity.z) * drag;
      body.applyImpulse(s.impulse);
      addTo(result.impulse, s.impulse);
    }

    this.selfRight(state, body, dt);
    this.writeState(state, contacts, slipTotal, gripTotal, activity, speedFwd);
    return result;
  }

  private mountPoint(state: VehicleState, index: number, out: Vec3): Vec3 {
    const local = RoverController.wheelLocal(this.config, index);
    rotateVector(scratch.q, local.x, local.y, local.z, out);
    out.x += state.position.x;
    out.y += state.position.y;
    out.z += state.position.z;
    return out;
  }

  /** If the rover ends up on its side or roof, TerraWing flips itself back with a rotor burst. */
  private selfRight(state: VehicleState, body: VehicleBody, dt: number): void {
    state.uprightness = scratch.up.y;
    const capsized = scratch.up.y < CAPSIZE_UP && state.speed < 3;
    this.capsizedFor = capsized ? this.capsizedFor + dt : 0;
    state.selfRighting = this.capsizedFor > this.config.selfRightDelay;
    if (!state.selfRighting) return;
    // Torque the up axis back towards world up (cross(up, worldUp) gives the rotation axis).
    const ax = -scratch.up.z;
    const az = scratch.up.x;
    body.angularVelocity(scratch.angvel);
    scratch.angvel.x = damp(scratch.angvel.x, ax * SELF_RIGHT_RATE * 2, 6, dt);
    scratch.angvel.z = damp(scratch.angvel.z, az * SELF_RIGHT_RATE * 2, 6, dt);
    body.setAngularVelocity(scratch.angvel);
    scratch.impulse.x = 0;
    scratch.impulse.y = body.mass * GRAVITY * 1.1 * dt;
    scratch.impulse.z = 0;
    body.applyImpulse(scratch.impulse);
  }

  private writeState(
    state: VehicleState,
    contacts: number,
    slipTotal: number,
    gripTotal: number,
    activity: number,
    speedFwd: number,
  ): void {
    state.grounded = contacts > 0;
    state.forwardSpeed = speedFwd;
    state.slip = contacts > 0 ? slipTotal / contacts : 0;
    state.traction = contacts > 0 ? clamp(gripTotal / contacts, 0, 1.5) : 0;
    state.suspensionActivity = damp(state.suspensionActivity, activity / 4, 12, 1 / 60);
    state.steerAngle = this.steer;
    let nx = 0;
    let ny = 0;
    let nz = 0;
    surfaceVotes.fill(0);
    for (let i = 0; i < 4; i++) {
      const wheel = this.wheels[i]!;
      const wheelState = state.wheels[i]!;
      wheelState.contact = wheel.contact;
      wheelState.compression = wheel.compression;
      wheelState.surface = wheel.surface;
      if (!wheel.contact) continue;
      nx += wheel.nx;
      ny += wheel.ny;
      nz += wheel.nz;
      surfaceVotes[wheel.surface]!++;
    }
    if (contacts > 0) {
      const length = Math.hypot(nx, ny, nz) || 1;
      state.groundNormal.x = nx / length;
      state.groundNormal.y = ny / length;
      state.groundNormal.z = nz / length;
      let best = 0;
      surfaceVotes.forEach((count, surface) => {
        if (count > best) {
          best = count;
          state.surface = surface as SurfaceId;
        }
      });
    }
    // The chassis itself tilts in physics; no extra visual attitude layer is needed.
    state.visualPitch = 0;
    state.visualRoll = 0;
    state.hovering = false;
  }
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function addTo(target: Vec3, v: Vec3): void {
  target.x += v.x;
  target.y += v.y;
  target.z += v.z;
}

function normalize(v: Vec3): void {
  const length = Math.hypot(v.x, v.y, v.z) || 1;
  v.x /= length;
  v.y /= length;
  v.z /= length;
}
