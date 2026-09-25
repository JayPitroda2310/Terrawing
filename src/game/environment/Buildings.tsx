import { useFrame } from '@react-three/fiber';
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import { useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  DoubleSide,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Mesh,
} from 'three';
import { getMaterial, getPadTexture } from './materials';

/** Hunting cabin in the forest clearing. Origin at ground level, door facing +Z. */
export function Cabin() {
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[3.6, 2.2, 2.6]} position={[0, 2.2, 0]} />
      <mesh material={getMaterial('concreteDark')} position={[0, 0.25, 0]} castShadow receiveShadow>
        <boxGeometry args={[7.6, 0.5, 5.6]} />
      </mesh>
      {/* Log walls — stacked slabs give a log-cabin silhouette. */}
      {Array.from({ length: 7 }, (_, i) => (
        <mesh
          key={i}
          material={getMaterial(i % 2 ? 'wood' : 'woodDark')}
          position={[0, 0.72 + i * 0.4, 0]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[7.2 - (i % 2) * 0.12, 0.4, 5.2 - (i % 2) * 0.12]} />
        </mesh>
      ))}
      <mesh
        material={getMaterial('roof')}
        position={[0, 4.35, -1.45]}
        rotation={[0.55, 0, 0]}
        castShadow
      >
        <boxGeometry args={[8.2, 0.18, 3.4]} />
      </mesh>
      <mesh
        material={getMaterial('roof')}
        position={[0, 4.35, 1.45]}
        rotation={[-0.55, 0, 0]}
        castShadow
      >
        <boxGeometry args={[8.2, 0.18, 3.4]} />
      </mesh>
      <mesh material={getMaterial('concreteDark')} position={[2.2, 4.8, -0.8]} castShadow>
        <boxGeometry args={[0.7, 1.8, 0.7]} />
      </mesh>
      <mesh material={getMaterial('woodDark')} position={[-1.2, 1.5, 2.62]}>
        <boxGeometry args={[1.1, 2.1, 0.08]} />
      </mesh>
      <mesh material={getMaterial('windowWarm')} position={[1.6, 2, 2.62]}>
        <boxGeometry args={[1.3, 0.9, 0.06]} />
      </mesh>
      <mesh material={getMaterial('windowWarm')} position={[3.62, 2, 0]}>
        <boxGeometry args={[0.06, 0.9, 1.3]} />
      </mesh>
      {/* Porch */}
      <mesh material={getMaterial('wood')} position={[0, 0.55, 3.4]} receiveShadow>
        <boxGeometry args={[7.2, 0.15, 1.6]} />
      </mesh>
    </RigidBody>
  );
}

/** Rescue tent — orange shell with white bands. */
export function Tent() {
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[2.3, 1.9, 3]} position={[0, 1.9, 0]} />
      {/* Triangular prism roof (vertex up), sitting on the box walls. */}
      <mesh
        material={getMaterial('tentOrange')}
        position={[0, 2.8, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        castShadow
        receiveShadow
      >
        <cylinderGeometry args={[2.6, 2.6, 6, 3]} />
      </mesh>
      <mesh material={getMaterial('tentOrange')} position={[0, 0.75, 0]} castShadow receiveShadow>
        <boxGeometry args={[4.5, 1.5, 6]} />
      </mesh>
      {[-1.8, 0, 1.8].map((z) => (
        <mesh key={z} material={getMaterial('tentWhite')} position={[0, 0.75, z]}>
          <boxGeometry args={[4.56, 1.52, 0.18]} />
        </mesh>
      ))}
      <mesh material={getMaterial('steelDark')} position={[0, 0.9, 3.02]}>
        <boxGeometry args={[1.4, 1.8, 0.04]} />
      </mesh>
    </RigidBody>
  );
}

/** Shipping container used as a field workshop. */
export function Container() {
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[3, 1.3, 1.2]} position={[0, 1.3, 0]} />
      <mesh material={getMaterial('containerBlue')} position={[0, 1.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[6, 2.6, 2.4]} />
      </mesh>
      {Array.from({ length: 11 }, (_, i) => (
        <mesh
          key={i}
          material={getMaterial('containerBlue')}
          position={[-2.75 + i * 0.55, 1.3, 1.22]}
        >
          <boxGeometry args={[0.12, 2.5, 0.06]} />
        </mesh>
      ))}
      <mesh material={getMaterial('orangePaint')} position={[0, 2.62, 0]}>
        <boxGeometry args={[6.02, 0.06, 2.42]} />
      </mesh>
    </RigidBody>
  );
}

