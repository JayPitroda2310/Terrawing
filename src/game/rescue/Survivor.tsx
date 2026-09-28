import { useFrame } from '@react-three/fiber';
import { useCallback, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  type Bone,
  CanvasTexture,
  MeshStandardMaterial,
  SpriteMaterial,
  type Group,
  type Mesh,
  type Sprite,
} from 'three';
import { DEG2RAD } from '@/utils/math/scalar';
import type { SurvivorRuntime } from './SurvivorManager';
import { FoilBlanket } from './FoilBlanket';
import { SURVIVOR_JACKETS } from './humanRig';
import { SurvivorModel } from './SurvivorModel';

/** High-visibility jacket colours, so survivors read clearly (and differently) in the rain. */

function useRescueMaterials() {
  return useMemo(
    () => ({
      beaconBody: new MeshStandardMaterial({ color: '#1b1f22', roughness: 0.5 }),
      beaconLight: new MeshStandardMaterial({
        color: '#041a08',
        emissive: '#4dff7a',
        emissiveIntensity: 3.5,
      }),
      strobe: new MeshStandardMaterial({
        color: '#222',
        emissive: '#f4f8ff',
        emissiveIntensity: 6,
      }),
      halo: new SpriteMaterial({
        map: createHaloTexture(),
        color: '#dfe8ff',
        blending: AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    }),
    [],
  );
}

/** Soft radial glow used for the strobe halo. */
function createHaloTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return new CanvasTexture(canvas);
}

/** A survivor: realistic posed figure plus the thermal blanket and locator beacon once secured. */
export function Survivor({ survivor }: { survivor: SurvivorRuntime }) {
  const def = survivor.definition;
  const materials = useRescueMaterials();
  const beacon = useRef<Group>(null);
  const beaconLight = useRef<Mesh>(null);
  const bones = useRef<ReadonlyMap<string, Bone> | null>(null);
  const setBones = useCallback((map: ReadonlyMap<string, Bone>) => {
    bones.current = map;
  }, []);
  const strobe = useRef<Group>(null);
  const halo = useRef<Sprite>(null);

  const root = useRef<Group>(null);

  useFrame(({ clock }) => {
    if (root.current) root.current.visible = !survivor.onBoard;
    const secured = survivor.status === 'secured';
    if (beacon.current) beacon.current.visible = secured;
    if (beaconLight.current) beaconLight.current.visible = secured && clock.elapsedTime % 1 < 0.35;
    if (strobe.current) {
      // Double flash every 1.4 s, like a phone torch SOS / personal strobe.
      const t = clock.elapsedTime % 1.4;
      strobe.current.visible = !secured && (t < 0.08 || (t > 0.22 && t < 0.3));
      if (halo.current) halo.current.scale.setScalar(3 + Math.sin(clock.elapsedTime * 40) * 0.2);
    }
  });

  const { x, y, z } = survivor.position;
  return (
    <group ref={root} position={[x, y, z]} rotation={[0, -def.facingDeg * DEG2RAD, 0]}>
      <SurvivorModel
        pose={def.pose}
        jacket={SURVIVOR_JACKETS[def.callsign] ?? '#c0492a'}
        isCalm={() => survivor.status === 'secured'}
        onBones={setBones}
      />
      <FoilBlanket
        pose={def.pose}
        getBones={() => bones.current}
        isActive={() => survivor.status === 'secured'}
      />
      {def.strobe && (
        <group
          ref={strobe}
          position={[0.35, def.pose === 'lying' ? 0.4 : 1.3, 0.2]}
          visible={false}
        >
          <mesh material={materials.strobe}>
            <sphereGeometry args={[0.08, 8, 6]} />
          </mesh>
          <sprite ref={halo} material={materials.halo} scale={3} />
        </group>
      )}
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
