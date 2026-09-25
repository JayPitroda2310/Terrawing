import { Environment, Lightformer } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { BackSide, Vector3, type DirectionalLight, type HemisphereLight } from 'three';
import type { EnvironmentDefinition } from '@/data/environments/environmentSchema';

const SHADOW_EXTENT = 70;
const SUN_DISTANCE = 180;

interface LightingProps {
  lighting: EnvironmentDefinition['lighting'];
  shadows: boolean;
  shadowMapSize: number;
  /** World position the shadow frustum should follow (usually TerraWing). */
  getFocus: () => { x: number; y: number; z: number };
  getFlash: () => number;
}

/**
 * Overcast lighting: soft hemisphere fill plus a diffuse key light whose shadow frustum tracks the
 * player so shadow resolution is spent where it matters. A tiny baked environment gives metals and
 * wet surfaces something to reflect.
 */
export function Lighting({ lighting, shadows, shadowMapSize, getFocus, getFlash }: LightingProps) {
  const sun = useRef<DirectionalLight>(null);
  const hemi = useRef<HemisphereLight>(null);
  const direction = useMemo(
    () => new Vector3(...lighting.sunDirection).normalize(),
    [lighting.sunDirection],
  );

  useEffect(() => {
    const light = sun.current;
    if (!light) return;
    const cam = light.shadow.camera;
    cam.left = -SHADOW_EXTENT;
    cam.right = SHADOW_EXTENT;
    cam.top = SHADOW_EXTENT;
    cam.bottom = -SHADOW_EXTENT;
    cam.near = 1;
    cam.far = SUN_DISTANCE * 2.5;
    cam.updateProjectionMatrix();
    light.shadow.bias = -0.0004;
    light.shadow.normalBias = 0.6;
    light.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    light.shadow.map?.dispose();
    light.shadow.map = null;
  }, [shadowMapSize]);

  useFrame(() => {
    const light = sun.current;
    if (!light) return;
    const focus = getFocus();
    // Snap to texel-sized steps to avoid shadow shimmering while moving.
    const step = (SHADOW_EXTENT * 2) / shadowMapSize;
    const fx = Math.round(focus.x / step) * step;
    const fz = Math.round(focus.z / step) * step;
    light.target.position.set(fx, focus.y, fz);
    light.position.set(
      fx + direction.x * SUN_DISTANCE,
      focus.y + direction.y * SUN_DISTANCE,
      fz + direction.z * SUN_DISTANCE,
    );
    light.target.updateMatrixWorld();
    const flash = getFlash();
    light.intensity = lighting.sunIntensity + flash * 3;
    if (hemi.current) hemi.current.intensity = lighting.hemiIntensity + flash * 2;
  });

  return (
    <>
      <hemisphereLight
        ref={hemi}
        args={[lighting.skyColor, lighting.groundColor, lighting.hemiIntensity]}
      />
      <directionalLight
        ref={sun}
        color={lighting.sunColor}
        intensity={lighting.sunIntensity}
        castShadow={shadows}
      />
      <Environment resolution={64} frames={1} environmentIntensity={0.55}>
        <mesh scale={60}>
          <sphereGeometry args={[1, 16, 8]} />
          <meshBasicMaterial color={lighting.fogColor} side={BackSide} />
        </mesh>
        <Lightformer
          form="rect"
          intensity={1.6}
          color={lighting.skyColor}
          position={[0, 30, 0]}
          rotation-x={Math.PI / 2}
          scale={[80, 80, 1]}
        />
        <Lightformer
          form="rect"
          intensity={0.25}
          color={lighting.groundColor}
          position={[0, -20, 0]}
          rotation-x={-Math.PI / 2}
          scale={[80, 80, 1]}
        />
      </Environment>
    </>
  );
}
