import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Suspense, useMemo } from 'react';
import type { Object3D } from 'three';
import type { RigState, VehicleConfig } from '@/data/vehicles';
import { AssetBoundary } from '@/components/common/AssetBoundary';
import { TerraWingModel } from './TerraWingModel';

/** The subset of vehicle state a visual needs. Read every frame; never copied into React state. */
export interface VehicleVisualState {
  rig: RigState;
  forwardSpeed: number;
  steer: number;
  payload: string | null;
}

export interface VehicleVisualProps {
  state: VehicleVisualState;
  headlights?: boolean;
}

/**
 * Chooses the vehicle's visual representation from its config. A GLB model can replace the
 * procedural placeholder without touching gameplay code; if it fails to load we fall back.
 */
export function VehicleVisual({
  config,
  ...props
}: VehicleVisualProps & { config: VehicleConfig }) {
  const procedural = <TerraWingModel {...props} />;
  if (config.visual.kind === 'procedural') return procedural;
  return (
    <AssetBoundary name={`vehicle model ${config.visual.url}`} fallback={procedural}>
      <Suspense fallback={procedural}>
        <GltfVehicleModel url={config.visual.url} scale={config.visual.scale} {...props} />
      </Suspense>
    </AssetBoundary>
  );
}

/**
 * GLB vehicle. Nodes named `rotor_*` spin with the rig's rotor speed; further bone mapping
 * (arms, wheels) follows the same rig parameters.
 */
function GltfVehicleModel({
  url,
  scale,
  state,
}: VehicleVisualProps & { url: string; scale: number }) {
  const gltf = useGLTF(url);
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  const rotors = useMemo(() => {
    const found: Object3D[] = [];
    scene.traverse((node) => {
      if (node.name.startsWith('rotor_')) found.push(node);
    });
    return found;
  }, [scene]);
  useFrame((_, dt) => {
    for (const rotor of rotors) rotor.rotation.y += state.rig.rotorSpeed * 75 * dt;
  });
  return <primitive object={scene} scale={scale} />;
}
