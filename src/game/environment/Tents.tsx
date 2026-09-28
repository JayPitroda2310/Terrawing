import { useMemo } from 'react';
import {
  type BufferGeometry,
  CanvasTexture,
  CapsuleGeometry,
  CatmullRomCurve3,
  DoubleSide,
  ExtrudeGeometry,
  MeshStandardMaterial,
  Quaternion,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
} from 'three';
import { StaticModel } from './Houses';
import { cached, PartBuilder, type BuiltModel, type V3 } from './partBuilder';
import type { MaterialName } from './materials';

const UP = new Vector3(0, 1, 0);

/** A straight rod or rope between two points (in the builder's current frame). */
function segment(b: PartBuilder, material: MaterialName, from: V3, to: V3, radius: number): void {
  const a = new Vector3(...from);
  const c = new Vector3(...to);
  const length = a.distanceTo(c);
  const geometry = new CapsuleGeometry(radius, Math.max(0.001, length - radius * 2), 2, 6);
  geometry.applyQuaternion(new Quaternion().setFromUnitVectors(UP, c.clone().sub(a).normalize()));
  const mid = a.add(c).multiplyScalar(0.5);
  b.add(material, geometry, [mid.x, mid.y, mid.z]);
}

// ---------------------------------------------------------------------------------------------
// Decals
// ---------------------------------------------------------------------------------------------

type Marking = 'medical' | 'command' | 'supply';

const decalCache = new Map<string, MeshStandardMaterial>();
/** Printed markings on the tent fabric (red cross, lettering) on a transparent canvas. */
function getDecal(kind: Marking | 'roofCross'): MeshStandardMaterial {
  const hit = decalCache.get(kind);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const cross = (cx: number, cy: number, size: number) => {
    ctx.fillStyle = '#f4f4f0';
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.62, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d4231d';
    const arm = size * 0.28;
    ctx.fillRect(cx - arm / 2, cy - size * 0.45, arm, size * 0.9);
    ctx.fillRect(cx - size * 0.45, cy - arm / 2, size * 0.9, arm);
  };
  const label = (text: string, y: number) => {
    ctx.fillStyle = '#f4f4f0';
    ctx.font = 'bold 64px "Arial Narrow", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, 256, y);
  };
  if (kind === 'roofCross') cross(256, 256, 400);
  else if (kind === 'medical') {
    cross(256, 200, 260);
    label('MEDICAL', 440);
  } else if (kind === 'command') {
    ctx.strokeStyle = '#f4f4f0';
    ctx.lineWidth = 14;
    ctx.strokeRect(60, 150, 392, 150);
    label('COMMAND', 250);
    ctx.font = '600 38px "Arial Narrow", Arial, sans-serif';
    ctx.fillText('INCIDENT POST', 256, 360);
  } else {
    label('SUPPLY', 250);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  const material = new MeshStandardMaterial({
    map: texture,
    transparent: true,
    roughness: 0.9,
    side: DoubleSide,
  });
  decalCache.set(kind, material);
  return material;
}

// ---------------------------------------------------------------------------------------------
// Rescue frame tent
// ---------------------------------------------------------------------------------------------

const TENT = { halfWidth: 2.25, wall: 1.6, peak: 3.05, length: 6, hoops: 5 };

/** Cross-section outline: vertical walls with an elliptical arched roof. */
function tentProfile(offset = 0): [number, number][] {
  const { halfWidth: w, wall, peak } = TENT;
  const points: [number, number][] = [[-w - offset, 0]];
  for (let i = 0; i <= 18; i++) {
    const t = Math.PI - (i / 18) * Math.PI;
    points.push([(w + offset) * Math.cos(t), wall + (peak - wall + offset) * Math.sin(t)]);
  }
  points.push([w + offset, 0]);
  return points;
}

/** Canvas skin: the profile extruded along the tent, sagging a little between the frame hoops. */
function createTentSkin(): BufferGeometry {
  const { length, hoops, wall } = TENT;
  const shape = new Shape();
  const outline = tentProfile();
  shape.moveTo(outline[0]![0], outline[0]![1]);
  for (const [x, y] of outline.slice(1)) shape.lineTo(x, y);
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, { depth: length, steps: 36, bevelEnabled: false });
  geometry.translate(0, 0, -length / 2);
  const position = geometry.getAttribute('position');
  const spacing = length / (hoops - 1);
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    if (y < 0.05) continue;
    const sag = 0.07 * Math.abs(Math.sin((Math.PI * (z + length / 2)) / spacing));
    if (y > wall) position.setY(i, y - sag * (0.4 + 0.6 * Math.min(1, (y - wall) / 0.8)));
    position.setX(i, x - Math.sign(x) * sag * (y <= wall ? 1 : 0.4));
  }
  geometry.computeVertexNormals();
  return geometry;
}

