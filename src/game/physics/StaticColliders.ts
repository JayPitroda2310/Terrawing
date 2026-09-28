import type { Collider } from '@dimforge/rapier3d-compat';
import type { RapierContext } from '@react-three/rapier';

export type StaticShape =
  | { kind: 'cylinder'; x: number; y: number; z: number; halfHeight: number; radius: number }
  | { kind: 'ball'; x: number; y: number; z: number; radius: number }
  | { kind: 'cone'; x: number; y: number; z: number; halfHeight: number; radius: number }
  /** Convex hull of the given points (x, y, z triples, world space). */
  | { kind: 'convex'; points: Float32Array }
  | {
      kind: 'cuboid';
      x: number;
      y: number;
      z: number;
      hx: number;
      hy: number;
      hz: number;
      rotationY: number;
    };

/**
 * Creates many static colliders on a single fixed rigid body in one go. Far cheaper than mounting
 * thousands of collider components. Returns a disposer. `out`, when given, receives each shape's
 * collider (null where a hull could not be built), in shape order.
 */
export function createStaticColliders(
  { world, rapier }: Pick<RapierContext, 'world' | 'rapier'>,
  shapes: readonly StaticShape[],
  friction = 0.8,
  out?: (Collider | null)[],
): () => void {
  const body = world.createRigidBody(rapier.RigidBodyDesc.fixed());
  for (const shape of shapes) {
    let desc;
    switch (shape.kind) {
      case 'cylinder':
        desc = rapier.ColliderDesc.cylinder(shape.halfHeight, shape.radius);
        break;
      case 'ball':
        desc = rapier.ColliderDesc.ball(shape.radius);
        break;
      case 'cone':
        desc = rapier.ColliderDesc.cone(shape.halfHeight, shape.radius);
        break;
      case 'convex': {
        const hull = rapier.ColliderDesc.convexHull(shape.points);
        if (!hull) {
          out?.push(null);
          continue;
        }
        out?.push(world.createCollider(hull.setFriction(friction), body));
        continue;
      }
      case 'cuboid': {
        desc = rapier.ColliderDesc.cuboid(shape.hx, shape.hy, shape.hz);
        const half = shape.rotationY / 2;
        desc.setRotation({ x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) });
        break;
      }
    }
    desc.setTranslation(shape.x, shape.y, shape.z).setFriction(friction);
    out?.push(world.createCollider(desc, body));
  }
  return () => {
    // The world may already be freed when the Physics component unmounts first.
    try {
      if (world.getRigidBody(body.handle)) world.removeRigidBody(body);
    } catch {
      /* world disposed */
    }
  };
}
