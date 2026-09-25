import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { getMaterial } from './materials';

interface BridgeProps {
  /** World-space endpoints and deck heights of the two abutments. */
  from: { x: number; y: number; z: number };
  to: { x: number; y: number; z: number };
}

const DECK_WIDTH = 8.6;
const DECK_THICKNESS = 0.7;
const STUB_FRACTION = 0.26;

/**
 * Collapsed road bridge. Both approach spans remain as stubs; the centre span has dropped into
 * the river. The rover cannot cross — TerraWing must fly.
 */
export function Bridge({ from, to }: BridgeProps) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const span = Math.hypot(dx, dz);
  const heading = Math.atan2(dx, dz);
  const deckY = Math.max(from.y, to.y);
  const stub = span * STUB_FRACTION;
  const midY = deckY - 5.2;

  return (
    <group position={[from.x, 0, from.z]} rotation={[0, heading, 0]}>
      <RigidBody type="fixed" colliders={false}>
        {/* Abutments */}
        {[0, span].map((z) => (
          <group key={z}>
            <mesh
              material={getMaterial('concrete')}
              position={[0, deckY - 3, z]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[DECK_WIDTH + 1.5, 6, 3]} />
            </mesh>
            <CuboidCollider args={[(DECK_WIDTH + 1.5) / 2, 3, 1.5]} position={[0, deckY - 3, z]} />
          </group>
        ))}
        {/* Intact stubs */}
        {[
          { z: stub / 2 + 1.5, tilt: 0.02 },
          { z: span - stub / 2 - 1.5, tilt: -0.05 },
        ].map((s) => (
          <group
            key={s.z}
            position={[0, deckY - DECK_THICKNESS / 2, s.z]}
            rotation={[s.tilt, 0, 0]}
          >
            <mesh material={getMaterial('concreteDark')} castShadow receiveShadow>
              <boxGeometry args={[DECK_WIDTH, DECK_THICKNESS, stub]} />
            </mesh>
            <CuboidCollider args={[DECK_WIDTH / 2, DECK_THICKNESS / 2, stub / 2]} />
            {[-1, 1].map((side) => (
              <mesh
                key={side}
                material={getMaterial('steel')}
                position={[(side * DECK_WIDTH) / 2, 0.6, 0]}
              >
                <boxGeometry args={[0.1, 0.9, stub]} />
              </mesh>
            ))}
          </group>
        ))}
        {/* Fallen centre span, half submerged */}
        <group position={[0.8, midY, span / 2]} rotation={[0.32, 0.12, 0.18]}>
          <mesh material={getMaterial('concreteDark')} castShadow receiveShadow>
            <boxGeometry args={[DECK_WIDTH, DECK_THICKNESS, span * 0.42]} />
          </mesh>
          <CuboidCollider args={[DECK_WIDTH / 2, DECK_THICKNESS / 2, span * 0.21]} />
          <mesh
            material={getMaterial('steel')}
            position={[DECK_WIDTH / 2, 0.6, 0]}
            rotation={[0, 0, 0.5]}
          >
            <boxGeometry args={[0.1, 0.9, span * 0.4]} />
          </mesh>
        </group>
        {/* Toppled pier */}
        <mesh
          material={getMaterial('concrete')}
          position={[-2.5, midY - 1, span * 0.62]}
          rotation={[0.4, 0, 1.1]}
          castShadow
        >
          <cylinderGeometry args={[0.9, 1.1, 9, 10]} />
        </mesh>
        {/* Exposed rebar at the break */}
        {Array.from({ length: 6 }, (_, i) => (
          <mesh
            key={i}
            material={getMaterial('steelDark')}
            position={[-3 + i * 1.2, deckY - 0.4, stub + 1.6]}
            rotation={[0.9 + (i % 3) * 0.2, 0, (i % 2) * 0.3]}
          >
            <cylinderGeometry args={[0.03, 0.03, 1.8, 4]} />
          </mesh>
        ))}
      </RigidBody>
    </group>
  );
}