function buildRescueTent(marking: Marking): BuiltModel {
  const b = new PartBuilder();
  const { halfWidth: w, wall, peak, length, hoops } = TENT;
  b.add('tentOrange', createTentSkin());
  b.collider([w, wall / 2, length / 2], [0, wall / 2, 0]);
  b.collider([w * 0.7, (peak - wall) / 2, length / 2], [0, (wall + peak) / 2, 0]);

  // Aluminium frame hoops outside the skin, with reflective white pole sleeves.
  const spacing = length / (hoops - 1);
  for (let k = 0; k < hoops; k++) {
    const z = -length / 2 + k * spacing;
    const curve = new CatmullRomCurve3(tentProfile(0.03).map(([x, y]) => new Vector3(x, y, z)));
    b.add(
      k === 0 || k === hoops - 1 ? 'steel' : 'tentWhite',
      new TubeGeometry(curve, 48, 0.035, 6, false),
    );
    // Foot plates.
    for (const side of [-1, 1]) b.box('steelDark', [0.2, 0.02, 0.2], [side * (w + 0.03), 0.01, z]);
  }
  // Skirt with a dark mud line along the ground.
  for (const side of [-1, 1]) b.box('mud', [0.03, 0.18, length], [side * (w + 0.005), 0.09, 0]);

  // Clear PVC windows with white welded frames on both sides.
  for (const side of [-1, 1]) {
    for (const z of [-1.9, 1.9]) {
      b.frame([side * (w + 0.012), 1.05, z], [0, (side * Math.PI) / 2, 0], () => {
        b.box('windowDark', [0.9, 0.55, 0.01], [0, 0, 0]);
        b.box('tentWhite', [1.02, 0.06, 0.012], [0, 0.3, 0.004]);
        b.box('tentWhite', [1.02, 0.06, 0.012], [0, -0.3, 0.004]);
        b.box('tentWhite', [0.06, 0.6, 0.012], [-0.48, 0, 0.004]);
        b.box('tentWhite', [0.06, 0.6, 0.012], [0.48, 0, 0.004]);
      });
    }
  }

  // Front: open doorway with the flap rolled up and tied, zips down both sides, and an awning.
  b.frame([0, 0, length / 2], [0, 0, 0], () => {
    b.box('tentInterior', [1.3, 2.0, 0.01], [0, 1.0, 0.004]);
    b.cyl('tentOrange', 0.13, 1.45, [0, 2.12, 0.1], [0, 0, Math.PI / 2], 12);
    for (const x of [-0.45, 0.45]) b.box('rope', [0.03, 0.34, 0.03], [x, 2.12, 0.24]);
    for (const x of [-0.68, 0.68]) b.box('steelDark', [0.025, 2.0, 0.012], [x, 1.0, 0.01]);
    b.box('tentOrange', [2.2, 0.03, 1.5], [0, 2.4, 0.72], [-0.16, 0, 0]);
    for (const x of [-1.0, 1.0]) {
      b.cyl('steel', 0.025, 2.3, [x, 1.15, 1.42]);
      segment(b, 'rope', [x, 2.28, 1.44], [x * 1.6, 0, 2.6], 0.008);
      b.cyl('steelDark', 0.015, 0.35, [x * 1.6, 0.1, 2.6], [0.3, 0, 0], 6);
    }
    // Duckboard step at the entrance.
    for (let k = 0; k < 5; k++) b.box('wood', [1.4, 0.04, 0.12], [0, 0.03, 0.3 + k * 0.18]);
  });
  // Back: closed end with a window.
  b.frame([0, 1.9, -length / 2 - 0.01], [0, Math.PI, 0], () => {
    b.box('windowDark', [1.0, 0.6, 0.01], [0, 0, 0]);
    b.box('tentWhite', [1.1, 0.7, 0.008], [0, 0, -0.004]);
  });

  // Guy ropes from each hoop shoulder to tent pegs, with sandbags on the corners.
  for (let k = 0; k < hoops; k++) {
    const z = -length / 2 + k * spacing;
    for (const side of [-1, 1]) {
      const shoulder: V3 = [side * (w + 0.02), wall + 0.45, z];
      const peg: V3 = [side * (w + 1.35), 0.02, z];
      segment(b, 'rope', shoulder, peg, 0.008);
      segment(b, 'steelDark', [peg[0], 0.12, z], [peg[0] + side * 0.05, -0.1, z], 0.012);
    }
  }
  for (const [x, z] of [
    [w + 0.25, length / 2 - 0.2],
    [-w - 0.25, length / 2 - 0.2],
    [w + 0.25, -length / 2 + 0.2],
    [-w - 0.25, -length / 2 + 0.2],
  ] as const) {
    for (let k = 0; k < 3; k++) {
      const bag = new CapsuleGeometry(0.13, 0.3, 3, 8);
      bag.rotateZ(Math.PI / 2);
      bag.scale(1, 0.7, 1.15);
      b.add(
        'sandbag',
        bag,
        [x, 0.09 + (k === 2 ? 0.16 : 0), z + (k === 1 ? 0.3 : k === 2 ? 0.15 : 0)],
        [0, 0.2 * k, 0],
      );
    }
  }

  if (marking === 'command') {
    // Radio mast with a whip antenna and a generator hum box behind the tent.
    b.cyl('steel', 0.04, 4.5, [w - 0.2, 2.25, -length / 2 - 0.4]);
    b.cyl('steelDark', 0.012, 1.4, [w - 0.2, 5.2, -length / 2 - 0.4], [0, 0, 0], 6);
    for (const side of [-1, 1])
      segment(
        b,
        'rope',
        [w - 0.2, 4.3, -length / 2 - 0.4],
        [w - 0.2 + side * 1.6, 0.02, -length / 2 - 1.4],
        0.006,
      );
    b.box('orangePaint', [1.1, 0.75, 0.7], [-w + 0.6, 0.38, -length / 2 - 1.0]);
    b.box('steelDark', [0.9, 0.08, 0.5], [-w + 0.6, 0.79, -length / 2 - 1.0]);
    b.collider([0.55, 0.38, 0.35], [-w + 0.6, 0.38, -length / 2 - 1.0]);
  } else if (marking === 'supply') {
    // Stacked supply crates beside the entrance.
    for (let k = 0; k < 5; k++) {
      const x = w + 0.9 + (k % 2) * 0.72;
      const y = 0.3 + Math.floor(k / 2) * 0.6;
      b.box('wood', [0.7, 0.58, 0.9], [x, y, 1.2 + (k === 4 ? 0.1 : 0)], [0, k * 0.07, 0]);
    }
    b.collider([0.75, 0.6, 0.5], [w + 1.26, 0.6, 1.2]);
  }
  return b.build();
}

