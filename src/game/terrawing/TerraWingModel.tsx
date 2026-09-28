import { RoundedBox } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type Group,
  type Mesh,
  type Object3D,
  type SpotLight,
  Vector3,
  Material,
  Shape,
  ShapeGeometry,
} from 'three';
import { DEG2RAD, lerp, smoothstep } from '@/utils/math/scalar';
import {
  createDuctGeometry,
  createPropellerGeometry,
  createRimGeometry,
  createTreadGeometry,
  createTyreGeometry,
  DUCT_RADIUS,
  WHEEL_RADIUS,
  WHEEL_WIDTH,
} from './vehicleGeometry';
import { createVehicleMaterials, type VehicleMaterials } from './vehicleMaterials';
import { CasualtyCapsule } from '@/game/rescue/CasualtyCapsule';
import type { VehicleVisualProps, VehicleVisualState } from './VehicleVisual';

/** Chassis centre height at rover ride height. */
const CHASSIS_Y = 0.85;
const HULL_BOTTOM = -0.24;
/** Casualty capsule rack (chassis space) and the lateral offset of two capsules side by side. */
export const POD_Y = 0.62;
export const POD_Z = 0.1;
export const POD_SLOT_X = 0.36;
const WHEEL_TRACK = 0.84;
const AXLE_Z = 0.95;
const MAX_ROTOR_RATE = 75;
/** Arm pivots sit on pylons at the hull's four shoulders, at rotor height. */
const PIVOT = { x: 0.66, y: 0.62, z: AXLE_Z };
const ARM_LENGTH = { folded: 0.326, extended: 1.05 };
/** Retracted wheels pull up snug into their arches (tread still visible below the hull). */
/**
 * Wheel legs: vertical telescopic hydraulic struts mounted up inside each wheel arch. Deploying
 * extends the rod straight down, so the wheel keeps its track and simply lowers out from under
 * its mud guard. Stowed, the wheel sits up in the arch.
 */
const WHEEL_LEG = {
  mountY: HULL_BOTTOM + 0.3,
  stowedY: WHEEL_RADIUS - CHASSIS_Y + 0.06,
  sleeve: 0.26,
};
/** Landing legs: telescopic struts on hinges at the belly; they shorten, then fold flat. */
const LEGS = { hingeX: 0.6, sleeve: 0.42, retracted: 0.46, tube: 0.5 };
/**
 * Body-mounted fenders, part of the hull: an arc centred on the wheel at rover ride height that
 * grows straight out of the hull side (same centre and radius as the arch line on the flank)
 * and runs down to the hull bottom at both ends, reaching just past the tyre's outer wall.
 */
const FENDER_Y = WHEEL_RADIUS - CHASSIS_Y;
const FENDER_R = WHEEL_RADIUS + 0.11;
const FENDER = {
  y: FENDER_Y,
  radius: FENDER_R,
  inner: 0.752,
  outer: WHEEL_TRACK + WHEEL_WIDTH / 2 + 0.03,
  /** Arc from the hull bottom at the rear, over the top, to the hull bottom at the front. */
  start: Math.asin((HULL_BOTTOM - FENDER_Y) / FENDER_R),
};

interface ArmSpec {
  side: 1 | -1;
  end: 1 | -1;
  extendedYaw: number;
  /**
   * Stowed yaw. Each arm swings outwards and back round its pivot (never across the roof), so the
   * front and rear pods on a side move apart and land on the roof without touching.
   */
  foldedYaw: number;
}

/** Arms: front-right, front-left, rear-right, rear-left. Model faces -Z. */
const ARMS: readonly ArmSpec[] = [
  { side: 1, end: -1, extendedYaw: -45 * DEG2RAD, foldedYaw: -190.4 * DEG2RAD },
  { side: -1, end: -1, extendedYaw: 45 * DEG2RAD, foldedYaw: 190.4 * DEG2RAD },
  { side: 1, end: 1, extendedYaw: -135 * DEG2RAD, foldedYaw: 10.4 * DEG2RAD },
  { side: -1, end: 1, extendedYaw: 135 * DEG2RAD, foldedYaw: -10.4 * DEG2RAD },
];

interface ArmRefs {
  root: Group | null;
  tube: Mesh | null;
  pod: Group | null;
  rotor: Group | null;
}

interface StrutRefs {
  wishbone: Mesh | null;
  damper: Mesh | null;
}

const FORWARD = new Vector3(0, 0, 1);
const strutFrom = new Vector3();
const strutTo = new Vector3();
const strutDir = new Vector3();

