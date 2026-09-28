import {
  ConvexHullCollider,
  CuboidCollider,
  CylinderCollider,
  RigidBody,
} from '@react-three/rapier';
import { useGLTF } from '@react-three/drei';
import { useMemo } from 'react';
import {
  Box3,
  Euler,
  Matrix4,
  Quaternion,
  type BufferGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import { CAR_WRECK_MODEL } from '@/data/visualAssets';
import { createRandom, randomRange } from '@/utils/math/random';
import { getMaterial } from './materials';
import { useBoulders } from './boulders';
import type { LocalGround } from './Structures';

/**
 * A boulder's convex outline placed like its mesh (position, Euler rotation, scale), for a
 * ConvexHullCollider at the rigid body's origin: collision matches the rock that is drawn.
 */
function placedHull(
  hull: Float32Array,
  position: readonly [number, number, number],
  rotation: readonly [number, number, number],
  scale: number | readonly [number, number, number],
): Float32Array {
  const matrix = new Matrix4().compose(
    new Vector3(...position),
    new Quaternion().setFromEuler(new Euler(...rotation)),
    typeof scale === 'number' ? new Vector3(scale, scale, scale) : new Vector3(...scale),
  );
  const out = new Float32Array(hull.length);
  const v = new Vector3();
  for (let i = 0; i < hull.length; i += 3) {
    v.set(hull[i]!, hull[i + 1]!, hull[i + 2]!).applyMatrix4(matrix);
    out[i] = v.x;
    out[i + 1] = v.y;
    out[i + 2] = v.z;
  }
  return out;
}

/** Weathered paint for the abandoned car: muted colour with grime and mud up the lower panels. */
function weatherCarMaterial(material: MeshStandardMaterial, name: string): MeshStandardMaterial {
  const weathered = material.clone();
  if (name === 'Body_Color') {
    weathered.color = new Color('#4a1f1c');
    weathered.metalness = 0.45;
    weathered.roughness = 0.5;
  } else if (name.includes('Yellow') || name.includes('DodgerBlue')) {
    weathered.color = new Color('#2a2c2e');
  } else if (!name.includes('Glass') && !name.includes('LED')) {
    // Grime on everything else (rims, trim, interior) so nothing reads showroom-clean.
    weathered.color = weathered.color.clone().multiplyScalar(0.4);
    weathered.roughness = 0.85;
  }
  weathered.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vCarHeight;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCarHeight = position.y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vCarHeight;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float twMud = 1.0 - smoothstep(0.1, 0.55, vCarHeight);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.17, 0.13, 0.09), twMud * 0.75);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.95, 1.0 - smoothstep(0.1, 0.55, vCarHeight));',
      );
  };
  weathered.customProgramCacheKey = () => `car-wreck-${name}`;
  return weathered;
}

/** Abandoned car, nose-down against the landslide debris. */
export function CarWreck() {
  const gltf = useGLTF(CAR_WRECK_MODEL);
  const model = useMemo(() => {
    const scene = gltf.scene.clone(true);
    scene.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      const material = node.material as MeshStandardMaterial;
      node.material = weatherCarMaterial(material, material.name);
      node.castShadow = true;
      node.receiveShadow = true;
    });
    // Lay it along +Z with its wheels on y = 0, whatever the source orientation.
    const box = new Box3().setFromObject(scene);
    const size = box.getSize(new Vector3());
    const wrapper = new Group();
    if (size.x > size.z) scene.rotation.y = Math.PI / 2;
    wrapper.add(scene);
    const fitted = new Box3().setFromObject(wrapper);
    const center = fitted.getCenter(new Vector3());
    scene.position.set(-center.x, -fitted.min.y, -center.z);
    return wrapper;
  }, [gltf.scene]);

  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[1, 0.6, 2.3]} position={[0, 0.65, 0]} rotation={[0.08, 0, 0.06]} />
      <group rotation={[0.08, 0, 0.06]}>
        <primitive object={model} />
      </group>
    </RigidBody>
  );
}

