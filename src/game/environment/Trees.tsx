import { useTexture } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  Color,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  RepeatWrapping,
  SRGBColorSpace,
  type Camera,
} from 'three';
import type { Collider } from '@dimforge/rapier3d-compat';
import { BARK_TEXTURES } from '@/data/visualAssets';
import { createStaticColliders, type StaticShape } from '@/game/physics/StaticColliders';
import { IntervalGate } from '@/utils/performance/throttle';
import { createCardTreeGeometry, createFrondTexture } from './treeGeometry';
import { createTreeGeometry } from './vegetationGeometry';
import { forest } from './forest';
import { TREE_STRIDE, type VegetationLayout } from './VegetationPlacer';

const CHUNK_SIZE = 125;
/**
 * Real-world proportions: mature alpine spruce/fir stand ~18-30 m tall with narrow crowns. The
 * tree models are authored ~10 m tall, so instances are stretched upwards and slightly widened.
 */
export const TREE_HEIGHT_SCALE = 2.4;
export const TREE_WIDTH_SCALE = 1.1;
const TRUNK_RADIUS = 0.3;
const TRUNK_HALF_HEIGHT = 1.5;
/** Canopy collider (cone) roughly matching the needle tiers, so the forest blocks low flight. */
const CANOPY = { base: 1.8, halfHeight: 3.3, radius: 1.9 };
const LOD_CHECK_INTERVAL = 0.25;

/** Height of a tree from its layout scale and variation (matches the instance transform). */
function treeHeightScale(layout: VegetationLayout, index: number): number {
  const o = index * TREE_STRIDE;
  return layout.trees[o + 3]! * TREE_HEIGHT_SCALE * (0.9 + layout.trees[o + 5]! * 0.25);
}

/** Model-space height of the card tree (base to tip) per unit of vertical scale. */
const MODEL_TREE_HEIGHT = 10;

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
  const high = useMemo(() => createCardTreeGeometry(), []);
  // Far model matched to the near model's silhouette (height and crown width), so trees don't
  // pop in size when the LOD switches as you approach.
  const low = useMemo(() => createTreeGeometry('low').scale(1.45, 1.15, 1.45), []);
  const { map: barkMap, normalMap: barkNormal } = useTexture({
    map: BARK_TEXTURES.diffuse,
    normalMap: BARK_TEXTURES.normal,
  });
  // Near trees: photographic bark + alpha-tested needle fronds. Far trees: cheap cones.
  const highMaterials = useMemo(() => {
    for (const texture of [barkMap, barkNormal]) {
      texture.wrapS = RepeatWrapping;
      texture.wrapT = RepeatWrapping;
    }
    barkMap.colorSpace = SRGBColorSpace;
    const bark = new MeshStandardMaterial({
      map: barkMap,
      normalMap: barkNormal,
      roughness: 0.9,
      color: '#7d736a',
    });
    const needles = new MeshStandardMaterial({
      map: createFrondTexture(),
      alphaTest: 0.5,
      side: DoubleSide,
      roughness: 0.85,
      color: '#c4d1bb',
    });
    return [bark, needles];
  }, [barkMap, barkNormal]);
  const material = useMemo(
    () => new MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
    [],
  );
  const highRefs = useRef<(InstancedMesh | null)[]>([]);
  const lowRefs = useRef<(InstancedMesh | null)[]>([]);
  const gate = useMemo(() => new IntervalGate(LOD_CHECK_INTERVAL), []);
  const colliders = useRef<(Collider | null)[]>([]);

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
        const width = scale * TREE_WIDTH_SCALE;
        dummy.scale.set(width, treeHeightScale(layout, treeIndex), width);
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
        y: layout.trees[o + 1]! + TRUNK_HALF_HEIGHT * scale * TREE_HEIGHT_SCALE,
        z: layout.trees[o + 2]!,
        halfHeight: TRUNK_HALF_HEIGHT * scale * TREE_HEIGHT_SCALE,
        radius: TRUNK_RADIUS * scale * TREE_WIDTH_SCALE * 1.3,
      });
      shapes.push({
        kind: 'cone',
        x: layout.trees[o]!,
        y: layout.trees[o + 1]! + (CANOPY.base + CANOPY.halfHeight) * scale * TREE_HEIGHT_SCALE,
        z: layout.trees[o + 2]!,
        halfHeight: CANOPY.halfHeight * scale * TREE_HEIGHT_SCALE,
        radius: CANOPY.radius * scale * TREE_WIDTH_SCALE,
      });
    }
    colliders.current = [];
    return createStaticColliders(rapier, shapes, 0.6, colliders.current);
  }, [rapier, layout]);

  useEffect(() => {
    const where = new Map<number, [number, number]>();
    chunks.forEach((chunk, c) => chunk.instances.forEach((tree, i) => where.set(tree, [c, i])));
    const hidden = new Matrix4().makeScale(0, 0, 0);
    forest.layout = layout;
    forest.fell = (index) => {
      const slot = where.get(index);
      if (!slot) return null;
      where.delete(index);
      const [c, i] = slot;
      for (const mesh of [highRefs.current[c], lowRefs.current[c]]) {
        if (!mesh) continue;
        mesh.setMatrixAt(i, hidden);
        mesh.instanceMatrix.needsUpdate = true;
      }
      for (const k of [index * 2, index * 2 + 1]) colliders.current[k]?.setEnabled(false);
      const o = index * TREE_STRIDE;
      const width = layout.trees[o + 3]! * TREE_WIDTH_SCALE;
      const heightScale = treeHeightScale(layout, index);
      const local = new Matrix4()
        .makeRotationY(layout.trees[o + 4]!)
        .scale({ x: width, y: heightScale, z: width } as never)
        .setPosition(0, -0.2, 0);
      return {
        x: layout.trees[o]!,
        y: layout.trees[o + 1]!,
        z: layout.trees[o + 2]!,
        height: heightScale * MODEL_TREE_HEIGHT,
        scale: layout.trees[o + 3]!,
        local,
        geometry: high,
        materials: highMaterials,
      };
    };
    return () => {
      forest.fell = null;
      forest.layout = null;
    };
  }, [chunks, layout, high, highMaterials]);

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
            args={[high, highMaterials, chunk.instances.length]}
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
