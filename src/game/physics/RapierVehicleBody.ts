import type { RapierCollider, RapierContext, RapierRigidBody } from '@react-three/rapier';
import type { RoverConfig } from '@/game/terrawing/RoverController';
import type { VelocityCommand } from '@/game/terrawing/VehicleState';
import { headingToQuaternion, quaternionToHeading } from '@/utils/math/quat';
import type { BodyMode, BodySample, GroundHit, Quat, Vec3, VehicleBody } from './VehicleBody';

type Rapier = RapierContext['rapier'];
type World = RapierContext['world'];

export { headingToQuaternion, quaternionToHeading };

export interface VehicleColliders {
  /** Sphere used in flight (and while landed before the wheels deploy). */
  flight: RapierCollider;
  /** Chassis box used in rover mode; the wheels are raycasts. */
  rover: RapierCollider;
}

/** VehicleBody implementation backed by a Rapier dynamic rigid body. */
export class RapierVehicleBody implements VehicleBody {
  private readonly ray: InstanceType<Rapier['Ray']>;
  private readonly linvel = { x: 0, y: 0, z: 0 };
  private readonly angvel = { x: 0, y: 0, z: 0 };
  private gravityScale = -1;
  private mode: BodyMode | null = null;
  readonly mass: number;
  private readonly angularDamping: number;

  constructor(
    private readonly body: RapierRigidBody,
    private readonly world: World,
    rapier: Rapier,
    private readonly colliders: VehicleColliders,
    rover: RoverConfig,
  ) {
    this.ray = new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    const m = rover.mass;
    this.mass = m.total;
    this.angularDamping = m.angularDamping;
    // Explicit mass properties: a low centre of mass keeps the rover planted on slopes.
    body.setAdditionalMassProperties(
      m.total,
      { x: 0, y: m.centerHeight, z: 0 },
      { x: m.inertia[0], y: m.inertia[1], z: m.inertia[2] },
      { x: 0, y: 0, z: 0, w: 1 },
      true,
    );
  }

  setMode(mode: BodyMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    const rover = mode === 'rover';
    this.colliders.flight.setEnabled(!rover);
    this.colliders.rover.setEnabled(rover);
    this.body.setEnabledRotations(rover, true, rover, true);
    this.body.setAngularDamping(rover ? this.angularDamping : 0);
    if (rover) {
      this.body.setGravityScale(1, true);
      this.gravityScale = 1;
    }
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
    // In rover mode pitch/roll come from the physics; only override them while flying.
    if (this.mode !== 'rover') {
      this.angvel.x = 0;
      this.angvel.z = 0;
      this.angvel.y = -command.yawRate;
      this.body.setAngvel(this.angvel, true);
    }
    if (command.gravityScale !== this.gravityScale) {
      this.gravityScale = command.gravityScale;
      this.body.setGravityScale(command.gravityScale, true);
    }
  }

  rotation(out: Quat): Quat {
    const r = this.body.rotation();
    out.x = r.x;
    out.y = r.y;
    out.z = r.z;
    out.w = r.w;
    return out;
  }

  setRotation(rotation: Quat): void {
    this.body.setRotation(rotation, true);
  }

  angularVelocity(out: Vec3): Vec3 {
    const w = this.body.angvel();
    out.x = w.x;
    out.y = w.y;
    out.z = w.z;
    return out;
  }

  setAngularVelocity(velocity: Vec3): void {
    this.body.setAngvel(velocity, true);
  }

  pointVelocity(point: Vec3, out: Vec3): Vec3 {
    const v = this.body.velocityAtPoint(point);
    out.x = v.x;
    out.y = v.y;
    out.z = v.z;
    return out;
  }

  applyImpulse(impulse: Vec3): void {
    this.body.applyImpulse(impulse, true);
  }

  applyImpulseAtPoint(impulse: Vec3, point: Vec3): void {
    this.body.applyImpulseAtPoint(impulse, point, true);
  }

  probeGround(
    x: number,
    y: number,
    z: number,
    maxDistance: number,
    out: GroundHit,
  ): GroundHit | null {
    return this.cast(x, y, z, 0, -1, 0, maxDistance, out);
  }

  castRay(origin: Vec3, direction: Vec3, maxDistance: number, out: GroundHit): GroundHit | null {
    return this.cast(
      origin.x,
      origin.y,
      origin.z,
      direction.x,
      direction.y,
      direction.z,
      maxDistance,
      out,
    );
  }

  teleport(x: number, y: number, z: number, heading: number): void {
    this.body.setTranslation({ x, y, z }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setRotation(headingToQuaternion(heading), true);
  }

  private cast(
    x: number,
    y: number,
    z: number,
    dx: number,
    dy: number,
    dz: number,
    maxDistance: number,
    out: GroundHit,
  ): GroundHit | null {
    this.ray.origin.x = x;
    this.ray.origin.y = y;
    this.ray.origin.z = z;
    this.ray.dir.x = dx;
    this.ray.dir.y = dy;
    this.ray.dir.z = dz;
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
}
