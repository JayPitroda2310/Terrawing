import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
  type Texture,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createRandom, randomRange, type RandomFn } from '@/utils/math/random';

/** Tree height at scale 1 (metres). */
const TREE_HEIGHT = 10;
const CROWN_BASE = 1.2;
const WHORLS = 10;
const TRUNK_TOP_RADIUS = 0.05;
const TRUNK_BASE_RADIUS = 0.2;

const up = new Vector3(0, 1, 0);

/**
 * Adds one branch frond: two crossed quads from the trunk outwards, drooping towards the tip.
 * UV.x runs along the branch (0 = trunk, 1 = tip), UV.y across it. Normals point away from the
 * crown's centre line so the whole crown shades as one soft volume.
 */
function pushFrond(
  positions: number[],
  normals: number[],
  uvs: number[],
  y: number,
  angle: number,
  length: number,
  droop: number,
  random: RandomFn,
): void {
  const dir = new Vector3(Math.cos(angle), 0, Math.sin(angle));
  const side = new Vector3(-dir.z, 0, dir.x);
  const tipDrop = length * droop;
  const base = new Vector3(dir.x * 0.1, y, dir.z * 0.1);
  const tip = new Vector3(dir.x * length, y - tipDrop, dir.z * length);
  const halfWidth = length * randomRange(random, 0.5, 0.6);
  const twist = randomRange(random, -0.25, 0.25);

  // Two cards: one flat-ish (slightly twisted), one tilted, for volume from every angle.
  const cards = [
    side.clone().applyAxisAngle(dir, twist),
    side.clone().applyAxisAngle(dir, 1.1 + twist),
  ];
  for (const across of cards) {
    const a = base.clone().addScaledVector(across, -halfWidth * 0.35);
    const b = base.clone().addScaledVector(across, halfWidth * 0.35);
    const c = tip.clone().addScaledVector(across, -halfWidth);
    const d = tip.clone().addScaledVector(across, halfWidth);
    const verts = [a, c, b, b, c, d];
    const uv = [
      [0, 0],
      [1, 0],
      [0, 1],
      [0, 1],
      [1, 0],
      [1, 1],
    ];
    verts.forEach((v, i) => {
      positions.push(v.x, v.y, v.z);
      const n = new Vector3(v.x, 0, v.z)
        .normalize()
        .multiplyScalar(0.75)
        .addScaledVector(up, 0.65)
        .normalize();
      normals.push(n.x, n.y, n.z);
      uvs.push(uv[i]![0]!, uv[i]![1]!);
    });
  }
}

/**
 * Spruce built from alpha-tested branch cards around a bark-textured trunk, about 10 m tall at
 * scale 1. Returns a geometry with two groups: 0 = trunk (bark material), 1 = foliage.
 */
export function createCardTreeGeometry(seed = 7): BufferGeometry {
  const random = createRandom(seed);
  const trunk = new CylinderGeometry(TRUNK_TOP_RADIUS, TRUNK_BASE_RADIUS, TREE_HEIGHT * 0.92, 7, 1);
  trunk.translate(0, (TREE_HEIGHT * 0.92) / 2, 0);
  // Bark repeats around and up the trunk.
  const trunkUv = trunk.getAttribute('uv');
  for (let i = 0; i < trunkUv.count; i++)
    trunkUv.setXY(i, trunkUv.getX(i) * 2, trunkUv.getY(i) * 6);

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  for (let w = 0; w < WHORLS; w++) {
    const t = w / (WHORLS - 1);
    const y = CROWN_BASE + t * (TREE_HEIGHT - CROWN_BASE - 0.6);
    // Classic spruce profile: long drooping lower branches, short upturned top.
    const length = (1 - t) ** 0.85 * 2.7 + 0.35;
    const count = Math.round(7 - t * 3);
    const droop = 0.45 - t * 0.35;
    const offset = random() * Math.PI * 2;
    for (let b = 0; b < count; b++) {
      const angle = offset + (b / count) * Math.PI * 2 + randomRange(random, -0.25, 0.25);
      pushFrond(
        positions,
        normals,
        uvs,
        y + randomRange(random, -0.15, 0.15),
        angle,
        length * randomRange(random, 0.85, 1.1),
        droop,
        random,
      );
    }
  }
  // Leader at the top.
  pushFrond(positions, normals, uvs, TREE_HEIGHT - 0.9, 0, 0.1, -9, random);

  const foliage = new BufferGeometry();
  foliage.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  foliage.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
  foliage.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));

  const merged = mergeGeometries([trunk.toNonIndexed(), foliage], true);
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Paints a spruce frond (stem with dense needles) onto a transparent canvas. Used with alphaTest
 * so each card has a feathery, natural silhouette.
 */
export function createFrondTexture(): Texture {
  const width = 512;
  const height = 256;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const random = createRandom(99);
    const mid = height / 2;
    // Solid foliage mass (tapering towards the tip) so crowns read as dense, not skeletal.
    ctx.fillStyle = 'rgb(30,52,32)';
    ctx.beginPath();
    ctx.moveTo(0, mid - 30);
    ctx.quadraticCurveTo(width * 0.45, mid - height * 0.46, width - 12, mid - 6);
    ctx.lineTo(width - 12, mid + 6);
    ctx.quadraticCurveTo(width * 0.45, mid + height * 0.46, 0, mid + 30);
    ctx.closePath();
    ctx.fill();
    // Needle strokes break up the edge and add texture.
    const needle = (x: number, y: number, len: number, angle: number, shade: number) => {
      ctx.strokeStyle = `rgb(${Math.round(26 + shade * 30)},${Math.round(50 + shade * 55)},${Math.round(28 + shade * 24)})`;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
      ctx.stroke();
    };
    ctx.lineWidth = 2.4;
    for (let n = 0; n < 2600; n++) {
      const t = random();
      const x = t * (width - 20);
      const spread = (1 - t) * height * 0.44 + 10;
      const y = mid + (random() * 2 - 1) * spread;
      const outward = y < mid ? -1 : 1;
      needle(x, y, 8 + random() * 14, outward * (0.5 + random() * 0.7), random());
    }
    ctx.strokeStyle = 'rgb(58,44,32)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(width * 0.8, mid);
    ctx.stroke();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}
