import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { AdditiveBlending, Color, DoubleSide, ShaderMaterial, type Mesh } from 'three';
import type { ScanPulseState } from '@/game/scanner/ScannerEffect';
import { scanUniforms } from './shaderChunks';

const WALL_HEIGHT = 36;

/**
 * Scanner pulse visuals: drives the shared scan uniforms (terrain/rock band) and draws a faint
 * translucent wavefront wall. Deliberately restrained.
 */
export function ScanEffect({
  pulse,
  getWetness,
}: {
  pulse: ScanPulseState;
  getWetness?: () => number;
}) {
  const wall = useRef<Mesh>(null);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        blending: AdditiveBlending,
        uniforms: { uColor: { value: new Color('#4fe0d2') }, uIntensity: { value: 0 } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          uniform float uIntensity;
          varying vec2 vUv;
          void main() {
            float fade = pow(1.0 - vUv.y, 2.5);
            float lines = 0.75 + 0.25 * step(0.5, fract(vUv.y * 18.0));
            gl_FragColor = vec4(uColor * lines, fade * uIntensity * 0.22);
          }
        `,
      }),
    [],
  );

  useEffect(() => () => material.dispose(), [material]);

  useFrame((_, dt) => {
    scanUniforms.uTime.value += dt;
    if (getWetness) scanUniforms.uWetness.value = getWetness();
    scanUniforms.uScanOrigin.value.set(pulse.originX, pulse.originY, pulse.originZ);
    scanUniforms.uScanRadius.value = pulse.radius;
    scanUniforms.uScanIntensity.value = pulse.active ? pulse.intensity : 0;
    material.uniforms.uIntensity!.value = pulse.active ? pulse.intensity : 0;
    const mesh = wall.current;
    if (!mesh) return;
    mesh.visible = pulse.active && pulse.radius > 1;
    mesh.position.set(pulse.originX, pulse.originY - WALL_HEIGHT * 0.35, pulse.originZ);
    mesh.scale.set(pulse.radius, 1, pulse.radius);
  });

  return (
    <mesh ref={wall} material={material} visible={false} frustumCulled={false} renderOrder={3}>
      <cylinderGeometry args={[1, 1, WALL_HEIGHT, 96, 1, true]} />
    </mesh>
  );
}