/** Decals are separate meshes (they use printed textures rather than the shared palette). */
function TentDecals({ marking }: { marking: Marking }) {
  const { halfWidth: w, peak } = TENT;
  const side = getDecal(marking);
  const roof = getDecal('roofCross');
  return (
    <group>
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          material={side}
          position={[s * (w + 0.014), 1.05, 0]}
          rotation={[0, (s * Math.PI) / 2, 0]}
        >
          <planeGeometry args={[1.5, 1.5]} />
        </mesh>
      ))}
      {marking === 'medical' && (
        <mesh material={roof} position={[0, peak - 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[1.9, 1.9]} />
        </mesh>
      )}
    </group>
  );
}

/**
 * Inflatable-style rescue frame tent (4.5 × 6 m): arched roof on aluminium hoops, fabric sagging
 * between them, clear windows, rolled-up door flap and awning, guy ropes, pegs and sandbags.
 */
export function RescueTent({ marking }: { marking: Marking }) {
  const model = useMemo(() => cached(`tent-${marking}`, () => buildRescueTent(marking)), [marking]);
  return (
    <>
      <StaticModel model={model} />
      <TentDecals marking={marking} />
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Camping dome tent
// ---------------------------------------------------------------------------------------------

function buildDomeTent(colour: 'nylonGreen' | 'nylonBlue'): BuiltModel {
  const b = new PartBuilder();
  const rx = 1.15;
  const ry = 1.2;
  const rz = 1.05;
  // Fly sheet: a squashed dome whose panels sag slightly between the poles.
  const fly = new SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const position = fly.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const azimuth = Math.atan2(z, x);
    const sag = 1 - 0.06 * Math.abs(Math.sin(azimuth * 2)) * Math.sin(Math.acos(Math.min(1, y)));
    position.setXYZ(i, x * rx * sag, y * ry * sag, z * rz * sag);
  }
  fly.computeVertexNormals();
  b.add(colour, fly);
  b.collider([rx, ry / 2, rz], [0, ry / 2, 0]);
  // Two crossing poles over the dome, just outside the fly.
  for (const angle of [Math.PI / 4, -Math.PI / 4]) {
    const points: Vector3[] = [];
    for (let i = 0; i <= 16; i++) {
      const t = (i / 16) * Math.PI;
      const r = Math.cos(t);
      points.push(
        new Vector3(
          Math.cos(angle) * r * (rx + 0.02),
          Math.sin(t) * (ry + 0.02),
          Math.sin(angle) * r * (rz + 0.02),
        ),
      );
    }
    b.add('nylonGrey', new TubeGeometry(new CatmullRomCurve3(points), 32, 0.012, 5, false));
  }
  // Vestibule over the door, zipped door panel and guy lines to pegs.
  b.frame([0, 0, rz * 0.7], [0, 0, 0], () => {
    b.box('tentInterior', [0.7, 0.9, 0.01], [0, 0.45, 0.32]);
    b.box(colour, [1.3, 0.03, 0.9], [0, 0.9, 0.35], [0.55, 0, 0]);
    b.box('nylonGrey', [0.02, 0.9, 0.012], [0.36, 0.45, 0.33]);
  });
  for (const [x, z] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ] as const) {
    const top: V3 = [x * rx * 0.62, ry * 0.72, z * rz * 0.62];
    const peg: V3 = [x * (rx + 0.9), 0.02, z * (rz + 0.9)];
    segment(b, 'rope', top, peg, 0.006);
    segment(b, 'steelDark', [peg[0], 0.1, peg[2]], [peg[0], -0.08, peg[2]], 0.01);
  }
  // Groundsheet edge and a camp stool.
  b.box('nylonGrey', [rx * 2.1, 0.02, rz * 2.1], [0, 0.01, 0]);
  return b.build();
}

