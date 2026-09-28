import { useAnimations, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { CapsuleCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  type Group,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { GameSession } from '@/game/core/GameSession';
import { createRandom } from '@/utils/math/random';

const FOX_MODEL = '/assets/models/fox.glb';
/** Model units → metres (the fox is ~1.55 m nose-to-tail in model units ×100). */
const FOX_SCALE = 0.0072;
const FOX_WALK = 0.9;
const FOX_RUN = 7;
const FOX_FLEE_DISTANCE = 26;
const UP = new Vector3(0, 1, 0);

export interface FoxSpec {
  x: number;
  z: number;
  radius: number;
  seed: number;
}

/**
 * Red fox: wanders its territory (walk), stops to sniff and look around (survey), and bolts at a
 * full run when TerraWing comes near. Its body is a kinematic capsule in the physics world.
 */
export function Fox({ session, spec }: { session: GameSession; spec: FoxSpec }) {
  const gltf = useGLTF(FOX_MODEL);
  const scene = useMemo(() => {
    const copy = cloneSkinned(gltf.scene);
    copy.traverse((node) => {
      if (node instanceof Mesh) {
        node.castShadow = true;
        node.frustumCulled = false;
      }
    });
    return copy;
  }, [gltf.scene]);
  const holder = useRef<Group>(null);
  const body = useRef<RapierRigidBody>(null);
  const { actions } = useAnimations(gltf.animations, holder);
  const quat = useMemo(() => new Quaternion(), []);
  const agent = useMemo(() => {
    const random = createRandom(spec.seed);
    return {
      random,
      x: spec.x,
      z: spec.z,
      yaw: random() * Math.PI * 2,
      target: { x: spec.x, z: spec.z },
      wait: 1 + random() * 3,
      speed: 0,
      flee: 0,
      clip: '' as string,
    };
  }, [spec]);

  useEffect(() => {
    for (const action of Object.values(actions)) action?.stop();
  }, [actions]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const a = agent;
    const v = session.vehicle.state;
    const dx = a.x - v.position.x;
    const dz = a.z - v.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < FOX_FLEE_DISTANCE && (v.speed > 1 || v.mode === 'FLIGHT')) a.flee = 4;
    a.flee = Math.max(0, a.flee - dt);

    let desired = 0;
    let heading = a.yaw;
    if (a.flee > 0) {
      heading = Math.atan2(dx, dz);
      desired = FOX_RUN;
    } else if (a.wait > 0) a.wait -= dt;
    else {
      const tx = a.target.x - a.x;
      const tz = a.target.z - a.z;
      if (Math.hypot(tx, tz) < 0.8) {
        a.wait = 2 + a.random() * 6;
        const ang = a.random() * Math.PI * 2;
        const r = Math.sqrt(a.random()) * spec.radius;
        a.target = { x: spec.x + Math.cos(ang) * r, z: spec.z + Math.sin(ang) * r };
      } else {
        heading = Math.atan2(tx, tz);
        desired = FOX_WALK;
      }
    }
    a.speed += (desired - a.speed) * Math.min(1, dt * 4);
    let turn = heading - a.yaw;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    a.yaw += turn * Math.min(1, dt * 5);
    const nx = a.x + Math.sin(a.yaw) * a.speed * dt;
    const nz = a.z + Math.cos(a.yaw) * a.speed * dt;
    if (session.terrain.waterLevelAt(nx, nz) === null) {
      a.x = nx;
      a.z = nz;
    }
    body.current?.setNextKinematicTranslation({
      x: a.x,
      y: session.terrain.heightAt(a.x, a.z),
      z: a.z,
    });
    body.current?.setNextKinematicRotation(quat.setFromAxisAngle(UP, a.yaw));

    const clip = a.speed > 3 ? 'Run' : a.speed > 0.25 ? 'Walk' : 'Survey';
    if (clip !== a.clip) {
      actions[a.clip]?.fadeOut(0.25);
      actions[clip]?.reset().fadeIn(0.25).play();
      a.clip = clip;
    }
    const action = actions[clip];
    if (action)
      action.timeScale = clip === 'Walk' ? a.speed / FOX_WALK : clip === 'Run' ? a.speed / 5 : 1;
  });

  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[spec.x, 0, spec.z]}>
      <CapsuleCollider args={[0.3, 0.2]} position={[0, 0.3, 0]} rotation={[Math.PI / 2, 0, 0]} />
      <group ref={holder} scale={FOX_SCALE}>
        <primitive object={scene} />
      </group>
    </RigidBody>
  );
}

