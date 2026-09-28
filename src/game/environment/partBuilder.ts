import {
  BoxGeometry,
  type BufferGeometry,
  CylinderGeometry,
  Euler,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MaterialName } from './materials';

export type V3 = [number, number, number];

interface ColliderSpec {
  half: V3;
  position: V3;
  rotation: V3;
}

export interface BuiltModel {
  meshes: { material: MaterialName; geometry: BufferGeometry }[];
  colliders: ColliderSpec[];
}

/**
 * Collects many small parts and merges them into one geometry per material, so a detailed building
 * costs a handful of draw calls. A transform stack lets parts be placed in local frames (a wall
 * face, a window, a slab).
 */
export class PartBuilder {
  private readonly parts = new Map<MaterialName, BufferGeometry[]>();
  private readonly stack: Matrix4[] = [new Matrix4()];
  readonly colliders: ColliderSpec[] = [];

  private get current(): Matrix4 {
    return this.stack[this.stack.length - 1]!;
  }

  /** Runs `fn` with an extra local transform (translation + Euler rotation). */
  frame(position: V3, rotation: V3, fn: () => void): void {
    const local = new Matrix4().compose(
      new Vector3(...position),
      new Quaternion().setFromEuler(new Euler(...rotation)),
      new Vector3(1, 1, 1),
    );
    this.stack.push(this.current.clone().multiply(local));
    fn();
    this.stack.pop();
  }

  add(
    material: MaterialName,
    geometry: BufferGeometry,
    position: V3 = [0, 0, 0],
    rotation: V3 = [0, 0, 0],
  ): void {
    const local = new Matrix4().compose(
      new Vector3(...position),
      new Quaternion().setFromEuler(new Euler(...rotation)),
      new Vector3(1, 1, 1),
    );
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    g.applyMatrix4(this.current.clone().multiply(local));
    const list = this.parts.get(material) ?? [];
    list.push(g);
    this.parts.set(material, list);
  }

  box(material: MaterialName, size: V3, position: V3, rotation: V3 = [0, 0, 0]): void {
    this.add(material, new BoxGeometry(...size), position, rotation);
  }

  /** Cylinder along Y unless rotated. */
  cyl(
    material: MaterialName,
    radius: number,
    length: number,
    position: V3,
    rotation: V3 = [0, 0, 0],
    segments = 10,
  ): void {
    this.add(material, new CylinderGeometry(radius, radius, length, segments), position, rotation);
  }

  /** Collider in the current frame (only translation + Y/X/Z rotation of this frame are kept). */
  collider(half: V3, position: V3, rotation: V3 = [0, 0, 0]): void {
    const local = new Matrix4().compose(
      new Vector3(...position),
      new Quaternion().setFromEuler(new Euler(...rotation)),
      new Vector3(1, 1, 1),
    );
    const world = this.current.clone().multiply(local);
    const p = new Vector3();
    const q = new Quaternion();
    world.decompose(p, q, new Vector3());
    const e = new Euler().setFromQuaternion(q);
    this.colliders.push({ half, position: [p.x, p.y, p.z], rotation: [e.x, e.y, e.z] });
  }

  build(): BuiltModel {
    const meshes: BuiltModel['meshes'] = [];
    for (const [material, list] of this.parts) {
      const geometry = mergeGeometries(list);
      for (const part of list) part.dispose();
      if (geometry) meshes.push({ material, geometry });
    }
    return { meshes, colliders: this.colliders };
  }
}

const modelCache = new Map<string, BuiltModel>();
export function cached(key: string, build: () => BuiltModel): BuiltModel {
  let model = modelCache.get(key);
  if (!model) {
    model = build();
    modelCache.set(key, model);
  }
  return model;
}
