import { RoundedBox } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import type { Group, Mesh, Object3D, SpotLight } from 'three';
import { DEG2RAD, lerp } from '@/utils/math/scalar';
import { createVehicleMaterials, type VehicleMaterials } from './vehicleMaterials';
import type { VehicleVisualProps } from './VehicleVisual';

/** Chassis centre height at rover ride height. */
const CHASSIS_Y = 0.85;
const ARM_LENGTH = { folded: 0.42, extended: 1.05 };
const WHEEL_RADIUS = 0.42;
const WHEEL_WIDTH = 0.28;
const WHEEL_TRACK = 0.84;
const AXLE_Z = 0.95;
const MAX_ROTOR_RATE = 75;
const DUCT_RADIUS = 0.46;

interface ArmSpec {
  side: 1 | -1;
  end: 1 | -1;
  extendedYaw: number;
  foldedYaw: number;
}

/** Arms: front-right, front-left, rear-right, rear-left. Model faces -Z. */
const ARMS: readonly ArmSpec[] = [
  { side: 1, end: -1, extendedYaw: -45 * DEG2RAD, foldedYaw: -90 * DEG2RAD },
  { side: -1, end: -1, extendedYaw: 45 * DEG2RAD, foldedYaw: 90 * DEG2RAD },
  { side: 1, end: 1, extendedYaw: -135 * DEG2RAD, foldedYaw: -90 * DEG2RAD },
  { side: -1, end: 1, extendedYaw: 135 * DEG2RAD, foldedYaw: 90 * DEG2RAD },
];

interface ArmRefs {
  root: Group | null;
  beam: Mesh | null;
  pod: Group | null;
  rotor: Group | null;
}

/**
 * Procedural TerraWing. Every articulated part is driven by the rig parameters, so the same data
 * can later drive bones of a skinned GLB model.
 */
