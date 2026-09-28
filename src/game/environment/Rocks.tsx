import { useFrame } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { InstancedMesh, Object3D, Vector3, type Camera } from 'three';
import { createStaticColliders, type StaticShape } from '@/game/physics/StaticColliders';
import { IntervalGate } from '@/utils/performance/throttle';
import { useBoulders } from './boulders';
import { createRockGeometry } from './vegetationGeometry';
import { ROCK_STRIDE, ROCK_TILT_SCALE, type VegetationLayout } from './VegetationPlacer';

/** Must match the number of boulder scans in BOULDER_MODELS. */
const VARIANTS = 3;
/** Stored tilts are divided by this factor at placement, so they come out as real angles. */
const TILT_FACTOR = ROCK_TILT_SCALE;
/** Collider centre above the base, as a fraction of scale. */
/** Rocks smaller than this are decorative only. */
const COLLIDER_MIN_SCALE = 1.1;
const CHUNK_SIZE = 125;
/** Within this distance of the camera, chunks show the full photo-scanned boulders. */
const DETAIL_DISTANCE = 110;
const LOD_CHECK_INTERVAL = 0.25;
/** Beyond this the fog hides rocks entirely. */
const MAX_DISTANCE = 420;

interface RockChunk {
  cx: number;
  cz: number;
  /** Rock indices per scan variant (detailed LOD). */
  byVariant: number[][];
  /** All rock indices (low LOD). */
  all: number[];
}

interface RocksProps {
  layout: VegetationLayout;
  castShadow: boolean;
}

function buildChunks(layout: VegetationLayout): RockChunk[] {
  const chunks = new Map<string, RockChunk>();
  for (let i = 0; i < layout.rockCount; i++) {
    const x = layout.rocks[i * ROCK_STRIDE]!;
    const z = layout.rocks[i * ROCK_STRIDE + 2]!;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const key = `${cx},${cz}`;
    let chunk = chunks.get(key);
    if (!chunk) {
      chunk = {
        cx: (cx + 0.5) * CHUNK_SIZE,
        cz: (cz + 0.5) * CHUNK_SIZE,
        byVariant: Array.from({ length: VARIANTS }, () => []),
        all: [],
      };
      chunks.set(key, chunk);
    }
    chunk.byVariant[layout.rocks[i * ROCK_STRIDE + 5]! % VARIANTS]!.push(i);
    chunk.all.push(i);
  }
  return [...chunks.values()];
}

/**
 * Photo-scanned boulders. Rocks are grouped into spatial chunks: near the camera each chunk draws
 * the scanned meshes (one instanced draw per scan), further away a single low-poly stand-in with
 * the same material. Larger rocks get colliders regardless of LOD.
 */
export function Rocks({ layout, castShadow }: RocksProps) {
  const rapier = useRapier();
  const boulders = useBoulders();
  const chunks = useMemo(() => buildChunks(layout), [layout]);
  const lowGeometry = useMemo(() => createRockGeometry(0), []);
  const detailRefs = useRef<(InstancedMesh | null)[][]>([]);
  const lowRefs = useRef<(InstancedMesh | null)[]>([]);
  const gate = useMemo(() => new IntervalGate(LOD_CHECK_INTERVAL), []);

  useLayoutEffect(() => {
    const dummy = new Object3D();
    const place = (mesh: InstancedMesh | null | undefined, indices: readonly number[]) => {
      if (!mesh) return;
      indices.forEach((rockIndex, i) => {
        const o = rockIndex * ROCK_STRIDE;
        dummy.position.set(layout.rocks[o]!, layout.rocks[o + 1]!, layout.rocks[o + 2]!);
        dummy.rotation.set(
          layout.rocks[o + 6]! * TILT_FACTOR,
          layout.rocks[o + 4]!,
          layout.rocks[o + 7]! * TILT_FACTOR,
        );
        dummy.scale.setScalar(layout.rocks[o + 3]!);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    };
    chunks.forEach((chunk, c) => {
      chunk.byVariant.forEach((indices, v) => place(detailRefs.current[c]?.[v], indices));
      place(lowRefs.current[c], chunk.all);
    });
  }, [chunks, layout]);

  // Collision uses each rock's own shape, transformed exactly like its rendered instance, so there
  // are no invisible bumps above or around the boulders.
  useEffect(() => {
    const shapes: StaticShape[] = [];
    const dummy = new Object3D();
    const point = new Vector3();
    for (let i = 0; i < layout.rockCount; i++) {
      const o = i * ROCK_STRIDE;
      const scale = layout.rocks[o + 3]!;
      if (scale < COLLIDER_MIN_SCALE) continue;
      const hull = boulders[layout.rocks[o + 5]! % boulders.length]!.hull;
      dummy.position.set(layout.rocks[o]!, layout.rocks[o + 1]!, layout.rocks[o + 2]!);
      dummy.rotation.set(
        layout.rocks[o + 6]! * TILT_FACTOR,
        layout.rocks[o + 4]!,
        layout.rocks[o + 7]! * TILT_FACTOR,
      );
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      const points = new Float32Array(hull.length);
      for (let k = 0; k < hull.length; k += 3) {
        point.set(hull[k]!, hull[k + 1]!, hull[k + 2]!).applyMatrix4(dummy.matrix);
        points[k] = point.x;
        points[k + 1] = point.y;
        points[k + 2] = point.z;
      }
      shapes.push({ kind: 'convex', points });
    }
    return createStaticColliders(rapier, shapes, 0.9);
  }, [rapier, layout, boulders]);

  useFrame(({ camera }, dt) => {
    if (!gate.tick(dt)) return;
    updateLod(camera, chunks, detailRefs.current, lowRefs.current);
  });

  return (
    <group>
      {chunks.map((chunk, c) => (
        <group key={`${chunk.cx},${chunk.cz}`}>
          {chunk.byVariant.map((indices, v) =>
            indices.length === 0 ? null : (
              <instancedMesh
                key={v}
                ref={(mesh) => {
                  (detailRefs.current[c] ??= [])[v] = mesh;
                }}
                args={[boulders[v]!.geometry, boulders[v]!.material, indices.length]}
                castShadow={castShadow}
                receiveShadow
                visible={false}
              />
            ),
          )}
          <instancedMesh
            ref={(mesh) => {
              lowRefs.current[c] = mesh;
            }}
            args={[lowGeometry, boulders[0]!.material, chunk.all.length]}
            receiveShadow
          />
        </group>
      ))}
    </group>
  );
}

function updateLod(
  camera: Camera,
  chunks: readonly RockChunk[],
  detail: readonly (InstancedMesh | null)[][],
  low: readonly (InstancedMesh | null)[],
): void {
  const halfDiagonal = CHUNK_SIZE * 0.72;
  chunks.forEach((chunk, c) => {
    const distance = Math.max(
      0,
      Math.hypot(chunk.cx - camera.position.x, chunk.cz - camera.position.z) - halfDiagonal,
    );
    const near = distance < DETAIL_DISTANCE;
    for (const mesh of detail[c] ?? []) if (mesh) mesh.visible = near;
    const lowMesh = low[c];
    if (lowMesh) lowMesh.visible = !near && distance < MAX_DISTANCE;
  });
}