/** Two-person camping dome tent. */
export function DomeTent({ variant }: { variant: number }) {
  const colour = variant % 2 === 0 ? 'nylonGreen' : 'nylonBlue';
  const model = useMemo(() => cached(`dome-${colour}`, () => buildDomeTent(colour)), [colour]);
  return <StaticModel model={model} />;
}

// ---------------------------------------------------------------------------------------------
// Shipping container
// ---------------------------------------------------------------------------------------------

const CONTAINER = { length: 6.06, height: 2.59, width: 2.44 };

function buildContainer(): BuiltModel {
  const b = new PartBuilder();
  const { length: L, height: H, width: W } = CONTAINER;
  // Recessed wall panels, with corrugations standing proud on the long sides and the closed end.
  b.box('containerBlue', [L - 0.3, H - 0.3, W - 0.1], [0, H / 2, 0]);
  const ribs = Math.floor((L - 0.4) / 0.28);
  for (let i = 0; i < ribs; i++) {
    const x = -L / 2 + 0.3 + i * 0.28;
    for (const side of [-1, 1])
      b.box('containerBlue', [0.14, H - 0.34, 0.08], [x, H / 2, side * (W / 2 - 0.04)]);
  }
  for (let i = 0; i < 7; i++)
    b.box(
      'containerBlue',
      [0.08, H - 0.34, 0.14],
      [-L / 2 + 0.12, H / 2, -W / 2 + 0.35 + i * 0.29],
    );
  // Roof panel, corner posts, top/bottom rails and ISO corner castings.
  b.box('containerBlue', [L - 0.1, 0.06, W - 0.1], [0, H - 0.08, 0]);
  for (const x of [-L / 2 + 0.08, L / 2 - 0.08]) {
    for (const z of [-W / 2 + 0.08, W / 2 - 0.08]) {
      b.box('containerBlue', [0.16, H, 0.16], [x, H / 2, z]);
      for (const y of [0.09, H - 0.09]) b.box('steel', [0.18, 0.18, 0.18], [x, y, z]);
    }
  }
  for (const y of [0.1, H - 0.1]) {
    for (const z of [-W / 2 + 0.08, W / 2 - 0.08])
      b.box('containerBlue', [L, 0.16, 0.14], [0, y, z]);
  }
  // Fork-lift pockets.
  for (const x of [-1.05, 1.05])
    for (const z of [-1, 1]) b.box('steelDark', [0.36, 0.12, 0.03], [x, 0.1, z * (W / 2 + 0.01)]);
  // Doors: two leaves, four locking bars with handles and cams, hinges.
  b.frame([L / 2, 0, 0], [0, Math.PI / 2, 0], () => {
    b.box('containerBlue', [W - 0.2, H - 0.3, 0.05], [0, H / 2, 0.02]);
    b.box('steelDark', [0.02, H - 0.3, 0.02], [0, H / 2, 0.06]);
    for (const x of [-0.85, -0.35, 0.35, 0.85]) {
      b.cyl('steel', 0.022, H - 0.2, [x, H / 2, 0.09], [0, 0, 0], 8);
      b.box('steel', [0.3, 0.05, 0.04], [x + 0.12, 1.1, 0.12]);
      for (const y of [0.18, H - 0.18]) b.box('steel', [0.1, 0.08, 0.07], [x, y, 0.1]);
    }
    for (const side of [-1, 1])
      for (const y of [0.5, 1.3, 2.1])
        b.box('steel', [0.08, 0.14, 0.06], [side * (W / 2 - 0.12), y, 0.07]);
  });
  b.collider([L / 2, H / 2, W / 2], [0, H / 2, 0]);
  return b.build();
}

function getContainerDecal(): MeshStandardMaterial {
  const hit = decalCache.get('container');
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f2f2ee';
  ctx.font = 'bold 72px "Arial Narrow", Arial, sans-serif';
  ctx.fillText('TWRU 481233 0', 40, 100);
  ctx.font = '600 44px "Arial Narrow", Arial, sans-serif';
  ctx.fillText('22G1   RESCUE FIELD WORKSHOP', 40, 180);
  ctx.fillStyle = '#e8601c';
  ctx.fillRect(40, 205, 560, 14);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const material = new MeshStandardMaterial({ map: texture, transparent: true, roughness: 0.7 });
  decalCache.set('container', material);
  return material;
}

/** 20 ft ISO shipping container used as a field workshop. */
export function ShippingContainer() {
  const model = useMemo(() => cached('container', buildContainer), []);
  const decal = useMemo(getContainerDecal, []);
  return (
    <>
      <StaticModel model={model} />
      <mesh material={decal} position={[-0.4, 2.0, CONTAINER.width / 2 + 0.005]}>
        <planeGeometry args={[3.2, 0.8]} />
      </mesh>
    </>
  );
}
