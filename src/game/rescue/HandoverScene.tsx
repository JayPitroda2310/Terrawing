import { RoundedBox } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { CapsuleCollider, type RapierRigidBody, RigidBody } from '@react-three/rapier';
import { Suspense, useMemo, useRef, useState } from 'react';
import { type Group, MeshStandardMaterial, type Object3D, Quaternion, Vector3 } from 'three';
import type { GameSession } from '@/game/core/GameSession';
import { gaitAims, STRIDE, useHumanModel } from '@/game/life/humanActor';
import { smoothstep } from '@/utils/math/scalar';
import { Ambulance } from './Ambulance';
import { CasualtyCapsule } from './CasualtyCapsule';
import {
  type AmbulancePose,
  DOOR_SWING,
  type HandoverPlan,
  type HandoverUnit,
  type CrewPose,
  type Key,
  sampleKeys,
  TROLLEY_DECK,
  TROLLEY_HALF,
} from './handover';
import { aimBone, ARMS_DOWN, type Dir, type HeadStyle } from './humanRig';

const UP = new Vector3(0, 1, 0);
/** Nurses in ceil-blue scrubs and scrub caps; the doctor in a white coat with a stethoscope. */
const NURSE_SCRUBS = '#4f8fb8';
const NURSE_CAP = { color: '#3f7da6' };
const DOCTOR_COAT = '#f1f2ef';
const DOCTOR_TROUSERS = '#2b3340';
const DOCTOR_HAIR = { color: '#2a1d15', hair: true };

interface CrewState {
  x: number;
  z: number;
  y: number;
  yaw: number;
  visible: boolean;
  pose: CrewPose;
  /** While reaching for the capsule: 0 = up at the roof, 1 = down at the stretcher deck. */
  reach: number;
}

/** Arms reaching for the capsule's side handles, at the roof (up) and at the deck (down). */
const REACH_UP: Record<string, Dir> = {
  LeftArm: [0.2, 0.35, 1],
  LeftForeArm: [0.04, 0.45, 1],
  RightArm: [-0.2, 0.35, 1],
  RightForeArm: [-0.04, 0.45, 1],
  Spine: [0, 1, 0.05],
};
const REACH_DOWN: Record<string, Dir> = {
  LeftArm: [0.2, -0.55, 0.8],
  LeftForeArm: [0.04, -0.35, 1],
  RightArm: [-0.2, -0.55, 0.8],
  RightForeArm: [-0.04, -0.35, 1],
  Spine: [0, 1, 0.25],
};

const POSE_ARMS: Record<Exclude<CrewPose, 'walk' | 'reach'>, Record<string, Dir>> = {
  /** Walking ahead of the stretcher, one hand back on its handle. */
  pull: {
    RightArm: [-0.2, -0.85, -0.45],
    RightForeArm: [-0.05, -0.8, -0.6],
  },
  stand: { ...ARMS_DOWN },
  push: {
    LeftArm: [0.22, -0.62, 0.75],
    LeftForeArm: [0.02, -0.3, 1],
    RightArm: [-0.22, -0.62, 0.75],
    RightForeArm: [-0.02, -0.3, 1],
  },
  assess: {
    Spine: [0, 1, 0.3],
    Neck: [0, 1, 0.55],
    RightArm: [-0.15, -0.65, 0.75],
    RightForeArm: [-0.05, -0.55, 0.85],
    LeftArm: [0.28, -0.8, 0.35],
    LeftForeArm: [-0.25, -0.1, 1],
  },
};

