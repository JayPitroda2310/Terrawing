import { useGLTF } from '@react-three/drei';
import { useMemo } from 'react';
import {
  Box3,
  Mesh,
  MeshStandardMaterial,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import { BOULDER_MODELS } from '@/data/visualAssets';
import { withScanBand } from '@/game/effects/shaderChunks';

export interface BoulderAsset {
  geometry: BufferGeometry;
  material: MeshStandardMaterial;
  /**
   * Convex outline of the rock for physics (x, y, z triples in the normalised model space): the
   * furthest vertex in each of many directions, so the collider matches the visible rock.
   */
  hull: Float32Array;
}

const HULL_DIRECTIONS = 96;

/** Extreme (support) points of a geometry along evenly spread directions. */
export function supportHull(geometry: BufferGeometry): Float32Array {
  const position = geometry.getAttribute('position');
  const picked = new Set<number>();
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let k = 0; k < HULL_DIRECTIONS; k++) {
    const y = 1 - (2 * (k + 0.5)) / HULL_DIRECTIONS;
    const r = Math.sqrt(1 - y * y);
    const dx = Math.cos(golden * k) * r;
    const dz = Math.sin(golden * k) * r;
    let best = -Infinity;
    let index = 0;
    for (let i = 0; i < position.count; i++) {
      const d = position.getX(i) * dx + position.getY(i) * y + position.getZ(i) * dz;
      if (d > best) {
        best = d;
        index = i;
      }
    }
    picked.add(index);
  }
  const out = new Float32Array(picked.size * 3);
  let j = 0;
  for (const i of picked) {
    out[j++] = position.getX(i);
    out[j++] = position.getY(i);
    out[j++] = position.getZ(i);
  }
  return out;
}

/** How far below the ground plane a boulder sits (fraction of its height) so it looks embedded. */
const EMBED = 0.18;

/**
 * Loads the photo-scanned boulders and normalises each one: centred, about 1 m in horizontal
 * radius and resting on y = 0 (slightly embedded). Materials get the scanner wave.
 */
export function useBoulders(): readonly BoulderAsset[] {
  const gltfs = useGLTF(BOULDER_MODELS as unknown as string[]);
  return useMemo(
    () =>
      gltfs.map((gltf, index) => {
        let found: Mesh | null = null;
        gltf.scene.traverse((node) => {
          if (!found && node instanceof Mesh) found = node;
        });
        const mesh = found as Mesh | null;
        if (!mesh) throw new Error(`Boulder model ${BOULDER_MODELS[index]} has no mesh`);
        mesh.updateWorldMatrix(true, false);
        const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
        const box = new Box3().setFromBufferAttribute(geometry.getAttribute('position') as never);
        const size = box.getSize(new Vector3());
        const center = box.getCenter(new Vector3());
        const radius = Math.max(size.x, size.z) / 2 || 1;
        geometry.translate(-center.x, -box.min.y - size.y * EMBED, -center.z);
        geometry.scale(1 / radius, 1 / radius, 1 / radius);
        geometry.computeBoundingSphere();
        const source = mesh.material as Material | Material[];
        const base = (Array.isArray(source) ? source[0] : source) as MeshStandardMaterial;
        const material = withScanBand(base.clone(), `boulder-${index}`);
        material.envMapIntensity = 0.8;
        gradeToAlpineRock(material);
        return { geometry, material, hull: supportHull(geometry) };
      }),
    [gltfs],
  );
}

/**
 * The scans are warm desert sandstone; desaturate and cool them so they match wet alpine granite.
 * Chains onto the existing shader patch (scan wave).
 */
function gradeToAlpineRock(material: MeshStandardMaterial): void {
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      float twLuma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(twLuma) * vec3(0.92, 0.97, 1.0), 0.8) * 0.85;`,
    );
  };
  const key = material.customProgramCacheKey();
  material.customProgramCacheKey = () => `${key}-alpine`;
}

for (const url of BOULDER_MODELS) useGLTF.preload(url);
