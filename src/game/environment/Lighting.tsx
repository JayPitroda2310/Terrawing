import { Environment } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Vector3, type DirectionalLight, type HemisphereLight, type Texture } from 'three';
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
  /** 0..1 daylight (fades towards dusk). */
  getDaylight?: () => number;
  /** HDR sky used for image-based lighting. */
  environmentMap: Texture;
  /** Strength of the image-based lighting. */
  environmentIntensity: number;
}

/**
 * Overcast lighting: soft hemisphere fill plus a diffuse key light whose shadow frustum tracks the
 * player so shadow resolution is spent where it matters. The overcast HDRI provides image-based
 * lighting, so metals, wet ground and puddles reflect the real sky.
 */
export function Lighting({
  lighting,
  shadows,
  shadowMapSize,
  getFocus,
  getFlash,
  getDaylight,
  environmentMap,
  environmentIntensity,
}: LightingProps) {
  const scene = useThree((s) => s.scene);
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
    const day = getDaylight?.() ?? 1;
    light.intensity = lighting.sunIntensity * day + flash * 3;
    if (hemi.current) hemi.current.intensity = lighting.hemiIntensity * day + flash * 2;
    scene.environmentIntensity = environmentIntensity * (0.35 + 0.65 * day);
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
      <Environment map={environmentMap} environmentIntensity={environmentIntensity} />
    </>
  );
}
