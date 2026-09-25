import { useRapier } from '@react-three/rapier';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { InstancedMesh, MeshStandardMaterial, Object3D } from 'three';
import { withScanBand } from '@/game/effects/shaderChunks';
import { createStaticColliders, type StaticShape } from '@/game/physics/StaticColliders';
import { createRockGeometry } from './vegetationGeometry';
import { ROCK_STRIDE, type VegetationLayout } from './VegetationPlacer';

const VARIANTS = 3;
/** Rocks smaller than this are decorative only. */
const COLLIDER_MIN_SCALE = 1.1;
const COLLIDER_RADIUS_FACTOR = 0.8;

interface RocksProps {
  layout: VegetationLayout;
  castShadow: boolean;
}

/** Instanced boulders (one draw call per shape variant) with colliders for the larger ones. */
export function Rocks({ layout, castShadow }: RocksProps) {
  const rapier = useRapier();
  const geometries = useMemo(
    () => Array.from({ length: VARIANTS }, (_, i) => createRockGeometry(i)),
    [],
  );
  const material = useMemo(
    () =>
      withScanBand(
        new MeshStandardMaterial({ color: '#6c6b66', roughness: 0.8, flatShading: true }),
        'rock',
      ),
    [],
  );
  const refs = useRef<(InstancedMesh | null)[]>([]);

  const byVariant = useMemo(() => {
    const groups: number[][] = Array.from({ length: VARIANTS }, () => []);
    for (let i = 0; i < layout.rockCount; i++)
      groups[layout.rocks[i * ROCK_STRIDE + 5]! % VARIANTS]!.push(i);
    return groups;
  }, [layout]);

  useLayoutEffect(() => {
    const dummy = new Object3D();
    byVariant.forEach((indices, v) => {
      const mesh = refs.current[v];
      if (!mesh) return;
      indices.forEach((rockIndex, i) => {
        const o = rockIndex * ROCK_STRIDE;
        const scale = layout.rocks[o + 3]!;
        dummy.position.set(layout.rocks[o]!, layout.rocks[o + 1]!, layout.rocks[o + 2]!);
        dummy.rotation.set(layout.rocks[o + 6]!, layout.rocks[o + 4]!, layout.rocks[o + 7]!);
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    });
  }, [byVariant, layout]);

  useEffect(() => {
    const shapes: StaticShape[] = [];
    for (let i = 0; i < layout.rockCount; i++) {
      const o = i * ROCK_STRIDE;
      const scale = layout.rocks[o + 3]!;
      if (scale < COLLIDER_MIN_SCALE) continue;
      shapes.push({
        kind: 'ball',
        x: layout.rocks[o]!,
        y: layout.rocks[o + 1]!,
        z: layout.rocks[o + 2]!,
        radius: scale * COLLIDER_RADIUS_FACTOR,
      });
    }
    return createStaticColliders(rapier, shapes, 0.9);
  }, [rapier, layout]);

  return (
    <group>
      {byVariant.map((indices, v) => (
        <instancedMesh
          key={v}
          ref={(mesh) => {
            refs.current[v] = mesh;
          }}
          args={[geometries[v]!, material, Math.max(1, indices.length)]}
          count={indices.length}
          castShadow={castShadow}
          receiveShadow
        />
      ))}
    </group>
  );
}
