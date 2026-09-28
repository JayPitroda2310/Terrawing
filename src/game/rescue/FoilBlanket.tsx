import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  BackSide,
  type Bone,
  type BufferAttribute,
  CanvasTexture,
  FrontSide,
  type Group,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  Vector2,
  Vector3,
} from 'three';
import { sampleAirflow } from '@/game/environment/airflow';
import type { SurvivorDefinition } from '@/game/missions/MissionDefinition';
import { createRandom } from '@/utils/math/random';

type Pose = SurvivorDefinition['pose'];

const COLUMNS = 13;
const ROWS = 17;
const WIDTH = 1.45;
/** Standing survivors get it to calf length; sitting/lying ones need more to cover the legs. */
const lengthFor = (pose: Pose) => (pose === 'waving' ? 1.45 : 2.05);
/** Largest distance a particle may move in one substep (keeps the solver from exploding). */
const MAX_MOVE = 0.08;
const GRAVITY = -9.81;
const SUBSTEP = 1 / 90;
const ITERATIONS = 6;
/** Cloth stand-off from the body and ground (foil thickness + a little air). */
const MARGIN = 0.025;
/** Simulate only when the camera is this close; farther away the blanket rests as it is. */
const SIM_DISTANCE = 140;

/** Body collision capsules: bone pairs and radii (m). */
const CAPSULES: readonly [string, string, number][] = [
  ['Hips', 'Spine2', 0.16],
  ['Spine2', 'Neck', 0.17],
  ['LeftArm', 'RightArm', 0.1],
  ['Head', 'HeadTop_End', 0.12],
  ['LeftArm', 'LeftForeArm', 0.065],
  ['LeftForeArm', 'LeftHand', 0.055],
  ['RightArm', 'RightForeArm', 0.065],
  ['RightForeArm', 'RightHand', 0.055],
  ['LeftUpLeg', 'LeftLeg', 0.09],
  ['LeftLeg', 'LeftFoot', 0.065],
  ['RightUpLeg', 'RightLeg', 0.09],
  ['RightLeg', 'RightFoot', 0.065],
];

let crinkleTexture: CanvasTexture | null = null;
/**
 * Normal map of crumpled foil: random flat facets, each tilted a different way, so the mirror-like
 * sheet breaks the sky into bright and dark patches like real mylar.
 */
function getCrinkleTexture(): CanvasTexture {
  if (crinkleTexture) return crinkleTexture;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgb(128,128,255)';
  ctx.fillRect(0, 0, size, size);
  const random = createRandom(515);
  for (let i = 0; i < 1400; i++) {
    const x = random() * size;
    const y = random() * size;
    const r = 4 + random() * 16;
    const nx = (random() - 0.5) * 1.3;
    const ny = (random() - 0.5) * 1.3;
    const nz = Math.sqrt(Math.max(0.1, 1 - nx * nx - ny * ny));
    ctx.fillStyle = `rgb(${Math.round((nx * 0.5 + 0.5) * 255)},${Math.round((ny * 0.5 + 0.5) * 255)},${Math.round((nz * 0.5 + 0.5) * 255)})`;
    ctx.beginPath();
    const corners = 3 + Math.floor(random() * 3);
    for (let k = 0; k < corners; k++) {
      const a = (k / corners) * Math.PI * 2 + random() * 0.8;
      const d = r * (0.6 + random() * 0.6);
      if (k === 0) ctx.moveTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
      else ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
    }
    ctx.closePath();
    ctx.fill();
  }
  crinkleTexture = new CanvasTexture(canvas);
  crinkleTexture.wrapS = crinkleTexture.wrapT = RepeatWrapping;
  crinkleTexture.repeat.set(3, 4);
  return crinkleTexture;
}

interface Cloth {
  points: Vector3[];
  previous: Vector3[];
  /** Pinned particles and the function giving their target position this frame. */
  pinned: Map<number, Vector3>;
  links: { a: number; b: number; rest: number; stiffness: number }[];
  initialised: boolean;
  capsules: { a: Vector3; b: Vector3; radius: number }[];
}

