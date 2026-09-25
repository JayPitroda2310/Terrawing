import { BallCollider, CuboidCollider, RigidBody } from '@react-three/rapier';
import { useMemo } from 'react';
import { createRandom, randomRange } from '@/utils/math/random';
import { getMaterial } from './materials';
import { createRockGeometry } from './vegetationGeometry';

const rockGeometries = [0, 1, 2].map((v) => createRockGeometry(v));

/** Abandoned hatchback, nose-down against the debris. */
export function CarWreck() {
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[1, 0.75, 2.2]} position={[0, 0.8, 0]} rotation={[0.08, 0, 0.06]} />
      <group rotation={[0.08, 0, 0.06]}>
        <mesh material={getMaterial('carRed')} position={[0, 0.72, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.8, 0.7, 4.2]} />
        </mesh>
        <mesh material={getMaterial('carRed')} position={[0, 1.3, 0.3]} castShadow>
          <boxGeometry args={[1.64, 0.55, 2.2]} />
        </mesh>
        <mesh material={getMaterial('glass')} position={[0, 1.3, -0.82]} rotation={[0.5, 0, 0]}>
          <boxGeometry args={[1.5, 0.62, 0.05]} />
        </mesh>
        <mesh material={getMaterial('glass')} position={[0.83, 1.3, 0.3]}>
          <boxGeometry args={[0.02, 0.4, 1.9]} />
        </mesh>
        {[-1.35, 1.35].flatMap((z) =>
          [-0.9, 0.9].map((x) => (
            <mesh
              key={`${x},${z}`}
              material={getMaterial('rubber')}
              position={[x, 0.35, z]}
              rotation={[0, 0, Math.PI / 2]}
            >
              <cylinderGeometry args={[0.34, 0.34, 0.24, 14]} />
            </mesh>
          )),
        )}
        <mesh material={getMaterial('lampWhite')} position={[0.6, 0.8, -2.11]} scale={[1, 1, 1]}>
          <boxGeometry args={[0.3, 0.14, 0.02]} />
        </mesh>
      </group>
    </RigidBody>
  );
}

/** Landslide debris: a mound of boulders and mud with snapped trunks, blocking the road. */
export function DebrisPile({ radius, seed }: { radius: number; seed: number }) {
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
    });
  }, [radius, seed]);
  const logs = useMemo(() => {
    const random = createRandom(seed + 1);
    return Array.from({ length: 5 }, () => ({
      x: randomRange(random, -radius, radius) * 0.6,
      z: randomRange(random, -radius, radius) * 0.6,
      rotation: random() * Math.PI,
      tilt: randomRange(random, -0.25, 0.25),
      length: randomRange(random, 6, 11),
    }));
  }, [radius, seed]);

  return (
    <RigidBody type="fixed" colliders={false}>
      <mesh
        material={getMaterial('mud')}
        position={[0, -radius * 0.55, 0]}
        scale={[1, 0.34, 1]}
        receiveShadow
        castShadow
      >
        <sphereGeometry args={[radius, 18, 10]} />
      </mesh>
      <CuboidCollider args={[radius * 0.8, radius * 0.18, radius * 0.8]} position={[0, 0.2, 0]} />
      {pieces.map((p, i) => (
        <group key={i}>
          <mesh
            geometry={rockGeometries[p.variant]}
            material={getMaterial('rock')}
            position={[p.x, p.scale * 0.35 + 0.6, p.z]}
            rotation={[0.2, p.rotation, 0.1]}
            scale={p.scale}
            castShadow
            receiveShadow
          />
          <BallCollider args={[p.scale * 0.8]} position={[p.x, p.scale * 0.35 + 0.6, p.z]} />
        </group>
      ))}
      {logs.map((log, i) => (
        <mesh
          key={`log-${i}`}
          material={getMaterial('bark')}
          position={[log.x, 1.6, log.z]}
          rotation={[Math.PI / 2 + log.tilt, 0, log.rotation]}
          castShadow
        >
          <cylinderGeometry args={[0.3, 0.38, log.length, 8]} />
        </mesh>
      ))}
    </RigidBody>
  );
}

/** A few fallen trunks across a path. */
export function FallenLogs({ seed }: { seed: number }) {
  const logs = useMemo(() => {
    const random = createRandom(seed);
    return Array.from({ length: 3 }, (_, i) => ({
      offset: (i - 1) * 2.4 + randomRange(random, -0.5, 0.5),
      rotation: randomRange(random, -0.35, 0.35),
      length: randomRange(random, 7, 10),
      radius: randomRange(random, 0.28, 0.42),
    }));
  }, [seed]);
  return (
    <RigidBody type="fixed" colliders={false}>
      {logs.map((log, i) => (
        <group key={i} position={[0, log.radius, log.offset]} rotation={[0, log.rotation, 0]}>
          <mesh
            material={getMaterial('bark')}
            rotation={[0, 0, Math.PI / 2]}
            castShadow
            receiveShadow
          >
            <cylinderGeometry args={[log.radius, log.radius * 1.15, log.length, 9]} />
          </mesh>
          <CuboidCollider args={[log.length / 2, log.radius, log.radius]} />
        </group>
      ))}
    </RigidBody>
  );
}

/**
 * Rock shelter at the foot of the cliff. Opening faces local +Z, about 7 m wide and 3.8 m high,
 * wide enough for the rover.
 */
export function RockShelter() {
  const side = rockGeometries[1]!;
  const slab = rockGeometries[2]!;
  return (
    <RigidBody type="fixed" colliders={false}>
      <mesh
        geometry={side}
        material={getMaterial('rock')}
        position={[-5.4, 2, -1]}
        scale={[2.2, 3, 4.2]}
        castShadow
        receiveShadow
      />
      <CuboidCollider args={[1.9, 3, 3.8]} position={[-5.6, 2, -1]} />
      <mesh
        geometry={side}
        material={getMaterial('rock')}
        position={[5.4, 2.2, -1.5]}
        scale={[2.4, 3.2, 4]}
        rotation={[0, 1.2, 0]}
        castShadow
        receiveShadow
      />
      <CuboidCollider args={[2, 3, 3.6]} position={[5.6, 2.2, -1.5]} />
      <mesh
        geometry={slab}
        material={getMaterial('rock')}
        position={[0, 5.4, -1.2]}
        scale={[7.8, 1.3, 5.2]}
        rotation={[0.06, 0.3, 0.04]}
        castShadow
        receiveShadow
      />
      <CuboidCollider args={[7, 1, 4.6]} position={[0, 5.5, -1.2]} />
      <mesh
        geometry={side}
        material={getMaterial('rock')}
        position={[0, 2.5, -6.2]}
        scale={[6, 4, 2]}
        castShadow
        receiveShadow
      />
      <CuboidCollider args={[5.5, 3.5, 1.6]} position={[0, 2.5, -6.4]} />
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
          colliders={p.kind === 'stone' ? 'ball' : 'cuboid'}
          position={[p.x, 1.2, p.z]}
          rotation={[0, p.rotation, 0]}
          mass={p.kind === 'stone' ? 60 : 25}
          linearDamping={0.6}
          angularDamping={0.8}
        >
          {p.kind === 'stone' ? (
            <mesh
              geometry={rockGeometries[i % 3]}
              material={getMaterial('rock')}
              scale={p.size}
              castShadow
            />
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
