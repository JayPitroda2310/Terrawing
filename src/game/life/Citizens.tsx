import { useFrame } from '@react-three/fiber';
import { CapsuleCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import { useMemo, useRef } from 'react';
import { type Group, Quaternion, Vector3 } from 'three';
import type { GameSession } from '@/game/core/GameSession';
import { aimBone, ARMS_DOWN } from '@/game/rescue/humanRig';
import { gaitAims, STRIDE, useHumanModel } from './humanActor';
import { createRandom, type RandomFn } from '@/utils/math/random';

export interface CitizenSpec {
  id: string;
  /** Home area the citizen wanders in. */
  home: { x: number; z: number; radius: number };
  jacket: string;
  /** Rescue workers walk briskly; civilians amble. */
  role: 'worker' | 'civilian';
  seed: number;
}

const WALK_SPEED = { worker: 1.45, civilian: 1.15 };
const RUN_SPEED = 3.9;
const FLEE_DISTANCE = 9;
const ANIMATE_DISTANCE = 80;
const UP = new Vector3(0, 1, 0);

function pickTarget(
  session: GameSession,
  spec: CitizenSpec,
  random: RandomFn,
  out: { x: number; z: number },
): void {
  const normal = { x: 0, y: 1, z: 0 };
  for (let attempt = 0; attempt < 12; attempt++) {
    const a = random() * Math.PI * 2;
    const r = Math.sqrt(random()) * spec.home.radius;
    const x = spec.home.x + Math.cos(a) * r;
    const z = spec.home.z + Math.sin(a) * r;
    if (session.terrain.waterLevelAt(x, z) !== null) continue;
    session.terrain.normalAt(x, z, normal);
    if (normal.y < 0.93) continue;
    out.x = x;
    out.z = z;
    return;
  }
  out.x = spec.home.x;
  out.z = spec.home.z;
}

/**
 * A citizen going about their day: walks between spots in their area with a real gait, pauses to
 * look around, and gets out of the way — running — when TerraWing drives or flies at them.
 * The body is a kinematic capsule in the physics world, so the vehicle cannot pass through people.
 */
export function Citizen({ session, spec }: { session: GameSession; spec: CitizenSpec }) {
  const { scene, bones, rest } = useHumanModel(spec.jacket);
  const body = useRef<RapierRigidBody>(null);
  const visual = useRef<Group>(null);
  const agent = useMemo(() => {
    const random = createRandom(spec.seed);
    const start = { x: 0, z: 0 };
    pickTarget(session, spec, random, start);
    return {
      random,
      x: start.x,
      z: start.z,
      yaw: random() * Math.PI * 2,
      target: { x: start.x, z: start.z },
      wait: random() * 3,
      speed: 0,
      phase: random() * 10,
      flee: 0,
      frame: Math.floor(random() * 3),
      scale: 0.94 + random() * 0.12,
    };
  }, [session, spec]);
  const quat = useMemo(() => new Quaternion(), []);
  if (import.meta.env.DEV) {
    const registry = ((
      window as unknown as { __twCitizens?: Record<string, unknown> }
    ).__twCitizens ??= {});
    registry[spec.id] = agent;
  }

  useFrame(({ camera }, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const a = agent;
    const vehicle = session.vehicle.state;
    const dx = a.x - vehicle.position.x;
    const dz = a.z - vehicle.position.z;
    const distance = Math.hypot(dx, dz);
    const lowFlight = vehicle.mode === 'FLIGHT' && vehicle.altitudeAGL < 14;
    const threat = distance < FLEE_DISTANCE && (vehicle.speed > 1.5 || lowFlight);
    if (threat) a.flee = 2.5;
    a.flee = Math.max(0, a.flee - dt);

    let desired = 0;
    let heading = a.yaw;
    if (a.flee > 0) {
      heading = Math.atan2(dx, dz);
      desired = RUN_SPEED;
    } else if (a.wait > 0) {
      a.wait -= dt;
    } else {
      const tx = a.target.x - a.x;
      const tz = a.target.z - a.z;
      if (Math.hypot(tx, tz) < 0.6) {
        a.wait = 2 + a.random() * 5;
        pickTarget(session, spec, a.random, a.target);
      } else {
        heading = Math.atan2(tx, tz);
        desired = WALK_SPEED[spec.role];
      }
    }
    // Accelerate like a person (not instantly), and turn at a human rate.
    a.speed += (desired - a.speed) * Math.min(1, dt * 3);
    let turn = heading - a.yaw;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    a.yaw += turn * Math.min(1, dt * (a.flee > 0 ? 8 : 4));
    const nx = a.x + Math.sin(a.yaw) * a.speed * dt;
    const nz = a.z + Math.cos(a.yaw) * a.speed * dt;
    // Never walk into water.
    if (session.terrain.waterLevelAt(nx, nz) === null) {
      a.x = nx;
      a.z = nz;
    } else a.target = { x: spec.home.x, z: spec.home.z };
    const y = session.terrain.heightAt(a.x, a.z);
    const bob = Math.abs(Math.sin(a.phase)) * 0.035 * Math.min(1, a.speed);
    body.current?.setNextKinematicTranslation({ x: a.x, y, z: a.z });
    body.current?.setNextKinematicRotation(quat.setFromAxisAngle(UP, a.yaw));

    // Animate the skeleton only when close enough to see it (every other frame further out).
    const camDistance = Math.hypot(camera.position.x - a.x, camera.position.z - a.z);
    if (camDistance > ANIMATE_DISTANCE || !visual.current) return;
    a.frame++;
    if (camDistance > 35 && a.frame % 2) return;
    a.phase += (a.speed / STRIDE) * Math.PI * dt * (camDistance > 35 ? 2 : 1);
    visual.current.position.y = bob;
    for (const [name, bone] of bones) bone.quaternion.copy(rest.get(name)!);
    const amount = Math.min(1, a.speed / 1.1);
    const aims = gaitAims(a.phase, amount, a.speed > 2.4);
    if (amount < 0.05) Object.assign(aims, ARMS_DOWN);
    for (const [name, direction] of Object.entries(aims)) {
      const bone = bones.get(name);
      if (bone) aimBone(visual.current, bone, direction);
    }
    // Idle: look around.
    const neck = bones.get('Neck');
    if (neck && amount < 0.3) neck.rotateY(Math.sin(a.phase * 0.2 + a.speed) * 0.4);
  });

  return (
    <RigidBody
      ref={body}
      type="kinematicPosition"
      colliders={false}
      position={[agent.x, 0, agent.z]}
    >
      <CapsuleCollider args={[0.55, 0.28]} position={[0, 0.85, 0]} />
      <group ref={visual} scale={agent.scale}>
        <primitive object={scene} />
      </group>
    </RigidBody>
  );
}
