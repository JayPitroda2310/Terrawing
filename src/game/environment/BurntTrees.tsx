import { useTexture } from '@react-three/drei';
import { useRapier } from '@react-three/rapier';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  CylinderGeometry,
  type InstancedMesh,
  MeshStandardMaterial,
  Object3D,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BARK_TEXTURES } from '@/data/visualAssets';
import { createStaticColliders, type StaticShape } from '@/game/physics/StaticColliders';
import { createRandom } from '@/utils/math/random';
import { TREE_STRIDE, type VegetationLayout } from './VegetationPlacer';

/** Fire-killed snags keep most of their height: ~15-20 m. */
const TRUNK_HEIGHT = 16;
const TRUNK_RADIUS = 0.38;

/** A snapped, fire-stripped conifer: tapering trunk plus a few charred branch stubs. */
function createBurntTreeGeometry() {
  const parts = [];
  const trunk = new CylinderGeometry(TRUNK_RADIUS * 0.35, TRUNK_RADIUS, TRUNK_HEIGHT, 7, 3);
  trunk.translate(0, TRUNK_HEIGHT / 2, 0);
  parts.push(trunk);
  const random = createRandom(17);
  for (let i = 0; i < 5; i++) {
    const length = 0.8 + random() * 1.1;
    const branch = new CylinderGeometry(0.03, 0.07, length, 4);
    branch.translate(0, length / 2, 0);
    branch.rotateZ(Math.PI / 2 - 0.35 - random() * 0.4);
    branch.rotateY(random() * Math.PI * 2);
    branch.translate(0, 5 + i * 2.1, 0);
    parts.push(branch);
  }
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
}

/** Charred standing trunks left behind by the forest fire. */
export function BurntTrees({
  layout,
  castShadow,
}: {
  layout: VegetationLayout;
  castShadow: boolean;
}) {
  const rapier = useRapier();
  const mesh = useRef<InstancedMesh>(null);
  const geometry = useMemo(createBurntTreeGeometry, []);
  const { map, normalMap } = useTexture({
    map: BARK_TEXTURES.diffuse,
    normalMap: BARK_TEXTURES.normal,
  });
  const material = useMemo(() => {
    for (const texture of [map, normalMap]) {
      texture.wrapS = RepeatWrapping;
      texture.wrapT = RepeatWrapping;
    }
    map.colorSpace = SRGBColorSpace;
    return new MeshStandardMaterial({ map, normalMap, color: '#2b2522', roughness: 0.97 });
  }, [map, normalMap]);

  useLayoutEffect(() => {
    const target = mesh.current;
    if (!target) return;
    const dummy = new Object3D();
    for (let i = 0; i < layout.burntTreeCount; i++) {
      const o = i * TREE_STRIDE;
      const scale = layout.burntTrees[o + 3]!;
      const lean = (layout.burntTrees[o + 5]! - 0.5) * 0.12;
      dummy.position.set(
        layout.burntTrees[o]!,
        layout.burntTrees[o + 1]! - 0.15,
        layout.burntTrees[o + 2]!,
      );
      dummy.rotation.set(lean, layout.burntTrees[o + 4]!, lean * 0.5);
      dummy.scale.set(scale, scale * (0.7 + layout.burntTrees[o + 5]! * 0.5), scale);
      dummy.updateMatrix();
      target.setMatrixAt(i, dummy.matrix);
    }
    target.instanceMatrix.needsUpdate = true;
    target.computeBoundingSphere();
  }, [layout]);

  useEffect(() => {
    const shapes: StaticShape[] = [];
    for (let i = 0; i < layout.burntTreeCount; i++) {
      const o = i * TREE_STRIDE;
      const scale = layout.burntTrees[o + 3]!;
      shapes.push({
        kind: 'cylinder',
        x: layout.burntTrees[o]!,
        y: layout.burntTrees[o + 1]! + (TRUNK_HEIGHT / 2) * scale,
        z: layout.burntTrees[o + 2]!,
        halfHeight: (TRUNK_HEIGHT / 2) * scale,
        radius: TRUNK_RADIUS * scale,
      });
    }
    return createStaticColliders(rapier, shapes, 0.6);
  }, [rapier, layout]);

  if (layout.burntTreeCount === 0) return null;
  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, layout.burntTreeCount]}
      castShadow={castShadow}
      receiveShadow
    />
  );
}
