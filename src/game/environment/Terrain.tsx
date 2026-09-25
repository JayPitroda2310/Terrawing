import { RigidBody, TrimeshCollider } from '@react-three/rapier';
import { useLayoutEffect, useMemo } from 'react';
import { MeshStandardMaterial } from 'three';
import {
  NOISE_GLSL,
  SCAN_BAND_GLSL,
  SCAN_UNIFORMS_GLSL,
  scanUniforms,
} from '@/game/effects/shaderChunks';
import type { TerrainQuery } from './TerrainQuery';
import { buildTerrainGeometry } from './terrainGeometry';

/** Terrain material: vertex-coloured surfaces with procedural detail, wet sheen and scanner wave. */
function createTerrainMaterial(): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, scanUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTwWorld;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvTwWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying vec3 vTwWorld;\n${SCAN_UNIFORMS_GLSL}\n${NOISE_GLSL}\n${SCAN_BAND_GLSL}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float twDetail = tw_fbm(vTwWorld.xz * 0.35);
        float twFine = tw_noise(vTwWorld.xz * 2.7);
        diffuseColor.rgb *= 0.78 + 0.34 * twDetail + 0.1 * twFine;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        // Puddles and wet patches in low, flat areas.
        float twWet = smoothstep(0.55, 0.75, tw_fbm2(vTwWorld.xz * 0.08 + 7.0)) * uWetness;
        roughnessFactor = mix(roughnessFactor, 0.28, twWet);
        diffuseColor.rgb *= 1.0 - twWet * 0.25;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += tw_scanBand(vTwWorld);',
      );
  };
  material.customProgramCacheKey = () => 'tw-terrain-v1';
  return material;
}

interface TerrainProps {
  terrain: TerrainQuery;
  receiveShadow: boolean;
}

export function Terrain({ terrain, receiveShadow }: TerrainProps) {
  const geometry = useMemo(() => buildTerrainGeometry(terrain.data), [terrain]);
  const material = useMemo(createTerrainMaterial, []);
  const collider = useMemo(() => {
    const position = geometry.getAttribute('position');
    const index = geometry.getIndex();
    return {
      vertices: position.array as Float32Array,
      indices: (index?.array ?? new Uint32Array()) as Uint32Array,
    };
  }, [geometry]);

  useLayoutEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  return (
    <RigidBody type="fixed" colliders={false} name="terrain">
      <TrimeshCollider args={[collider.vertices, collider.indices]} friction={0.9} />
      <mesh geometry={geometry} material={material} receiveShadow={receiveShadow} />
    </RigidBody>
  );
}