/** Stretches a unit-length (along +Z) mesh between two points in its parent's space. */
function placeStrut(mesh: Mesh | null, from: Vector3, to: Vector3): void {
  if (!mesh) return;
  strutDir.subVectors(to, from);
  const length = strutDir.length();
  mesh.visible = length > 0.02;
  if (!mesh.visible) return;
  mesh.position.addVectors(from, to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(FORWARD, strutDir.divideScalar(length));
  mesh.scale.set(1, 1, length);
}

function usePartGeometry() {
  return useMemo(
    () => ({
      duct: createDuctGeometry(),
      propeller: createPropellerGeometry(),
      tyre: createTyreGeometry(),
      tread: createTreadGeometry(),
      rim: createRimGeometry(),
    }),
    [],
  );
}
type PartGeometry = ReturnType<typeof usePartGeometry>;

/**
 * Procedural TerraWing. Every articulated part is driven by the rig parameters, so the same data
 * can later drive bones of a skinned GLB model.
 *
 * Flight: four ducted fans on telescoping carbon arms. Rover: the arms swing back and retract so the
 * fans lie flat on the roof, and the wheels drop out of their wells on wishbone suspension. The
 * transformation stages arms and wheels one after the other, so parts never pass through each other.
 */
export function TerraWingModel({
  state,
  headlights = false,
  suspensionTop = WHEEL_RADIUS,
}: VehicleVisualProps & {
  /** Wheel-centre height at zero suspension compression (from the vehicle config). */
  suspensionTop?: number;
}) {
  const materials = useMemo(createVehicleMaterials, []);
  const geometry = usePartGeometry();
  const chassis = useRef<Group>(null);
  const arms = useRef<ArmRefs[]>(
    ARMS.map(() => ({ root: null, tube: null, pod: null, rotor: null })),
  );
  const wheels = useRef<(Group | null)[]>([]);
  const wheelSpin = useRef<(Group | null)[]>([]);
  const struts = useRef<StrutRefs[]>(ARMS.map(() => ({ wishbone: null, damper: null })));
  const skids = useRef<Group>(null);
  const legSides = useRef<{ hinge: Group | null; tubes: (Mesh | null)[]; skid: Mesh | null }[]>([
    { hinge: null, tubes: [null, null], skid: null },
    { hinge: null, tubes: [null, null], skid: null },
  ]);
  const mast = useRef<Group>(null);
  const radar = useRef<Group>(null);
  const payload = useRef<Group>(null);
  const pod = useRef<Group>(null);
  const capsules = useRef<(Group | null)[]>([]);
  const statusLight = useRef<Mesh>(null);
  const spot = useRef<SpotLight>(null);
  const spotTarget = useRef<Object3D>(null);
  const wheelAngle = useRef(0);
  const root = useRef<Group>(null);
  const rootWorld = useMemo(() => new Vector3(), []);

  useEffect(
    () => () => {
      for (const material of Object.values(materials)) {
        if (!(material instanceof Material)) continue;
        if ('map' in material) material.map?.dispose();
        if ('bumpMap' in material) material.bumpMap?.dispose();
        material.dispose();
      }
      for (const part of Object.values(geometry)) part.dispose();
    },
    [materials, geometry],
  );

  // The spotlight target must be part of the scene graph so its world matrix follows the vehicle.
  useEffect(() => {
    if (spot.current && spotTarget.current) spot.current.target = spotTarget.current;
  }, []);

  useFrame(({ clock }, dt) => {
    // Wear: ground line (the wheels' contact plane is this model's origin) and wetness.
    if (root.current) {
      root.current.getWorldPosition(rootWorld);
      materials.wear.rootY.value = rootWorld.y;
    }
    materials.wear.wetness.value = state.wetness ?? 0;
    const rig = state.rig;
    const time = clock.elapsedTime;
    const e = rig.armExtension;
    const chassisY = CHASSIS_Y + rig.bodyLift;

    if (chassis.current) chassis.current.position.y = chassisY;

    // Arms swing first; the telescoping tube only retracts in the last part of the fold.
    const armLength = lerp(ARM_LENGTH.folded, ARM_LENGTH.extended, smoothstep(0.4, 1, e));
    ARMS.forEach((spec, i) => {
      const refs = arms.current[i]!;
      if (refs.root) refs.root.rotation.y = lerp(spec.foldedYaw, spec.extendedYaw, e);
      if (refs.tube) {
        refs.tube.scale.y = armLength;
        refs.tube.position.z = -armLength / 2;
      }
      if (refs.pod) refs.pod.position.z = -armLength;
      if (refs.rotor)
        refs.rotor.rotation.y += rig.rotorSpeed * MAX_ROTOR_RATE * dt * (i % 2 ? 1 : -1);
    });
    materials.rotorBlur.opacity = smoothstep(0.35, 1, rig.rotorSpeed) * 0.3;
    materials.ductGlow.emissiveIntensity = 0.2 + rig.rotorSpeed * 1.6;

    // Sequence, like real landing gear: the wheels swing down and take the weight first
    // (wheelDeploy 0 → 0.6), then the landing legs telescope in and fold away (0.55 → 1).
    const w = rig.wheelDeploy;
    const drop = smoothstep(0, 0.6, w);
    wheelAngle.current += (state.forwardSpeed / WHEEL_RADIUS) * dt * w;
    const physicsWheels = state.wheels;
    const steerAngle = state.steerAngle ?? state.steer * 0.35;
    wheels.current.forEach((wheel, i) => {
      if (!wheel) return;
      const side = i % 2 === 0 ? 1 : -1;
      const z = i < 2 ? -AXLE_Z : AXLE_Z;
      const suspended = physicsWheels
        ? suspensionTop + physicsWheels[i]!.compression
        : WHEEL_RADIUS;
      // Straight down on the strut: the track never changes, only the height.
      const hubY = lerp(chassisY + WHEEL_LEG.stowedY, suspended, drop);
      const hubX = side * (WHEEL_TRACK - WHEEL_WIDTH / 2 - 0.03);
      wheel.position.x = side * WHEEL_TRACK;
      wheel.position.y = hubY;
      wheel.rotation.y = i < 2 ? -steerAngle * w : 0;
      const spin = wheelSpin.current[i];
      const angle = physicsWheels ? physicsWheels[i]!.spin : wheelAngle.current;
      if (spin) spin.rotation.y = angle * side;

      // Strut: fixed outer sleeve hanging from the arch, polished rod sliding out of it to the hub.
      const strut = struts.current[i]!;
      const mountY = chassisY + WHEEL_LEG.mountY;
      strutFrom.set(hubX, mountY, z);
      strutTo.set(hubX, mountY - WHEEL_LEG.sleeve, z);
      placeStrut(strut.wishbone, strutFrom, strutTo);
      strutFrom.set(hubX, mountY - 0.05, z);
      strutTo.set(hubX, hubY, z);
      placeStrut(strut.damper, strutFrom, strutTo);
    });

    // Landing legs: telescope in (inner tube slides up into its sleeve), then swing up on their
    // hinges to lie flat under the belly. Extended, they reach the ground under the chassis.
    if (skids.current) skids.current.position.y = chassisY + HULL_BOTTOM;
    const legPhase = smoothstep(0.55, 1, w);
    const retract = smoothstep(0, 0.5, legPhase);
    const fold = smoothstep(0.5, 1, legPhase);
    const extended = Math.max(LEGS.retracted, chassisY + HULL_BOTTOM);
    const legLength = lerp(extended, LEGS.retracted, retract);
    legSides.current.forEach((leg, i) => {
      if (!leg.hinge) return;
      const side = i === 0 ? 1 : -1;
      leg.hinge.rotation.z = -side * (Math.PI / 2) * fold;
      for (const tube of leg.tubes) if (tube) tube.position.y = -legLength + LEGS.tube / 2;
      if (leg.skid) leg.skid.position.y = -legLength;
    });
    if (mast.current) mast.current.scale.y = Math.max(0.05, rig.sensorMast);
    if (radar.current) radar.current.rotation.y = time * 1.8;
    if (payload.current) payload.current.visible = state.payload !== null;
    // Capsules on the roof rack (hidden once the medical team takes them).
    const list = state.capsulesDetached ? [] : (state.capsules ?? []);
    capsules.current.forEach((capsule, i) => {
      if (!capsule) return;
      const entry = list[i];
      capsule.visible = Boolean(entry);
      if (entry) capsule.position.x = entry.x;
    });
    if (statusLight.current) statusLight.current.visible = time % 1.2 < 0.6;
    if (spot.current) spot.current.intensity = headlights ? 40 : 0;
  });

  return (
    <group ref={root}>
      <group ref={chassis} position={[0, CHASSIS_Y, 0]}>
        <Hull materials={materials} />
        {ARMS.map((spec, i) => (
          <group key={i}>
            <ArmPylon materials={materials} x={spec.side * PIVOT.x} z={spec.end * PIVOT.z} />
            <group
              ref={(g) => {
                arms.current[i]!.root = g;
              }}
              position={[spec.side * PIVOT.x, PIVOT.y, spec.end * PIVOT.z]}
            >
              {/* Fixed outer sleeve; the inner tube telescopes out of it. */}
              <mesh
                material={materials.trim}
                position={[0, 0, -0.14]}
                rotation={[Math.PI / 2, 0, 0]}
                castShadow
              >
                <cylinderGeometry args={[0.06, 0.06, 0.28, 14]} />
              </mesh>
              <mesh
                ref={(m) => {
                  arms.current[i]!.tube = m;
                }}
                material={materials.carbon}
                rotation={[Math.PI / 2, 0, 0]}
                castShadow
              >
                <cylinderGeometry args={[0.042, 0.042, 1, 14]} />
              </mesh>
              <group
                ref={(g) => {
                  arms.current[i]!.pod = g;
                }}
              >
                <RotorPod
                  materials={materials}
                  geometry={geometry}
                  navLight={spec.side === 1 ? materials.green : materials.red}
                  navAngle={Math.atan2(spec.side, spec.end)}
                  rotorRef={(g) => {
                    arms.current[i]!.rotor = g;
                  }}
                />
              </group>
            </group>
          </group>
        ))}
        {/* Sensor mast with rotating radar, on the nose ahead of the stowed fans. */}
        <group ref={mast} position={[0, 0.2, -1.3]}>
          <mesh material={materials.trim} position={[0, 0.2, 0]}>
            <cylinderGeometry args={[0.03, 0.045, 0.4, 10]} />
          </mesh>
          <group ref={radar} position={[0, 0.42, 0]}>
            <mesh material={materials.white}>
              <boxGeometry args={[0.42, 0.05, 0.08]} />
            </mesh>
            <mesh material={materials.cyan} position={[0.2, 0, 0]}>
              <sphereGeometry args={[0.03, 8, 6]} />
            </mesh>
          </group>
        </group>
        {/* Casualty capsules: full-length stretchers strapped to a rack over the stowed fans. */}
        <group ref={pod} name="casualty-pod" position={[0, POD_Y, POD_Z]}>
          {[0, 1].map((i) => (
            <group
              key={i}
              ref={(g) => {
                capsules.current[i] = g;
              }}
              visible={false}
            >
              <CapsuleOnRack state={state} index={i} />
              {[-0.75, 0.75].map((z) => (
                <mesh key={z} material={materials.accent} position={[0, -0.03, z]}>
                  <boxGeometry args={[0.72, 0.05, 0.08]} />
                </mesh>
              ))}
            </group>
          ))}
        </group>
        {/* Medical kit in the rear cargo rack. */}
        <group ref={payload} position={[0, 0.08, 1.5]} visible={false}>
          <RoundedBox
            args={[0.62, 0.34, 0.4]}
            radius={0.04}
            material={materials.medical}
            castShadow
          />
          <mesh material={materials.accent} position={[0, 0.175, 0]}>
            <boxGeometry args={[0.3, 0.01, 0.09]} />
          </mesh>
          <mesh material={materials.accent} position={[0, 0.175, 0]}>
            <boxGeometry args={[0.09, 0.01, 0.26]} />
          </mesh>
        </group>
        {/* Camera mounts (their -Z is the line of sight): nose FPV and the belly gimbal. */}
        <object3D name="cam-nose" position={[0, 0.08, -1.6]} />
        <object3D name="cam-gimbal" position={[0, HULL_BOTTOM - 0.15, -1.1]} />
        <mesh ref={statusLight} material={materials.green} position={[0, 0.23, -1.02]}>
          <sphereGeometry args={[0.03, 8, 6]} />
        </mesh>
        <spotLight
          ref={spot}
          position={[0, 0.1, -1.46]}
          angle={0.55}
          penumbra={0.6}
          distance={45}
          decay={1.6}
          color="#eef3ff"
          intensity={0}
          castShadow={false}
        />
        <object3D ref={spotTarget} position={[0, -1.2, -12]} />
      </group>

      {[0, 1, 2, 3].map((i) => (
        <group key={i}>
          <group
            ref={(g) => {
              wheels.current[i] = g;
            }}
            position={[
              (i % 2 === 0 ? 1 : -1) * WHEEL_TRACK,
              WHEEL_RADIUS,
              i < 2 ? -AXLE_Z : AXLE_Z,
            ]}
          >
            {/* Axis along X, facing outwards. */}
            <group rotation={[0, 0, (-(i % 2 === 0 ? 1 : -1) * Math.PI) / 2]}>
              <group
                ref={(g) => {
                  wheelSpin.current[i] = g;
                }}
              >
                <Wheel materials={materials} geometry={geometry} />
              </group>
            </group>
          </group>
          <mesh
            ref={(m) => {
              struts.current[i]!.wishbone = m;
            }}
            material={materials.trim}
            castShadow
          >
            <boxGeometry args={[0.1, 0.1, 1]} />
          </mesh>
          <mesh
            ref={(m) => {
              struts.current[i]!.damper = m;
            }}
            material={materials.aluminium}
          >
            <boxGeometry args={[0.04, 0.04, 1]} />
          </mesh>
        </group>
      ))}

      {/* Landing legs: hinged at the belly, telescopic struts, skid tube at the foot. */}
      <group ref={skids} position={[0, CHASSIS_Y + HULL_BOTTOM, 0]}>
        {[1, -1].map((side, i) => (
          <group
            key={side}
            ref={(g) => {
              legSides.current[i]!.hinge = g;
            }}
            position={[side * LEGS.hingeX, 0, 0]}
          >
            {[-0.22, 0.22].map((z, k) => (
              <group key={z} position={[0, 0, z]}>
                <mesh material={materials.aluminium} rotation={[0, 0, Math.PI / 2]}>
                  <cylinderGeometry args={[0.03, 0.03, 0.09, 10]} />
                </mesh>
                {/* Outer sleeve (fixed) and the inner tube that slides into it. */}
                <mesh material={materials.trim} position={[0, -LEGS.sleeve / 2, 0]} castShadow>
                  <cylinderGeometry args={[0.028, 0.028, LEGS.sleeve, 10]} />
                </mesh>
                <mesh
                  ref={(m) => {
                    legSides.current[i]!.tubes[k] = m;
                  }}
                  material={materials.aluminium}
                  castShadow
                >
                  <cylinderGeometry args={[0.02, 0.02, LEGS.tube, 10]} />
                </mesh>
              </group>
            ))}
            <mesh
              ref={(m) => {
                legSides.current[i]!.skid = m;
              }}
              material={materials.trim}
              rotation={[Math.PI / 2, 0, 0]}
              castShadow
            >
              <capsuleGeometry args={[0.035, 1.7, 4, 8]} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

/** Lug nuts round the hub (wheel space, axis = Y). */
const LUG_NUTS = Array.from({ length: 6 }, (_, k) => {
  const a = (k / 6) * Math.PI * 2;
  return [Math.cos(a) * 0.078, Math.sin(a) * 0.078] as const;
});

/** Beadlock ring bolts (wheel space, axis = Y). */
const BEADLOCK_BOLTS = Array.from({ length: 16 }, (_, k) => {
  const a = (k / 16) * Math.PI * 2;
  return [Math.cos(a) * 0.275, Math.sin(a) * 0.275] as const;
});

/** Fasteners on the hull (chassis space): roof-deck corners, nose housing, tail panel. */
const BOLTS: readonly (readonly [number, number, number, 'x' | 'y' | 'z'])[] = [
  ...[-0.5, 0.5].flatMap((x) => [-0.58, 0.82].map((z) => [x, 0.452, z, 'y'] as const)),
  ...[-0.38, -0.13, 0.13, 0.38].map((x) => [x, 0.19, -1.265, 'z'] as const),
  ...[-0.62, 0.62].flatMap((x) => [-0.15, 0.15].map((y) => [x, y, 1.254, 'z'] as const)),
  ...[-1, 1].flatMap((side) => [-0.45, 0.35].map((z) => [side * 0.754, 0.15, z, 'x'] as const)),
];

/** Dark wheel-well recess on the hull flank: the arch opening, clipped at the hull bottom. */
function createWellGeometry(): ShapeGeometry {
  const radius = FENDER.radius - 0.01;
  const shape = new Shape();
  const steps = 32;
  for (let k = 0; k <= steps; k++) {
    const a = FENDER.start + ((Math.PI - 2 * FENDER.start) * k) / steps;
    const x = Math.cos(a) * radius;
    const y = FENDER.y + Math.sin(a) * radius;
    if (k === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.lineTo(Math.cos(FENDER.start) * radius, HULL_BOTTOM);
  return new ShapeGeometry(shape, 1);
}

/** One fender: shell, dark liner, rolled outer lip and a flange where it meets the hull. */
function Fender({ materials, side }: { materials: VehicleMaterials; side: 1 | -1 }) {
  const width = FENDER.outer - FENDER.inner;
  const length = Math.PI - 2 * FENDER.start;
  const arc = (radius: number) =>
    [radius, radius, width, 40, 1, true, FENDER.start, length] as const;
  const lip = (x: number, tube: number) => (
    <group position={[x, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
      <mesh material={materials.shell} rotation={[0, 0, FENDER.start]}>
        <torusGeometry args={[FENDER.radius, tube, 6, 40, length]} />
      </mesh>
    </group>
  );
  return (
    <group position={[0, FENDER.y, 0]}>
      <group position={[side * (FENDER.inner + width / 2), 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <mesh material={materials.shell} castShadow receiveShadow>
          <cylinderGeometry args={arc(FENDER.radius)} />
        </mesh>
        <mesh material={materials.liner}>
          <cylinderGeometry args={arc(FENDER.radius - 0.008)} />
        </mesh>
      </group>
      {lip(side * FENDER.outer, 0.014)}
      {lip(side * (FENDER.inner + 0.004), 0.02)}
    </group>
  );
}

function ArmPylon({ materials, x, z }: { materials: VehicleMaterials; x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh material={materials.shell} position={[0, 0.42, 0]} castShadow>
        <boxGeometry args={[0.13, 0.4, 0.13]} />
      </mesh>
      {/* Fold hinge */}
      <mesh material={materials.aluminium} position={[0, PIVOT.y, 0]}>
        <cylinderGeometry args={[0.075, 0.075, 0.1, 16]} />
      </mesh>
    </group>
  );
}

function Hull({ materials }: { materials: VehicleMaterials }) {
  const wellGeometry = useMemo(createWellGeometry, []);
  useEffect(() => () => wellGeometry.dispose(), [wellGeometry]);
  return (
    <group>
      <RoundedBox
        args={[1.5, 0.46, 2.5]}
        radius={0.12}
        smoothness={4}
        material={materials.hull}
        castShadow
        receiveShadow
      />
      {/* Raised roof deck the fans rest on when stowed. */}
      <RoundedBox
        args={[1.16, 0.3, 1.55]}
        radius={0.1}
        smoothness={4}
        position={[0, 0.3, 0.12]}
        material={materials.shell}
        castShadow
      />
      {/* Rubber seal where the roof deck meets the hull, grab rails, and deck fasteners. */}
      <RoundedBox
        args={[1.19, 0.025, 1.58]}
        radius={0.012}
        position={[0, 0.235, 0.12]}
        material={materials.trim}
      />
      {[-1, 1].map((side) => (
        <group key={`rail${side}`} position={[side * 0.63, 0.36, 0.12]}>
          <mesh material={materials.aluminium} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.014, 0.014, 1.2, 10]} />
          </mesh>
          {[-0.55, 0, 0.55].map((z) => (
            <mesh key={z} material={materials.trim} position={[0, -0.05, z]}>
              <cylinderGeometry args={[0.012, 0.016, 0.1, 8]} />
            </mesh>
          ))}
        </group>
      ))}
      {BOLTS.map(([x, y, z, axis], i) => (
        <mesh
          key={`bolt${i}`}
          material={materials.hub}
          position={[x, y, z]}
          rotation={
            axis === 'x' ? [0, 0, Math.PI / 2] : axis === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, 0]
          }
        >
          <cylinderGeometry args={[0.012, 0.012, 0.008, 6]} />
        </mesh>
      ))}
      {/* Nose sensor housing, bumper and camera gimbal */}
      <RoundedBox
        args={[0.92, 0.3, 0.5]}
        radius={0.08}
        smoothness={3}
        position={[0, 0.06, -1.18]}
        material={materials.shell}
        castShadow
      />
      {/* Logo across the roof deck (reads from the chase camera and from above). */}
      <mesh material={materials.logo} position={[0, 0.457, 0.06]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.0, 0.108]} />
      </mesh>
      {/* Logo on the front bumper and the tail. */}
      <mesh material={materials.logo} position={[0, -0.17, -1.392]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[0.66, 0.071]} />
      </mesh>
      <mesh material={materials.logo} position={[0, 0.172, 1.257]}>
        <planeGeometry args={[0.9, 0.097]} />
      </mesh>
      <mesh material={materials.glass} position={[0, 0.08, -1.44]}>
        <sphereGeometry args={[0.13, 24, 16]} />
      </mesh>
      <mesh material={materials.cyan} position={[0, 0.08, -1.43]}>
        <torusGeometry args={[0.15, 0.01, 8, 32]} />
      </mesh>
      <mesh material={materials.trim} position={[0, -0.17, -1.33]} castShadow>
        <boxGeometry args={[1.28, 0.1, 0.12]} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} material={materials.accent} position={[side * 0.42, -0.2, -1.4]}>
          <torusGeometry args={[0.035, 0.012, 6, 12]} />
        </mesh>
      ))}
      <mesh material={materials.headlight} position={[0, 0.2, -1.425]}>
        <boxGeometry args={[0.5, 0.025, 0.01]} />
      </mesh>
      <group position={[0, HULL_BOTTOM - 0.02, -0.95]}>
        <mesh material={materials.trim} position={[0, -0.03, 0]}>
          <boxGeometry args={[0.2, 0.06, 0.12]} />
        </mesh>
        <mesh material={materials.trim} position={[0, -0.13, 0]} castShadow>
          <sphereGeometry args={[0.085, 20, 14]} />
        </mesh>
        <mesh
          material={materials.glass}
          position={[0, -0.13, -0.075]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <cylinderGeometry args={[0.035, 0.035, 0.03, 16]} />
        </mesh>
      </group>
      {/* Canopy window strip */}
      <mesh material={materials.glass} position={[0, 0.36, -0.66]} rotation={[-0.5, 0, 0]}>
        <boxGeometry args={[0.9, 0.16, 0.02]} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side}>
          {/* Wheel wells: dark recess on the flank, and the fenders growing out of it. */}
          {[-AXLE_Z, AXLE_Z].map((z) => (
            <group key={z} position={[0, 0, z]}>
              <mesh
                geometry={wellGeometry}
                material={materials.trim}
                position={[side * 0.7515, 0, 0]}
                rotation={[0, (side * Math.PI) / 2, 0]}
              />
              <Fender materials={materials} side={side as 1 | -1} />
            </group>
          ))}
          {/* Livery decal between the arches */}
          <mesh
            material={materials.livery}
            position={[side * 0.757, 0.02, 0]}
            rotation={[0, (side * Math.PI) / 2, 0]}
          >
            <planeGeometry args={[1.0, 0.2]} />
          </mesh>
          {/* Side skirt */}
          <mesh material={materials.trim} position={[side * 0.76, HULL_BOTTOM + 0.04, 0]}>
            <boxGeometry args={[0.03, 0.07, 1.0]} />
          </mesh>
          <mesh
            material={materials.accent}
            position={[side * 0.3, 0.2, -1.2]}
            rotation={[0, side * 0.5, 0]}
          >
            <boxGeometry args={[0.2, 0.012, 0.05]} />
          </mesh>
          {/* Headlight: bezel, chrome reflector, LED strip behind a clear lens. */}
          <group position={[side * 0.52, -0.02, -1.262]}>
            <RoundedBox args={[0.25, 0.1, 0.03]} radius={0.012} material={materials.trim} />
            <mesh material={materials.aluminium} position={[0, 0, -0.012]}>
              <boxGeometry args={[0.21, 0.066, 0.012]} />
            </mesh>
            <mesh material={materials.headlight} position={[0, 0.012, -0.02]}>
              <boxGeometry args={[0.18, 0.018, 0.006]} />
            </mesh>
            {[-0.06, 0, 0.06].map((x) => (
              <mesh key={x} material={materials.headlight} position={[x, -0.014, -0.02]}>
                <cylinderGeometry args={[0.012, 0.012, 0.006, 12]} />
              </mesh>
            ))}
            <mesh material={materials.glass} position={[0, 0, -0.026]} rotation={[0, Math.PI, 0]}>
              <planeGeometry args={[0.22, 0.07]} />
            </mesh>
          </group>
          <group position={[side * 0.55, 0, 1.26]}>
            <RoundedBox args={[0.22, 0.08, 0.025]} radius={0.01} material={materials.trim} />
            <mesh material={materials.red} position={[0, 0, 0.014]}>
              <boxGeometry args={[0.18, 0.05, 0.006]} />
            </mesh>
          </group>
          {/* Whip antenna */}
          <group position={[side * 0.3, 0.23, 1.18]}>
            <mesh material={materials.trim} position={[0, 0.2, 0]}>
              <cylinderGeometry args={[0.006, 0.012, 0.4, 6]} />
            </mesh>
            <mesh material={materials.red} position={[0, 0.41, 0]}>
              <sphereGeometry args={[0.016, 6, 4]} />
            </mesh>
          </group>
        </group>
      ))}
      {/* Roof panel seams and markings */}
      {[0.5, 0.62].map((z) => (
        <mesh key={z} material={materials.white} position={[0, 0.456, z]}>
          <boxGeometry args={[1.0, 0.004, 0.05]} />
        </mesh>
      ))}
      {[-0.35, 0.35].map((x) => (
        <mesh key={x} material={materials.trim} position={[x, 0.453, 0.12]}>
          <boxGeometry args={[0.006, 0.004, 1.4]} />
        </mesh>
      ))}
      {/* Rear vents and cargo rack */}
      {[-0.1, -0.03, 0.04, 0.11].map((y) => (
        <mesh key={y} material={materials.trim} position={[0, y, 1.256]}>
          <boxGeometry args={[0.7, 0.025, 0.012]} />
        </mesh>
      ))}
      <group position={[0, -0.1, 1.5]}>
        <mesh material={materials.aluminium} position={[0, 0, 0]}>
          <boxGeometry args={[0.72, 0.03, 0.46]} />
        </mesh>
        {[-0.34, 0.34].map((x) => (
          <mesh key={x} material={materials.aluminium} position={[x, 0.1, 0]}>
            <boxGeometry args={[0.03, 0.2, 0.46]} />
          </mesh>
        ))}
      </group>
      {/* Underside plate */}
      <mesh material={materials.trim} position={[0, HULL_BOTTOM, 0]}>
        <boxGeometry args={[1.2, 0.04, 1.2]} />
      </mesh>
    </group>
  );
}

function RotorPod({
  materials,
  geometry,
  navLight,
  navAngle,
  rotorRef,
}: {
  materials: VehicleMaterials;
  geometry: PartGeometry;
  navLight: VehicleMaterials['red'];
  /** Direction (around Y) the navigation light faces: away from the hull. */
  navAngle: number;
  rotorRef: (group: Group | null) => void;
}) {
  return (
    <group>
      <mesh geometry={geometry.duct} material={materials.duct} castShadow receiveShadow />
      <mesh material={materials.ductGlow} position={[0, -0.11, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[DUCT_RADIUS + 0.03, 0.008, 6, 40]} />
      </mesh>
      {/* Motor with cooling fins, held by stator vanes. */}
      <mesh material={materials.trim} position={[0, -0.03, 0]} castShadow>
        <cylinderGeometry args={[0.085, 0.1, 0.13, 20]} />
      </mesh>
      {[0, 1, 2, 3, 4, 5].map((k) => (
        <mesh
          key={`fin${k}`}
          material={materials.aluminium}
          position={[0, -0.03, 0]}
          rotation={[0, (k * Math.PI) / 6, 0]}
        >
          <boxGeometry args={[0.215, 0.1, 0.008]} />
        </mesh>
      ))}
      {[0, 1, 2, 3].map((k) => (
        <mesh
          key={k}
          material={materials.trim}
          rotation={[0.25, (k * Math.PI) / 2 + Math.PI / 4, 0]}
          position={[0, -0.075, 0]}
        >
          <boxGeometry args={[DUCT_RADIUS * 2, 0.008, 0.022]} />
        </mesh>
      ))}
      <group ref={rotorRef} position={[0, 0.045, 0]}>
        <mesh geometry={geometry.propeller} material={materials.blade} castShadow />
        <mesh material={materials.accent} position={[0, 0.045, 0]}>
          <coneGeometry args={[0.05, 0.07, 16]} />
        </mesh>
      </group>
      <mesh material={materials.rotorBlur} position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.08, DUCT_RADIUS - 0.015, 40]} />
      </mesh>
      <group rotation={[0, navAngle, 0]}>
        <mesh material={navLight} position={[0, 0, DUCT_RADIUS + 0.095]}>
          <sphereGeometry args={[0.025, 8, 6]} />
        </mesh>
      </group>
    </group>
  );
}