function createLinks(spacingX: number, spacingY: number): Cloth['links'] {
  const links: Cloth['links'] = [];
  const id = (c: number, r: number) => r * COLUMNS + c;
  const diagonal = Math.hypot(spacingX, spacingY);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLUMNS; c++) {
      const add = (nc: number, nr: number, rest: number, stiffness: number) => {
        if (nc < 0 || nc >= COLUMNS || nr >= ROWS) return;
        links.push({ a: id(c, r), b: id(nc, nr), rest, stiffness });
      };
      add(c + 1, r, spacingX, 1);
      add(c, r + 1, spacingY, 1);
      add(c + 1, r + 1, diagonal, 0.7);
      add(c - 1, r + 1, diagonal, 0.7);
      // Weak bending links: foil creases easily but is not completely limp.
      add(c + 2, r, spacingX * 2, 0.12);
      add(c, r + 2, spacingY * 2, 0.12);
    }
  }
  return links;
}

/**
 * Mylar emergency blanket simulated as cloth: draped over the survivor's shoulders (or laid over
 * them when lying down), it falls onto the body, collides with the torso, arms, legs and ground,
 * and moves in the wind and in TerraWing's rotor wash.
 */
export function FoilBlanket({
  pose,
  getBones,
  isActive,
}: {
  pose: Pose;
  getBones: () => ReadonlyMap<string, Bone> | null;
  isActive: () => boolean;
}) {
  const group = useRef<Group>(null);
  const { geometry, silver, gold } = useMemo(() => {
    const g = new PlaneGeometry(WIDTH, lengthFor(pose), COLUMNS - 1, ROWS - 1);
    const normalMap = getCrinkleTexture();
    return {
      geometry: g,
      // Silver face out, gold face in — like real two-sided emergency blankets. The sheet's front
      // face ends up against the body, so silver is drawn on the back face.
      silver: new MeshStandardMaterial({
        color: '#c2c8ce',
        metalness: 1,
        roughness: 0.32,
        normalMap,
        normalScale: new Vector2(0.9, 0.9),
        side: BackSide,
      }),
      gold: new MeshStandardMaterial({
        color: '#c6973c',
        metalness: 1,
        roughness: 0.34,
        normalMap,
        normalScale: new Vector2(0.9, 0.9),
        side: FrontSide,
      }),
    };
  }, [pose]);
  useEffect(
    () => () => {
      geometry.dispose();
      silver.dispose();
      gold.dispose();
    },
    [geometry, silver, gold],
  );

  const cloth = useMemo<Cloth>(
    () => ({
      points: Array.from({ length: COLUMNS * ROWS }, () => new Vector3()),
      previous: Array.from({ length: COLUMNS * ROWS }, () => new Vector3()),
      pinned: new Map(),
      links: createLinks(WIDTH / (COLUMNS - 1), lengthFor(pose) / (ROWS - 1)),
      initialised: false,
      capsules: CAPSULES.map(([, , radius]) => ({ a: new Vector3(), b: new Vector3(), radius })),
    }),
    [pose],
  );
  const scratch = useMemo(
    () => ({
      world: new Vector3(),
      air: new Vector3(),
      inverse: new Quaternion(),
      normal: new Vector3(),
      delta: new Vector3(),
      ab: new Vector3(),
      left: new Vector3(),
      right: new Vector3(),
      neck: new Vector3(),
      lateral: new Vector3(),
      forward: new Vector3(),
      centre: new Vector3(),
      hips: new Vector3(),
      head: new Vector3(),
    }),
    [],
  );

  /** Bone position in the blanket group's local space. */
  const local = (bones: ReadonlyMap<string, Bone>, name: string, out: Vector3): boolean => {
    const bone = bones.get(name);
    if (!bone || !group.current) return false;
    bone.getWorldPosition(out);
    group.current.worldToLocal(out);
    return true;
  };

  /** Updates the shoulder pins (standing/sitting): an arc around the back of the neck. */
  const updatePins = (bones: ReadonlyMap<string, Bone>) => {
    const s = scratch;
    if (!local(bones, 'LeftArm', s.left) || !local(bones, 'RightArm', s.right)) return false;
    local(bones, 'Neck', s.neck);
    s.lateral.subVectors(s.left, s.right);
    const halfWidth = s.lateral.length() / 2 + 0.07;
    s.lateral.normalize();
    // Character faces +forward: right shoulder × up.
    s.forward.set(0, 1, 0).cross(s.lateral).negate().normalize();
    s.centre.addVectors(s.left, s.right).multiplyScalar(0.5);
    s.centre.y = Math.max(s.centre.y, s.neck.y - 0.05) + 0.05;
    for (let c = 0; c < COLUMNS; c++) {
      const t = (c / (COLUMNS - 1) - 0.5) * Math.PI * 1.15;
      const target = cloth.pinned.get(c) ?? new Vector3();
      target
        .copy(s.centre)
        .addScaledVector(s.lateral, Math.sin(t) * halfWidth)
        .addScaledVector(s.forward, -Math.cos(t) * 0.15 + Math.max(0, Math.abs(t) - 1.2) * 0.2);
      target.y -= Math.abs(Math.sin(t)) * 0.06;
      cloth.pinned.set(c, target);
    }
    return true;
  };

  const initialise = (bones: ReadonlyMap<string, Bone>) => {
    const s = scratch;
    const spacing = lengthFor(pose) / (ROWS - 1);
    if (pose === 'lying') {
      // Laid flat above the body, then allowed to settle; the four corners are tucked in.
      local(bones, 'Hips', s.hips);
      local(bones, 'Head', s.head);
      s.forward.subVectors(s.head, s.hips).setY(0).normalize();
      s.lateral.set(0, 1, 0).cross(s.forward).normalize();
      s.centre.copy(s.hips).addScaledVector(s.forward, -0.15);
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLUMNS; c++) {
          const i = r * COLUMNS + c;
          cloth.points[i]!.copy(s.centre)
            .addScaledVector(s.forward, (0.5 - r / (ROWS - 1)) * lengthFor(pose) * 0.95)
            .addScaledVector(s.lateral, (c / (COLUMNS - 1) - 0.5) * WIDTH);
          cloth.points[i]!.y = 0.55;
          cloth.previous[i]!.copy(cloth.points[i]!);
        }
      }
      for (const i of [0, COLUMNS - 1, (ROWS - 1) * COLUMNS, ROWS * COLUMNS - 1]) {
        cloth.pinned.set(i, cloth.points[i]!.clone().setY(MARGIN));
      }
    } else {
      if (!updatePins(bones)) return false;
      // Hanging straight down from the shoulder arc, slightly out from the body.
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLUMNS; c++) {
          const i = r * COLUMNS + c;
          const pin = cloth.pinned.get(c)!;
          s.delta.subVectors(pin, s.centre).setY(0).normalize();
          // Hang down to the ground; any length left over lies folded out behind on the ground,
          // so the cloth starts without being forced through the terrain.
          const drop = r * spacing;
          const hang = Math.min(drop, pin.y - MARGIN);
          cloth.points[i]!.copy(pin).addScaledVector(s.delta, r * 0.02);
          cloth.points[i]!.y -= hang;
          cloth.points[i]!.addScaledVector(s.forward, -(drop - hang));
          cloth.previous[i]!.copy(cloth.points[i]!);
        }
      }
    }
    cloth.initialised = true;
    return true;
  };

  /** Limits a particle's move this substep, so a violent correction can't fling the cloth. */
  const clampMove = (p: Vector3, prev: Vector3) => {
    scratch.delta.subVectors(p, prev);
    const moved = scratch.delta.length();
    if (moved > MAX_MOVE) p.copy(prev).addScaledVector(scratch.delta, MAX_MOVE / moved);
  };

  const collide = (p: Vector3) => {
    const s = scratch;
    for (const capsule of cloth.capsules) {
      s.ab.subVectors(capsule.b, capsule.a);
      const lengthSq = s.ab.lengthSq() || 1e-6;
      const t = Math.min(1, Math.max(0, s.delta.subVectors(p, capsule.a).dot(s.ab) / lengthSq));
      s.delta.copy(capsule.a).addScaledVector(s.ab, t);
      s.delta.subVectors(p, s.delta);
      const distance = s.delta.length();
      const minimum = capsule.radius + MARGIN;
      if (distance < minimum && distance > 1e-6)
        p.addScaledVector(s.delta, (minimum - distance) / distance);
    }
    if (p.y < MARGIN) p.y = MARGIN;
  };

  useFrame(({ camera }, rawDt) => {
    const root = group.current;
    if (!root) return;
    const active = isActive();
    root.visible = active && cloth.initialised;
    if (!active) {
      cloth.initialised = false;
      return;
    }
    const bones = getBones();
    if (!bones) return;
    if (!cloth.initialised) {
      if (!initialise(bones)) return;
      writeGeometry();
      root.visible = true;
    }
    root.getWorldPosition(scratch.world);
    if (scratch.world.distanceTo(camera.position) > SIM_DISTANCE) return;

    // Body capsules from the posed skeleton.
    CAPSULES.forEach(([from, to], k) => {
      const capsule = cloth.capsules[k]!;
      if (!local(bones, from, capsule.a) || !local(bones, to, capsule.b)) capsule.radius = 0;
    });
    if (pose !== 'lying') updatePins(bones);

    // Airflow (weather + rotor wash) in local space.
    sampleAirflow(scratch.world.x, scratch.world.y + 1, scratch.world.z, scratch.air);
    root.getWorldQuaternion(scratch.inverse).invert();
    scratch.air.applyQuaternion(scratch.inverse);
    const normals = geometry.getAttribute('normal') as BufferAttribute;

    const dt = Math.min(rawDt, 0.05);
    const steps = Math.max(2, Math.ceil(dt / SUBSTEP));
    const h = dt / steps;
    for (let step = 0; step < steps; step++) {
      for (let i = 0; i < cloth.points.length; i++) {
        const p = cloth.points[i]!;
        const prev = cloth.previous[i]!;
        const pin = cloth.pinned.get(i);
        if (pin) {
          prev.copy(p);
          p.copy(pin);
          continue;
        }
        // Foil is very light: air pressure through the sheet's normal plus a little skin drag.
        scratch.normal.fromBufferAttribute(normals, i);
        const vx = scratch.air.x - (p.x - prev.x) / h;
        const vy = scratch.air.y - (p.y - prev.y) / h;
        const vz = scratch.air.z - (p.z - prev.z) / h;
        const speed = Math.min(20, Math.hypot(vx, vy, vz));
        const pressure =
          (vx * scratch.normal.x + vy * scratch.normal.y + vz * scratch.normal.z) * speed * 0.35;
        const ax = scratch.normal.x * pressure + vx * speed * 0.05;
        const ay = scratch.normal.y * pressure + vy * speed * 0.05 + GRAVITY;
        const az = scratch.normal.z * pressure + vz * speed * 0.05;
        const nx = p.x + (p.x - prev.x) * 0.97 + ax * h * h;
        const ny = p.y + (p.y - prev.y) * 0.97 + ay * h * h;
        const nz = p.z + (p.z - prev.z) * 0.97 + az * h * h;
        prev.copy(p);
        p.set(nx, ny, nz);
        clampMove(p, prev);
      }
      for (let iteration = 0; iteration < ITERATIONS; iteration++) {
        for (const link of cloth.links) {
          const pa = cloth.points[link.a]!;
          const pb = cloth.points[link.b]!;
          scratch.delta.subVectors(pb, pa);
          const length = scratch.delta.length() || 1e-6;
          const error = ((length - link.rest) / length) * link.stiffness;
          const aPinned = cloth.pinned.has(link.a);
          const bPinned = cloth.pinned.has(link.b);
          if (aPinned && bPinned) continue;
          if (aPinned) pb.addScaledVector(scratch.delta, -error);
          else if (bPinned) pa.addScaledVector(scratch.delta, error);
          else {
            pa.addScaledVector(scratch.delta, error * 0.5);
            pb.addScaledVector(scratch.delta, -error * 0.5);
          }
        }
        for (let i = 0; i < cloth.points.length; i++) {
          if (!cloth.pinned.has(i)) collide(cloth.points[i]!);
        }
      }
    }

    writeGeometry();
  });

  function writeGeometry() {
    const position = geometry.getAttribute('position') as BufferAttribute;
    cloth.points.forEach((p, i) => position.setXYZ(i, p.x, p.y, p.z));
    position.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
  }

  return (
    <group ref={group} visible={false}>
      <mesh geometry={geometry} material={silver} castShadow frustumCulled={false} />
      <mesh geometry={geometry} material={gold} frustumCulled={false} />
    </group>
  );
}
