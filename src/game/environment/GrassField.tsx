import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  DataTexture,
  DoubleSide,
  FloatType,
  InstancedBufferAttribute,
  InstancedMesh,
  MeshStandardMaterial,
  NearestFilter,
  RedFormat,
  SRGBColorSpace,
  UnsignedByteType,
} from 'three';
import { SurfaceId } from '@/data/surfaces/surfaces';
import { createRandom } from '@/utils/math/random';
import type { TerrainQuery } from './TerrainQuery';

/** Grass cover (0..1) by surface: meadows full, forest floor sparse, everything else bare. */
const SURFACE_DENSITY: Partial<Record<SurfaceId, number>> = {
  [SurfaceId.GRASS]: 1,
  [SurfaceId.FOREST_FLOOR]: 0.35,
  [SurfaceId.MUD]: 0.08,
};
const CLUMP_WIDTH = 0.6;
const CLUMP_HEIGHT = 0.46;

/** Blade silhouettes on a transparent canvas, drawn with light tips and dark roots. */
function createBladeTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const random = createRandom(4242);
  for (let i = 0; i < 34; i++) {
    const x = 8 + random() * 112;
    const height = 60 + random() * 64;
    const lean = (random() - 0.5) * 34;
    const width = 3 + random() * 3;
    const gradient = ctx.createLinearGradient(0, 128, 0, 128 - height);
    const hue = 62 + random() * 22;
    gradient.addColorStop(0, `hsl(${hue}, 40%, 18%)`);
    gradient.addColorStop(0.6, `hsl(${hue}, 45%, ${34 + random() * 8}%)`);
    gradient.addColorStop(1, `hsl(${hue - 8}, 42%, ${48 + random() * 10}%)`);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(x - width, 128);
    ctx.quadraticCurveTo(x - width * 0.3 + lean * 0.4, 128 - height * 0.55, x + lean, 128 - height);
    ctx.quadraticCurveTo(x + width * 0.3 + lean * 0.4, 128 - height * 0.55, x + width, 128);
    ctx.closePath();
    ctx.fill();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Three crossed quads (star clump). UV.y runs 0 at the root to 1 at the tips. */
function createClumpGeometry(): BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let q = 0; q < 3; q++) {
    const angle = (q * Math.PI) / 3;
    const dx = (Math.cos(angle) * CLUMP_WIDTH) / 2;
    const dz = (Math.sin(angle) * CLUMP_WIDTH) / 2;
    const base = positions.length / 3;
    positions.push(-dx, 0, -dz, dx, 0, dz, dx, CLUMP_HEIGHT, dz, -dx, CLUMP_HEIGHT, -dz);
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setAttribute(
    'normal',
    new BufferAttribute(
      new Float32Array(positions.length).map((_, i) => (i % 3 === 1 ? 1 : 0)),
      3,
    ),
  );
  geometry.setIndex(indices);
  return geometry;
}

/** Terrain heights and grass density uploaded as textures the vertex shader can sample. */
function createTerrainTextures(terrain: TerrainQuery) {
  const data = terrain.data;
  const n = data.verticesPerSide;
  const heights = new DataTexture(new Float32Array(data.heights), n, n, RedFormat, FloatType);
  const density = new Uint8Array(n * n);
  for (let i = 0; i < n * n; i++) {
    const cover = SURFACE_DENSITY[data.surfaces[i] as SurfaceId] ?? 0;
    const scorched = data.scorch ? 1 - Math.min(1, data.scorch[i]! * 2) : 1;
    density[i] = Math.round(cover * scorched * 255);
  }
  const mask = new DataTexture(density, n, n, RedFormat, UnsignedByteType);
  for (const texture of [heights, mask]) {
    texture.magFilter = NearestFilter;
    texture.minFilter = NearestFilter;
    texture.needsUpdate = true;
  }
  return { heights, mask };
}

interface GrassFieldProps {
  terrain: TerrainQuery;
  /** Number of grass clumps kept around the camera (0 disables grass). */
  count: number;
  /** Radius (m) of the grass patch around the camera; clumps fade out towards it. */
  radius: number;
  getWind: () => { x: number; z: number };
}

/**
 * Wind-swept grass clumps around the camera. A fixed set of instances wraps around the camera
 * (positions are stable in the world, so nothing slides as you move); the vertex shader reads the
 * terrain height and a grass-density mask, so there is no per-frame CPU work.
 */