export function TerraWingModel({ state, headlights = false }: VehicleVisualProps) {
  const materials = useMemo(createVehicleMaterials, []);
  const chassis = useRef<Group>(null);
  const arms = useRef<ArmRefs[]>(
    ARMS.map(() => ({ root: null, beam: null, pod: null, rotor: null })),
  );
  const wheels = useRef<(Group | null)[]>([]);
  const wheelSpin = useRef<(Group | null)[]>([]);
  const skids = useRef<Group>(null);
  const mast = useRef<Group>(null);
  const radar = useRef<Group>(null);
  const payload = useRef<Group>(null);
  const statusLight = useRef<Mesh>(null);
  const spot = useRef<SpotLight>(null);
  const spotTarget = useRef<Object3D>(null);
  const wheelAngle = useRef(0);

  useEffect(
    () => () => {
      for (const material of Object.values(materials)) material.dispose();
    },
    [materials],
  );

  // The spotlight target must be part of the scene graph so its world matrix follows the vehicle.
  useEffect(() => {
    if (spot.current && spotTarget.current) spot.current.target = spotTarget.current;
  }, []);

  useFrame(({ clock }, dt) => {
    const rig = state.rig;
    const time = clock.elapsedTime;
    const e = rig.armExtension;

    if (chassis.current) chassis.current.position.y = CHASSIS_Y + rig.bodyLift;

    const armLength = lerp(ARM_LENGTH.folded, ARM_LENGTH.extended, e);
    ARMS.forEach((spec, i) => {
      const refs = arms.current[i]!;
      if (refs.root) refs.root.rotation.y = lerp(spec.foldedYaw, spec.extendedYaw, e);
      if (refs.beam) {
        refs.beam.scale.z = armLength;
        refs.beam.position.z = -armLength / 2;
      }
      if (refs.pod) {
        refs.pod.position.z = -armLength;
        // Folded, each duct pitches vertical and becomes a wheel guard.
        refs.pod.rotation.x = (1 - e) * (Math.PI / 2);
      }
      if (refs.rotor)
        refs.rotor.rotation.y += rig.rotorSpeed * MAX_ROTOR_RATE * dt * (i % 2 ? 1 : -1);
    });
    materials.rotorBlur.opacity = rig.rotorSpeed * 0.28;
    materials.ductGlow.emissiveIntensity = 0.2 + rig.rotorSpeed * 1.6;

    // Wheels drop from the hull; they spin with forward speed.
    const w = rig.wheelDeploy;
    wheelAngle.current += (state.forwardSpeed / WHEEL_RADIUS) * dt * w;
    wheels.current.forEach((wheel, i) => {
      if (!wheel) return;
      const side = i % 2 === 0 ? 1 : -1;
      wheel.position.x = side * lerp(0.46, WHEEL_TRACK, w);
      wheel.position.y = lerp(CHASSIS_Y + rig.bodyLift, WHEEL_RADIUS, w);
      wheel.rotation.z = lerp(0, Math.PI / 2, w) * side;
      // Front wheels steer.
      wheel.rotation.y = i < 2 ? -state.steer * 0.35 * w : 0;
      const spin = wheelSpin.current[i];
      if (spin) spin.rotation.y = -wheelAngle.current * side;
    });

    if (skids.current) {
      const s = Math.max(0.001, 1 - w);
      skids.current.scale.y = s;
      skids.current.visible = s > 0.02;
    }
    if (mast.current) mast.current.scale.y = Math.max(0.05, rig.sensorMast);
    if (radar.current) radar.current.rotation.y = time * 1.8;
    if (payload.current) payload.current.visible = state.payload !== null;
    if (statusLight.current) statusLight.current.visible = time % 1.2 < 0.6;
    if (spot.current) spot.current.intensity = headlights ? 40 : 0;
  });

  return (
    <group>
      <group ref={chassis} position={[0, CHASSIS_Y, 0]}>
        <Hull materials={materials} />
        {ARMS.map((spec, i) => (
          <group
            key={i}
            ref={(g) => {
              arms.current[i]!.root = g;
            }}
            position={[spec.side * 0.62, -0.08, spec.end * AXLE_Z]}
          >
            <mesh
              ref={(m) => {
                arms.current[i]!.beam = m;
              }}
              material={materials.shell}
              castShadow
            >
              <boxGeometry args={[0.15, 0.1, 1]} />
            </mesh>
            <group
              ref={(g) => {
                arms.current[i]!.pod = g;
              }}
            >
              <RotorPod
                materials={materials}
                navLight={spec.side === 1 ? materials.green : materials.red}
                rotorRef={(g) => {
                  arms.current[i]!.rotor = g;
                }}
              />
            </group>
          </group>
        ))}
        {/* Sensor mast with rotating radar */}
        <group ref={mast} position={[0, 0.47, -0.1]}>
          <mesh material={materials.trim} position={[0, 0.2, 0]}>
            <cylinderGeometry args={[0.035, 0.05, 0.4, 8]} />
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
        {/* Medical kit payload */}
        <group ref={payload} position={[0, 0.66, 0.72]} visible={false}>
          <RoundedBox
            args={[0.62, 0.34, 0.46]}
            radius={0.04}
            material={materials.medical}
            castShadow
          />
          <mesh material={materials.orange} position={[0, 0.175, 0]}>
            <boxGeometry args={[0.36, 0.01, 0.1]} />
          </mesh>
          <mesh material={materials.orange} position={[0, 0.175, 0]}>
            <boxGeometry args={[0.1, 0.01, 0.3]} />
          </mesh>
        </group>
        <mesh ref={statusLight} material={materials.green} position={[0, 0.5, 0.35]}>
          <sphereGeometry args={[0.035, 8, 6]} />
        </mesh>
        <spotLight
          ref={spot}
          position={[0, 0.1, -1.3]}
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
        <group
          key={i}
          ref={(g) => {
            wheels.current[i] = g;
          }}
          position={[(i % 2 === 0 ? 1 : -1) * WHEEL_TRACK, WHEEL_RADIUS, i < 2 ? -AXLE_Z : AXLE_Z]}
        >
          <group
            ref={(g) => {
              wheelSpin.current[i] = g;
            }}
          >
            <Wheel materials={materials} />
          </group>
        </group>
      ))}

      <group ref={skids}>
        {[-1, 1].map((side) => (
          <group key={side} position={[side * 0.55, 0, 0]}>
            <mesh
              material={materials.trim}
              position={[0, 0.04, 0]}
              rotation={[Math.PI / 2, 0, 0]}
              castShadow
            >
              <capsuleGeometry args={[0.04, 1.8, 4, 8]} />
            </mesh>
            {[-0.55, 0.55].map((z) => (
              <mesh key={z} material={materials.trim} position={[0, 0.45, z]}>
                <boxGeometry args={[0.05, 0.85, 0.05]} />
              </mesh>
            ))}
          </group>
        ))}
      </group>
    </group>
  );
}

