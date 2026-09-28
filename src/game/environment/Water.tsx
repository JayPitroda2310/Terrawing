import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { BufferAttribute, type Group, type Mesh, MeshStandardMaterial } from 'three';
import { NOISE_GLSL } from '@/game/effects/shaderChunks';
import { samplePolyline } from '@/utils/math/polyline';
import { createRandom } from '@/utils/math/random';
import { getMaterial } from './materials';
import { buildRibbon } from './ribbon';
import { riverLevelAt, riverSpeedAt } from './terrainMath';
import type { TerrainQuery } from './TerrainQuery';

const BANK_OVERLAP = 2;
const RIBBON_V_SCALE = 12;
const FLOATING_LOGS = 10;

/** Raindrop ripple rings on a water surface (world XZ); returns a normal perturbation. */
const RIPPLE_GLSL = /* glsl */ `
vec2 twRipple(vec2 p, float time) {
  vec2 grad = vec2(0.0);
  for (int layer = 0; layer < 2; layer++) {
    vec2 q = p * (layer == 0 ? 1.6 : 2.7) + float(layer) * 7.3;
    vec2 cell = floor(q);
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 c = cell + vec2(float(i), float(j));
        float h = fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453);
        vec2 centre = c + vec2(fract(h * 17.0), fract(h * 31.0));
        float age = fract(time * 0.9 + h);
        vec2 d = q - centre;
        float r = length(d);
        float ring = 1.0 - smoothstep(0.0, 0.12, abs(r - age * 0.9));
        grad += d / max(r, 1e-3) * sin((r - age * 0.9) * 45.0) * ring * (1.0 - age);
      }
    }
  }
  return grad;
}
`;

/**
 * River surface. Colour comes from depth across the channel (clear, silty shallows at the banks;
 * deep green-black in mid-channel) and the Fresnel sky reflection of the scene environment. The
 * surface texture flows downstream at the real current speed (two-phase flow mapping, so it never
 * stretches); foam gathers along the banks and whitens the rapids; raindrops ring the surface.
 */
function createWaterMaterial(): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.14,
    metalness: 0,
    envMapIntensity: 0.55,
    transparent: true,
  });
  const uniforms = { uWaterTime: { value: 0 }, uRain: { value: 0 } };
  material.userData.uniforms = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float flowSpeed;
        varying vec2 vWaterUv;
        varying float vFlowSpeed;
        varying vec3 vWaterWorld;`,
      )
      .replace(
        '#include <uv_vertex>',
        '#include <uv_vertex>\nvWaterUv = uv;\nvFlowSpeed = flowSpeed;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvWaterWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 vWaterUv;
        varying float vFlowSpeed;
        varying vec3 vWaterWorld;
        uniform float uWaterTime;
        uniform float uRain;
        ${NOISE_GLSL}
        ${RIPPLE_GLSL}
        float twFoam;
        vec2 twFlowNoise(vec2 uv) {
          float phaseA = fract(uWaterTime * 0.35);
          float phaseB = fract(uWaterTime * 0.35 + 0.5);
          float w = abs(phaseA - 0.5) * 2.0;
          // Ribbon V units per phase cycle at this vertex's current speed.
          float advect = vFlowSpeed / ${RIBBON_V_SCALE.toFixed(1)} / 0.35;
          vec2 a = vec2(uv.x * 4.0, (uv.y - phaseA * advect) * 3.0);
          vec2 b = vec2(uv.x * 4.0, (uv.y - phaseB * advect) * 3.0 + 0.37);
          vec2 na = vec2(tw_noise(a * vec2(1.0, 2.2)), tw_noise(a * vec2(2.3, 4.7) + 3.1));
          vec2 nb = vec2(tw_noise(b * vec2(1.0, 2.2)), tw_noise(b * vec2(2.3, 4.7) + 3.1));
          return mix(na, nb, w) - 0.5;
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float across = clamp(vWaterUv.x, 0.0, 1.0);
        float depth = pow(sin(3.14159 * across), 0.6);
        diffuseColor.rgb = mix(vec3(0.27, 0.29, 0.22), vec3(0.03, 0.06, 0.055), depth);
        diffuseColor.a = mix(0.55, 0.98, smoothstep(0.0, 0.5, depth));
        // Foam: a lace along the banks, and thin streaks drawn out by the current in the rapids.
        vec2 streakUv = vec2(vWaterUv.x * 26.0, vWaterUv.y * 0.9);
        vec2 f = twFlowNoise(streakUv) + 0.5;
        vec2 lace = twFlowNoise(vWaterUv * vec2(14.0, 6.0)) + 0.5;
        float bank = 1.0 - smoothstep(0.015, 0.1, min(across, 1.0 - across));
        float rapids = smoothstep(3.1, 3.8, vFlowSpeed);
        twFoam = clamp(
          bank * smoothstep(0.45, 0.7, lace.x)
          + rapids * smoothstep(0.66, 0.82, f.x * 0.7 + lace.y * 0.3), 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.8, 0.84, 0.84), twFoam * 0.75);
        diffuseColor.a = max(diffuseColor.a, twFoam);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.7, twFoam);',
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        vec2 flowN = twFlowNoise(vWaterUv) * (0.35 + 0.12 * vFlowSpeed);
        vec2 drops = twRipple(vWaterWorld.xz, uWaterTime) * 0.06 * uRain;
        vec3 wn = normalize(vec3(flowN.x + drops.x, 1.0, flowN.y + drops.y));
        normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);`,
      );
  };
  material.customProgramCacheKey = () => 'tw-water-v3';
  return material;
}