export function GrassField({ terrain, count, radius, getWind }: GrassFieldProps) {
  const mesh = useMemo(() => {
    const geometry = createClumpGeometry();
    const size = radius * 2;
    const random = createRandom(97);
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      seeds[i * 4] = random() * size;
      seeds[i * 4 + 1] = random() * size;
      seeds[i * 4 + 2] = random();
      seeds[i * 4 + 3] = random();
    }
    geometry.setAttribute('aGrass', new InstancedBufferAttribute(seeds, 4));

    const { heights, mask } = createTerrainTextures(terrain);
    const uniforms = {
      uGrassHeight: { value: heights },
      uGrassMask: { value: mask },
      uGrassCam: { value: [0, 0] as [number, number] },
      uGrassWind: { value: [0, 0] as [number, number] },
      uGrassTime: { value: 0 },
    };
    const data = terrain.data;
    const material = new MeshStandardMaterial({
      map: createBladeTexture(),
      alphaTest: 0.4,
      side: DoubleSide,
      roughness: 0.85,
      color: '#b4bf7a',
    });
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          attribute vec4 aGrass;
          uniform highp sampler2D uGrassHeight;
          uniform sampler2D uGrassMask;
          uniform vec2 uGrassCam;
          uniform vec2 uGrassWind;
          uniform float uGrassTime;
          varying float vGrassTint;
          float twGrassHeight(ivec2 c) {
            c = clamp(c, ivec2(0), ivec2(${data.verticesPerSide - 1}));
            return texelFetch(uGrassHeight, c, 0).r;
          }`,
        )
        .replace(
          '#include <beginnormal_vertex>',
          'vec3 objectNormal = vec3(0.0, 1.0, 0.0);\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3(1.0, 0.0, 0.0);\n#endif',
        )
        .replace(
          '#include <begin_vertex>',
          `const float SIZE = ${(radius * 2).toFixed(1)};
          vec2 rel = mod(aGrass.xy - uGrassCam + SIZE * 0.5, SIZE) - SIZE * 0.5;
          vec2 wp = uGrassCam + rel;
          vec2 g = (wp + ${data.half.toFixed(3)}) / ${data.cellSize.toFixed(5)};
          ivec2 c = ivec2(floor(g));
          vec2 f = fract(g);
          float h = mix(
            mix(twGrassHeight(c), twGrassHeight(c + ivec2(1, 0)), f.x),
            mix(twGrassHeight(c + ivec2(0, 1)), twGrassHeight(c + ivec2(1, 1)), f.x),
            f.y);
          float cover = texelFetch(uGrassMask, clamp(ivec2(floor(g + 0.5)), ivec2(0), ivec2(${data.verticesPerSide - 1})), 0).r;
          float fade = 1.0 - smoothstep(${(radius * 0.55).toFixed(1)}, ${radius.toFixed(1)}, length(rel));
          float s = step(aGrass.z, cover) * fade * (0.65 + aGrass.w * 0.7);
          float ang = aGrass.z * 97.0;
          vec3 transformed = position * s;
          transformed.xz = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * transformed.xz;
          float sway = uv.y * uv.y * s;
          float gust = sin(uGrassTime * 1.9 + wp.x * 0.31 + wp.y * 0.17) * 0.5 + 0.5;
          transformed.xz += (uGrassWind * (0.3 + gust * 0.7) + vec2(sin(uGrassTime * 2.3 + wp.y), cos(uGrassTime * 1.7 + wp.x)) * 0.05) * sway;
          transformed += vec3(wp.x, h - 0.04, wp.y);
          vGrassTint = 0.8 + aGrass.w * 0.35;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vGrassTint;')
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          // Self-shadowing towards the roots.
          diffuseColor.rgb *= vGrassTint * (0.5 + 0.5 * vMapUv.y);`,
        );
    };
    material.customProgramCacheKey = () => `tw-grass-${radius}-${data.verticesPerSide}`;
    material.userData.uniforms = uniforms;

    const instanced = new InstancedMesh(geometry, material, count);
    instanced.frustumCulled = false;
    instanced.receiveShadow = true;
    return instanced;
  }, [terrain, count, radius]);

  useEffect(
    () => () => {
      const material = mesh.material as MeshStandardMaterial;
      const uniforms = material.userData.uniforms as {
        uGrassHeight: { value: DataTexture };
        uGrassMask: { value: DataTexture };
      };
      uniforms.uGrassHeight.value.dispose();
      uniforms.uGrassMask.value.dispose();
      material.map?.dispose();
      material.dispose();
      mesh.geometry.dispose();
      mesh.dispose();
    },
    [mesh],
  );

  useFrame(({ camera, clock }) => {
    const uniforms = (mesh.material as MeshStandardMaterial).userData.uniforms as {
      uGrassCam: { value: [number, number] };
      uGrassWind: { value: [number, number] };
      uGrassTime: { value: number };
    };
    uniforms.uGrassCam.value[0] = camera.position.x;
    uniforms.uGrassCam.value[1] = camera.position.z;
    const wind = getWind();
    uniforms.uGrassWind.value[0] = wind.x * 0.02;
    uniforms.uGrassWind.value[1] = wind.z * 0.02;
    uniforms.uGrassTime.value = clock.elapsedTime;
  });

  if (count === 0) return null;
  return <primitive object={mesh} />;
}
