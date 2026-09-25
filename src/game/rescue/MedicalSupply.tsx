import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group } from 'three';
import { getMaterial } from '@/game/environment/materials';
import type { SupplyRuntime } from './SupplyManager';

/** Medical kit crate on a pallet at the base; hidden once loaded. */
export function MedicalSupply({ supply }: { supply: SupplyRuntime }) {
  const crate = useRef<Group>(null);
  useFrame(() => {
    if (crate.current) crate.current.visible = supply.status === 'available';
  });
  const { x, y, z } = supply.position;
  return (
    <group position={[x, y, z]}>
      <mesh material={getMaterial('wood')} position={[0, 0.08, 0]} receiveShadow>
        <boxGeometry args={[1.3, 0.16, 1.1]} />
      </mesh>
      <group ref={crate}>
        <mesh material={getMaterial('whitePaint')} position={[0, 0.45, 0]} castShadow>
          <boxGeometry args={[0.9, 0.58, 0.66]} />
        </mesh>
        <mesh material={getMaterial('orangePaint')} position={[0, 0.745, 0]}>
          <boxGeometry args={[0.5, 0.01, 0.14]} />
        </mesh>
        <mesh material={getMaterial('orangePaint')} position={[0, 0.745, 0]}>
          <boxGeometry args={[0.14, 0.01, 0.5]} />
        </mesh>
        <mesh material={getMaterial('cyanGlow')} position={[0.46, 0.6, 0]}>
          <boxGeometry args={[0.01, 0.05, 0.2]} />
        </mesh>
      </group>
    </group>
  );
}
