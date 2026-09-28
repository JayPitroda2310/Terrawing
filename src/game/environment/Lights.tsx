import { useFrame } from '@react-three/fiber';
import { CylinderCollider, RigidBody } from '@react-three/rapier';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  type InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  Points,
  PointsMaterial,
  type SpotLight,
} from 'three';
import { getMaterial } from './materials';

let haloTexture: CanvasTexture | null = null;
/** Soft glare disc used for every light's halo. */
function getHaloTexture(): CanvasTexture {
  if (haloTexture) return haloTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  haloTexture = new CanvasTexture(canvas);
  return haloTexture;
}

/** Additive glare sprites at the given local positions; brightness per light via vertex colour. */
function createHalos(positions: Float32Array, size: number): Points {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(positions.length), 3));
  const material = new PointsMaterial({
    map: getHaloTexture(),
    size,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  return points;
}

const GREEN = new Color('#46ff7c');
const AMBER = new Color('#ffb21f');

/**
 * Flush-mounted pad edge lights. Heliports: steady green perimeter lights. Extraction LZ: amber
 * lights running a sequenced "chase" around the ring to lead the pilot in.
 */
export function PadLights({
  kind,
  radius,
  surface,
}: {
  kind: 'helipad' | 'extraction';
  radius: number;
  surface: number;
}) {
  const count = kind === 'helipad' ? 16 : 12;
  const color = kind === 'helipad' ? GREEN : AMBER;
  const housings = useRef<InstancedMesh>(null);
  const domes = useRef<InstancedMesh>(null);
  const domeMaterial = useMemo(() => new MeshBasicMaterial({ color: '#ffffff' }), []);
  const halos = useMemo(() => {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      positions.set([Math.cos(a) * radius, surface + 0.09, Math.sin(a) * radius], i * 3);
    }
    return createHalos(positions, 1.3);
  }, [count, radius, surface]);
  const tint = useMemo(() => new Color(), []);

  useLayoutEffect(() => {
    const dummy = new Object3D();
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      dummy.position.set(Math.cos(a) * radius, surface + 0.02, Math.sin(a) * radius);
      dummy.updateMatrix();
      housings.current?.setMatrixAt(i, dummy.matrix);
      dummy.position.y = surface + 0.05;
      dummy.updateMatrix();
      domes.current?.setMatrixAt(i, dummy.matrix);
    }
    for (const mesh of [housings.current, domes.current]) {
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [count, radius, surface]);

  useEffect(
    () => () => {
      halos.geometry.dispose();
      (halos.material as PointsMaterial).dispose();
      domeMaterial.dispose();
    },
    [halos, domeMaterial],
  );

  useFrame(({ clock }) => {
    const colors = halos.geometry.getAttribute('color') as BufferAttribute;
    const t = clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      let level = 1;
      if (kind === 'extraction') {
        // A bright pulse runs around the ring about once a second, over a dim steady glow.
        const phase = ((((t * count) / 1.1 - i) % count) + count) % count;
        level = 0.18 + 0.82 * Math.max(0, 1 - phase / 1.5);
      }
      tint.copy(color).multiplyScalar(level);
      colors.setXYZ(i, tint.r, tint.g, tint.b);
      domes.current?.setColorAt(i, tint.copy(color).multiplyScalar(0.35 + level * 0.65));
    }
    colors.needsUpdate = true;
    if (domes.current?.instanceColor) domes.current.instanceColor.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh
        ref={housings}
        args={[undefined, getMaterial('steelDark'), count]}
        receiveShadow
      >
        <cylinderGeometry args={[0.13, 0.15, 0.04, 12]} />
      </instancedMesh>
      <instancedMesh ref={domes} args={[undefined, domeMaterial, count]}>
        <sphereGeometry args={[0.075, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </instancedMesh>
      <primitive object={halos} />
    </group>
  );
}

/** A single glowing light: bulb plus glare halo, optionally flashing. */
export function GlowLight({
  position,
  color,
  size = 2,
  flash,
}: {
  position: [number, number, number];
  color: string;
  size?: number;
  /** Flash pattern: period (s) and on-time (s). Omit for a steady light. */
  flash?: { period: number; on: number };
}) {
  const halo = useMemo(() => createHalos(new Float32Array(position), size), [position, size]);
  const bulbMaterial = useMemo(() => new MeshBasicMaterial({ color }), [color]);
  const base = useMemo(() => new Color(color), [color]);
  const scratch = useMemo(() => new Color(), []);
  useEffect(
    () => () => {
      halo.geometry.dispose();
      (halo.material as PointsMaterial).dispose();
      bulbMaterial.dispose();
    },
    [halo, bulbMaterial],
  );
  useFrame(({ clock }) => {
    const on = !flash || clock.elapsedTime % flash.period < flash.on;
    const level = on ? 1 : 0.06;
    const colors = halo.geometry.getAttribute('color') as BufferAttribute;
    scratch.copy(base).multiplyScalar(level);
    colors.setXYZ(0, scratch.r, scratch.g, scratch.b);
    colors.needsUpdate = true;
    bulbMaterial.color.copy(base).multiplyScalar(0.25 + level * 0.75);
  });
  return (
    <group>
      <mesh material={bulbMaterial} position={position}>
        <sphereGeometry args={[0.12, 12, 8]} />
      </mesh>
      <primitive object={halo} />
    </group>
  );
}

/**
 * Twin-head LED floodlight mast lighting the pad. The heads glow; at night they also cast real
 * light onto the ground.
 */
export function Floodlight({ night }: { night: boolean }) {
  const lamps = useRef<(SpotLight | null)[]>([]);
  const targets = useRef<(Object3D | null)[]>([]);
  useEffect(() => {
    lamps.current.forEach((lamp, i) => {
      const target = targets.current[i];
      if (lamp && target) lamp.target = target;
    });
  }, [night]);
  const height = 7;
  return (
    <RigidBody type="fixed" colliders={false}>
      <CylinderCollider args={[height / 2, 0.15]} position={[0, height / 2, 0]} />
      <mesh material={getMaterial('concrete')} position={[0, 0.2, 0]} receiveShadow>
        <cylinderGeometry args={[0.45, 0.55, 0.4, 12]} />
      </mesh>
      <mesh material={getMaterial('steel')} position={[0, height / 2, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.13, height, 10]} />
      </mesh>
      <mesh material={getMaterial('steelDark')} position={[0, 1.2, 0.14]}>
        <boxGeometry args={[0.22, 0.4, 0.1]} />
      </mesh>
      {/* Cross-arm with two tilted LED heads. */}
      <mesh material={getMaterial('steel')} position={[0, height, 0]}>
        <boxGeometry args={[1.7, 0.08, 0.08]} />
      </mesh>
      {[-0.6, 0.6].map((x, i) => (
        <group key={x} position={[x, height - 0.05, 0.12]} rotation={[0.95, 0, 0]}>
          <mesh material={getMaterial('steelDark')} castShadow>
            <boxGeometry args={[0.55, 0.36, 0.1]} />
          </mesh>
          {/* Cooling fins on the back. */}
          {[-0.18, -0.06, 0.06, 0.18].map((fx) => (
            <mesh key={fx} material={getMaterial('steelDark')} position={[fx, 0, -0.08]}>
              <boxGeometry args={[0.02, 0.32, 0.08]} />
            </mesh>
          ))}
          <mesh material={getMaterial('lampWhite')} position={[0, 0, 0.055]}>
            <boxGeometry args={[0.48, 0.29, 0.01]} />
          </mesh>
          {night && (
            <>
              <spotLight
                ref={(l) => {
                  lamps.current[i] = l;
                }}
                position={[0, 0, 0.1]}
                angle={0.7}
                penumbra={0.5}
                distance={45}
                decay={1.4}
                intensity={45}
                color="#fff2dc"
              />
              <object3D
                ref={(o) => {
                  targets.current[i] = o;
                }}
                position={[0, 0, 10]}
              />
            </>
          )}
        </group>
      ))}
    </RigidBody>
  );
}