/** One crew member (paramedic or doctor): walking gait plus working poses, physical capsule. */
function CrewMember({
  jacket,
  trousers,
  head,
  stethoscope = false,
  getState,
}: {
  jacket: string;
  trousers: string;
  head: HeadStyle;
  stethoscope?: boolean;
  getState: (out: CrewState) => void;
}) {
  const { scene, bones, rest } = useHumanModel(jacket, { trousers, head, stethoscope });
  const body = useRef<RapierRigidBody>(null);
  const visual = useRef<Group>(null);
  const state = useMemo<CrewState>(
    () => ({ x: 0, z: 0, y: -100, yaw: 0, visible: false, pose: 'walk', reach: 0 }),
    [],
  );
  const motion = useMemo(() => ({ x: NaN, z: NaN, speed: 0, phase: 0 }), []);
  const quat = useMemo(() => new Quaternion(), []);

  useFrame((_, rawDt) => {
    const dt = Math.max(1e-3, Math.min(rawDt, 0.05));
    getState(state);
    const group = visual.current;
    if (!group) return;
    group.visible = state.visible;
    body.current?.setNextKinematicTranslation({
      x: state.x,
      y: state.visible ? state.y : -100,
      z: state.z,
    });
    body.current?.setNextKinematicRotation(quat.setFromAxisAngle(UP, state.yaw));
    if (!state.visible) {
      motion.x = NaN;
      return;
    }
    const moved = Number.isNaN(motion.x) ? 0 : Math.hypot(state.x - motion.x, state.z - motion.z);
    motion.x = state.x;
    motion.z = state.z;
    motion.speed += (moved / dt - motion.speed) * Math.min(1, dt * 8);
    motion.phase += (motion.speed / STRIDE) * Math.PI * dt;
    for (const [name, bone] of bones) bone.quaternion.copy(rest.get(name)!);
    const amount = Math.min(1, motion.speed / 1.1);
    const aims: Record<string, Dir> = gaitAims(motion.phase, amount, false);
    if (amount < 0.05) Object.assign(aims, ARMS_DOWN);
    if (state.pose === 'reach') {
      const k = state.reach;
      for (const [name, up] of Object.entries(REACH_UP)) {
        const down = REACH_DOWN[name]!;
        aims[name] = [
          up[0] + (down[0] - up[0]) * k,
          up[1] + (down[1] - up[1]) * k,
          up[2] + (down[2] - up[2]) * k,
        ];
      }
    } else if (state.pose !== 'walk') Object.assign(aims, POSE_ARMS[state.pose]);
    for (const [name, direction] of Object.entries(aims)) {
      const bone = bones.get(name);
      if (bone) aimBone(group, bone, direction);
    }
    group.position.y = Math.abs(Math.sin(motion.phase)) * 0.03 * amount;
  });

  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[0, -100, 0]}>
      {/* Sensor: the crew's choreographed movement must never shove TerraWing around. */}
      <CapsuleCollider args={[0.55, 0.28]} position={[0, 0.85, 0]} sensor />
      <group ref={visual} visible={false}>
        <primitive object={scene} />
      </group>
    </RigidBody>
  );
}

