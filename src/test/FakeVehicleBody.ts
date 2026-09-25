import type { TerrainQuery } from '@/game/environment/TerrainQuery';
import type { BodySample, GroundHit, VehicleBody } from '@/game/physics/VehicleBody';
import type { VelocityCommand } from '@/game/terrawing/VehicleState';

const GRAVITY = 9.81;

/**
 * Minimal kinematic stand-in for the Rapier body: integrates velocity, applies gravity and keeps
 * the body on top of the terrain. Enough to exercise the full gameplay loop in unit tests.
 */
export class FakeVehicleBody implements VehicleBody {
  readonly position = { x: 0, y: 0, z: 0 };
  readonly velocity = { x: 0, y: 0, z: 0 };
  heading = 0;
  private yawRate = 0;
  private gravityScale = 1;

  constructor(private readonly terrain: TerrainQuery) {}

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

  probeGround(
    x: number,
    y: number,
    z: number,
    maxDistance: number,
    out: GroundHit,
  ): GroundHit | null {
    const distance = y - this.terrain.heightAt(x, z);
    if (distance < 0 || distance > maxDistance) return null;
    out.distance = distance;
    this.terrain.normalAt(x, z, out.normal);
    return out;
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
