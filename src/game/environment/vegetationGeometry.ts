import {
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createNoise2D } from '@/utils/math/noise';

function paint(geometry: BufferGeometry, hex: string, shade = 0): BufferGeometry {
  const color = new Color(hex);
  const count = geometry.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < count; i++) {
    // Darker towards the bottom of each tier for a bit of self-shadowing.
    const k = 1 - shade * (0.5 - Math.min(0.5, Math.max(-0.5, position.getY(i) * 0.15)));
    colors[i * 3] = color.r * k;
    colors[i * 3 + 1] = color.g * k;
    colors[i * 3 + 2] = color.b * k;
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  return geometry;
}

const TRUNK_COLOR = '#3b2d22';
const NEEDLE_COLORS = ['#1f2d1f', '#243426', '#2a3a28', '#2f402c'];

/** Conifer, about 9 m tall at scale 1, origin at the base of the trunk. */
export function createTreeGeometry(detail: 'high' | 'low'): BufferGeometry {
  const radial = detail === 'high' ? 7 : 5;
  const parts: BufferGeometry[] = [];
  const trunk = new CylinderGeometry(0.16, 0.26, 2.4, detail === 'high' ? 6 : 4);
  trunk.translate(0, 1.2, 0);
  parts.push(paint(trunk, TRUNK_COLOR));
  const tiers = detail === 'high' ? 4 : 2;
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const radius = (detail === 'high' ? 2.4 : 2.2) * (1 - t * 0.62);
    const height = detail === 'high' ? 3.4 - t * 1.2 : 5.2 - t * 2;
    const cone = new ConeGeometry(radius, height, radial, 1, false);
    cone.translate(0, 1.7 + (detail === 'high' ? i * 1.75 : i * 2.8) + height / 2, 0);
    parts.push(paint(cone, NEEDLE_COLORS[i % NEEDLE_COLORS.length]!, 0.4));
  }
  const merged = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
  merged.computeVertexNormals();
  return merged;
}

/** Irregular boulder: displaced icosahedron, radius about 1 at scale 1. */
export function createRockGeometry(variant: number): BufferGeometry {
  const geometry = new IcosahedronGeometry(1, 1);
  const noise = createNoise2D(1000 + variant * 17);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const n = 1 + noise(x * 1.7 + variant, z * 1.7 - y) * 0.28 + noise(y * 3.1, x * 3.1) * 0.08;
    const flatten = y > 0 ? 0.72 : 0.9;
    position.setXYZ(i, x * n * (1 + variant * 0.12), y * n * flatten, z * n);
  }
  // Icosahedron geometry is already non-indexed, so faces stay flat-shaded.
  geometry.computeVertexNormals();
  return geometry;
}
