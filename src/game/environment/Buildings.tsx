import { useTexture } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { CylinderCollider, RigidBody } from '@react-three/rapier';
import { useMemo } from 'react';
import { MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';
import { PAD_TEXTURES } from '@/data/visualAssets';
import { GlowLight, PadLights } from './Lights';
import { getMaterial, getPadTexture } from './materials';

/** Relay mast — the signal source. Blinking aviation light on top. */
export function Antenna({ height }: { height: number }) {
  const sections = Math.floor(height / 3);
  return (
    <RigidBody type="fixed" colliders={false}>
      <CylinderCollider args={[height / 2, 0.8]} position={[0, height / 2, 0]} />
      <mesh material={getMaterial('concrete')} position={[0, 0.3, 0]} receiveShadow>
        <boxGeometry args={[2.4, 0.6, 2.4]} />
      </mesh>
      {[-0.45, 0.45].flatMap((x) =>
        [-0.45, 0.45].map((z) => (
          <mesh
            key={`${x},${z}`}
            material={getMaterial('steel')}
            position={[x, height / 2, z]}
            castShadow
          >
            <boxGeometry args={[0.1, height, 0.1]} />
          </mesh>
        )),
      )}
      {Array.from({ length: sections }, (_, i) => (
        <mesh
          key={i}
          material={getMaterial('steel')}
          position={[0, 1.5 + i * 3, 0]}
          rotation={[0, (i % 2) * (Math.PI / 2), 0.62]}
        >
          <boxGeometry args={[0.06, 1.3, 0.06]} />
        </mesh>
      ))}
      <mesh
        material={getMaterial('whitePaint')}
        position={[0.55, height - 4, 0]}
        rotation={[0, 0, -Math.PI / 2]}
        castShadow
      >
        <cylinderGeometry args={[0.9, 0.2, 0.4, 16]} />
      </mesh>
      <mesh material={getMaterial('steelDark')} position={[0, height - 1.5, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 3, 6]} />
      </mesh>
      {/* Aviation obstruction lights: flashing red on top, steady red halfway up. */}
      <GlowLight
        position={[0, height + 0.15, 0]}
        color="#ff2a1a"
        size={3.2}
        flash={{ period: 1.5, on: 0.5 }}
      />
      <GlowLight position={[0.5, height / 2, 0]} color="#ff2a1a" size={2} />
    </RigidBody>
  );
}

/**
 * Surface height of a landing pad above its levelled ground. The pad is a real slab: its collider
 * top is exactly this visible surface, so wheels and skids rest on it rather than in it.
 */
const PAD_SURFACE = 0.03;
const PAD_RADIUS = 11;
const RING = { inner: 10.4, outer: 10.8 };

/**
 * Concrete landing pad: markings and the charging ring are painted in the pad's own shader (no
 * stacked decal layers and no polygon offset, which would draw the pad over tyres at low angles).
 */
function createPadMaterial(
  concrete: { map: Texture; normalMap: Texture },
  markings: Texture,
  charging: boolean,
) {
  for (const texture of [concrete.map, concrete.normalMap]) {
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.repeat.set(5, 5);
  }
  concrete.map.colorSpace = SRGBColorSpace;
  const material = new MeshStandardMaterial({
    map: concrete.map,
    normalMap: concrete.normalMap,
    color: '#9a9ea2',
    roughness: 0.75,
  });
  const ringPulse = { value: 1.5 };
  material.userData.ringPulse = ringPulse;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPadMarkings = { value: markings };
    shader.uniforms.uPadRing = ringPulse;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vPadUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvPadUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform sampler2D uPadMarkings;\nuniform float uPadRing;\nvarying vec2 vPadUv;',
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        vec4 padMark = texture2D(uPadMarkings, vPadUv);
        diffuseColor.rgb = mix(diffuseColor.rgb, padMark.rgb, padMark.a * 0.88);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float padR = length(vPadUv - 0.5) * ${(PAD_RADIUS * 2).toFixed(1)};
        float padRing = step(${RING.inner.toFixed(2)}, padR) * step(padR, ${RING.outer.toFixed(2)});
        ${charging ? 'totalEmissiveRadiance += vec3(0.25, 0.88, 0.85) * padRing * uPadRing;' : ''}`,
      );
  };
  material.customProgramCacheKey = () => `tw-pad-${charging ? 'charging' : 'plain'}`;
  return material;
}

export function Pad({ kind, charging }: { kind: 'helipad' | 'extraction'; charging: boolean }) {
  const concrete = useTexture({ map: PAD_TEXTURES.diffuse, normalMap: PAD_TEXTURES.normal });
  const material = useMemo(
    () => createPadMaterial(concrete, getPadTexture(kind), charging),
    [concrete, kind, charging],
  );
  useFrame(({ clock }) => {
    (material.userData.ringPulse as { value: number }).value =
      1.2 + Math.sin(clock.elapsedTime * 2) * 0.6;
  });
  return (
    <group>
      <RigidBody type="fixed" colliders={false}>
        <CylinderCollider
          args={[0.1, PAD_RADIUS]}
          position={[0, PAD_SURFACE - 0.1, 0]}
          friction={1}
        />
      </RigidBody>
      <mesh
        material={material}
        position={[0, PAD_SURFACE, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <circleGeometry args={[PAD_RADIUS, 64]} />
      </mesh>
      {/* Slab edge, running down into the soil. */}
      <mesh
        material={getMaterial('concreteDark')}
        position={[0, (PAD_SURFACE - 0.4) / 2, 0]}
        receiveShadow
      >
        <cylinderGeometry args={[PAD_RADIUS, PAD_RADIUS + 0.05, 0.4 + PAD_SURFACE, 64, 1, true]} />
      </mesh>
      <PadLights kind={kind} radius={10.55} surface={PAD_SURFACE} />
    </group>
  );
}
