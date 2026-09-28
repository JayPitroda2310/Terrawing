import { RigidBody, TrimeshCollider } from '@react-three/rapier';
import { useLayoutEffect, useMemo } from 'react';
import { suspend } from 'suspend-react';
import { MeshStandardMaterial, Vector3, type DataArrayTexture } from 'three';
import { TERRAIN_LAYER, TERRAIN_LAYERS } from '@/data/visualAssets';
import {
  NOISE_GLSL,
  SCAN_BAND_GLSL,
  SCAN_UNIFORMS_GLSL,
  scanUniforms,
} from '@/game/effects/shaderChunks';
import { COLOR_SPACE, loadTextureArray } from './textureArrays';
import type { TerrainQuery } from './TerrainQuery';
import { buildTerrainGeometry } from './terrainGeometry';

const LAYER_COUNT = TERRAIN_LAYERS.length;

/** Loads the terrain albedo + normal texture arrays once per resolution (suspends while loading). */
function useTerrainTextures(size: number): { albedo: DataArrayTexture; normal: DataArrayTexture } {
  return suspend(async () => {
    const [albedo, normal] = await Promise.all([
      loadTextureArray(
        TERRAIN_LAYERS.map((l) => l.diffuse),
        size,
        COLOR_SPACE.color,
        [90, 96, 70],
      ),
      loadTextureArray(
        TERRAIN_LAYERS.map((l) => l.normal),
        size,
        COLOR_SPACE.data,
        [128, 128, 255],
      ),
    ]);
    return { albedo, normal };
  }, ['terrain-textures', size]);
}

const TERRAIN_GLSL = /* glsl */ `
uniform highp sampler2DArray uTerrainAlbedo;
uniform highp sampler2DArray uTerrainNormal;
uniform float uLayerScale[${LAYER_COUNT}];
uniform float uLayerRough[${LAYER_COUNT}];
uniform float uLayerNormal[${LAYER_COUNT}];
uniform vec3 uLayerTint[${LAYER_COUNT}];
varying vec4 vSplatA;
varying vec4 vSplatB;
varying vec3 vTwNormal;

vec3 twAlbedo;
vec3 twNormalW;
float twRough;
/** 0..1 — how much the ground here can hold puddles (mud, gravel and trails only). */
float twWetMask;

// Fetches one layer. textureGrad keeps mip selection correct inside the per-layer branches.
vec3 twTex(highp sampler2DArray tex, vec2 uv, float layer, vec2 ddx, vec2 ddy) {
  return textureGrad(tex, vec3(uv, layer), ddx, ddy).rgb;
}

void twSampleTerrain() {
  float w[${LAYER_COUNT}] = float[${LAYER_COUNT}](
    vSplatA.x, vSplatA.y, vSplatA.z, vSplatA.w, vSplatB.x, vSplatB.y, vSplatB.z, vSplatB.w);
  vec3 N = normalize(vTwNormal);
  vec3 tri = pow(abs(N), vec3(4.0));
  tri /= tri.x + tri.y + tri.z;
  vec2 dxXZ = dFdx(vTwWorld.xz);
  vec2 dyXZ = dFdy(vTwWorld.xz);
  // Two sampling scales, mixed by a slow noise field, hide texture tiling. Far away the coarse
  // scale dominates and normal detail fades, so distant slopes read as rock, not noise.
  float viewDist = distance(cameraPosition, vTwWorld);
  float farBlend = smoothstep(60.0, 260.0, viewDist);
  float detailFade = 1.0 - smoothstep(40.0, 220.0, viewDist) * 0.8;
  float tileMix = mix(0.25 + 0.35 * tw_noise(vTwWorld.xz * 0.04), 0.9, farBlend);

  vec3 albedo = vec3(0.0);
  vec3 perturb = vec3(0.0);
  float rough = 0.0;
  float total = 0.0;
  bool wantNormals = detailFade > 0.25;
  for (int i = 0; i < ${LAYER_COUNT}; i++) {
    float wi = w[i];
    // Thin blend fringes are not worth their texture fetches; weights are renormalised below.
    if (wi < 0.06) continue;
    float layer = float(i);
    float s = 1.0 / uLayerScale[i];
    vec3 color;
    vec3 bump = vec3(0.0);
    if (i == ${TERRAIN_LAYER.ROCK} && tri.y < 0.92) {
      // Triplanar projection so cliffs are not stretched (flat rock falls through to planar).
      vec3 dx3 = dFdx(vTwWorld) * s;
      vec3 dy3 = dFdy(vTwWorld) * s;
      vec3 p = vTwWorld * s;
      color = vec3(0.0);
      if (farBlend < 0.99) {
        vec3 cx = twTex(uTerrainAlbedo, p.zy, layer, dx3.zy, dy3.zy);
        vec3 cy = twTex(uTerrainAlbedo, p.xz, layer, dx3.xz, dy3.xz);
        vec3 cz = twTex(uTerrainAlbedo, p.xy, layer, dx3.xy, dy3.xy);
        color = (cx * tri.x + cy * tri.y + cz * tri.z) * (1.0 - farBlend);
      }
      if (farBlend > 0.01) {
        // Distant faces: a much larger projection so whole mountainsides show rock structure
        // instead of fine speckle.
        vec3 q = p * 0.23 + vec3(0.41, 0.17, 0.73);
        vec3 fx = twTex(uTerrainAlbedo, q.zy, layer, dx3.zy * 0.23, dy3.zy * 0.23);
        vec3 fy = twTex(uTerrainAlbedo, q.xz, layer, dx3.xz * 0.23, dy3.xz * 0.23);
        vec3 fz = twTex(uTerrainAlbedo, q.xy, layer, dx3.xy * 0.23, dy3.xy * 0.23);
        color += (fx * tri.x + fy * tri.y + fz * tri.z) * farBlend;
      }
      if (wantNormals) {
        vec3 nx = twTex(uTerrainNormal, p.zy, layer, dx3.zy, dy3.zy) * 2.0 - 1.0;
        vec3 ny = twTex(uTerrainNormal, p.xz, layer, dx3.xz, dy3.xz) * 2.0 - 1.0;
        vec3 nz = twTex(uTerrainNormal, p.xy, layer, dx3.xy, dy3.xy) * 2.0 - 1.0;
        bump = vec3(0.0, ny.y, nx.x) * tri.x * sign(N.x)
             + vec3(ny.x, 0.0, ny.y) * tri.y
             + vec3(nz.x, nz.y, 0.0) * tri.z * sign(N.z);
      }
    } else {
      vec2 uv = vTwWorld.xz * s;
      vec2 ddx = dxXZ * s;
      vec2 ddy = dyXZ * s;
      // Near: detailed scale (plus a little of the coarse one); far: coarse scale only.
      vec3 far = twTex(uTerrainAlbedo, uv * 0.29 + vec2(0.37, 0.71), layer, ddx * 0.29, ddy * 0.29);
      color = far;
      if (tileMix < 0.85) {
        vec3 near = twTex(uTerrainAlbedo, uv, layer, ddx, ddy);
        color = mix(near, far, tileMix);
      }
      if (wantNormals) {
        vec3 n = twTex(uTerrainNormal, uv, layer, ddx, ddy) * 2.0 - 1.0;
        bump = vec3(n.x, 0.0, n.y);
      }
    }
    albedo += color * uLayerTint[i] * wi;
    perturb += bump * uLayerNormal[i] * detailFade * wi;
    rough += uLayerRough[i] * wi;
    total += wi;
  }
  twWetMask = w[${TERRAIN_LAYER.MUD}] + w[${TERRAIN_LAYER.GRAVEL}] + w[${TERRAIN_LAYER.TRAIL}];
  total = max(total, 0.0001);
  twAlbedo = albedo / total;
  twRough = rough / total;
  twNormalW = normalize(N + perturb / total);
}
`;

