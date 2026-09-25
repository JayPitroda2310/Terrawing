import type { RapierRigidBody, RapierContext } from '@react-three/rapier';
import type { VelocityCommand } from '@/game/terrawing/VehicleState';
import type { BodySample, GroundHit, VehicleBody } from './VehicleBody';

type Rapier = RapierContext['rapier'];
type World = RapierContext['world'];

/** Heading ↔ quaternion. The body only ever yaws; rotation.y = -heading. */
export function headingToQuaternion(heading: number): {
  x: number;
  y: number;
  z: number;
  w: number;
} {
  const half = -heading / 2;
  return { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) };
}

export function quaternionToHeading(q: { x: number; y: number; z: number; w: number }): number {
  const yaw = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));
  return -yaw;
}

/** VehicleBody implementation backed by a Rapier dynamic rigid body. */
export class RapierVehicleBody implements VehicleBody {
  private readonly ray: InstanceType<Rapier['Ray']>;
  private readonly linvel = { x: 0, y: 0, z: 0 };
  private readonly angvel = { x: 0, y: 0, z: 0 };
  private gravityScale = -1;

  constructor(
    private readonly body: RapierRigidBody,
    private readonly world: World,
    rapier: Rapier,
  ) {
    this.ray = new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  }

  read(out: BodySample): BodySample {
    const t = this.body.translation();
    const v = this.body.linvel();
    out.position.x = t.x;
    out.position.y = t.y;
    out.position.z = t.z;
    out.velocity.x = v.x;
    out.velocity.y = v.y;
    out.velocity.z = v.z;
    out.heading = quaternionToHeading(this.body.rotation());
    return out;
  }

  write(command: VelocityCommand): void {
    this.linvel.x = command.x;
    this.linvel.y = command.y;
    this.linvel.z = command.z;
    this.body.setLinvel(this.linvel, true);
    this.angvel.y = -command.yawRate;
    this.body.setAngvel(this.angvel, true);
    if (command.gravityScale !== this.gravityScale) {
      this.gravityScale = command.gravityScale;
      this.body.setGravityScale(command.gravityScale, true);
    }
  }

  probeGround(
    x: number,
    y: number,
    z: number,
    maxDistance: number,
    out: GroundHit,
  ): GroundHit | null {
    this.ray.origin.x = x;
    this.ray.origin.y = y;
    this.ray.origin.z = z;
    const hit = this.world.castRayAndGetNormal(
      this.ray,
      maxDistance,
      true,
      undefined,
      undefined,
      undefined,
      this.body,
      (collider) => !collider.isSensor(),
    );
    if (!hit) return null;
    out.distance = hit.timeOfImpact;
    out.normal.x = hit.normal.x;
    out.normal.y = hit.normal.y;
    out.normal.z = hit.normal.z;
    return out;
  }

  teleport(x: number, y: number, z: number, heading: number): void {
    this.body.setTranslation({ x, y, z }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setRotation(headingToQuaternion(heading), true);
  }
}
