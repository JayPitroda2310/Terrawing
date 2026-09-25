import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { MeshStandardMaterial, type Group, type Mesh } from 'three';
import { DEG2RAD } from '@/utils/math/scalar';
import type { SurvivorRuntime } from './SurvivorManager';

const JACKETS: Readonly<Record<string, string>> = {
  A: '#d9471f',
  B: '#2f6fb3',
  C: '#d9a51f',
};

function useSurvivorMaterials(callsign: string) {
  return useMemo(
    () => ({
      jacket: new MeshStandardMaterial({ color: JACKETS[callsign] ?? '#c0492a', roughness: 0.75 }),
      trousers: new MeshStandardMaterial({ color: '#2b2e33', roughness: 0.9 }),
      skin: new MeshStandardMaterial({ color: '#c79a7d', roughness: 0.8 }),
      hat: new MeshStandardMaterial({ color: '#1f2226', roughness: 0.9 }),
      pack: new MeshStandardMaterial({ color: '#3f4a3a', roughness: 0.85 }),
      blanket: new MeshStandardMaterial({ color: '#c9ccc9', roughness: 0.25, metalness: 0.9 }),
      beaconBody: new MeshStandardMaterial({ color: '#1b1f22', roughness: 0.5 }),
      beaconLight: new MeshStandardMaterial({
        color: '#041a08',
        emissive: '#4dff7a',
        emissiveIntensity: 3.5,
      }),
    }),
    [callsign],
  );
}

type SurvivorMaterials = ReturnType<typeof useSurvivorMaterials>;

/** Procedural hiker figure (~1.75 m) with pose, idle animation and post-rescue beacon. */
export function Survivor({ survivor }: { survivor: SurvivorRuntime }) {
  const def = survivor.definition;
  const materials = useSurvivorMaterials(def.callsign);
  const waveArm = useRef<Group>(null);
  const body = useRef<Group>(null);
  const beacon = useRef<Group>(null);
  const beaconLight = useRef<Mesh>(null);
  const blanket = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const secured = survivor.status === 'secured';
    if (waveArm.current) {
      waveArm.current.rotation.z = secured ? -2.6 : -2.5 + Math.sin(t * 5) * 0.45;
    }
    if (body.current && def.pose !== 'lying') body.current.rotation.x = Math.sin(t * 1.3) * 0.02;
    if (beacon.current) beacon.current.visible = secured;
    if (blanket.current) blanket.current.visible = secured;
    if (beaconLight.current) beaconLight.current.visible = secured && t % 1 < 0.35;
  });

  const { x, y, z } = survivor.position;
  return (
    <group position={[x, y, z]} rotation={[0, -def.facingDeg * DEG2RAD, 0]}>
      <group ref={body}>
        {def.pose === 'waving' && <StandingFigure materials={materials} waveArmRef={waveArm} />}
        {def.pose === 'sitting' && <SittingFigure materials={materials} />}
        {def.pose === 'lying' && <LyingFigure materials={materials} />}
      </group>
      <mesh
        ref={blanket}
        material={materials.blanket}
        position={[0, def.pose === 'lying' ? 0.35 : 0.55, 0.1]}
        scale={def.pose === 'lying' ? [0.7, 0.2, 1.1] : [0.55, 0.5, 0.45]}
        visible={false}
      >
        <sphereGeometry args={[0.8, 12, 8]} />
      </mesh>
      <group ref={beacon} position={[1.1, 0, 0.6]} visible={false}>
        <mesh material={materials.beaconBody} position={[0, 0.35, 0]} castShadow>
          <cylinderGeometry args={[0.08, 0.12, 0.7, 10]} />
        </mesh>
        <mesh ref={beaconLight} material={materials.beaconLight} position={[0, 0.78, 0]}>
          <sphereGeometry args={[0.09, 10, 8]} />
        </mesh>
      </group>
    </group>
  );
}

