import { useFrame } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Color, InstancedMesh, MeshStandardMaterial, Object3D, type Camera } from 'three';
import { createStaticColliders, type StaticShape } from '@/game/physics/StaticColliders';
import { IntervalGate } from '@/utils/performance/throttle';
import { createTreeGeometry } from './vegetationGeometry';
import { TREE_STRIDE, type VegetationLayout } from './VegetationPlacer';

const CHUNK_SIZE = 200;
const TRUNK_RADIUS = 0.3;
const TRUNK_HALF_HEIGHT = 1.5;
/** Canopy collider (cone) roughly matching the needle tiers, so the forest blocks low flight. */
const CANOPY = { base: 1.8, halfHeight: 3.3, radius: 1.9 };
const LOD_CHECK_INTERVAL = 0.25;

interface Chunk {
  cx: number;
  cz: number;
  instances: number[];
}

interface TreesProps {
  layout: VegetationLayout;
  /** Fraction of trees to render (graphics quality). Colliders always use every tree. */
  fraction: number;
  lodDistance: number;
  castShadow: boolean;
}

function buildChunks(layout: VegetationLayout, fraction: number): Chunk[] {
  const chunks = new Map<string, Chunk>();
  const step = fraction >= 1 ? 1 : 1 / fraction;
  let accumulator = 0;
  for (let i = 0; i < layout.treeCount; i++) {
    accumulator += 1;
    if (accumulator < step) continue;
    accumulator -= step;
    const x = layout.trees[i * TREE_STRIDE]!;
    const z = layout.trees[i * TREE_STRIDE + 2]!;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const key = `${cx},${cz}`;
    let chunk = chunks.get(key);
    if (!chunk) {
      chunk = { cx: (cx + 0.5) * CHUNK_SIZE, cz: (cz + 0.5) * CHUNK_SIZE, instances: [] };
      chunks.set(key, chunk);
    }
    chunk.instances.push(i);
  }
  return [...chunks.values()];
}

/**
 * Instanced conifers split into spatial chunks so frustum culling works, with a two-level LOD per
 * chunk (detailed near the camera, simplified far away).
 */
export function Trees({ layout, fraction, lodDistance, castShadow }: TreesProps) {
  const rapier = useRapier();
  const chunks = useMemo(() => buildChunks(layout, fraction), [layout, fraction]);
  const high = useMemo(() => createTreeGeometry('high'), []);
  const low = useMemo(() => createTreeGeometry('low'), []);
  const material = useMemo(
    () => new MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
    [],
  );
  const highRefs = useRef<(InstancedMesh | null)[]>([]);
  const lowRefs = useRef<(InstancedMesh | null)[]>([]);
  const gate = useMemo(() => new IntervalGate(LOD_CHECK_INTERVAL), []);

  useLayoutEffect(() => {
    const dummy = new Object3D();
    const tint = new Color();
    chunks.forEach((chunk, c) => {
      const meshes = [highRefs.current[c], lowRefs.current[c]];
      chunk.instances.forEach((treeIndex, i) => {
        const o = treeIndex * TREE_STRIDE;
        const scale = layout.trees[o + 3]!;
        dummy.position.set(layout.trees[o]!, layout.trees[o + 1]! - 0.2, layout.trees[o + 2]!);
        dummy.rotation.set(0, layout.trees[o + 4]!, 0);
        dummy.scale.set(scale, scale * (0.9 + layout.trees[o + 5]! * 0.25), scale);
        dummy.updateMatrix();
        // Instance colour multiplies the vertex colours: a subtle per-tree variation.
        const v = layout.trees[o + 5]!;
        tint.setRGB(0.8 + v * 0.35, 0.85 + v * 0.3, 0.8 + v * 0.2);
        for (const mesh of meshes) {
          if (!mesh) continue;
          mesh.setMatrixAt(i, dummy.matrix);
          mesh.setColorAt(i, tint);
        }
      });
      for (const mesh of meshes) {
        if (!mesh) continue;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
      }
    });
  }, [chunks, layout]);

  // Trunk + canopy colliders for every tree (independent of visual density so gameplay is identical).
  useEffect(() => {
    const shapes: StaticShape[] = [];
    for (let i = 0; i < layout.treeCount; i++) {
      const o = i * TREE_STRIDE;
      const scale = layout.trees[o + 3]!;
      shapes.push({
        kind: 'cylinder',
        x: layout.trees[o]!,
        y: layout.trees[o + 1]! + TRUNK_HALF_HEIGHT * scale,
        z: layout.trees[o + 2]!,
        halfHeight: TRUNK_HALF_HEIGHT * scale,
        radius: TRUNK_RADIUS * scale,
      });
      shapes.push({
        kind: 'cone',
        x: layout.trees[o]!,
        y: layout.trees[o + 1]! + (CANOPY.base + CANOPY.halfHeight) * scale,
        z: layout.trees[o + 2]!,
        halfHeight: CANOPY.halfHeight * scale,
        radius: CANOPY.radius * scale,
      });
    }
    return createStaticColliders(rapier, shapes, 0.6);
  }, [rapier, layout]);

  useFrame(({ camera }, dt) => {
    if (!gate.tick(dt)) return;
    updateLod(camera, chunks, highRefs.current, lowRefs.current, lodDistance);
  });

  return (
    <group>
      {chunks.map((chunk, c) => (
        <group key={`${chunk.cx},${chunk.cz}`}>
          <instancedMesh
            ref={(mesh) => {
              highRefs.current[c] = mesh;
            }}
            args={[high, material, chunk.instances.length]}
            castShadow={castShadow}
            receiveShadow
          />
          <instancedMesh
            ref={(mesh) => {
              lowRefs.current[c] = mesh;
            }}
            args={[low, material, chunk.instances.length]}
            visible={false}
          />
        </group>
      ))}
    </group>
  );
}

function updateLod(
  camera: Camera,
  chunks: readonly Chunk[],
  high: readonly (InstancedMesh | null)[],
  low: readonly (InstancedMesh | null)[],
  lodDistance: number,
): void {
  const px = camera.position.x;
  const pz = camera.position.z;
  const halfDiagonal = CHUNK_SIZE * 0.72;
  chunks.forEach((chunk, c) => {
    const distance = Math.max(0, Math.hypot(chunk.cx - px, chunk.cz - pz) - halfDiagonal);
    const near = distance < lodDistance;
    const h = high[c];
    const l = low[c];
    if (h) h.visible = near;
    if (l) l.visible = !near;
  });
}