/**
 * Terrain material: eight photographic PBR layers blended by per-vertex splat weights, with
 * normal mapping, triplanar rock, anti-tiling, wet puddles and the scanner wave.
 */
function createTerrainMaterial(
  albedo: DataArrayTexture,
  normal: DataArrayTexture,
): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, scanUniforms, {
      uTerrainAlbedo: { value: albedo },
      uTerrainNormal: { value: normal },
      uLayerScale: { value: TERRAIN_LAYERS.map((l) => l.scale) },
      uLayerRough: { value: TERRAIN_LAYERS.map((l) => l.roughness) },
      uLayerNormal: { value: TERRAIN_LAYERS.map((l) => l.normalStrength) },
      uLayerTint: { value: TERRAIN_LAYERS.map((l) => new Vector3(...l.tint)) },
    });
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec4 splatA;
        attribute vec4 splatB;
        varying vec4 vSplatA;
        varying vec4 vSplatB;
        varying vec3 vTwWorld;
        varying vec3 vTwNormal;`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        vTwNormal = normalize(mat3(modelMatrix) * objectNormal);
        vSplatA = splatA;
        vSplatB = splatB;`,
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvTwWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vTwWorld;
        ${SCAN_UNIFORMS_GLSL}
        ${NOISE_GLSL}
        ${SCAN_BAND_GLSL}
        ${TERRAIN_GLSL}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        twSampleTerrain();
        diffuseColor.rgb *= twAlbedo;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = twRough;
        // Rain-soaked puddles in low, flat areas.
        float twWet = smoothstep(0.55, 0.75, tw_pfbm2(vTwWorld.xz * 0.08 + 7.0)) * uWetness
          * smoothstep(0.8, 0.95, normalize(vTwNormal).y) * clamp(twWetMask * 1.5, 0.0, 1.0);
        roughnessFactor = mix(roughnessFactor, 0.12, twWet);
        diffuseColor.rgb *= 1.0 - twWet * 0.35;`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        normal = normalize((viewMatrix * vec4(twNormalW, 0.0)).xyz);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += tw_scanBand(vTwWorld);',
      );
  };
  material.customProgramCacheKey = () => 'tw-terrain-pbr-v6';
  return material;
}

interface TerrainProps {
  terrain: TerrainQuery;
  receiveShadow: boolean;
  textureSize: number;
}

export function Terrain({ terrain, receiveShadow, textureSize }: TerrainProps) {
  const textures = useTerrainTextures(textureSize);
  const geometry = useMemo(() => buildTerrainGeometry(terrain.data), [terrain]);
  const material = useMemo(
    () => createTerrainMaterial(textures.albedo, textures.normal),
    [textures],
  );
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
