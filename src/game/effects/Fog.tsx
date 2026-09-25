import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import {
  Color,
  DoubleSide,
  FogExp2,
  InstancedMesh,
  Object3D,
  PlaneGeometry,
  ShaderMaterial,
} from 'three';
import type { TerrainQuery } from '@/game/environment/TerrainQuery';
import { createRandom, randomRange } from '@/utils/math/random';

/** Exponential scene fog. Density comes from the weather system. */
export function Fog({ color, density }: { color: string; density: number }) {
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    scene.fog = new FogExp2(new Color(color), density);
    return () => {
      scene.fog = null;
    };
  }, [scene, color, density]);
  return null;
}

const MIST_COUNT = 38;
const MIST_SIZE = 70;

/**
 * Low-lying mist banks in the valley: large soft billboards with animated noise. Gives the
 * volumetric feel without volumetric rendering cost.
 */
export function Mist({ terrain, color }: { terrain: TerrainQuery; color: string }) {
  const mesh = useMemo(() => {
    const geometry = new PlaneGeometry(1, 1);
    const material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      fog: false,
      uniforms: { uTime: { value: 0 }, uColor: { value: new Color(color) } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying float vSeed;
        varying float vDepth;
        void main() {
          vUv = uv;
          vec4 center = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          vec3 scale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), 1.0);
          vSeed = instanceMatrix[3].x * 0.013 + instanceMatrix[3].z * 0.007;
          vec4 mv = center + vec4(position.xy * scale.xy, 0.0, 0.0);
          vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uColor;
        varying vec2 vUv;
        varying float vSeed;
        varying float vDepth;
        void main() {
          vec2 p = vUv - 0.5;
          float r = length(p * vec2(1.0, 2.2));
          float wisps = 0.6 + 0.4 * sin(p.x * 9.0 + uTime * 0.2 + vSeed * 6.0) * sin(p.y * 13.0 - uTime * 0.13);
          float alpha = (1.0 - smoothstep(0.1, 0.5, r)) * wisps * 0.16;
          alpha *= smoothstep(8.0, 40.0, vDepth);
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
    });
    const instanced = new InstancedMesh(geometry, material, MIST_COUNT);
    const random = createRandom(808);
    const dummy = new Object3D();
    const river = terrain.data.river.line;
    for (let i = 0; i < MIST_COUNT; i++) {
      // Hug the river valley and low ground.
      const point = river.points[Math.floor(random() * river.points.length)]!;
      const x = point[0] + randomRange(random, -220, 220);
      const z = point[1] + randomRange(random, -60, 60);
      dummy.position.set(x, terrain.heightAt(x, z) + randomRange(random, 4, 12), z);
      const size = MIST_SIZE * randomRange(random, 0.7, 1.4);
      dummy.scale.set(size, size * 0.45, 1);
      dummy.updateMatrix();
      instanced.setMatrixAt(i, dummy.matrix);
    }
    instanced.frustumCulled = false;
    instanced.renderOrder = 2;
    return instanced;
  }, [terrain, color]);

  useEffect(
    () => () => {
      mesh.geometry.dispose();
      (mesh.material as ShaderMaterial).dispose();
    },
    [mesh],
  );

  useFrame((_, dt) => {
    (mesh.material as ShaderMaterial).uniforms.uTime!.value += dt;
  });

  return <primitive object={mesh} />;
}
