import { useTexture } from '@react-three/drei';
import { useMemo } from 'react';
import {
  BufferAttribute,
  Color,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three';
import { TERRAIN_LAYERS } from '@/data/visualAssets';
import { createNoise2D, fbm, ridged } from '@/utils/math/noise';
import { FOG_MAX } from '@/game/effects/Fog';
import { smoothstep } from '@/utils/math/scalar';

const SIZE = 4200;
const SEGMENTS = 160;
/** Inside this radius the main terrain is shown; the backdrop sinks below it. */
const INNER = 470;
const SNOW_LINE = 330;

const rockLayer = TERRAIN_LAYERS.find((l) => l.id === 'rock')!;
const snowLayer = TERRAIN_LAYERS.find((l) => l.id === 'snow')!;

/**
 * The backdrop uses the scene's exponential fog curve (plus extra haze low in the valleys), capped
 * like the scene fog, so it is always at least as hazy as the nearer playable terrain.
 */
function createMountainMaterial(
  rock: Texture,
  snow: Texture,
  fogColor: string,
  fogDensity: number,
): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, fog: false });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRock = { value: rock };
    shader.uniforms.uSnow = { value: snow };
    // Mixed after the output colour-space conversion, like three's own fog colour.
    shader.uniforms.uHazeColor = { value: new Color(fogColor).convertLinearToSRGB() };
    shader.uniforms.uHaze = { value: fogDensity };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vMtWorld;\nvarying vec3 vMtNormal;',
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vMtWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vMtNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform sampler2D uRock;\nuniform sampler2D uSnow;\nuniform vec3 uHazeColor;\nuniform float uHaze;\nvarying vec3 vMtWorld;\nvarying vec3 vMtNormal;',
      )
      .replace(
        '#include <fog_fragment>',
        `#include <fog_fragment>
        float mtDist = distance(vMtWorld, cameraPosition);
        float haze = 1.0 - exp(-uHaze * uHaze * mtDist * mtDist);
        haze += (1.0 - smoothstep(40.0, 420.0, vMtWorld.y)) * 0.15;
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uHazeColor, clamp(haze, 0.0, ${FOG_MAX.toFixed(2)}));`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // Biplanar rock projection with snow on gentle, high ground.
        vec3 n = normalize(vMtNormal);
        // One projection per pixel: the dominant axis (these slopes are seen from afar).
        vec2 mtUv = n.y > 0.7 ? vMtWorld.xz : (abs(n.x) > abs(n.z) ? vMtWorld.zy : vMtWorld.xy);
        vec3 rockColor = texture2D(uRock, mtUv / 60.0).rgb;
        vec3 snowColor = texture2D(uSnow, vMtWorld.xz / 40.0).rgb;
        float snow = smoothstep(${SNOW_LINE.toFixed(1)}, ${(SNOW_LINE + 90).toFixed(1)}, vMtWorld.y + n.y * 60.0)
          * smoothstep(0.35, 0.7, n.y);
        // Scree and grass on the lower, gentler flanks; bare rock above.
        float lowland = (1.0 - smoothstep(120.0, 260.0, vMtWorld.y)) * smoothstep(0.55, 0.85, n.y);
        vec3 ground = mix(rockColor * 0.85, rockColor * vec3(0.72, 0.8, 0.6), lowland);
        diffuseColor.rgb *= mix(ground, snowColor, snow);`,
      );
  };
  material.customProgramCacheKey = () => 'tw-mountains-v6';
  return material;
}

/** Visual-only mountain backdrop around the playable map. No physics. */
export function DistantMountains({
  seed,
  fogColor,
  fogDensity,
}: {
  seed: number;
  fogColor: string;
  fogDensity: number;
}) {
  const { rock, snow } = useTexture({ rock: rockLayer.diffuse, snow: snowLayer.diffuse });
  const geometry = useMemo(() => {
    const noise = createNoise2D(seed + 505);
    const warp = createNoise2D(seed + 606);
    const geo = new PlaneGeometry(SIZE, SIZE, SEGMENTS, SEGMENTS);
    geo.rotateX(-Math.PI / 2);
    const position = geo.getAttribute('position');
    const tint = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const z = position.getZ(i);
      const r = Math.max(Math.abs(x), Math.abs(z));
      const ring = smoothstep(INNER, 950, r);
      // Domain-warped ridges read as eroded massifs rather than a sawtooth.
      const wx = x + fbm(warp, x / 700, z / 700, 3) * 220;
      const wz = z + fbm(warp, z / 700 + 9, x / 700, 3) * 220;
      // Broad massifs with sharper ridgelines on top, instead of evenly spaced teeth.
      const massif = 0.5 + 0.5 * fbm(warp, wx / 1100 + 4, wz / 1100 - 7, 3);
      const crest = Math.pow(ridged(noise, wx / 650, wz / 650, 5), 1.25);
      const h = r < INNER + 35 ? -60 : 60 + ring * (90 + 420 * crest * (0.45 + 0.75 * massif));
      position.setY(i, h);
      const shade = 0.85 + 0.2 * fbm(noise, x / 300, z / 300, 2);
      tint[i * 3] = shade;
      tint[i * 3 + 1] = shade;
      tint[i * 3 + 2] = shade * 1.02;
    }
    geo.setAttribute('color', new BufferAttribute(tint, 3));
    geo.computeVertexNormals();
    return geo;
  }, [seed]);

  const material = useMemo(() => {
    for (const texture of [rock, snow]) {
      texture.wrapS = RepeatWrapping;
      texture.wrapT = RepeatWrapping;
      texture.colorSpace = SRGBColorSpace;
    }
    return createMountainMaterial(rock, snow, fogColor, fogDensity);
  }, [rock, snow, fogColor, fogDensity]);

  // Drawn after the playable terrain so hidden backdrop pixels are rejected before shading.
  return <mesh geometry={geometry} material={material} position={[0, -2, 0]} renderOrder={2} />;
}
