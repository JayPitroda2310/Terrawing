import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import { MeshStandardMaterial } from 'three';
import { NOISE_GLSL } from '@/game/effects/shaderChunks';
import { riverLevelAt } from './terrainMath';
import { buildRibbon } from './ribbon';
import type { TerrainQuery } from './TerrainQuery';

const BANK_OVERLAP = 2;
const FLOW_SPEED = 0.9;

function createWaterMaterial(): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    color: '#27393b',
    roughness: 0.12,
    metalness: 0.15,
    transparent: true,
    opacity: 0.88,
  });
  material.userData.time = { value: 0 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWaterTime = material.userData.time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vWaterUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvWaterUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying vec2 vWaterUv;\nuniform float uWaterTime;\n${NOISE_GLSL}`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        vec2 flowUv = vec2(vWaterUv.x * 3.0, vWaterUv.y - uWaterTime * ${FLOW_SPEED.toFixed(2)});
        float n1 = tw_noise(flowUv * vec2(4.0, 1.5));
        float n2 = tw_noise(flowUv * vec2(9.0, 3.0) + 3.1);
        normal = normalize(normal + vec3((n1 - 0.5) * 0.35, 0.0, (n2 - 0.5) * 0.35));`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float edge = 1.0 - smoothstep(0.0, 0.12, min(vWaterUv.x, 1.0 - vWaterUv.x));
        float foam = edge * smoothstep(0.45, 0.8, tw_noise(vec2(vWaterUv.x * 20.0, vWaterUv.y * 3.0 - uWaterTime * 1.4)));
        float streaks = smoothstep(0.7, 0.95, tw_noise(vec2(vWaterUv.x * 14.0, vWaterUv.y * 0.6 - uWaterTime * 1.1))) * 0.25;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.72, 0.76, 0.76), foam * 0.7 + streaks);`,
      );
  };
  material.customProgramCacheKey = () => 'tw-water-v1';
  return material;
}

/** Animated river surface following the carved channel. */
export function Water({ terrain }: { terrain: TerrainQuery }) {
  const river = terrain.data.river;
  const geometry = useMemo(
    () =>
      buildRibbon({
        line: river.line,
        halfWidth: river.halfWidth + BANK_OVERLAP,
        spacing: 4,
        vScale: 12,
        heightAt: (t) => riverLevelAt(river, t),
      }),
    [river],
  );
  const material = useMemo(createWaterMaterial, []);

  useFrame((_, dt) => {
    (material.userData.time as { value: number }).value += dt;
  });

  return <mesh geometry={geometry} material={material} receiveShadow renderOrder={1} />;
}
