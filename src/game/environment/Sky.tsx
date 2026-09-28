import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { BackSide, Color, ShaderMaterial, type Texture } from 'three';

interface SkyProps {
  /** Equirectangular HDR sky photograph. */
  map: Texture;
  fogColor: string;
  intensity: number;
  /** 0..1 lightning flash, read every frame. */
  getFlash: () => number;
  getDaylight?: () => number;
}

const SKY_RADIUS = 2600;

/**
 * Photographic overcast sky dome. The HDRI is shown above the horizon and fades into the fog
 * colour below it, so the distant terrain blends seamlessly. Lightning brightens the clouds.
 */
export function Sky({ map, fogColor, intensity, getFlash, getDaylight }: SkyProps) {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uSkyMap: { value: map },
          uHorizon: { value: new Color(fogColor) },
          uIntensity: { value: intensity },
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
          #include <common>
          uniform sampler2D uSkyMap;
          uniform vec3 uHorizon;
          uniform float uIntensity;
          uniform float uFlash;
          varying vec3 vDir;
          void main() {
            vec3 dir = normalize(vDir);
            vec3 sky = texture2D(uSkyMap, equirectUv(dir)).rgb * uIntensity;
            float cloudLuma = dot(sky, vec3(0.299, 0.587, 0.114));
            vec3 color = mix(uHorizon, sky, smoothstep(-0.03, 0.22, dir.y));
            color += vec3(0.75, 0.8, 0.95) * uFlash * (0.3 + cloudLuma);
            gl_FragColor = vec4(color, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `,
      }),
    [map, fogColor, intensity],
  );

  useEffect(() => () => material.dispose(), [material]);

  useFrame(() => {
    material.uniforms.uFlash!.value = getFlash();
    material.uniforms.uIntensity!.value = intensity * (0.3 + 0.7 * (getDaylight?.() ?? 1));
  });

  return (
    <mesh material={material} frustumCulled={false} renderOrder={-1000}>
      <sphereGeometry args={[SKY_RADIUS, 48, 24]} />
    </mesh>
  );
}