/** Driftwood carried downstream by the current, bobbing and turning as it goes. */
function FloatingLogs({ river }: { river: TerrainQuery['data']['river'] }) {
  const logs = useRef<(Group | null)[]>([]);
  const state = useMemo(() => {
    const random = createRandom(4711);
    return Array.from({ length: FLOATING_LOGS }, () => ({
      t: random(),
      lane: (random() - 0.5) * 1.3,
      spin: (random() - 0.5) * 0.4,
      yaw: random() * Math.PI,
      length: 2.2 + random() * 3,
      phase: random() * 10,
    }));
  }, []);
  const point = useMemo(() => ({ x: 0, z: 0 }), []);
  const ahead = useMemo(() => ({ x: 0, z: 0 }), []);

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const time = clock.elapsedTime;
    state.forEach((log, i) => {
      const group = logs.current[i];
      if (!group) return;
      const speed = riverSpeedAt(river, log.t) * (0.25 + 0.75 * (1 - log.lane * log.lane));
      log.t += (speed * dt) / river.line.length;
      if (log.t > 1) log.t -= 1;
      samplePolyline(river.line, log.t, point);
      samplePolyline(river.line, Math.min(1, log.t + 0.003), ahead);
      const tx = ahead.x - point.x;
      const tz = ahead.z - point.z;
      const length = Math.hypot(tx, tz) || 1;
      const offset = log.lane * river.halfWidth * 0.8;
      log.yaw += log.spin * dt;
      group.position.set(
        point.x + (-tz / length) * offset,
        riverLevelAt(river, log.t) - 0.08 + Math.sin(time * 1.3 + log.phase) * 0.04,
        point.z + (tx / length) * offset,
      );
      group.rotation.set(Math.sin(time * 0.9 + log.phase) * 0.06, log.yaw, 0);
    });
  });

  return (
    <group>
      {state.map((log, i) => (
        <group
          key={i}
          ref={(g) => {
            logs.current[i] = g;
          }}
        >
          <mesh material={getMaterial('bark')} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.18, 0.22, log.length, 8]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Animated river surface following the carved channel, with driftwood in the current. */
export function Water({ terrain, getRain }: { terrain: TerrainQuery; getRain: () => number }) {
  const river = terrain.data.river;
  const geometry = useMemo(() => {
    const g = buildRibbon({
      line: river.line,
      halfWidth: river.halfWidth + BANK_OVERLAP,
      spacing: 4,
      vScale: RIBBON_V_SCALE,
      heightAt: (t) => riverLevelAt(river, t),
    });
    // Per-vertex current speed drives the flow-mapped surface.
    const uv = g.getAttribute('uv');
    const speeds = new Float32Array(uv.count);
    for (let i = 0; i < uv.count; i++) {
      const t = (uv.getY(i) * RIBBON_V_SCALE) / river.line.length;
      speeds[i] = riverSpeedAt(river, Math.min(1, Math.max(0, t)));
    }
    g.setAttribute('flowSpeed', new BufferAttribute(speeds, 1));
    return g;
  }, [river]);
  const material = useMemo(createWaterMaterial, []);

  useFrame((_, dt) => {
    const uniforms = material.userData.uniforms as {
      uWaterTime: { value: number };
      uRain: { value: number };
    };
    uniforms.uWaterTime.value += dt;
    uniforms.uRain.value = getRain();
  });

  return (
    <group>
      <mesh geometry={geometry} material={material} receiveShadow renderOrder={1} />
      <FloatingLogs river={river} />
    </group>
  );
}

function createFloodMaterial(): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    color: '#3b3224',
    roughness: 0.32,
    metalness: 0,
    envMapIntensity: 0.45,
    transparent: true,
    opacity: 0.95,
  });
  material.userData.time = { value: 0 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWaterTime = material.userData.time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFloodXZ;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvFloodXZ = (modelMatrix * vec4(position, 1.0)).xz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying vec2 vFloodXZ;\nuniform float uWaterTime;\n${NOISE_GLSL}\n${RIPPLE_GLSL}`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        vec2 fp = vFloodXZ * 0.12 + vec2(uWaterTime * 0.05, uWaterTime * 0.11);
        float f1 = tw_noise(fp);
        float f2 = tw_noise(fp * 2.3 + 7.1 - uWaterTime * 0.04);
        vec2 drops = twRipple(vFloodXZ, uWaterTime) * 0.06;
        normal = normalize(normal + vec3((f1 - 0.5) * 0.22 + drops.x, 0.0, (f2 - 0.5) * 0.22 + drops.y));`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // Silt-laden water with drifting lighter patches and floating debris scum.
        float silt = tw_noise(vFloodXZ * 0.015 + uWaterTime * 0.01);
        float scum = smoothstep(0.78, 0.92, tw_noise(vFloodXZ * 0.09 - uWaterTime * 0.03));
        diffuseColor.rgb *= 0.85 + silt * 0.3;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.38, 0.3), scum * 0.5);`,
      );
  };
  material.customProgramCacheKey = () => 'tw-flood-v2';
  return material;
}

/** Flood water: a flat lake surface over every part of the valley below the flood level. */
export function FloodWater({
  level,
  size,
  getLevel,
}: {
  level: number;
  size: number;
  getLevel?: () => number;
}) {
  const material = useMemo(createFloodMaterial, []);
  const mesh = useRef<Mesh>(null);
  useFrame((_, dt) => {
    (material.userData.time as { value: number }).value += dt;
    if (mesh.current && getLevel) mesh.current.position.y = getLevel();
  });
  return (
    <mesh
      ref={mesh}
      material={material}
      position={[0, level, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
      renderOrder={1}
    >
      <planeGeometry args={[size, size]} />
    </mesh>
  );
}
