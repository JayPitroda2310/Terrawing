import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { BufferAttribute, BufferGeometry, LineSegments, ShaderMaterial, Vector3 } from 'three';
import { createRandom } from '@/utils/math/random';

const BOX = { width: 70, height: 45 };
const FALL_SPEED = 13;
const STREAK_LENGTH = 0.55;

interface RainProps {
  drops: number;
  intensity: number;
  getWind: () => { x: number; z: number };
}

/**
 * GPU rain: drops live in a box that wraps around the camera. Positions are computed entirely in
 * the vertex shader from a per-drop seed, so the CPU cost is one uniform update per frame.
 */
export function Rain({ drops, intensity, getWind }: RainProps) {
  const lines = useMemo(() => {
    const random = createRandom(123);
    const seeds = new Float32Array(drops * 2 * 3);
    const ends = new Float32Array(drops * 2);
    for (let i = 0; i < drops; i++) {
      const sx = random();
      const sy = random();
      const sz = random();
      for (let k = 0; k < 2; k++) {
        const v = (i * 2 + k) * 3;
        seeds[v] = sx;
        seeds[v + 1] = sy;
        seeds[v + 2] = sz;
        ends[i * 2 + k] = k;
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(seeds, 3));
    geometry.setAttribute('end', new BufferAttribute(ends, 1));
    const material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uCamera: { value: new Vector3() },
        uWind: { value: new Vector3() },
        uOpacity: { value: 0.35 * intensity },
      },
      vertexShader: /* glsl */ `
        attribute float end;
        uniform float uTime;
        uniform vec3 uCamera;
        uniform vec3 uWind;
        varying float vFade;
        void main() {
          vec3 seed = position;
          float fall = fract(seed.y - uTime * ${FALL_SPEED.toFixed(1)} / ${BOX.height.toFixed(1)});
          vec3 local;
          local.xz = fract(seed.xz - uCamera.xz / ${BOX.width.toFixed(1)}) - 0.5;
          local.xz *= ${BOX.width.toFixed(1)};
          local.y = (fall - 0.5) * ${BOX.height.toFixed(1)};
          vec3 world = vec3(uCamera.x, uCamera.y, uCamera.z) + local;
          vec3 velocity = vec3(uWind.x, -${FALL_SPEED.toFixed(1)}, uWind.z);
          world -= velocity * end * ${STREAK_LENGTH.toFixed(2)} / ${FALL_SPEED.toFixed(1)};
          vec4 mv = modelViewMatrix * vec4(world, 1.0);
          vFade = 1.0 - smoothstep(10.0, ${(BOX.width / 2).toFixed(1)}, length(local.xz));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uOpacity;
        varying float vFade;
        void main() {
          gl_FragColor = vec4(0.78, 0.82, 0.86, uOpacity * vFade);
        }
      `,
    });
    const segments = new LineSegments(geometry, material);
    segments.frustumCulled = false;
    return segments;
  }, [drops, intensity]);

  useEffect(
    () => () => {
      lines.geometry.dispose();
      (lines.material as ShaderMaterial).dispose();
    },
    [lines],
  );

  useFrame(({ camera }, dt) => {
    const uniforms = (lines.material as ShaderMaterial).uniforms;
    uniforms.uTime!.value += dt;
    (uniforms.uCamera!.value as Vector3).copy(camera.position);
    const wind = getWind();
    (uniforms.uWind!.value as Vector3).set(wind.x, 0, wind.z);
  });

  if (intensity <= 0) return null;
  return <primitive object={lines} />;
}
