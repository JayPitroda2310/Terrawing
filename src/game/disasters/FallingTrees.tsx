import { useFrame } from '@react-three/fiber';
import {
  CapsuleCollider,
  ConeCollider,
  type RapierRigidBody,
  RigidBody,
} from '@react-three/rapier';
import { useEffect, useMemo, useRef, useState } from 'react';
import { type Mesh, Quaternion, Vector3 } from 'three';
import type { GameSession } from '@/game/core/GameSession';
import { type FelledTree, forest } from '@/game/environment/forest';
import { TREE_STRIDE } from '@/game/environment/VegetationPlacer';
import { createRandom } from '@/utils/math/random';

const GRAVITY = 9.81;
/** At most this many trees come down in one mission. */
const MAX_FELLED = 5;
/** Gust needed (m/s, horizontal) before a weakened tree gives way, and the pause between falls. */
const GUST_THRESHOLD = 6.5;
const COOLDOWN = [45, 100] as const;
/** Distance band from TerraWing (m) in which a falling tree is picked, so the player sees it. */
const NEAR = 22;
const FAR = 110;

interface Falling {
  id: number;
  tree: FelledTree;
  /** Horizontal fall direction (unit). */
  dirX: number;
  dirZ: number;
  /** Lean angle from vertical (rad) and its rate. */
  angle: number;
  rate: number;
  settled: boolean;
  bounced: boolean;
}

/**
 * Storm-felled and fire-weakened trees: in strong gusts (or inside a spreading fire) a tree near
 * TerraWing gives way and topples. It falls as a rigid pole pivoting on its stump — gravity
 * torque grows with the lean, the wind pushes on the crown — until the crown strikes the ground,
 * where it bounces once and stays as a physical obstacle across the terrain.
 */
export function FallingTrees({ session }: { session: GameSession }) {
  const [trees, setTrees] = useState<Falling[]>([]);
  const random = useMemo(() => createRandom(4242), []);
  const state = useMemo(() => ({ cooldown: 30 + random() * 30, count: 0, force: false }), [random]);
  if (import.meta.env.DEV)
    (window as unknown as { __twTreeFall?: () => void }).__twTreeFall = () => {
      state.cooldown = 0;
      state.force = true;
    };

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    state.cooldown -= dt;
    if (state.cooldown > 0 || state.count >= MAX_FELLED || !forest.layout || !forest.fell) return;
    const wind = session.weather.wind;
    const gust = Math.hypot(wind.x, wind.z);
    const fires = session.mission.hazards.filter((h) => h.kind === 'fire');
    if (gust < GUST_THRESHOLD && fires.length === 0 && !state.force) return;

    // Pick a candidate: in view range of TerraWing, burning trees first, else any tree.
    const layout = forest.layout;
    const v = session.vehicle.state.position;
    for (let attempt = 0; attempt < 60; attempt++) {
      const index = Math.floor(random() * layout.treeCount);
      const o = index * TREE_STRIDE;
      const x = layout.trees[o]!;
      const z = layout.trees[o + 2]!;
      const d = Math.hypot(x - v.x, z - v.z);
      if (d < NEAR || d > FAR) continue;
      const burning = fires.some(
        (h) => Math.hypot(x - h.position[0], z - h.position[1]) < session.hazards.radiusOf(h),
      );
      if (!burning && gust < GUST_THRESHOLD && !state.force) continue;
      const tree = forest.fell(index);
      if (!tree) continue;
      // Downwind (with some scatter); a burnt-through trunk just goes where it leans.
      const heading =
        (gust > 1 ? Math.atan2(wind.z, wind.x) : random() * Math.PI * 2) + (random() - 0.5) * 0.8;
      state.count++;
      state.force = false;
      state.cooldown = COOLDOWN[0] + random() * (COOLDOWN[1] - COOLDOWN[0]);
      setTrees((list) => [
        ...list,
        {
          id: index,
          tree,
          dirX: Math.cos(heading),
          dirZ: Math.sin(heading),
          angle: 0.02,
          rate: 0,
          settled: false,
          bounced: false,
        },
      ]);
      break;
    }
  });

  return (
    <>
      {trees.map((falling) => (
        <FallingTree key={falling.id} session={session} falling={falling} />
      ))}
    </>
  );
}

const tilt = new Quaternion();
const axis = new Vector3();

function FallingTree({ session, falling }: { session: GameSession; falling: Falling }) {
  const body = useRef<RapierRigidBody>(null);
  const mesh = useRef<Mesh>(null);
  const { tree } = falling;
  const trunkRadius = 0.3 * tree.scale * 1.4;

  useEffect(() => {
    if (mesh.current) {
      mesh.current.matrixAutoUpdate = false;
      mesh.current.matrix.copy(tree.local);
    }
  }, [tree]);

  useFrame((_, rawDt) => {
    if (falling.settled || !body.current) return;
    const dt = Math.min(rawDt, 0.05);
    const L = tree.height;
    // Uniform pole about its base: I = mL²/3, gravity torque = mg(L/2)sinθ → θ'' = 3g sinθ / 2L.
    // Wind: drag on the crown (~0.7 L up), proportional to the along-fall gust squared.
    const wind = session.weather.wind;
    const along = Math.max(0, wind.x * falling.dirX + wind.z * falling.dirZ);
    const accel =
      ((3 * GRAVITY) / (2 * L)) * Math.sin(falling.angle) +
      (0.012 * along * along * Math.cos(falling.angle)) / L;
    // Sub-step: the fall speeds up sharply near the ground.
    const steps = 4;
    for (let s = 0; s < steps; s++) {
      falling.rate += accel * (dt / steps);
      falling.angle += falling.rate * (dt / steps);
    }
    // Crown contact: where the tip meets the terrain (crown radius keeps it resting on its boughs).
    const tipX = tree.x + Math.sin(falling.angle) * L * falling.dirX;
    const tipZ = tree.z + Math.sin(falling.angle) * L * falling.dirZ;
    const tipY = tree.y + Math.cos(falling.angle) * L;
    const ground = session.terrain.heightAt(tipX, tipZ) + 1.2 * tree.scale;
    if (tipY <= ground && falling.rate > 0) {
      if (!falling.bounced) {
        falling.bounced = true;
        falling.rate = -falling.rate * 0.18;
        session.events.emit('world:crash', {
          x: tree.x + falling.dirX * L * 0.6,
          y: ground,
          z: tree.z + falling.dirZ * L * 0.6,
          size: 1,
        });
      } else if (Math.abs(falling.rate) < 0.4) {
        falling.rate = 0;
        falling.settled = true;
      } else falling.rate = -falling.rate * 0.1;
      // Hold at the contact angle.
      falling.angle = Math.acos(Math.max(-1, Math.min(1, (ground - tree.y) / L)));
    }
    // Rotate about the horizontal axis perpendicular to the fall (up × direction).
    axis.set(falling.dirZ, 0, -falling.dirX);
    tilt.setFromAxisAngle(axis, falling.angle);
    body.current.setNextKinematicRotation(tilt);
  });

  const h = tree.height;
  return (
    <RigidBody
      ref={body}
      type="kinematicPosition"
      colliders={false}
      position={[tree.x, tree.y, tree.z]}
    >
      <CapsuleCollider args={[h * 0.4, trunkRadius]} position={[0, h * 0.45, 0]} />
      <ConeCollider args={[h * 0.3, 1.7 * tree.scale]} position={[0, h * 0.55, 0]} />
      <mesh
        ref={mesh}
        geometry={tree.geometry}
        material={tree.materials}
        castShadow
        receiveShadow
      />
    </RigidBody>
  );
}