function Hull({ materials }: { materials: VehicleMaterials }) {
  return (
    <group>
      <RoundedBox
        args={[1.5, 0.46, 2.5]}
        radius={0.12}
        smoothness={3}
        material={materials.hull}
        castShadow
        receiveShadow
      />
      <RoundedBox
        args={[1.16, 0.3, 1.55]}
        radius={0.1}
        smoothness={3}
        position={[0, 0.3, 0.12]}
        material={materials.shell}
        castShadow
      />
      {/* Nose sensor housing */}
      <RoundedBox
        args={[0.92, 0.3, 0.5]}
        radius={0.08}
        smoothness={2}
        position={[0, 0.06, -1.18]}
        material={materials.shell}
        castShadow
      />
      <mesh material={materials.glass} position={[0, 0.08, -1.44]}>
        <sphereGeometry args={[0.14, 20, 14]} />
      </mesh>
      <mesh material={materials.cyan} position={[0, 0.08, -1.43]}>
        <torusGeometry args={[0.16, 0.012, 8, 28]} />
      </mesh>
      {/* Canopy window strip */}
      <mesh material={materials.glass} position={[0, 0.36, -0.66]} rotation={[-0.5, 0, 0]}>
        <boxGeometry args={[0.9, 0.16, 0.02]} />
      </mesh>
      {/* Safety orange side stripes and nose accents */}
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh material={materials.orange} position={[side * 0.755, 0.02, 0.1]}>
            <boxGeometry args={[0.012, 0.07, 2]} />
          </mesh>
          <mesh
            material={materials.orange}
            position={[side * 0.3, 0.2, -1.2]}
            rotation={[0, side * 0.5, 0]}
          >
            <boxGeometry args={[0.2, 0.012, 0.05]} />
          </mesh>
          <mesh material={materials.headlight} position={[side * 0.52, -0.02, -1.255]}>
            <boxGeometry args={[0.2, 0.06, 0.01]} />
          </mesh>
          <mesh material={materials.red} position={[side * 0.55, 0, 1.255]}>
            <boxGeometry args={[0.18, 0.05, 0.01]} />
          </mesh>
          <mesh material={materials.cyan} position={[side * 0.52, 0.46, 0.85]}>
            <sphereGeometry args={[0.025, 8, 6]} />
          </mesh>
        </group>
      ))}
      {/* White markings */}
      {[0.5, 0.62].map((z) => (
        <mesh key={z} material={materials.white} position={[0, 0.456, z]}>
          <boxGeometry args={[1.0, 0.004, 0.05]} />
        </mesh>
      ))}
      <mesh material={materials.orange} position={[0, 0.456, -0.25]}>
        <boxGeometry args={[0.5, 0.004, 0.12]} />
      </mesh>
      {/* Underside plate */}
      <mesh material={materials.trim} position={[0, -0.24, 0]}>
        <boxGeometry args={[1.2, 0.04, 2.1]} />
      </mesh>
    </group>
  );
}

function RotorPod({
  materials,
  navLight,
  rotorRef,
}: {
  materials: VehicleMaterials;
  navLight: VehicleMaterials['red'];
  rotorRef: (group: Group | null) => void;
}) {
  return (
    <group>
      <mesh material={materials.trim} position={[0, -0.02, 0]} castShadow>
        <cylinderGeometry args={[0.11, 0.13, 0.2, 14]} />
      </mesh>
      <mesh material={materials.hull} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[DUCT_RADIUS, 0.05, 10, 36]} />
      </mesh>
      <mesh material={materials.orange} position={[0, 0.045, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[DUCT_RADIUS, 0.018, 6, 36]} />
      </mesh>
      <mesh material={materials.ductGlow} position={[0, -0.04, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[DUCT_RADIUS - 0.05, 0.01, 6, 36]} />
      </mesh>
      {/* Duct struts */}
      {[0, 1, 2].map((k) => (
        <mesh
          key={k}
          material={materials.trim}
          rotation={[0, (k * Math.PI * 2) / 3, 0]}
          position={[0, -0.02, 0]}
        >
          <boxGeometry args={[0.02, 0.02, DUCT_RADIUS * 2]} />
        </mesh>
      ))}
      <group ref={rotorRef} position={[0, 0.07, 0]}>
        <mesh material={materials.trim}>
          <boxGeometry args={[0.82, 0.012, 0.07]} />
        </mesh>
        <mesh material={materials.trim} rotation={[0, Math.PI / 2, 0]}>
          <boxGeometry args={[0.82, 0.012, 0.07]} />
        </mesh>
      </group>
      <mesh material={materials.rotorBlur} position={[0, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[DUCT_RADIUS - 0.04, 28]} />
      </mesh>
      <mesh material={navLight} position={[DUCT_RADIUS + 0.03, 0, 0]}>
        <sphereGeometry args={[0.03, 8, 6]} />
      </mesh>
    </group>
  );
}

function Wheel({ materials }: { materials: VehicleMaterials }) {
  return (
    <group>
      <mesh material={materials.tire} castShadow>
        <cylinderGeometry args={[WHEEL_RADIUS, WHEEL_RADIUS, WHEEL_WIDTH, 24]} />
      </mesh>
      {[-1, 1].map((face) => (
        <group key={face} position={[0, (face * WHEEL_WIDTH) / 2, 0]}>
          <mesh material={materials.hub}>
            <cylinderGeometry args={[0.2, 0.2, 0.02, 16]} />
          </mesh>
          <mesh material={materials.orange} position={[0, face * 0.012, 0]}>
            <cylinderGeometry args={[0.07, 0.07, 0.01, 12]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
