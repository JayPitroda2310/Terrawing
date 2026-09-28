import type { BufferGeometry, Material, Matrix4 } from 'three';
import type { VegetationLayout } from './VegetationPlacer';

/** A tree taken out of the standing forest so it can be simulated falling. */
export interface FelledTree {
  /** Base of the trunk (world). */
  x: number;
  y: number;
  z: number;
  /** Tree height (m) and the instance transform relative to its base (yaw + scale). */
  height: number;
  scale: number;
  local: Matrix4;
  geometry: BufferGeometry;
  materials: Material[];
}

/**
 * The standing forest, published for storm and fire events: `fell(i)` hides tree i and removes its
 * colliders (only trees that are actually drawn can be felled), returning what is needed to draw
 * and simulate it falling.
 */
export const forest: {
  layout: VegetationLayout | null;
  fell: ((index: number) => FelledTree | null) | null;
} = { layout: null, fell: null };
