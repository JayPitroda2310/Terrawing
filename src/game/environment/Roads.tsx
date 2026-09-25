import { useMemo } from 'react';
import { MeshStandardMaterial } from 'three';
import { NOISE_GLSL } from '@/game/effects/shaderChunks';
import { sampleProfile } from './terrainMath';
import { buildRibbon } from './ribbon';
import type { TerrainQuery } from './TerrainQuery';

const ROAD_LIFT = 0.12;
/** Keep the road deck away from the river; the bridge structure spans that gap. */
const RIVER_GAP = 16;

function createRoadMaterial(): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ color: '#45484b', roughness: 0.6, metalness: 0.05 });
  material.polygonOffset = true;
  material.polygonOffsetFactor = -2;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec2 vRoadUv;\nvarying vec3 vRoadWorld;',
      )
      .replace(
        '#include <uv_vertex>',
        '#include <uv_vertex>\nvRoadUv = uv;\nvRoadWorld = (modelMatrix * vec4(position, 1.0)).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying vec2 vRoadUv;\nvarying vec3 vRoadWorld;\n${NOISE_GLSL}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float centre = abs(vRoadUv.x - 0.5);
        float dash = step(0.5, fract(vRoadUv.y * 0.25));
        float line = (1.0 - smoothstep(0.012, 0.02, centre)) * dash;
        float edgeLine = smoothstep(0.43, 0.44, centre) * (1.0 - smoothstep(0.455, 0.465, centre));
        float wear = tw_fbm2(vRoadWorld.xz * 0.4);
        diffuseColor.rgb *= 0.8 + 0.35 * wear;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.55, 0.32), line * 0.55 * smoothstep(0.3, 0.6, wear));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.6), edgeLine * 0.35);
        float mudEdge = smoothstep(0.38, 0.5, centre);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.23, 0.2, 0.16), mudEdge * 0.7);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        float puddle = smoothstep(0.62, 0.7, tw_fbm2(vRoadWorld.xz * 0.18));
        roughnessFactor = mix(roughnessFactor, 0.08, puddle);
        diffuseColor.rgb *= 1.0 - puddle * 0.35;`,
      );
  };
  material.customProgramCacheKey = () => 'tw-road-v1';
  return material;
}

/** Road decks laid over the carved road corridors. Broken sections and the river gap are omitted. */
export function Roads({ terrain }: { terrain: TerrainQuery }) {
  const material = useMemo(createRoadMaterial, []);
  const geometries = useMemo(
    () =>
      terrain.data.paths
        .filter((path) => path.kind === 'road')
        .map((path) =>
          buildRibbon({
            line: path.line,
            halfWidth: path.definition.halfWidth,
            spacing: 3,
            vScale: 1,
            heightAt: (t) => sampleProfile(path.profile, t) + ROAD_LIFT,
            include: (t, x, z) =>
              !path.definition.damagedSections.some(([from, to]) => t >= from && t <= to) &&
              terrain.distanceToRiver(x, z) > terrain.data.river.halfWidth + RIVER_GAP,
          }),
        ),
    [terrain],
  );

  return (
    <group>
      {geometries.map((geometry, i) => (
        <mesh key={i} geometry={geometry} material={material} receiveShadow />
      ))}
    </group>
  );
}