/** Stretcher trolley: wheeled base, telescopic legs, deck with mattress and end handles. */
function Trolley({ mattress }: { mattress: React.RefObject<Group | null> }) {
  const m = useMemo(
    () => ({
      frame: new MeshStandardMaterial({ color: '#c4c9cd', roughness: 0.3, metalness: 0.85 }),
      dark: new MeshStandardMaterial({ color: '#202326', roughness: 0.7 }),
      pad: new MeshStandardMaterial({ color: '#e5731c', roughness: 0.75 }),
      yellow: new MeshStandardMaterial({ color: '#f2cf0a', roughness: 0.6 }),
    }),
    [],
  );
  const deck = TROLLEY_DECK;
  const len = TROLLEY_HALF * 2;
  return (
    <group>
      {/* Base frame and casters. */}
      {[-1, 1].map((sx) => (
        <mesh key={`b${sx}`} material={m.frame} position={[sx * 0.24, 0.16, 0]}>
          <boxGeometry args={[0.04, 0.04, len - 0.3]} />
        </mesh>
      ))}
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <group key={`w${sx}${sz}`} position={[sx * 0.24, 0.07, sz * (TROLLEY_HALF - 0.2)]}>
            <mesh material={m.dark} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.07, 0.07, 0.04, 12]} />
            </mesh>
          </group>
        )),
      )}
      {/* Telescopic legs. */}
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh
            key={`l${sx}${sz}`}
            material={m.frame}
            position={[sx * 0.22, (deck - 0.05 + 0.16) / 2, sz * 0.55]}
          >
            <cylinderGeometry args={[0.022, 0.022, deck - 0.2, 8]} />
          </mesh>
        )),
      )}
      {/* Deck frame, side rails and handles. */}
      <mesh material={m.frame} position={[0, deck - 0.05, 0]}>
        <boxGeometry args={[0.58, 0.04, len]} />
      </mesh>
      {[-1, 1].map((sx) => (
        <mesh key={`r${sx}`} material={m.frame} position={[sx * 0.33, deck + 0.1, 0]}>
          <boxGeometry args={[0.025, 0.025, 1.3]} />
        </mesh>
      ))}
      {[-1, 1].map((sz) => (
        <mesh
          key={`h${sz}`}
          material={m.yellow}
          position={[0, deck - 0.02, sz * (TROLLEY_HALF + 0.05)]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <cylinderGeometry args={[0.025, 0.025, 0.6, 8]} />
        </mesh>
      ))}
      <group ref={mattress}>
        <RoundedBox
          args={[0.56, 0.1, len - 0.1]}
          radius={0.04}
          position={[0, deck + 0.02, 0]}
          material={m.pad}
          castShadow
        />
      </group>
    </group>
  );
}

const key = (): Key => ({ t: 0, x: 0, z: 0, yaw: 0, lift: 0 });