/** Relay mast — the signal source. Blinking aviation light on top. */
export function Antenna({ height }: { height: number }) {
  const beacon = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (beacon.current) beacon.current.visible = clock.elapsedTime % 1.6 < 0.25;
  });
  const sections = Math.floor(height / 3);
  return (
    <RigidBody type="fixed" colliders={false}>
      <CylinderCollider args={[height / 2, 0.8]} position={[0, height / 2, 0]} />
      <mesh material={getMaterial('concrete')} position={[0, 0.3, 0]} receiveShadow>
        <boxGeometry args={[2.4, 0.6, 2.4]} />
      </mesh>
      {[-0.45, 0.45].flatMap((x) =>
        [-0.45, 0.45].map((z) => (
          <mesh
            key={`${x},${z}`}
            material={getMaterial('steel')}
            position={[x, height / 2, z]}
            castShadow
          >
            <boxGeometry args={[0.1, height, 0.1]} />
          </mesh>
        )),
      )}
      {Array.from({ length: sections }, (_, i) => (
        <mesh
          key={i}
          material={getMaterial('steel')}
          position={[0, 1.5 + i * 3, 0]}
          rotation={[0, (i % 2) * (Math.PI / 2), 0.62]}
        >
          <boxGeometry args={[0.06, 1.3, 0.06]} />
        </mesh>
      ))}
      <mesh
        material={getMaterial('whitePaint')}
        position={[0.55, height - 4, 0]}
        rotation={[0, 0, -Math.PI / 2]}
        castShadow
      >
        <cylinderGeometry args={[0.9, 0.2, 0.4, 16]} />
      </mesh>
      <mesh material={getMaterial('steelDark')} position={[0, height - 1.5, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 3, 6]} />
      </mesh>
      <mesh ref={beacon} material={getMaterial('beaconRed')} position={[0, height + 0.1, 0]}>
        <sphereGeometry args={[0.22, 10, 8]} />
      </mesh>
    </RigidBody>
  );
}

/** Floodlight with a soft light cone (additive mesh — no dynamic light cost). */
export function Floodlight() {
  const cone = useMemo(
    () =>
      new MeshBasicMaterial({
        color: '#fff0d4',
        transparent: true,
        opacity: 0.07,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
      }),
    [],
  );
  return (
    <group>
      <mesh material={getMaterial('steelDark')} position={[0, 3, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.12, 6, 8]} />
      </mesh>
      <group position={[0, 6, 0]} rotation={[0.9, 0, 0]}>
        <mesh material={getMaterial('steelDark')}>
          <boxGeometry args={[1, 0.6, 0.35]} />
        </mesh>
        <mesh material={getMaterial('lampWhite')} position={[0, 0, 0.18]}>
          <boxGeometry args={[0.85, 0.45, 0.02]} />
        </mesh>
        <mesh material={cone} position={[0, 0, 5.2]} rotation={[-Math.PI / 2, 0, 0]}>
          <coneGeometry args={[3.2, 10, 20, 1, true]} />
        </mesh>
      </group>
    </group>
  );
}

/** Landing pad decal with an optional charging ring. */
export function Pad({ kind, charging }: { kind: 'helipad' | 'extraction'; charging: boolean }) {
  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        map: getPadTexture(kind),
        roughness: 0.6,
        polygonOffset: true,
        polygonOffsetFactor: -4,
      }),
    [kind],
  );
  const ring = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (!ring.current) return;
    const m = ring.current.material as MeshStandardMaterial;
    m.emissiveIntensity = 1.2 + Math.sin(clock.elapsedTime * 2) * 0.6;
  });
  return (
    <group>
      <mesh
        material={material}
        position={[0, 0.06, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <circleGeometry args={[11, 48]} />
      </mesh>
      {charging && (
        <mesh ref={ring} position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[10.4, 10.8, 64]} />
          <meshStandardMaterial color="#062224" emissive="#40e0d8" emissiveIntensity={1.5} />
        </mesh>
      )}
      {kind === 'extraction' &&
        [0, 1, 2, 3].map((i) => {
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
          return <PadBeacon key={i} x={Math.cos(a) * 12} z={Math.sin(a) * 12} phase={i * 0.25} />;
        })}
    </group>
  );
}

function PadBeacon({ x, z, phase }: { x: number; z: number; phase: number }) {
  const light = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (light.current) light.current.visible = (clock.elapsedTime + phase) % 1 < 0.3;
  });
  return (
    <group position={[x, 0, z]}>
      <mesh material={getMaterial('steelDark')} position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.12, 0.15, 0.6, 8]} />
      </mesh>
      <mesh ref={light} material={getMaterial('beaconRed')} position={[0, 0.7, 0]}>
        <sphereGeometry args={[0.14, 8, 6]} />
      </mesh>
    </group>
  );
}

/** Orange windsock on a pole, swaying in the wind. */
export function Windsock({ getWind }: { getWind: () => { x: number; z: number } }) {
  const sock = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (!sock.current) return;
    const wind = getWind();
    sock.current.parent!.rotation.y = Math.atan2(-wind.x, -wind.z);
    sock.current.rotation.x = Math.PI / 2 - 0.25 + Math.sin(clock.elapsedTime * 3) * 0.05;
  });
  return (
    <group>
      <mesh material={getMaterial('steel')} position={[0, 2.5, 0]}>
        <cylinderGeometry args={[0.05, 0.07, 5, 6]} />
      </mesh>
      <group position={[0, 4.9, 0]}>
        <mesh ref={sock} material={getMaterial('orangePaint')} position={[0, 0, 0.8]}>
          <coneGeometry args={[0.35, 1.8, 10, 1, true]} />
        </mesh>
      </group>
    </group>
  );
}