function Wheel({ materials, geometry }: { materials: VehicleMaterials; geometry: PartGeometry }) {
  return (
    <group>
      <mesh geometry={geometry.tyre} material={materials.tire} castShadow />
      <mesh geometry={geometry.tread} material={materials.tread} castShadow />
      <mesh geometry={geometry.rim} material={materials.rim} />
      <mesh material={materials.accent} position={[0, 0.128, 0]}>
        <cylinderGeometry args={[0.045, 0.045, 0.012, 14]} />
      </mesh>
      {/* Beadlock ring clamping the tyre bead, with its bolt circle. */}
      <mesh material={materials.rim} position={[0, 0.132, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.25, 0.3, 40]} />
      </mesh>
      {BEADLOCK_BOLTS.map(([x, z], i) => (
        <mesh key={`b${i}`} material={materials.hub} position={[x, 0.137, z]}>
          <cylinderGeometry args={[0.008, 0.008, 0.01, 6]} />
        </mesh>
      ))}
      {LUG_NUTS.map(([x, z], i) => (
        <mesh key={i} material={materials.hub} position={[x, 0.13, z]}>
          <cylinderGeometry args={[0.011, 0.011, 0.016, 6]} />
        </mesh>
      ))}
    </group>
  );
}

/** Capsule on the roof rack showing the patient actually carried in that slot. */
function CapsuleOnRack({ state, index }: { state: VehicleVisualState; index: number }) {
  const [jacket, setJacket] = useState('#c0492a');
  useFrame(() => {
    const next = state.capsules?.[index]?.jacket;
    if (next && next !== jacket) setJacket(next);
  });
  return <CasualtyCapsule jacket={jacket} />;
}
