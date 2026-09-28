import { RoundedBox } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Suspense, useMemo, useRef } from 'react';
import { DoubleSide, type Group, MeshPhysicalMaterial, MeshStandardMaterial } from 'three';
import { BRAND_GREEN } from '@/game/terrawing/vehicleTextures';
import { SurvivorModel } from './SurvivorModel';

/** Capsule size (m): a full-length rescue stretcher with a clear canopy. */
export const CAPSULE_LENGTH = 2.05;
const WIDTH = 0.66;
const TUB_HEIGHT = 0.24;
const CANOPY_RADIUS = 0.31;
const CANOPY_OPEN_ANGLE = 1.95;

function useCapsuleMaterials() {
  return useMemo(
    () => ({
      shell: new MeshStandardMaterial({ color: '#eceeea', roughness: 0.35, metalness: 0.05 }),
      trim: new MeshStandardMaterial({ color: '#23272a', roughness: 0.6 }),
      brand: new MeshStandardMaterial({ color: BRAND_GREEN, roughness: 0.45 }),
      mattress: new MeshStandardMaterial({ color: '#1e3f73', roughness: 0.8 }),
      blanket: new MeshStandardMaterial({ color: '#8c2424', roughness: 0.95 }),
      strap: new MeshStandardMaterial({ color: '#e8671c', roughness: 0.7 }),
      buckle: new MeshStandardMaterial({ color: '#b8bcc0', roughness: 0.3, metalness: 0.9 }),
      canopy: new MeshPhysicalMaterial({
        color: '#dfeff2',
        roughness: 0.04,
        metalness: 0,
        transparent: true,
        opacity: 0.22,
        clearcoat: 1,
        side: DoubleSide,
        depthWrite: false,
      }),
    }),
    [],
  );
}

/**
 * Casualty transport capsule: a moulded stretcher tub with mattress, the patient strapped in
 * under a blanket, and a hinged clear canopy. Head end is -Z. Local origin: centre of the tub
 * base. `getCanopy` (0 closed … 1 open) is read every frame.
 */
export function CasualtyCapsule({
  jacket,
  getCanopy,
  showPatient = true,
}: {
  jacket: string;
  getCanopy?: () => number;
  showPatient?: boolean;
}) {
  const m = useCapsuleMaterials();
  const hinge = useRef<Group>(null);
  useFrame(() => {
    if (hinge.current) hinge.current.rotation.z = -(getCanopy?.() ?? 0) * CANOPY_OPEN_ANGLE;
  });
  const half = CAPSULE_LENGTH / 2;
  const straight = CAPSULE_LENGTH - CANOPY_RADIUS * 2 * 0.9;
  return (
    <group>
      {/* Moulded tub, rim and brand band. */}
      <RoundedBox
        args={[WIDTH, TUB_HEIGHT, CAPSULE_LENGTH]}
        radius={0.09}
        smoothness={4}
        position={[0, TUB_HEIGHT / 2, 0]}
        material={m.shell}
        castShadow
        receiveShadow
      />
      <mesh material={m.brand} position={[0, TUB_HEIGHT * 0.55, 0]}>
        <boxGeometry args={[WIDTH + 0.006, 0.035, CAPSULE_LENGTH - 0.2]} />
      </mesh>
      <mesh material={m.trim} position={[0, TUB_HEIGHT + 0.005, 0]}>
        <boxGeometry args={[WIDTH + 0.01, 0.02, CAPSULE_LENGTH - 0.06]} />
      </mesh>
      {/* Carry handles at both ends and along the sides. */}
      {[-1, 1].map((end) => (
        <mesh
          key={`end${end}`}
          material={m.trim}
          position={[0, TUB_HEIGHT * 0.6, end * (half + 0.04)]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <torusGeometry args={[0.14, 0.018, 6, 16, Math.PI]} />
        </mesh>
      ))}
      {[-1, 1].flatMap((side) =>
        [-0.6, 0, 0.6].map((z) => (
          <mesh
            key={`h${side}${z}`}
            material={m.trim}
            position={[side * (WIDTH / 2 + 0.02), TUB_HEIGHT * 0.62, z]}
          >
            <boxGeometry args={[0.03, 0.03, 0.2]} />
          </mesh>
        )),
      )}
      {/* Mattress. */}
      <RoundedBox
        args={[WIDTH - 0.1, 0.07, CAPSULE_LENGTH - 0.14]}
        radius={0.03}
        position={[0, TUB_HEIGHT - 0.02, 0]}
        material={m.mattress}
      />
      {showPatient && (
        <group position={[0, TUB_HEIGHT - 0.1, 0]} scale={0.96}>
          <Suspense fallback={null}>
            <SurvivorModel pose="stretcher" jacket={jacket} isCalm={() => true} />
          </Suspense>
          {/* Blanket over legs and torso, three restraint straps with buckles. */}
          <RoundedBox
            args={[0.54, 0.13, 1.25]}
            radius={0.06}
            smoothness={3}
            position={[0, 0.27, 0.3]}
            material={m.blanket}
            castShadow
          />
          {[0.75, 0.25, -0.2].map((z) => (
            <group key={z} position={[0, 0.345, z]}>
              <mesh material={m.strap}>
                <boxGeometry args={[0.6, 0.012, 0.06]} />
              </mesh>
              <mesh material={m.buckle} position={[0, 0.01, 0]}>
                <boxGeometry args={[0.07, 0.012, 0.075]} />
              </mesh>
            </group>
          ))}
        </group>
      )}
      {/* Clear canopy on a hinge along the +X rim. */}
      <group ref={hinge} position={[WIDTH / 2, TUB_HEIGHT, 0]}>
        <group position={[-WIDTH / 2, 0, 0]} scale={[WIDTH / (CANOPY_RADIUS * 2), 0.82, 1]}>
          <mesh material={m.canopy} rotation={[Math.PI / 2, Math.PI / 2, 0]} renderOrder={2}>
            <cylinderGeometry
              args={[CANOPY_RADIUS, CANOPY_RADIUS, straight, 28, 1, true, 0, Math.PI]}
            />
          </mesh>
          {[-1, 1].map((end) => (
            <mesh
              key={end}
              material={m.canopy}
              position={[0, 0, end * (straight / 2)]}
              rotation={[0, end > 0 ? 0 : Math.PI, 0]}
              renderOrder={2}
            >
              <sphereGeometry args={[CANOPY_RADIUS, 20, 10, 0, Math.PI, 0, Math.PI / 2]} />
            </mesh>
          ))}
          {/* Canopy frame ribs. */}
          {[-straight / 2, 0, straight / 2].map((z) => (
            <mesh key={z} material={m.trim} position={[0, 0, z]}>
              <torusGeometry args={[CANOPY_RADIUS, 0.012, 5, 24, Math.PI]} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
}
