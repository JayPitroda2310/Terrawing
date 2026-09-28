import { Color, Vector3, type IUniform, type MeshStandardMaterial } from 'three';

/** GLSL value-noise helpers shared by custom material patches. */
export const NOISE_GLSL = /* glsl */ `
float tw_hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float tw_noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(tw_hash(i), tw_hash(i + vec2(1.0, 0.0)), u.x),
             mix(tw_hash(i + vec2(0.0, 1.0)), tw_hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float tw_fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) { v += a * tw_noise(p); p *= 2.03; a *= 0.5; }
  return v / 0.875;
}
float tw_fbm2(vec2 p) {
  return (tw_noise(p) * 0.5 + tw_noise(p * 2.03) * 0.25) / 0.75;
}
// Puddle noise: numerically stable in 32-bit floats (small multipliers), so the CPU mirror in
// environment/puddles.ts reproduces it exactly and splashes happen where puddles are drawn.
float tw_phash(vec2 p) {
  // Every intermediate stays below ~70, where 32-bit rounding is identical on CPU and GPU.
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 = fract(p3 + dot(p3, p3.yzx + 19.19));
  return fract((p3.x + p3.y) * p3.z * 7.13);
}
float tw_pnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(tw_phash(i), tw_phash(i + vec2(1.0, 0.0)), u.x),
             mix(tw_phash(i + vec2(0.0, 1.0)), tw_phash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float tw_pfbm2(vec2 p) {
  return (tw_pnoise(p) * 0.5 + tw_pnoise(p * 2.03) * 0.25) / 0.75;
}
`;

/**
 * Uniforms shared by every material that shows the scanner wave (terrain, rocks, structures).
 * Updated once per frame by the scan effect.
 */
export const scanUniforms: {
  uScanOrigin: IUniform<Vector3>;
  uScanRadius: IUniform<number>;
  uScanIntensity: IUniform<number>;
  uScanColor: IUniform<Color>;
  uTime: IUniform<number>;
  uWetness: IUniform<number>;
} = {
  uScanOrigin: { value: new Vector3() },
  uScanRadius: { value: 0 },
  uScanIntensity: { value: 0 },
  uScanColor: { value: new Color('#4fe0d2') },
  uTime: { value: 0 },
  uWetness: { value: 0.5 },
};

export const SCAN_UNIFORMS_GLSL = /* glsl */ `
uniform vec3 uScanOrigin;
uniform float uScanRadius;
uniform float uScanIntensity;
uniform vec3 uScanColor;
uniform float uTime;
uniform float uWetness;
`;

/** Emissive contribution of the expanding scanner ring at a world position. */
export const SCAN_BAND_GLSL = /* glsl */ `
vec3 tw_scanBand(vec3 worldPos) {
  if (uScanIntensity <= 0.0) return vec3(0.0);
  float d = distance(worldPos.xz, uScanOrigin.xz);
  float lead = smoothstep(uScanRadius - 9.0, uScanRadius, d) * (1.0 - smoothstep(uScanRadius, uScanRadius + 1.2, d));
  float inside = 1.0 - smoothstep(0.0, uScanRadius, d);
  float rings = smoothstep(0.96, 1.0, fract((uScanRadius - d) / 24.0)) * step(d, uScanRadius) * inside * 0.12;
  return uScanColor * (lead * 1.3 + rings) * uScanIntensity;
}
`;

/**
 * Patches a standard material so the scanner wave also sweeps across it. Works for instanced
 * meshes (the instance matrix is applied before computing the world position).
 */
export function withScanBand<T extends MeshStandardMaterial>(material: T, key: string): T {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, scanUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTwScanWorld;')
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vec4 twScanPos = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          twScanPos = instanceMatrix * twScanPos;
        #endif
        vTwScanWorld = (modelMatrix * twScanPos).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying vec3 vTwScanWorld;\n${SCAN_UNIFORMS_GLSL}\n${SCAN_BAND_GLSL}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += tw_scanBand(vTwScanWorld) * 0.8;',
      );
  };
  material.customProgramCacheKey = () => `tw-scan-${key}`;
  return material;
}

/**
 * Chains an extra shader patch onto a material without discarding earlier ones (for example the
 * scanner wave). `key` must be unique per distinct patch so programs are cached correctly.
 */
export function chainShaderPatch<T extends MeshStandardMaterial>(
  material: T,
  key: string,
  patch: (shader: Parameters<MeshStandardMaterial['onBeforeCompile']>[0]) => void,
): T {
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    patch(shader);
  };
  material.customProgramCacheKey = () => `${previousKey}|${key}`;
  return material;
}

/**
 * World-space triplanar projection for `map` and `normalMap`, so photo textures keep a constant
 * real-world size on boxes of any shape (no stretched UVs). `scale` = repeats per metre.
 */
export function withTriplanar<T extends MeshStandardMaterial>(
  material: T,
  scale: number,
  key: string,
): T {
  return chainShaderPatch(material, `triplanar-${key}`, (shader) => {
    shader.uniforms.uTriScale = { value: scale };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vTriWorld;\nvarying vec3 vTriNormal;',
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 twTriPos = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          twTriPos = instanceMatrix * twTriPos;
        #endif
        vTriWorld = (modelMatrix * twTriPos).xyz;
        vTriNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float uTriScale;\nvarying vec3 vTriWorld;\nvarying vec3 vTriNormal;',
      )
      .replace(
        '#include <map_fragment>',
        `vec3 twTriN = normalize(vTriNormal);
        vec3 twTriW = pow(abs(twTriN), vec3(4.0));
        twTriW /= twTriW.x + twTriW.y + twTriW.z;
        vec3 twTriP = vTriWorld * uTriScale;
        #ifdef USE_MAP
          vec4 twTriC = texture2D(map, twTriP.zy) * twTriW.x
            + texture2D(map, twTriP.xz) * twTriW.y
            + texture2D(map, twTriP.xy) * twTriW.z;
          diffuseColor *= twTriC;
        #endif`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#ifdef USE_NORMALMAP
          vec3 twNx = texture2D(normalMap, twTriP.zy).xyz * 2.0 - 1.0;
          vec3 twNy = texture2D(normalMap, twTriP.xz).xyz * 2.0 - 1.0;
          vec3 twNz = texture2D(normalMap, twTriP.xy).xyz * 2.0 - 1.0;
          vec3 twBump = vec3(0.0, twNx.y, twNx.x) * twTriW.x * sign(twTriN.x)
            + vec3(twNy.x, 0.0, twNy.y) * twTriW.y
            + vec3(twNz.x, twNz.y, 0.0) * twTriW.z * sign(twTriN.z);
          normal = normalize((viewMatrix * vec4(normalize(twTriN + twBump), 0.0)).xyz);
        #endif`,
      );
  });
}
