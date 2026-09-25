import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import { BackSide, Color, ShaderMaterial } from 'three';
import { NOISE_GLSL } from '@/game/effects/shaderChunks';

interface SkyProps {
  skyColor: string;
  fogColor: string;
  /** 0..1 lightning flash, read every frame. */
  getFlash: () => number;
}

const SKY_RADIUS = 2600;

/** Overcast sky dome with slowly drifting cloud layers and lightning flashes. */
export function Sky({ skyColor, fogColor, getFlash }: SkyProps) {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uTop: { value: new Color(skyColor).multiplyScalar(0.62) },
          uHorizon: { value: new Color(fogColor) },
          uTime: { value: 0 },
          uFlash: { value: 0 },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            gl_Position = p.xyww;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uTop;
          uniform vec3 uHorizon;
          uniform float uTime;
          uniform float uFlash;
          varying vec3 vDir;
          ${NOISE_GLSL}
          void main() {
            float h = clamp(vDir.y, -0.2, 1.0);
            vec3 base = mix(uHorizon, uTop, smoothstep(0.0, 0.55, h));
            vec2 uv = vDir.xz / max(0.08, vDir.y + 0.12);
            float clouds = tw_fbm(uv * 1.3 + vec2(uTime * 0.006, uTime * 0.002));
            float heavy = tw_fbm2(uv * 0.55 - vec2(uTime * 0.003, 0.0));
            float cover = smoothstep(0.35, 0.75, clouds * 0.6 + heavy * 0.6);
            vec3 cloudColor = mix(uTop * 0.8, uHorizon * 1.08, 0.5 + 0.5 * clouds);
            vec3 color = mix(base, cloudColor, cover * smoothstep(-0.02, 0.2, h) * 0.85);
            color = mix(color, uHorizon, 1.0 - smoothstep(-0.05, 0.12, h));
            color += vec3(0.75, 0.8, 0.95) * uFlash * (0.4 + 0.6 * cover);
            gl_FragColor = vec4(color, 1.0);
            #include <colorspace_fragment>
          }
        `,
      }),
    [skyColor, fogColor],
  );

  useFrame((_, dt) => {
    material.uniforms.uTime!.value += dt;
    material.uniforms.uFlash!.value = getFlash();
  });

  return (
    <mesh material={material} frustumCulled={false} renderOrder={-1000}>
      <sphereGeometry args={[SKY_RADIUS, 32, 16]} />
    </mesh>
  );
}
