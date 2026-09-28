import {
  Bone,
  Color,
  CylinderGeometry,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { getMaterial } from '@/game/environment/materials';

/** Colour grades applied over the photo-textured clothing (fabric detail is kept). */
/** High-visibility jacket colours per survivor callsign, so survivors read clearly in the rain. */
export const SURVIVOR_JACKETS: Readonly<Record<string, string>> = {
  A: '#e0531f',
  B: '#2f6fb3',
  C: '#e0aa1f',
};

export const TROUSERS = '#3b4046';
export const BOOTS = '#4a3526';

export type Dir = readonly [number, number, number];

export const ARMS_DOWN = {
  LeftArm: [0.25, -1, 0.05],
  LeftForeArm: [0.1, -1, 0.25],
  RightArm: [-0.25, -1, 0.05],
  RightForeArm: [-0.1, -1, 0.25],
} as const;

const tmp = {
  boneWorld: new Vector3(),
  childWorld: new Vector3(),
  current: new Vector3(),
  target: new Vector3(),
  delta: new Quaternion(),
  worldQuat: new Quaternion(),
  parentQuat: new Quaternion(),
  rootQuat: new Quaternion(),
};

/**
 * Rotates `bone` so the direction from it to its first child bone points along `direction`
 * (given in the space of `root`). Axis-agnostic, so it works for any humanoid rig.
 */
export function aimBone(root: Object3D, bone: Bone, direction: Dir): void {
  const child = bone.children.find((c): c is Bone => (c as Bone).isBone);
  if (!child) return;
  root.updateWorldMatrix(true, true);
  bone.getWorldPosition(tmp.boneWorld);
  child.getWorldPosition(tmp.childWorld);
  tmp.current.subVectors(tmp.childWorld, tmp.boneWorld).normalize();
  root.getWorldQuaternion(tmp.rootQuat);
  tmp.target
    .set(direction[0], direction[1], direction[2])
    .normalize()
    .applyQuaternion(tmp.rootQuat);
  tmp.delta.setFromUnitVectors(tmp.current, tmp.target);
  bone.getWorldQuaternion(tmp.worldQuat);
  tmp.worldQuat.premultiply(tmp.delta);
  bone.parent!.getWorldQuaternion(tmp.parentQuat);
  bone.quaternion.copy(tmp.parentQuat.invert().multiply(tmp.worldQuat));
  bone.updateMatrixWorld(true);
}

/** Replaces the texture's colour with a tint while keeping its light/dark fabric detail. */
export function regrade(
  material: MeshStandardMaterial,
  color: string,
  key: string,
): MeshStandardMaterial {
  const graded = material.clone();
  graded.color = new Color(color);
  graded.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#ifdef USE_MAP
        vec4 twTex = texture2D(map, vMapUv);
        float twLuma = dot(twTex.rgb, vec3(0.299, 0.587, 0.114));
        diffuseColor.rgb *= clamp(0.35 + twLuma * 1.3, 0.0, 1.4);
      #endif`,
    );
  };
  graded.customProgramCacheKey = () => `survivor-${key}`;
  graded.roughness = 0.85;
  return graded;
}

/**
 * Headwear fitted to the head bone (replaces the avatar's fedora): knitted beanie by default, or
 * `style` — a peaked cap (`brim`), a surgical scrub cap, or short hair (`hair`: sits lower).
 */
export interface HeadStyle {
  color: string;
  brim?: boolean;
  hair?: boolean;
}

export function addBeanie(model: Object3D, style?: HeadStyle): void {
  const cap = style?.color;
  model.updateWorldMatrix(true, true);
  let head: Bone | undefined;
  let top: Bone | undefined;
  model.traverse((node) => {
    if (node.name === 'Head') head = node as Bone;
    if (node.name === 'HeadTop_End') top = node as Bone;
  });
  if (!head || !top) return;
  const topLocal = head.worldToLocal(top.getWorldPosition(new Vector3()));
  const length = topLocal.length();
  const radius = length * 0.52;
  const material = cap
    ? new MeshStandardMaterial({ color: cap, roughness: style?.hair ? 0.95 : 0.8 })
    : getMaterial('fleece');
  const beanie = new Mesh(
    new SphereGeometry(
      radius * (style?.hair ? 0.98 : 1),
      20,
      10,
      0,
      Math.PI * 2,
      0,
      Math.PI * (style?.hair ? 0.54 : cap ? 0.5 : 0.56),
    ),
    material,
  );
  // Sit the cap on the upper skull, aligned with the head's up direction.
  const up = topLocal.clone().normalize();
  beanie.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), up);
  beanie.position.copy(up.multiplyScalar(length * 0.55));
  beanie.scale.set(1.05, 1, 1.08);
  beanie.castShadow = true;
  head.add(beanie);
  if (!style?.brim) return;
  // Peaked cap: a stiff brim over the forehead (model faces +Z).
  const origin = head.getWorldPosition(new Vector3());
  const forward = head
    .worldToLocal(origin.clone().add(new Vector3(0, 0, 1)))
    .sub(head.worldToLocal(origin.clone()))
    .normalize();
  const capUp = topLocal.clone().normalize();
  forward.addScaledVector(capUp, -forward.dot(capUp)).normalize();
  const side = new Vector3().crossVectors(capUp, forward);
  const brim = new Mesh(
    new CylinderGeometry(radius * 1.02, radius * 1.02, 0.008, 16, 1, false, -Math.PI / 2, Math.PI),
    material,
  );
  brim.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(side, capUp, forward));
  brim.position.copy(beanie.position).addScaledVector(forward, radius * 0.35);
  brim.scale.set(1, 1, 1.25);
  brim.castShadow = true;
  head.add(brim);
}

/**
 * Stethoscope worn round the neck: tubing looped behind the collar, both ends hanging down the
 * chest to the chest-piece. Built in the rest pose and attached to the upper spine so it follows.
 */
export function addStethoscope(model: Object3D): void {
  model.updateWorldMatrix(true, true);
  let neck: Bone | undefined;
  let chest: Bone | undefined;
  model.traverse((node) => {
    if (node.name === 'Neck') neck = node as Bone;
    if (node.name === 'Spine2') chest = node as Bone;
  });
  if (!neck || !chest) return;
  const base = neck.getWorldPosition(new Vector3());
  const tube = new MeshStandardMaterial({ color: '#1d2125', roughness: 0.45 });
  const metal = new MeshStandardMaterial({ color: '#c9ced3', roughness: 0.2, metalness: 0.95 });
  const group = new Object3D();
  // Loop round the back of the neck.
  const loop = new Mesh(new TorusGeometry(0.085, 0.0065, 6, 24, Math.PI * 1.1), tube);
  loop.rotation.set(Math.PI / 2 + 0.35, 0, Math.PI + Math.PI * -0.05);
  loop.position.set(0, -0.03, -0.005);
  group.add(loop);
  // Both ends down the chest, joining at the chest-piece.
  for (const side of [-1, 1]) {
    const drop = new Mesh(new CylinderGeometry(0.006, 0.006, 0.2, 6), tube);
    drop.position.set(side * 0.07, -0.13, 0.075);
    drop.rotation.z = side * 0.25;
    group.add(drop);
  }
  const piece = new Mesh(new CylinderGeometry(0.022, 0.022, 0.012, 16), metal);
  piece.rotation.x = Math.PI / 2;
  piece.position.set(0.035, -0.25, 0.1);
  group.add(piece);
  group.position.copy(base);
  model.add(group);
  group.updateWorldMatrix(true, true);
  chest.attach(group);
}