function Head({ materials, y }: { materials: SurvivorMaterials; y: number }) {
  return (
    <group position={[0, y, 0]}>
      <mesh material={materials.skin} castShadow>
        <sphereGeometry args={[0.12, 14, 10]} />
      </mesh>
      <mesh material={materials.hat} position={[0, 0.06, 0]} scale={[1, 0.7, 1]}>
        <sphereGeometry args={[0.128, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
    </group>
  );
}

function Torso({ materials, y }: { materials: SurvivorMaterials; y: number }) {
  return (
    <group position={[0, y, 0]}>
      <mesh material={materials.jacket} castShadow>
        <capsuleGeometry args={[0.2, 0.42, 4, 10]} />
      </mesh>
      <mesh material={materials.pack} position={[0, 0.05, 0.22]} castShadow>
        <boxGeometry args={[0.34, 0.46, 0.18]} />
      </mesh>
    </group>
  );
}

function Limb({
  material,
  length,
  radius,
}: {
  material: MeshStandardMaterial;
  length: number;
  radius: number;
}) {
  return (
    <mesh material={material} position={[0, -length / 2, 0]} castShadow>
      <capsuleGeometry args={[radius, length - radius * 2, 4, 8]} />
    </mesh>
  );
}

function StandingFigure({
  materials,
  waveArmRef,
}: {
  materials: SurvivorMaterials;
  waveArmRef: React.Ref<Group>;
}) {
  return (
    <group>
      {[-0.1, 0.1].map((x) => (
        <group key={x} position={[x, 0.86, 0]}>
          <Limb material={materials.trousers} length={0.86} radius={0.08} />
        </group>
      ))}
      <Torso materials={materials} y={1.2} />
      <Head materials={materials} y={1.64} />
      <group position={[-0.26, 1.45, 0]} rotation={[0, 0, 0.25]}>
        <Limb material={materials.jacket} length={0.62} radius={0.065} />
      </group>
      <group ref={waveArmRef} position={[0.26, 1.45, 0]}>
        <Limb material={materials.jacket} length={0.62} radius={0.065} />
      </group>
    </group>
  );
}

function SittingFigure({ materials }: { materials: SurvivorMaterials }) {
  return (
    <group>
      {[-0.11, 0.11].map((x) => (
        <group key={x} position={[x, 0.2, -0.05]}>
          <group rotation={[Math.PI / 2 - 0.25, 0, 0]}>
            <Limb material={materials.trousers} length={0.5} radius={0.08} />
          </group>
          <group position={[0, 0.1, -0.48]} rotation={[-0.1, 0, 0]}>
            <Limb material={materials.trousers} length={0.4} radius={0.07} />
          </group>
        </group>
      ))}
      <Torso materials={materials} y={0.55} />
      <Head materials={materials} y={0.98} />
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 0.26, 0.8, 0]} rotation={[-0.9, 0, side * 0.2]}>
          <Limb material={materials.jacket} length={0.58} radius={0.065} />
        </group>
      ))}
    </group>
  );
}

function LyingFigure({ materials }: { materials: SurvivorMaterials }) {
  return (
    <group position={[0, 0.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <group position={[0, -0.6, 0]}>
        <StandingPoseLite materials={materials} />
      </group>
    </group>
  );
}

function StandingPoseLite({ materials }: { materials: SurvivorMaterials }) {
  return (
    <group>
      <group position={[-0.1, 0.86, 0]}>
        <Limb material={materials.trousers} length={0.86} radius={0.08} />
      </group>
      <group position={[0.12, 0.86, 0]} rotation={[0, 0, -0.2]}>
        <Limb material={materials.trousers} length={0.86} radius={0.08} />
      </group>
      <Torso materials={materials} y={1.2} />
      <Head materials={materials} y={1.64} />
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 0.26, 1.45, 0]} rotation={[0, 0, side * 0.5]}>
          <Limb material={materials.jacket} length={0.62} radius={0.065} />
        </group>
      ))}
    </group>
  );
}
