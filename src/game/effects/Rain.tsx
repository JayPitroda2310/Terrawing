import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  FloatType,
  LinearFilter,
  LineSegments,
  Points,
  RGFormat,
  ShaderMaterial,
  Vector3,
} from 'three';
import { SurfaceId } from '@/data/surfaces/surfaces';
import type { TerrainQuery } from '@/game/environment/TerrainQuery';
import { createRandom } from '@/utils/math/random';

const BOX = { width: 60, height: 42 };
/** Terminal velocity range (m/s) for small to large raindrops. */
const TERMINAL = { min: 6.5, max: 9.5 };
/** Effective exposure time (s) that turns a falling drop into a streak. */
const EXPOSURE = 0.028;
const SPLASH_RADIUS = 22;

interface RainProps {
  drops: number;
  /** Highest intensity the rain can reach (sizes the effect). */
  intensity: number;
  /** Current intensity, read every frame (the weather evolves). */
  getIntensity?: () => number;
  getWind: () => { x: number; y?: number; z: number };
  terrain: TerrainQuery;
}

/**
 * Surface the rain lands on: R = height of ground or water surface, G = 1 over water. Sampled by
 * the shaders so drops stop exactly where they hit and splashes sit on the surface.
 */
interface SurfaceTexture {
  texture: DataTexture;
  n: number;
  half: number;
  cell: number;
}

const surfaceCache = new WeakMap<TerrainQuery, SurfaceTexture>();

function createSurfaceTexture(terrain: TerrainQuery): SurfaceTexture {
  const cached = surfaceCache.get(terrain);
  if (cached) return cached;
  const d = terrain.data;
  const n = d.verticesPerSide;
  const data = new Float32Array(n * n * 2);
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const i = iz * n + ix;
      const x = -d.half + ix * d.cellSize;
      const z = -d.half + iz * d.cellSize;
      const ground = d.heights[i]!;
      // Only river, bank and flooded cells can be under water; skip the costly query elsewhere.
      const surfaceId = d.surfaces[i];
      const maybeWet =
        surfaceId === SurfaceId.WATER ||
        surfaceId === SurfaceId.MUD ||
        (d.floodLevel != null && ground < d.floodLevel);
      const water = maybeWet ? terrain.waterLevelAt(x, z) : null;
      data[i * 2] = water !== null && water > ground ? water : ground;
      data[i * 2 + 1] = water !== null && water > ground ? 1 : 0;
    }
  }
  const texture = new DataTexture(data, n, n, RGFormat, FloatType);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  const result = { texture, n, half: d.half, cell: d.cellSize };
  surfaceCache.set(terrain, result);
  return result;
}

const SURFACE_GLSL = (half: number, size: number) => /* glsl */ `
uniform sampler2D uSurface;
vec2 twSurface(vec2 xz) {
  vec2 uv = (xz + ${half.toFixed(3)}) / ${size.toFixed(3)};
  return texture2D(uSurface, clamp(uv, 0.0, 1.0)).rg;
}
`;

/**
 * Physically based rain around the camera. Each drop falls at its own terminal velocity and is
 * carried by the gusting wind (including downdrafts); its streak is the motion blur of its velocity
 * relative to the moving camera, so rain slants towards you as you fly into it. Drops stop at the
 * ground or water surface, where they burst into splashes (crowns on land, rings on water).
 */
