import type { Material, MeshStandardMaterial } from 'three';

/**
 * Live wear inputs shared by all of one TerraWing's materials: the vehicle's ground reference
 * (world Y at the wheel contact line) and how wet it is.
 */
export interface WearUniforms {
  rootY: { value: number };
  wetness: { value: number };
}

export function createWearUniforms(): WearUniforms {
  return { rootY: { value: -1e4 }, wetness: { value: 0 } };
}

export interface WearOptions {
  /** How much mud and dust this surface collects (0 = none, 1 = bodywork). */
  mud: number;
  /** Fine surface texture strength (paint orange-peel, rubber grain, casting). */
  grain: number;
  /** Colour variation across the surface (fading, patchiness). */
  variation: number;
  /** Panel seams in object space (the hull shell only). */
  seams?: boolean;
  /** Brushed-metal streaks along object X. */
  brushed?: boolean;
}

/** 3D value noise and fbm used by the wear shader. */
const NOISE = /* glsl */ `
float twHash3(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float twNoise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(twHash3(i), twHash3(i + vec3(1, 0, 0)), f.x),
        mix(twHash3(i + vec3(0, 1, 0)), twHash3(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(twHash3(i + vec3(0, 0, 1)), twHash3(i + vec3(1, 0, 1)), f.x),
        mix(twHash3(i + vec3(0, 1, 1)), twHash3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float twFbm3(vec3 p) {
  return twNoise3(p) * 0.55 + twNoise3(p * 2.03 + 7.1) * 0.3 + twNoise3(p * 4.1 + 3.3) * 0.15;
}
`;

/**
 * Makes a vehicle material look used rather than new: paint grain and fading, mud and dust
 * built up from the ground line (crusty, rough, matte) with splatter higher up, panel seams,
 * brushed-metal streaks, and a wet look (darker, glossier) when it rains. Everything is in the
 * part's own object space, so wear sticks to the part as it moves.
 */
export function applyWear<T extends MeshStandardMaterial>(
  material: T,
  uniforms: WearUniforms,
  options: WearOptions,
): T {
  const key = `wear-${options.mud}-${options.grain}-${options.variation}-${options.seams ? 1 : 0}-${
    options.brushed ? 1 : 0
  }`;
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.uniforms.twRootY = uniforms.rootY;
    shader.uniforms.twWet = uniforms.wetness;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vTwObj;
        varying float vTwWorldY;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vTwObj = position;
        vTwWorldY = (modelMatrix * vec4(position, 1.0)).y;`,
      );
    const f = (n: number) => n.toFixed(3);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float twRootY;
        uniform float twWet;
        varying vec3 vTwObj;
        varying float vTwWorldY;
        ${NOISE}`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float twN = twFbm3(vTwObj * 5.0);
        float twH = vTwWorldY - twRootY;
        // Mud climbs from the ground line, ragged; splatter specks higher up.
        float twMud = smoothstep(0.62, 0.04, twH + (twN - 0.5) * 0.3);
        float twSpeck = smoothstep(0.9, 0.97, twNoise3(vTwObj * 36.0)) * smoothstep(0.75, 0.25, twH);
        twMud = clamp(max(twMud * 0.85, twSpeck * 0.6), 0.0, 1.0) * ${f(options.mud)};
        vec3 twMudColor = mix(vec3(0.19, 0.155, 0.115), vec3(0.43, 0.37, 0.29), smoothstep(0.3, 0.8, twN));
        diffuseColor.rgb *= 1.0 - ${f(options.variation)} * 0.5 + ${f(options.variation)} * twN;
        ${
          options.seams
            ? `// Panel seams: shut-lines across the sides and top of the shell.
        float twSeam = 1.0 - smoothstep(0.0025, 0.006, abs(vTwObj.z + 0.72));
        twSeam = max(twSeam, 1.0 - smoothstep(0.0025, 0.006, abs(vTwObj.z - 0.44)));
        twSeam = max(twSeam, (1.0 - smoothstep(0.0025, 0.006, abs(vTwObj.y - 0.02))) * step(0.7, abs(vTwObj.x)));
        diffuseColor.rgb *= 1.0 - twSeam * 0.65;`
            : ''
        }
        ${
          options.brushed
            ? `diffuseColor.rgb *= 0.9 + 0.2 * twNoise3(vec3(vTwObj.x * 6.0, vTwObj.y * 380.0, vTwObj.z * 380.0));`
            : ''
        }
        diffuseColor.rgb = mix(diffuseColor.rgb, twMudColor, twMud * 0.9);
        // Wet: porous mud darkens a lot, paint a little.
        diffuseColor.rgb *= mix(1.0, mix(0.86, 0.55, twMud), twWet);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor *= 0.88 + 0.24 * twN;
        roughnessFactor = mix(roughnessFactor, 0.96, twMud);
        roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.3 + 0.03, twWet * (1.0 - twMud * 0.4));`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          // Height: fine grain everywhere, crusted mud where it has built up.
          // Fade detail out where it would alias (far away / grazing), so it never sparkles.
          float twFade = 1.0 - smoothstep(0.15, 0.6, length(fwidth(vTwObj * 60.0)));
          float twHt = (twNoise3(vTwObj * 60.0) * ${f(options.grain)} * 0.08
            + twFbm3(vTwObj * 24.0) * twMud * 0.9) * twFade;
          vec3 twDx = dFdx(-vViewPosition);
          vec3 twDy = dFdy(-vViewPosition);
          float twHx = dFdx(twHt);
          float twHy = dFdy(twHt);
          vec3 twR1 = cross(twDy, normal);
          vec3 twR2 = cross(normal, twDx);
          float twDet = dot(twDx, twR1);
          vec3 twGrad = sign(twDet) * (twHx * twR1 + twHy * twR2);
          normal = normalize(abs(twDet) * normal - twGrad * 0.01);
        }`,
      )
      .replace(
        '#include <lights_physical_fragment>',
        `#include <lights_physical_fragment>
        #ifdef USE_CLEARCOAT
          material.clearcoat *= 1.0 - twMud;
          material.clearcoatRoughness = mix(material.clearcoatRoughness, 0.04, twWet);
        #endif`,
      );
  };
  const baseKey = material.customProgramCacheKey();
  material.customProgramCacheKey = () => `${baseKey}-${key}`;
  material.needsUpdate = true;
  return material;
}

/** Applies wear to every material in a record according to a per-key option table. */
export function wearAll(
  materials: Record<string, Material>,
  uniforms: WearUniforms,
  table: Record<string, WearOptions>,
): void {
  for (const [name, options] of Object.entries(table)) {
    const material = materials[name] as MeshStandardMaterial | undefined;
    if (material) applyWear(material, uniforms, options);
  }
}
