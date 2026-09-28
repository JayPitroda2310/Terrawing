import { RigidBody, TrimeshCollider } from '@react-three/rapier';
import { useTexture } from '@react-three/drei';
import { useMemo } from 'react';
import { MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';
import { ROAD_TEXTURES } from '@/data/visualAssets';
import { NOISE_GLSL } from '@/game/effects/shaderChunks';
import { sampleProfile } from './terrainMath';
import { buildRibbon } from './ribbon';
import type { TerrainQuery } from './TerrainQuery';

/**
 * Asphalt surface height above the road profile. The terrain beneath is carved slightly lower, and
 * the asphalt has its own collider at exactly this height, so wheels ride on the visible surface.
 */
const ROAD_LIFT = 0.05;
/** Length (m) over which the asphalt crumbles away at a road end. */
const ROAD_END_BREAKUP = 16;
/** Keep the road deck away from the river; the bridge structure spans that gap. */
const RIVER_GAP = 16;

function createRoadMaterial(map: Texture, normalMap: Texture, width: number): MeshStandardMaterial {
  // Ribbon UVs: u runs across the road (0..1), v along it in metres.
  for (const texture of [map, normalMap]) {
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.repeat.set(width / ROAD_TEXTURES.scale, 1 / ROAD_TEXTURES.scale);
  }
  map.colorSpace = SRGBColorSpace;
  const material = new MeshStandardMaterial({
    map,
    normalMap,
    color: '#b8bbbe',
    roughness: 0.7,
    metalness: 0.02,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float endDistance;\nvarying float vEndDistance;\nvarying vec2 vRoadUv;\nvarying vec3 vRoadWorld;',
      )
      .replace(
        '#include <uv_vertex>',
        '#include <uv_vertex>\nvRoadUv = uv;\nvEndDistance = endDistance;\nvRoadWorld = (modelMatrix * vec4(position, 1.0)).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying float vEndDistance;\nvarying vec2 vRoadUv;\nvarying vec3 vRoadWorld;\n${NOISE_GLSL}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // Where the road ends (or a landslide cut it) the asphalt breaks up into crumbling
        // chunks and potholes, revealing the gravel bed beneath, instead of a straight edge.
        float breakup = clamp(1.0 - vEndDistance / ${ROAD_END_BREAKUP.toFixed(1)}, 0.0, 1.0);
        float chunks = tw_fbm2(vRoadWorld.xz * 0.45) * 0.55 + tw_noise(vRoadWorld.xz * 2.3) * 0.3
          + tw_noise(vRoadWorld.xz * 7.0) * 0.15;
        // The edges fail first, so the surviving tongue of asphalt narrows as it crumbles.
        float sides = smoothstep(0.1, 0.5, abs(vRoadUv.x - 0.5)) * 0.9;
        float erosion = breakup * (1.05 + sides) - 0.05;
        if (breakup > 0.0 && chunks < erosion) discard;
        // Cracks and grime darken the asphalt approaching the break.
        diffuseColor.rgb *= 1.0 - 0.35 * breakup * smoothstep(erosion, erosion + 0.12, chunks) * (1.0 - smoothstep(erosion + 0.12, erosion + 0.3, chunks)) - 0.12 * breakup;
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
        float puddle = smoothstep(0.62, 0.7, tw_pfbm2(vRoadWorld.xz * 0.18));
        roughnessFactor = mix(roughnessFactor, 0.08, puddle);
        diffuseColor.rgb *= 1.0 - puddle * 0.35;`,
      );
  };
  material.customProgramCacheKey = () => 'tw-road-v5';
  return material;
}

/** Road decks laid over the carved road corridors. Broken sections and the river gap are omitted. */
export function Roads({ terrain }: { terrain: TerrainQuery }) {
  const { map, normalMap } = useTexture({
    map: ROAD_TEXTURES.diffuse,
    normalMap: ROAD_TEXTURES.normal,
  });
  const roadWidth =
    (terrain.data.paths.find((p) => p.kind === 'road')?.definition.halfWidth ?? 4) * 2;
  const material = useMemo(
    () => createRoadMaterial(map, normalMap, roadWidth),
    [map, normalMap, roadWidth],
  );
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

  // The asphalt is solid: a collider built from the very same ribbon the player sees.
  const colliders = useMemo(
    () =>
      geometries.map((geometry) => ({
        vertices: geometry.getAttribute('position').array as Float32Array,
        indices: new Uint32Array(geometry.getIndex()!.array),
      })),
    [geometries],
  );

  return (
    <group>
      {geometries.map((geometry, i) => (
        <mesh key={i} geometry={geometry} material={material} receiveShadow />
      ))}
      <RigidBody type="fixed" colliders={false} name="roads">
        {colliders.map((collider, i) => (
          <TrimeshCollider key={i} args={[collider.vertices, collider.indices]} friction={1} />
        ))}
      </RigidBody>
    </group>
  );
}
