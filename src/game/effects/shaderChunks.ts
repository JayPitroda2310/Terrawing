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