// ---------------------------------------------------------------------------------------------
// Birds
// ---------------------------------------------------------------------------------------------

/** A bird silhouette: body with two wings (vertices 3–8) that flap about the body line. */
function createBirdGeometry(): BufferGeometry {
  const g = new BufferGeometry();
  // Body (nose → tail), wing roots and tips; wings are separate triangles so they can flap.
  const p = [
    0, 0, 0.18, -0.03, 0, -0.16, 0.03, 0, -0.16, 0, 0, 0.06, 0, 0, -0.08, 0.42, 0, -0.02, 0, 0,
    0.06, 0, 0, -0.08, -0.42, 0, -0.02,
  ];
  g.setAttribute('position', new BufferAttribute(new Float32Array(p), 3));
  g.computeVertexNormals();
  return g;
}

interface Bird {
  angle: number;
  radius: number;
  height: number;
  speed: number;
  phase: number;
  scatter: Vector3;
}

/**
 * Flocks of crows circling over the valley on the breeze: each bird flaps and glides, and the
 * flock bursts apart when the drone flies into it, then regroups.
 */
export function BirdFlock({
  session,
  centre,
  count,
  seed,
}: {
  session: GameSession;
  centre: { x: number; z: number };
  count: number;
  seed: number;
}) {
  const geometry = useMemo(createBirdGeometry, []);
  const material = useMemo(
    () => new MeshStandardMaterial({ color: '#16181a', roughness: 0.9, side: DoubleSide }),
    [],
  );
  const mesh = useMemo(() => {
    const m = new InstancedMesh(geometry, material, count);
    m.frustumCulled = false;
    return m;
  }, [geometry, material, count]);
  const birds = useMemo<Bird[]>(() => {
    const random = createRandom(seed);
    return Array.from({ length: count }, () => ({
      angle: random() * Math.PI * 2,
      radius: 25 + random() * 35,
      height: 38 + random() * 22,
      speed: 0.18 + random() * 0.12,
      phase: random() * 10,
      scatter: new Vector3(),
    }));
  }, [count, seed]);
  const flap = useMemo(() => {
    const position = geometry.getAttribute('position') as BufferAttribute;
    return Float32Array.from(position.array as Float32Array);
  }, [geometry]);
  const dummy = useMemo(() => new Object3D(), []);
  const baseY = useMemo(
    () => session.terrain.heightAt(centre.x, centre.z),
    [session, centre.x, centre.z],
  );

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const t = clock.elapsedTime;
    const drone = session.vehicle.state.position;
    // Wing flap: shared by the flock (morphing the one geometry is cheap and reads fine at range).
    const position = geometry.getAttribute('position') as BufferAttribute;
    const beat = Math.sin(t * 9);
    for (const tip of [5, 8]) position.setY(tip, flap[tip * 3 + 1]! + beat * 0.22);
    position.needsUpdate = true;
    birds.forEach((b, i) => {
      b.angle += b.speed * dt;
      const x = centre.x + Math.cos(b.angle) * b.radius + b.scatter.x;
      const z = centre.z + Math.sin(b.angle) * b.radius + b.scatter.z;
      const y = baseY + b.height + Math.sin(t * 0.7 + b.phase) * 2 + b.scatter.y;
      const dx = x - drone.x;
      const dy = y - drone.y;
      const dz = z - drone.z;
      const d = Math.hypot(dx, dy, dz);
      if (d < 28)
        b.scatter.addScaledVector(new Vector3(dx, Math.abs(dy) + 4, dz).normalize(), 22 * dt);
      else b.scatter.multiplyScalar(1 - dt * 0.15);
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, -b.angle, Math.sin(t + b.phase) * 0.2);
      dummy.scale.setScalar(1.6);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  return <primitive object={mesh} />;
}

useGLTF.preload(FOX_MODEL);