/** Everything for one patient: ambulance, crew of three, trolley and the casualty capsule. */
function HandoverUnitView({
  session,
  plan,
  unit,
  jacket,
  getAnchor,
}: {
  session: GameSession;
  plan: HandoverPlan;
  unit: HandoverUnit;
  /** Patient's jacket (known once dispatched). */
  jacket: string;
  getAnchor: () => Object3D | null;
}) {
  const trolley = useRef<Group>(null);
  const mattress = useRef<Group>(null);
  const capsule = useRef<Group>(null);
  const tmp = useMemo(
    () => ({
      now: key(),
      crew: key(),
      before: key(),
      at: key(),
      anchor: new Vector3(),
      park: { x: 0, z: 0, yaw: 0, speed: 0, accel: 0, s: 0, visible: false } as AmbulancePose,
    }),
    [],
  );
  const canopy = useMemo(() => ({ value: 0 }), []);
  const ground = (x: number, z: number) => session.terrain.heightAt(x, z);

  useFrame(() => {
    const t = session.handoverTime;
    if (!unit.planned) {
      if (trolley.current) trolley.current.visible = false;
      if (capsule.current) capsule.current.visible = false;
      return;
    }
    const onTrolley = t >= unit.liftEnd;
    const trolleyOut = t >= unit.crewOut && t < unit.doorsClose + DOOR_SWING;
    sampleKeys(unit.trolley, t, tmp.now);
    const tr = tmp.now;
    const ty = ground(tr.x, tr.z) + tr.lift;
    if (trolley.current) {
      trolley.current.visible = trolleyOut;
      trolley.current.position.set(tr.x, ty, tr.z);
      trolley.current.rotation.y = tr.yaw;
    }
    if (mattress.current) mattress.current.visible = !onTrolley;

    // Capsule: on TerraWing's roof → lifted across → on the trolley → into the ambulance.
    const c = capsule.current;
    if (!c) return;
    canopy.value =
      smoothstep(unit.canopyOpen, unit.canopyOpen + 0.9, t) *
      (1 - smoothstep(unit.canopyClose, unit.canopyClose + 0.9, t));
    const anchor = getAnchor();
    const droverYaw = -plan.drover.heading;
    if (anchor) anchor.localToWorld(tmp.anchor.set(unit.slotX, 0, 0));
    else tmp.anchor.set(plan.drover.x, ground(plan.drover.x, plan.drover.z) + 1.3, plan.drover.z);
    sampleKeys(unit.trolley, unit.liftEnd, tmp.at);
    const deckY = ground(tmp.at.x, tmp.at.z) + TROLLEY_DECK + 0.05;
    if (t < unit.liftStart) {
      c.position.copy(tmp.anchor);
      c.rotation.y = droverYaw;
      c.visible = true;
    } else if (t < unit.liftEnd) {
      const k = smoothstep(unit.liftStart, unit.liftEnd, t);
      c.position.set(
        tmp.anchor.x + (tmp.at.x - tmp.anchor.x) * k,
        tmp.anchor.y + (deckY - tmp.anchor.y) * k + Math.sin(Math.PI * Math.min(1, k * 1.6)) * 0.12,
        tmp.anchor.z + (tmp.at.z - tmp.anchor.z) * k,
      );
      c.rotation.y = droverYaw;
      c.visible = true;
    } else {
      c.position.set(tr.x, ty + TROLLEY_DECK + 0.05, tr.z);
      c.rotation.y = tr.yaw;
      c.visible = trolleyOut;
    }
  });

  /** A crew member following their own track: position, heading, height and pose. */
  const follow = (track: () => Key[]) => (out: CrewState) => {
    const t = session.handoverTime;
    const keys = track();
    out.visible = unit.planned && keys.length > 0 && t >= keys[0]!.t && t < keys.at(-1)!.t;
    if (!out.visible) return;
    sampleKeys(keys, t, tmp.crew);
    out.x = tmp.crew.x;
    out.z = tmp.crew.z;
    out.yaw = tmp.crew.yaw;
    out.y = ground(out.x, out.z) + tmp.crew.lift;
    out.pose = tmp.crew.pose ?? 'walk';
    out.reach = smoothstep(unit.liftStart, unit.liftEnd, t);
  };
  const nurseLead = follow(() => unit.nurses[0]);
  const nurseSecond = follow(() => unit.nurses[1]);
  const doctor = follow(() => unit.doctor);

  return (
    <>
      <Ambulance session={session} plan={plan} unit={unit} />
      <group ref={trolley} visible={false}>
        <Trolley mattress={mattress} />
      </group>
      <group ref={capsule}>
        <CasualtyCapsule jacket={jacket} getCanopy={() => canopy.value} />
      </group>
      {[nurseLead, nurseSecond].map((getState, i) => (
        <CrewMember
          key={i}
          jacket={NURSE_SCRUBS}
          trousers={NURSE_SCRUBS}
          head={NURSE_CAP}
          getState={getState}
        />
      ))}
      <CrewMember
        jacket={DOCTOR_COAT}
        trousers={DOCTOR_TROUSERS}
        head={DOCTOR_HAIR}
        stethoscope
        getState={doctor}
      />
    </>
  );
}

/**
 * Patient handover at the LZ, mounted once the session starts the handover: one ambulance, crew
 * and trolley per casualty aboard TerraWing.
 */
export function HandoverScene({
  session,
  getVisualRoot,
}: {
  session: GameSession;
  getVisualRoot: () => Object3D | null;
}) {
  const [plan, setPlan] = useState<HandoverPlan | null>(null);
  const [version, setVersion] = useState(-1);
  useFrame(() => {
    if (session.handover !== plan) setPlan(session.handover);
    const v = session.handover?.version ?? -1;
    if (v !== version) setVersion(v);
  });
  if (!plan) return null;
  const getAnchor = () => getVisualRoot()?.getObjectByName('casualty-pod') ?? null;
  return (
    <Suspense fallback={null}>
      {plan.units.map((unit, k) => (
        <HandoverUnitView
          key={k}
          jacket={unit.patient.jacket}
          session={session}
          plan={plan}
          unit={unit}
          getAnchor={getAnchor}
        />
      ))}
    </Suspense>
  );
}
