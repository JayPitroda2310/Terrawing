import type { TerrainQuery } from '@/game/environment/TerrainQuery';
import type {
  BodyMode,
  BodySample,
  GroundHit,
  Quat,
  Vec3,
  VehicleBody,
} from '@/game/physics/VehicleBody';
import type { VelocityCommand } from '@/game/terrawing/VehicleState';
import { headingToQuaternion } from '@/utils/math/quat';

const GRAVITY = 9.81;
const RAY_STEP = 0.05;

/**
 * Minimal stand-in for the Rapier body: a point mass that yaws, integrates velocity and impulses,
 * applies gravity and stays on top of the terrain. Enough to exercise the gameplay loop in tests
 * (rover suspension included) without a physics engine.
 */
export class FakeVehicleBody implements VehicleBody {
  readonly position = { x: 0, y: 0, z: 0 };
  readonly velocity = { x: 0, y: 0, z: 0 };
  readonly mass = 420;
  heading = 0;
  mode: BodyMode = 'flight';
  private yawRate = 0;
  private gravityScale = 1;

  constructor(private readonly terrain: TerrainQuery) {}

  setMode(mode: BodyMode): void {
    this.mode = mode;
    if (mode === 'rover') this.gravityScale = 1;
  }

  read(out: BodySample): BodySample {
    Object.assign(out.position, this.position);
    Object.assign(out.velocity, this.velocity);
    out.heading = this.heading;
    return out;
  }

  write(command: VelocityCommand): void {
    this.velocity.x = command.x;
    this.velocity.y = command.y;
    this.velocity.z = command.z;
    this.yawRate = command.yawRate;
    this.gravityScale = command.gravityScale;
  }

  rotation(out: Quat): Quat {
    return Object.assign(out, headingToQuaternion(this.heading));
  }

  setRotation(): void {
    /* yaw-only body */
  }

  angularVelocity(out: Vec3): Vec3 {
    out.x = 0;
    out.y = -this.yawRate;
    out.z = 0;
    return out;
  }

  setAngularVelocity(velocity: Vec3): void {
    this.yawRate = -velocity.y;
  }

  pointVelocity(_point: Vec3, out: Vec3): Vec3 {
    return Object.assign(out, this.velocity);
  }

  applyImpulse(impulse: Vec3): void {
    this.velocity.x += impulse.x / this.mass;
    this.velocity.y += impulse.y / this.mass;
    this.velocity.z += impulse.z / this.mass;
  }

  applyImpulseAtPoint(impulse: Vec3): void {
    this.applyImpulse(impulse);
  }

  probeGround(
    x: number,
    y: number,
    z: number,
    maxDistance: number,
    out: GroundHit,
  ): GroundHit | null {
    return this.castRay({ x, y, z }, { x: 0, y: -1, z: 0 }, maxDistance, out);
  }

  castRay(origin: Vec3, direction: Vec3, maxDistance: number, out: GroundHit): GroundHit | null {
    for (let d = 0; d <= maxDistance; d += RAY_STEP) {
      const x = origin.x + direction.x * d;
      const y = origin.y + direction.y * d;
      const z = origin.z + direction.z * d;
      if (y <= this.terrain.heightAt(x, z)) {
        out.distance = d;
        this.terrain.normalAt(x, z, out.normal);
        return out;
      }
    }
    return null;
  }

  teleport(x: number, y: number, z: number, heading: number): void {
    Object.assign(this.position, { x, y, z });
    Object.assign(this.velocity, { x: 0, y: 0, z: 0 });
    this.heading = heading;
  }

  /** Advances the fake physics world. */
  step(dt: number): void {
    this.velocity.y -= GRAVITY * this.gravityScale * dt;
    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;
    this.position.z += this.velocity.z * dt;
    this.heading += this.yawRate * dt;
    const ground = this.terrain.heightAt(this.position.x, this.position.z);
    if (this.position.y < ground) {
      this.position.y = ground;
      if (this.velocity.y < 0) this.velocity.y = 0;
    }
  }
}