/** Landslide debris: a mound of boulders and mud with snapped trunks, blocking the road. */
export function DebrisPile({
  radius,
  seed,
  ground,
}: {
  radius: number;
  seed: number;
  ground: LocalGround;
}) {
  const boulders = useBoulders();
  const pieces = useMemo(() => {
    const random = createRandom(seed);
    return Array.from({ length: 22 }, () => {
      const angle = random() * Math.PI * 2;
      const distance = Math.sqrt(random()) * radius * 0.85;
      const scale = randomRange(random, 1.2, 3.4) * (1 - distance / (radius * 1.6));
      return {
        x: Math.cos(angle) * distance,
        z: Math.sin(angle) * distance,
        scale,
        variant: Math.floor(random() * 3),
        rotation: random() * Math.PI * 2,
      };
    }).map((p) => ({ ...p, y: ground(p.x, p.z) - p.scale * 0.15 }));
  }, [radius, seed, ground]);
  const logs = useMemo(() => {
    const random = createRandom(seed + 1);
    return Array.from({ length: 5 }, () => ({
      x: randomRange(random, -radius, radius) * 0.6,
      z: randomRange(random, -radius, radius) * 0.6,
      rotation: random() * Math.PI,
      tilt: randomRange(random, -0.25, 0.25),
      length: randomRange(random, 6, 11),
    })).map((log) => ({ ...log, y: ground(log.x, log.z) + 0.9 }));
  }, [radius, seed, ground]);

  return (
    <RigidBody type="fixed" colliders={false}>
      {pieces.map((p, i) => (
        <group key={i}>
          <mesh
            geometry={boulders[p.variant]!.geometry}
            material={boulders[p.variant]!.material}
            position={[p.x, p.y, p.z]}
            rotation={[0.2, p.rotation, 0.1]}
            scale={p.scale}
            castShadow
            receiveShadow
          />
          <ConvexHullCollider
            args={[
              placedHull(
                boulders[p.variant]!.hull,
                [p.x, p.y, p.z],
                [0.2, p.rotation, 0.1],
                p.scale,
              ),
            ]}
          />
        </group>
      ))}
      {logs.map((log, i) => (
        <mesh
          key={`log-${i}`}
          material={getMaterial('bark')}
          position={[log.x, log.y, log.z]}
          rotation={[Math.PI / 2 + log.tilt, 0, log.rotation]}
          castShadow
        >
          <cylinderGeometry args={[0.3, 0.38, log.length, 8]} />
        </mesh>
      ))}
      {logs.map((log, i) => (
        <CylinderCollider
          key={`log-collider-${i}`}
          args={[log.length / 2, 0.34]}
          position={[log.x, log.y, log.z]}
          rotation={[Math.PI / 2 + log.tilt, 0, log.rotation]}
        />
      ))}
    </RigidBody>
  );
}

/** A few fallen trunks across a path, resting on (and tilting with) the ground. */
export function FallenLogs({ seed, ground }: { seed: number; ground: LocalGround }) {
  const logs = useMemo(() => {
    const random = createRandom(seed);
    return Array.from({ length: 3 }, (_, i) => {
      const offset = (i - 1) * 2.4 + randomRange(random, -0.5, 0.5);
      const rotation = randomRange(random, -0.35, 0.35);
      const length = randomRange(random, 7, 10);
      const radius = randomRange(random, 0.28, 0.42);
      // Ends of the log along its own axis, in the structure's local space.
      const dx = (Math.cos(rotation) * length) / 2;
      const dz = (-Math.sin(rotation) * length) / 2;
      const h1 = ground(-dx, offset - dz);
      const h2 = ground(dx, offset + dz);
      return {
        offset,
        rotation,
        length,
        radius,
        y: (h1 + h2) / 2 + radius * 0.8,
        tilt: Math.atan2(h2 - h1, length),
      };
    });
  }, [seed, ground]);
  return (
    <RigidBody type="fixed" colliders={false}>
      {logs.map((log, i) => (
        <group key={i} position={[0, log.y, log.offset]} rotation={[0, log.rotation, log.tilt]}>
          <mesh
            material={getMaterial('bark')}
            rotation={[0, 0, Math.PI / 2]}
            castShadow
            receiveShadow
          >
            <cylinderGeometry args={[log.radius, log.radius * 1.15, log.length, 12]} />
          </mesh>
          <CuboidCollider args={[log.length / 2, log.radius, log.radius]} />
        </group>
      ))}
    </RigidBody>
  );
}

/** Clear height under the shelter's roof slab (the rover is ~1.7 m tall). */
const SHELTER_CLEARANCE = 4.2;

/**
 * Rock shelter at the foot of the cliff: two rock pillars and a back wall carrying a roof slab.
 * Every piece is sized from the boulder model's measured bounds, so the pillars stand on the
 * ground and the slab genuinely rests on them (nothing floats). Opening faces local +Z, ~6 m wide.
 */
