import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  LatheGeometry,
  Shape,
  Vector2,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const DUCT_RADIUS = 0.47;
export const WHEEL_RADIUS = 0.42;
export const WHEEL_WIDTH = 0.28;
const LUG_DEPTH = 0.035;

const lathe = (points: [number, number][], segments: number) =>
  new LatheGeometry(
    points.map(([r, y]) => new Vector2(r, y)),
    segments,
  );

/** Ducted-fan shroud: rounded inlet lip on top, straight throat, slightly flared exit. */
export function createDuctGeometry(): BufferGeometry {
  const r = DUCT_RADIUS;
  return lathe(
    [
      [r + 0.005, -0.12],
      [r - 0.005, -0.06],
      [r - 0.01, 0.03],
      [r - 0.005, 0.08],
      [r + 0.01, 0.115],
      [r + 0.03, 0.13],
      [r + 0.05, 0.12],
      [r + 0.06, 0.09],
      [r + 0.062, 0.02],
      [r + 0.058, -0.09],
      [r + 0.045, -0.125],
      [r + 0.022, -0.132],
      [r + 0.005, -0.12],
    ],
    56,
  );
}

/** One tapered, twisted rotor blade lying along +X in the XZ plane. */
function createBladeGeometry(): BufferGeometry {
  const root = 0.07;
  const tip = DUCT_RADIUS - 0.02;
  const shape = new Shape();
  shape.moveTo(root, -0.045);
  shape.lineTo(tip - 0.02, -0.028);
  shape.quadraticCurveTo(tip, -0.026, tip, 0);
  shape.quadraticCurveTo(tip, 0.02, tip - 0.02, 0.022);
  shape.lineTo(root, 0.04);
  shape.lineTo(root, -0.045);
  const blade = new ExtrudeGeometry(shape, {
    depth: 0.008,
    bevelEnabled: true,
    bevelThickness: 0.003,
    bevelSize: 0.003,
    bevelSegments: 1,
    steps: 1,
  });
  blade.rotateX(-Math.PI / 2);
  // Twist: more pitch at the root than at the tip.
  const position = blade.attributes.position!;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const t = (x - root) / (tip - root);
    const pitch = 0.42 - t * 0.26;
    position.setY(i, y * Math.cos(pitch) + z * Math.sin(pitch));
    position.setZ(i, z * Math.cos(pitch) - y * Math.sin(pitch));
  }
  blade.computeVertexNormals();
  return blade;
}

/** Three-blade propeller with its spinner. */
export function createPropellerGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (let k = 0; k < 3; k++) {
    const blade = createBladeGeometry();
    blade.rotateY((k * Math.PI * 2) / 3);
    parts.push(blade);
  }
  const hub = new CylinderGeometry(0.075, 0.08, 0.05, 20);
  parts.push(hub);
  const merged = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
  for (const part of parts) part.dispose();
  return merged;
}

/** Tyre carcass (axis = Y): rounded shoulders, open towards the rim. */
export function createTyreGeometry(): BufferGeometry {
  const r = WHEEL_RADIUS - 0.02;
  const h = WHEEL_WIDTH / 2;
  return lathe(
    [
      [0.27, -h + 0.01],
      [0.33, -h],
      [r - 0.03, -h + 0.005],
      [r - 0.008, -h + 0.03],
      [r, -h + 0.07],
      [r, h - 0.07],
      [r - 0.008, h - 0.03],
      [r - 0.03, h - 0.005],
      [0.33, h],
      [0.27, h - 0.01],
    ],
    40,
  );
}

/** Staggered off-road tread lugs around the tyre (axis = Y). */
export function createTreadGeometry(): BufferGeometry {
  const lugs: BufferGeometry[] = [];
  const count = 22;
  for (let k = 0; k < count; k++) {
    const angle = (k / count) * Math.PI * 2;
    for (const side of [-1, 1]) {
      const offset = side * (k % 2 === 0 ? 0.065 : 0.045);
      const lug = new BoxGeometry(0.07, 0.11, LUG_DEPTH);
      // Chevron: each half angled inwards.
      lug.rotateX(side * 0.35);
      // Lug tops sit exactly on the physics wheel radius, so the tread never sinks into the ground.
      lug.translate(0, offset, WHEEL_RADIUS - LUG_DEPTH / 2);
      lug.rotateY(angle + (k % 2) * 0.06);
      lugs.push(lug.toNonIndexed());
    }
  }
  const merged = mergeGeometries(lugs);
  for (const lug of lugs) lug.dispose();
  return merged;
}

/** Dished six-spoke rim with brake disc (axis = Y). */
export function createRimGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const barrel = lathe(
    [
      [0.28, -0.13],
      [0.27, -0.11],
      [0.265, 0.11],
      [0.28, 0.13],
    ],
    36,
  );
  parts.push(barrel);
  const face = new CylinderGeometry(0.075, 0.09, 0.05, 20);
  face.translate(0, 0.1, 0);
  parts.push(face);
  for (let k = 0; k < 6; k++) {
    const spoke = new BoxGeometry(0.2, 0.03, 0.045);
    spoke.translate(0.165, 0.1, 0);
    spoke.rotateZ(0);
    spoke.rotateY((k * Math.PI) / 3);
    parts.push(spoke);
  }
  const disc = new CylinderGeometry(0.19, 0.19, 0.015, 28);
  disc.translate(0, -0.02, 0);
  parts.push(disc);
  const merged = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
  for (const part of parts) part.dispose();
  return merged;
}