export function Rain({ drops, intensity, getIntensity, getWind, terrain }: RainProps) {
  const surface = useMemo(() => createSurfaceTexture(terrain), [terrain]);
  const shared = useMemo(
    () => ({
      uTime: { value: 0 },
      uCamera: { value: new Vector3() },
      uCamVel: { value: new Vector3() },
      uWind: { value: new Vector3() },
      uSurface: { value: surface.texture },
    }),
    [surface],
  );
  const size = surface.half * 2;

  const streaks = useMemo(() => {
    const random = createRandom(123);
    const seeds = new Float32Array(drops * 2 * 4);
    const ends = new Float32Array(drops * 2);
    for (let i = 0; i < drops; i++) {
      const s = [random(), random(), random(), random()];
      for (let k = 0; k < 2; k++) {
        seeds.set(s, (i * 2 + k) * 4);
        ends[i * 2 + k] = k;
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(drops * 2 * 3), 3));
    geometry.setAttribute('seed', new BufferAttribute(seeds, 4));
    geometry.setAttribute('end', new BufferAttribute(ends, 1));
    const material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { ...shared, uOpacity: { value: 0.28 + 0.25 * intensity } },
      vertexShader: /* glsl */ `
        attribute vec4 seed;
        attribute float end;
        uniform float uTime;
        uniform vec3 uCamera;
        uniform vec3 uCamVel;
        uniform vec3 uWind;
        varying float vFade;
        ${SURFACE_GLSL(surface.half, size)}
        void main() {
          float terminal = mix(${TERMINAL.min.toFixed(1)}, ${TERMINAL.max.toFixed(1)}, seed.w);
          vec3 velocity = vec3(uWind.x, -terminal + uWind.y, uWind.z);
          // Each drop falls through the box at its own speed; the box follows the camera.
          float fall = fract(seed.y + uTime * -velocity.y / ${BOX.height.toFixed(1)});
          vec3 local;
          local.xz = fract(seed.xz - uCamera.xz / ${BOX.width.toFixed(1)}
            - uWind.xz * uTime / ${BOX.width.toFixed(1)}) - 0.5;
          local.xz *= ${BOX.width.toFixed(1)};
          local.y = (0.5 - fall) * ${BOX.height.toFixed(1)};
          vec3 head = uCamera + local;
          // Motion blur of the velocity relative to the camera.
          vec3 relative = velocity - uCamVel;
          vec3 world = head - relative * end * ${EXPOSURE.toFixed(3)};
          float ground = twSurface(head.xz).r;
          vFade = (1.0 - smoothstep(8.0, ${(BOX.width / 2).toFixed(1)}, length(local.xz)))
            * step(ground, head.y);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uOpacity;
        varying float vFade;
        void main() {
          if (vFade <= 0.0) discard;
          gl_FragColor = vec4(0.8, 0.84, 0.88, uOpacity * vFade);
        }
      `,
    });
    const lines = new LineSegments(geometry, material);
    lines.frustumCulled = false;
    return lines;
  }, [drops, intensity, shared, surface, size]);

  const splashes = useMemo(() => {
    const count = Math.round(drops * 0.18 * intensity);
    const random = createRandom(321);
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < count * 4; i++) seeds[i] = random();
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute('seed', new BufferAttribute(seeds, 4));
    const material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { ...shared, uStrength: { value: 0.5 + 0.5 * intensity } },
      vertexShader: /* glsl */ `
        attribute vec4 seed;
        uniform float uTime;
        uniform vec3 uCamera;
        varying float vAge;
        varying float vWater;
        ${SURFACE_GLSL(surface.half, size)}
        float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main() {
          float period = mix(0.35, 0.7, seed.w);
          float cycle = uTime / period + seed.z;
          float n = floor(cycle);
          vAge = fract(cycle);
          vec2 offset = vec2(h(seed.xy + n), h(seed.yx + n * 1.37)) - 0.5;
          vec2 xz = uCamera.xz + offset * ${(SPLASH_RADIUS * 2).toFixed(1)};
          vec2 s = twSurface(xz);
          vWater = s.g;
          vec4 mv = modelViewMatrix * vec4(xz.x, s.r + 0.03, xz.y, 1.0);
          float grow = vWater > 0.5 ? mix(0.1, 0.45, vAge) : mix(0.06, 0.16, vAge);
          gl_PointSize = grow * 900.0 / max(0.5, -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uStrength;
        varying float vAge;
        varying float vWater;
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          float r = length(p) * 2.0;
          float a;
          if (vWater > 0.5) {
            // Expanding ripple ring, squashed to lie on the surface.
            float rr = length(p * vec2(1.0, 2.6)) * 2.0;
            a = (1.0 - smoothstep(0.0, 0.12, abs(rr - vAge))) * (1.0 - vAge) * 0.5;
          } else {
            // Crown of droplets thrown up and out, gone in a blink.
            float crown = 1.0 - smoothstep(0.0, 0.18, abs(r - 0.35 - vAge * 0.4));
            float up = step(p.y, 0.1);
            a = crown * up * (1.0 - vAge) * (1.0 - vAge) * 0.7;
          }
          if (a <= 0.003) discard;
          gl_FragColor = vec4(vec3(0.72, 0.78, 0.82) * a * uStrength, 1.0);
        }
      `,
    });
    const points = new Points(geometry, material);
    points.frustumCulled = false;
    return points;
  }, [drops, intensity, shared, surface, size]);

  useEffect(
    () => () => {
      for (const object of [streaks, splashes]) {
        object.geometry.dispose();
        (object.material as ShaderMaterial).dispose();
      }
    },
    [streaks, splashes],
  );

  const previous = useMemo(() => new Vector3(Number.NaN, 0, 0), []);
  useFrame(({ camera }, rawDt) => {
    const dt = Math.min(Math.max(rawDt, 1e-4), 0.1);
    shared.uTime.value += dt;
    shared.uCamera.value.copy(camera.position);
    if (Number.isNaN(previous.x)) previous.copy(camera.position);
    // Smoothed camera velocity (teleports and cuts are ignored).
    const vx = (camera.position.x - previous.x) / dt;
    const vy = (camera.position.y - previous.y) / dt;
    const vz = (camera.position.z - previous.z) / dt;
    if (Math.hypot(vx, vy, vz) < 60) shared.uCamVel.value.lerp(new Vector3(vx, vy, vz), 0.25);
    previous.copy(camera.position);
    const wind = getWind();
    shared.uWind.value.set(wind.x, wind.y ?? 0, wind.z);
    // Follow the evolving rain: fewer, fainter drops and splashes when it eases off.
    const now = Math.min(intensity, getIntensity?.() ?? intensity);
    const k = intensity > 0 ? now / intensity : 0;
    streaks.geometry.setDrawRange(0, Math.floor(drops * 2 * (0.15 + 0.85 * k)));
    (streaks.material as ShaderMaterial).uniforms.uOpacity!.value = 0.28 + 0.25 * now;
    const splashCount = splashes.geometry.getAttribute('position').count;
    splashes.geometry.setDrawRange(0, Math.floor(splashCount * k));
  });

  if (intensity <= 0) return null;
  return (
    <>
      <primitive object={streaks} />
      <primitive object={splashes} />
    </>
  );
}