export function RockShelter() {
  const boulders = useBoulders();
  const side = boulders[0]!;
  const slab = boulders[2]!;
  const layout = useMemo(() => {
    const bounds = (geometry: BufferGeometry) => {
      geometry.computeBoundingBox();
      return geometry.boundingBox!;
    };
    const sideBox = bounds(side.geometry);
    const slabBox = bounds(slab.geometry);
    // Pillars reach 0.5 m up into the slab; the slab is ~1.8 m thick, its underside at the clearance.
    const pillarTop = SHELTER_CLEARANCE + 0.5;
    const pillarScale = pillarTop / sideBox.max.y;
    const slabScale = 1.8 / (slabBox.max.y - slabBox.min.y);
    const slabY = SHELTER_CLEARANCE - slabBox.min.y * slabScale;
    return { pillarTop, pillarScale, slabScale, slabY, slabTop: slabY + slabBox.max.y * slabScale };
  }, [side, slab]);
  const { pillarScale, slabScale, slabY } = layout;

  return (
    <RigidBody type="fixed" colliders={false}>
      <mesh
        geometry={side.geometry}
        material={side.material}
        position={[-5.4, 0, -1]}
        scale={[2.4, pillarScale, 4.2]}
        castShadow
        receiveShadow
      />
      <ConvexHullCollider
        args={[placedHull(side.hull, [-5.4, 0, -1], [0, 0, 0], [2.4, pillarScale, 4.2])]}
      />
      <mesh
        geometry={side.geometry}
        material={side.material}
        position={[5.4, 0, -1.4]}
        scale={[2.5, pillarScale * 1.05, 4]}
        rotation={[0, 1.2, 0]}
        castShadow
        receiveShadow
      />
      <ConvexHullCollider
        args={[placedHull(side.hull, [5.4, 0, -1.4], [0, 1.2, 0], [2.5, pillarScale * 1.05, 4])]}
      />
      <mesh
        geometry={side.geometry}
        material={side.material}
        position={[0, 0, -5.6]}
        scale={[6.2, pillarScale * 1.1, 2]}
        castShadow
        receiveShadow
      />
      <ConvexHullCollider
        args={[placedHull(side.hull, [0, 0, -5.6], [0, 0, 0], [6.2, pillarScale * 1.1, 2])]}
      />
      {/* Roof slab resting across the pillars and the back wall. */}
      <mesh
        geometry={slab.geometry}
        material={slab.material}
        position={[0, slabY, -1.8]}
        scale={[7.2, slabScale, 4.8]}
        rotation={[0.03, 0.25, 0.02]}
        castShadow
        receiveShadow
      />
      <ConvexHullCollider
        args={[placedHull(slab.hull, [0, slabY, -1.8], [0.03, 0.25, 0.02], [7.2, slabScale, 4.8])]}
      />
    </RigidBody>
  );
}

/** Loose, pushable debris the rover can shove aside. */
export function LooseDebris({
  seed,
  count,
  radius,
}: {
  seed: number;
  count: number;
  radius: number;
}) {
  const boulders = useBoulders();
  const pieces = useMemo(() => {
    const random = createRandom(seed);
    return Array.from({ length: count }, () => ({
      x: randomRange(random, -radius, radius),
      z: randomRange(random, -radius, radius),
      rotation: random() * Math.PI,
      kind: random() > 0.5 ? ('branch' as const) : ('stone' as const),
      size: randomRange(random, 0.5, 0.9),
    }));
  }, [seed, count, radius]);
  return (
    <group>
      {pieces.map((p, i) => (
        <RigidBody
          key={i}
          type="dynamic"
          colliders={p.kind === 'stone' ? false : 'cuboid'}
          position={[p.x, 1.2, p.z]}
          rotation={[0, p.rotation, 0]}
          mass={p.kind === 'stone' ? 60 : 25}
          linearDamping={0.6}
          angularDamping={0.8}
        >
          {p.kind === 'stone' ? (
            <>
              <mesh
                geometry={boulders[i % boulders.length]!.geometry}
                material={boulders[i % boulders.length]!.material}
                scale={p.size}
                castShadow
              />
              {/* The scanned mesh is quantised, so its outline comes from the precomputed hull. */}
              <ConvexHullCollider
                args={[
                  placedHull(boulders[i % boulders.length]!.hull, [0, 0, 0], [0, 0, 0], p.size),
                ]}
              />
            </>
          ) : (
            <mesh material={getMaterial('bark')} castShadow>
              <boxGeometry args={[0.35, 0.35, 3.2 * p.size]} />
            </mesh>
          )}
        </RigidBody>
      ))}
    </group>
  );
}
