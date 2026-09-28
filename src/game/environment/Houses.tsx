import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { useMemo } from 'react';
import { type BufferGeometry, DodecahedronGeometry, ExtrudeGeometry, Shape } from 'three';
import { createRandom, randomRange } from '@/utils/math/random';
import { getMaterial, type MaterialName } from './materials';
import { cached, PartBuilder, type BuiltModel, type V3 } from './partBuilder';

export function StaticModel({ model }: { model: BuiltModel }) {
  return (
    <RigidBody type="fixed" colliders={false}>
      {model.colliders.map((c, i) => (
        <CuboidCollider key={i} args={c.half} position={c.position} rotation={c.rotation} />
      ))}
      {model.meshes.map((m) => (
        <mesh
          key={m.material}
          geometry={m.geometry}
          material={getMaterial(m.material)}
          castShadow
          receiveShadow
        />
      ))}
    </RigidBody>
  );
}

// ---------------------------------------------------------------------------------------------
// Shared architectural details
// ---------------------------------------------------------------------------------------------

/** Isosceles triangle (base `width`, height `height`) extruded by `depth` along +Z. */
function gableGeometry(width: number, height: number, depth: number): BufferGeometry {
  const shape = new Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(0, height);
  shape.closePath();
  return new ExtrudeGeometry(shape, { depth, bevelEnabled: false });
}

type Shutter = 'shutterGreen' | 'shutterBlue' | 'shutterRed';

/**
 * Framed window on a wall face. The current frame's origin is on the wall surface, +Z pointing
 * out of the wall, +Y up.
 */
function windowUnit(
  b: PartBuilder,
  x: number,
  y: number,
  w: number,
  h: number,
  shutter: Shutter | null,
  lit = false,
): void {
  const t = 0.07;
  b.box(lit ? 'windowWarm' : 'windowDark', [w, h, 0.03], [x, y, -0.05]);
  // Frame, mullion and transom.
  b.box('trimWhite', [w + t * 2, t, 0.1], [x, y + h / 2 + t / 2, 0]);
  b.box('trimWhite', [w + t * 2, t, 0.1], [x, y - h / 2 - t / 2, 0]);
  b.box('trimWhite', [t, h, 0.1], [x - w / 2 - t / 2, y, 0]);
  b.box('trimWhite', [t, h, 0.1], [x + w / 2 + t / 2, y, 0]);
  b.box('trimWhite', [0.045, h, 0.06], [x, y, -0.01]);
  b.box('trimWhite', [w, 0.045, 0.06], [x, y + h * 0.18, -0.01]);
  // Stone sill and lintel.
  b.box('concrete', [w + 0.35, 0.08, 0.2], [x, y - h / 2 - t - 0.04, 0.06]);
  b.box('concrete', [w + 0.3, 0.14, 0.06], [x, y + h / 2 + t + 0.07, 0.01]);
  if (shutter) {
    for (const side of [-1, 1]) {
      const sx = x + side * (w / 2 + t + w / 4 + 0.03);
      b.box(shutter, [w / 2, h + 0.06, 0.04], [sx, y, 0.04]);
      // Louvre lines.
      for (let k = 0; k < 5; k++) {
        b.box(
          shutter,
          [w / 2 - 0.08, 0.025, 0.02],
          [sx, y - h / 2 + 0.2 + (k * (h - 0.3)) / 4, 0.07],
        );
      }
    }
  }
}

function door(b: PartBuilder, x: number, material: MaterialName, groundY: number): void {
  const w = 1.05;
  const h = 2.15;
  const y = groundY + h / 2;
  b.box(material, [w, h, 0.05], [x, y, -0.04]);
  // Raised panels and handle.
  for (const py of [0.45, -0.35]) {
    b.box(material, [w - 0.3, h * 0.28, 0.03], [x, y + py, 0.0]);
  }
  b.cyl('steel', 0.025, 0.12, [x + w / 2 - 0.15, y - 0.05, 0.04], [Math.PI / 2, 0, 0], 8);
  b.box('trimWhite', [w + 0.2, 0.1, 0.12], [x, groundY + h + 0.05, 0]);
  b.box('trimWhite', [0.1, h, 0.12], [x - w / 2 - 0.05, y, 0]);
  b.box('trimWhite', [0.1, h, 0.12], [x + w / 2 + 0.05, y, 0]);
}

// ---------------------------------------------------------------------------------------------
// Village house
// ---------------------------------------------------------------------------------------------

const HOUSE = { width: 8, depth: 7, wallTop: 6, plinth: 0.6, pitch: 2.3, overhang: 0.45 };
type WallMaterial = 'plaster' | 'plasterWarm' | 'plasterGrey' | 'brick';
const WALLS: readonly WallMaterial[] = ['plaster', 'brick', 'plasterWarm', 'plasterGrey'];
const SHUTTERS: readonly Shutter[] = ['shutterGreen', 'shutterBlue', 'shutterRed'];

function buildHouse(variant: number, flatRoof: boolean): BuiltModel {
  const b = new PartBuilder();
  const { width: W, depth: D, wallTop: H, plinth: P, pitch: R, overhang: O } = HOUSE;
  const wall = WALLS[variant % WALLS.length]!;
  const shutter = variant % 4 === 3 ? null : SHUTTERS[variant % SHUTTERS.length]!;
  const roofMaterial: MaterialName = variant % 2 === 0 ? 'roofClay' : 'roofSlate';
  const balcony = variant % 3 === 1;

  // Plinth, walls, storey band and corner quoins.
  b.box('stone', [W + 0.2, P, D + 0.2], [0, P / 2, 0]);
  b.box(wall, [W, H - P, D], [0, (H + P) / 2, 0]);
  b.box('concrete', [W + 0.08, 0.16, D + 0.08], [0, 3.05, 0]);
  if (wall !== 'brick') {
    for (const [cx, cz] of [
      [W / 2, D / 2],
      [-W / 2, D / 2],
      [W / 2, -D / 2],
      [-W / 2, -D / 2],
    ] as const) {
      for (let k = 0; k < 9; k++) {
        const long = k % 2 === 0;
        b.box(
          'stone',
          [long ? 0.5 : 0.3, 0.28, long ? 0.3 : 0.5],
          [cx - Math.sign(cx) * 0.12, P + 0.2 + k * 0.58, cz - Math.sign(cz) * 0.12],
        );
      }
    }
  }
  b.collider([W / 2, H / 2, D / 2], [0, H / 2, 0]);

  // Front (+Z): door, windows, porch canopy, lamp, steps.
  b.frame([0, 0, D / 2], [0, 0, 0], () => {
    door(b, 0, shutter ?? 'woodDark', P);
    windowUnit(b, -2.4, 1.85, 1.1, 1.35, shutter);
    windowUnit(b, 2.4, 1.85, 1.1, 1.35, shutter);
    if (balcony) {
      // Upper-floor French door onto a balcony.
      b.box('windowDark', [1.1, 2.1, 0.03], [0, 4.35, -0.05]);
      b.box('trimWhite', [1.3, 0.08, 0.1], [0, 5.44, 0]);
      b.box('trimWhite', [0.08, 2.1, 0.1], [-0.6, 4.35, 0]);
      b.box('trimWhite', [0.08, 2.1, 0.1], [0.6, 4.35, 0]);
      b.box('concrete', [3.2, 0.16, 1.2], [0, 3.22, 0.6]);
      b.collider([1.6, 0.08, 0.6], [0, 3.22, 0.6]);
      for (let k = 0; k <= 12; k++)
        b.box('steelDark', [0.03, 0.95, 0.03], [-1.55 + k * 0.258, 3.78, 1.15]);
      b.box('steelDark', [3.2, 0.05, 0.06], [0, 4.27, 1.15]);
      for (const side of [-1, 1]) b.box('steelDark', [0.05, 0.05, 1.2], [side * 1.58, 4.27, 0.6]);
    } else {
      windowUnit(b, 0, 4.5, 1.1, 1.35, shutter);
    }
    windowUnit(b, -2.4, 4.5, 1.1, 1.35, shutter);
    windowUnit(b, 2.4, 4.5, 1.1, 1.35, shutter);
    // Door canopy on brackets, porch lamp and steps.
    b.box(roofMaterial, [1.9, 0.08, 0.8], [0, P + 2.55, 0.42], [0.25, 0, 0]);
    for (const side of [-1, 1])
      b.box('timber', [0.08, 0.35, 0.5], [side * 0.8, P + 2.35, 0.25], [0.6, 0, 0]);
    b.box('steelDark', [0.14, 0.24, 0.14], [0.85, P + 2.1, 0.1]);
    b.box('lampWarm', [0.1, 0.14, 0.1], [0.85, P + 2.08, 0.18]);
    b.box('stone', [1.8, P / 2, 0.45], [0, P * 0.75, 0.22]);
    b.box('stone', [2.0, P / 2, 0.45], [0, P * 0.25, 0.62]);
    b.collider([1.0, P / 2, 0.45], [0, P / 2, 0.42]);
  });
  // Back (−Z) and gable sides (±X).
  b.frame([0, 0, -D / 2], [0, Math.PI, 0], () => {
    for (const x of [-2.4, 2.4]) {
      windowUnit(b, x, 1.85, 1.1, 1.35, shutter);
      windowUnit(b, x, 4.5, 1.1, 1.35, shutter);
    }
    windowUnit(b, 0, 4.5, 0.8, 1.1, null);
  });
  for (const side of [-1, 1]) {
    b.frame([(side * W) / 2, 0, 0], [0, (side * Math.PI) / 2, 0], () => {
      windowUnit(b, -1.6, 1.85, 1.0, 1.3, shutter);
      windowUnit(b, 1.6, 4.5, 1.0, 1.3, shutter);
      windowUnit(b, 1.6, 1.85, 1.0, 1.3, shutter);
    });
  }

  // Gutters and downpipes.
  const eaveOut = D / 2 + O;
  const eaveY = flatRoof ? H - 0.05 : H - (R * O) / (D / 2);
  for (const side of [-1, 1]) {
    b.cyl(
      'gutter',
      0.07,
      W + 0.9,
      [0, eaveY - 0.1, side * (flatRoof ? D / 2 + 0.08 : eaveOut)],
      [0, 0, Math.PI / 2],
      8,
    );
    for (const px of [-1, 1]) {
      const z = side * (D / 2 + 0.07);
      b.cyl(
        'gutter',
        0.045,
        eaveY - 0.2,
        [px * (W / 2 - 0.15), (eaveY - 0.1) / 2, z],
        [0, 0, 0],
        8,
      );
    }
  }

  if (flatRoof) {
    b.box('concreteDark', [W + 0.2, 0.24, D + 0.2], [0, H + 0.12, 0]);
    for (const [x, z, w, d] of [
      [0, D / 2 + 0.05, W + 0.2, 0.18],
      [0, -D / 2 - 0.05, W + 0.2, 0.18],
      [W / 2 + 0.05, 0, 0.18, D + 0.2],
      [-W / 2 - 0.05, 0, 0.18, D + 0.2],
    ] as const) {
      b.box(wall, [w, 0.6, d], [x, H + 0.54, z]);
      b.box('trimWhite', [w + 0.06, 0.06, d + 0.06], [x, H + 0.87, z]);
      b.collider([w / 2, 0.33, d / 2], [x, H + 0.57, z]);
    }
    // Roof hatch and a water tank.
    b.box('steelDark', [0.9, 0.3, 0.9], [-2.4, H + 0.39, -1.8]);
    b.cyl('whitePaint', 0.55, 1.2, [2.6, H + 0.84, -2.2], [0, 0, 0], 16);
    b.collider([0.55, 0.6, 0.55], [2.6, H + 0.84, -2.2]);
  } else {
    // Gable ends, pitched tiled roof with fascia, ridge cap and chimney.
    for (const side of [-1, 1]) {
      b.add(
        wall,
        gableGeometry(D, R, 0.25),
        [side > 0 ? W / 2 - 0.25 : -W / 2, H, 0],
        [0, Math.PI / 2, 0],
      );
    }
    const run = D / 2 + O;
    const drop = (R * run) / (D / 2);
    const slope = Math.hypot(run, drop);
    const angle = Math.atan2(R, D / 2);
    for (const side of [-1, 1]) {
      const cz = (side * run) / 2;
      const cy = H + R - drop / 2 + 0.07 / Math.cos(angle);
      const rot: V3 = [side * angle, 0, 0];
      b.box(roofMaterial, [W + 0.9, 0.14, slope], [0, cy, cz], rot);
      b.collider([(W + 0.9) / 2, 0.07, slope / 2], [0, cy, cz], rot);
      b.box('trimWhite', [W + 0.9, 0.22, 0.05], [0, eaveY + 0.02, side * (run + 0.02)]);
      // Barge boards along the gable edges.
      for (const end of [-1, 1]) {
        b.box('trimWhite', [0.05, 0.2, slope], [end * (W / 2 + 0.45), cy - 0.02, cz], rot);
      }
    }
    b.cyl(roofMaterial, 0.11, W + 0.9, [0, H + R + 0.1, 0], [0, 0, Math.PI / 2], 10);
    const chimneyZ = -1.1;
    const roofAtChimney = H + R - (R * Math.abs(chimneyZ)) / (D / 2);
    const top = H + R + 0.9;
    b.box(
      'brick',
      [0.65, top - roofAtChimney + 0.4, 0.65],
      [2.3, (top + roofAtChimney - 0.4) / 2, chimneyZ],
    );
    b.box('concrete', [0.8, 0.1, 0.8], [2.3, top + 0.05, chimneyZ]);
    b.cyl('steelDark', 0.08, 0.3, [2.3, top + 0.25, chimneyZ]);
    b.collider(
      [0.33, (top - roofAtChimney) / 2 + 0.2, 0.33],
      [2.3, (top + roofAtChimney) / 2, chimneyZ],
    );
  }
  return b.build();
}

/**
 * Two-storey village house, 8 × 7 m. `flatRoof` gives a walkable roof with a parapet (flood
 * victims wait up there); otherwise a pitched tiled roof. Origin at ground level, door facing +Z.
 */
export function House({ variant, flatRoof }: { variant: number; flatRoof: boolean }) {
  const model = useMemo(
    () => cached(`house-${variant % 12}-${flatRoof}`, () => buildHouse(variant % 12, flatRoof)),
    [variant, flatRoof],
  );
  return <StaticModel model={model} />;
}

/** Flat-roof walking surface height, used to place rooftop survivors. */
export const HOUSE_FLAT_ROOF_TOP = HOUSE.wallTop + 0.24;

// ---------------------------------------------------------------------------------------------
// Collapsed house
// ---------------------------------------------------------------------------------------------

function buildCollapsed(variant: number): BuiltModel {
  const b = new PartBuilder();
  const random = createRandom(9000 + variant);
  const wall = WALLS[variant % WALLS.length]!;
  const roofMaterial: MaterialName = variant % 2 === 0 ? 'roofClay' : 'roofSlate';
  const { width: W, depth: D, plinth: P } = HOUSE;

  b.box('stone', [W + 0.2, P, D + 0.2], [0, P / 2, 0]);

  // Standing ground-floor walls with broken, stepped tops (back and left); right side mostly gone.
  const brokenWall = (
    length: number,
    maxHeight: number,
    place: (s: number, w: number, h: number) => void,
  ) => {
    const pieces = Math.round(length / 0.8);
    for (let k = 0; k < pieces; k++) {
      const h = maxHeight * randomRange(random, 0.35, 1);
      place(-length / 2 + (k + 0.5) * (length / pieces), length / pieces, h);
    }
  };
  brokenWall(W, 3.1, (s, w, h) => b.box(wall, [w + 0.01, h, 0.35], [s, P + h / 2, -D / 2 + 0.18]));
  b.collider([W / 2, 1.3, 0.18], [0, P + 1.3, -D / 2 + 0.18]);
  brokenWall(D - 1, 2.6, (s, w, h) =>
    b.box(wall, [0.35, h, w + 0.01], [-W / 2 + 0.18, P + h / 2, s - 0.5]),
  );
  b.collider([0.18, 1.1, (D - 1) / 2], [-W / 2 + 0.18, P + 1.1, -0.5]);
  brokenWall(3, 1.6, (s, w, h) =>
    b.box(wall, [0.35, h, w + 0.01], [W / 2 - 0.18, P + h / 2, s - 2]),
  );
  // A surviving window frame in the back wall.
  b.frame([-2.2, 0, -D / 2 + 0.36], [0, 0, 0], () => windowUnit(b, 0, 1.6, 1.0, 1.1, null));

  // Upper floor slab pancaked onto the ground floor, tilted, with rebar sticking out of its edges.
  const slabRot: V3 = [0.2, 0.08, -0.14];
  b.frame([0.3, P + 1.55, 0.2], slabRot, () => {
    b.box('concrete', [W + 0.3, 0.3, D + 0.2], [0, 0, 0]);
    b.collider([(W + 0.3) / 2, 0.15, (D + 0.2) / 2], [0, 0, 0]);
    for (let k = 0; k < 22; k++) {
      const edge = k % 4;
      const along = randomRange(random, -0.45, 0.45);
      const len = randomRange(random, 0.3, 1.1);
      const bend = randomRange(random, -0.5, 0.5);
      const pos: V3 =
        edge === 0
          ? [along * W, 0, (D + 0.2) / 2 + len / 2]
          : edge === 1
            ? [along * W, 0, -(D + 0.2) / 2 - len / 2]
            : edge === 2
              ? [(W + 0.3) / 2 + len / 2, 0, along * D]
              : [-(W + 0.3) / 2 - len / 2, 0, along * D];
      const rot: V3 = edge < 2 ? [Math.PI / 2 + bend, 0, 0] : [0, 0, Math.PI / 2 + bend];
      b.cyl('rebar', 0.012, len, pos, rot, 5);
    }
    // Broken upper-storey walls lying on the slab.
    b.box(wall, [6.5, 2.4, 0.3], [-0.4, 0.6, -1.3], [0.9, 0.05, 0]);
    b.collider([3.25, 1.2, 0.15], [-0.4, 0.6, -1.3], [0.9, 0.05, 0]);
    b.box(wall, [0.3, 1.8, 4], [2.9, 0.75, 0.6], [0, 0.2, -1.1]);
    // Roof slid down: tiled panels with rafters poking out.
    b.box(roofMaterial, [6.4, 0.12, 3.8], [1, 1.25, 0.9], [0.32, 0.25, -0.2]);
    b.collider([3.2, 0.1, 1.9], [1, 1.25, 0.9], [0.32, 0.25, -0.2]);
    b.box(roofMaterial, [4.8, 0.12, 3.4], [-1.9, 0.95, 2.4], [-0.5, -0.12, 0.22]);
    for (let k = 0; k < 6; k++) {
      b.box(
        'timber',
        [0.1, 0.16, randomRange(random, 2, 3.6)],
        [-3 + k * 1.2, 1.5 + random() * 0.4, 1.2],
        [randomRange(random, 0.2, 0.7), randomRange(random, -0.3, 0.3), 0],
      );
    }
  });

  // Rubble spilling into the street: plaster, brick and concrete chunks, broken tiles and beams.
  const debrisMaterials: MaterialName[] = [wall, wall, 'concreteDark', 'concrete', 'brick'];
  for (let k = 0; k < 46; k++) {
    const angle = randomRange(random, -0.2, Math.PI + 0.2);
    const distance = randomRange(random, 3.5, 7.2);
    const size = randomRange(random, 0.18, 0.55);
    const chunk = new DodecahedronGeometry(size, 0);
    chunk.scale(
      randomRange(random, 0.8, 1.6),
      randomRange(random, 0.5, 0.9),
      randomRange(random, 0.8, 1.4),
    );
    b.add(
      debrisMaterials[k % debrisMaterials.length]!,
      chunk,
      [Math.cos(angle) * distance, size * 0.4, Math.sin(angle) * distance * 0.85],
      [random() * 3, random() * 3, random() * 3],
    );
  }
  for (let k = 0; k < 14; k++) {
    const angle = random() * Math.PI;
    const distance = randomRange(random, 3, 6.5);
    b.box(
      roofMaterial,
      [randomRange(random, 0.25, 0.5), 0.04, randomRange(random, 0.3, 0.45)],
      [Math.cos(angle) * distance, 0.05, Math.sin(angle) * distance],
      [randomRange(random, -0.3, 0.3), random() * 3, randomRange(random, -0.3, 0.3)],
    );
  }
  for (let k = 0; k < 4; k++) {
    b.box(
      'timber',
      [0.14, 0.18, randomRange(random, 2.5, 4)],
      [randomRange(random, -3, 3), 0.25, randomRange(random, 3.8, 5.2)],
      [randomRange(random, -0.2, 0.2), random() * 3, randomRange(random, 0.05, 0.3)],
    );
  }
  b.collider([4.8, 0.25, 4.2], [0, 0.25, 0]);
  return b.build();
}

/** Dynamic chunks of masonry in front of a ruin — the rover can shove them aside. */
function LooseMasonry({ variant }: { variant: number }) {
  const chunks = useMemo(() => {
    const random = createRandom(700 + variant);
    return Array.from({ length: 6 }, (_, k) => ({
      position: [randomRange(random, -3.5, 3.5), 0.45, randomRange(random, 4.6, 6.2)] as V3,
      rotation: [0, random() * Math.PI, 0] as V3,
      size: [
        randomRange(random, 0.5, 0.9),
        randomRange(random, 0.3, 0.5),
        randomRange(random, 0.4, 0.7),
      ] as V3,
      material: (k % 2 === 0 ? 'concrete' : WALLS[variant % WALLS.length]!) as MaterialName,
    }));
  }, [variant]);
  return (
    <>
      {chunks.map((c, i) => (
        <RigidBody
          key={i}
          type="dynamic"
          position={c.position}
          rotation={c.rotation}
          colliders="cuboid"
          mass={60 * c.size[0] * c.size[1] * c.size[2] * 8}
          linearDamping={0.4}
          angularDamping={0.6}
          friction={0.9}
        >
          <mesh material={getMaterial(c.material)} castShadow receiveShadow>
            <boxGeometry args={c.size} />
          </mesh>
        </RigidBody>
      ))}
    </>
  );
}

/**
 * Earthquake-collapsed house: the upper floor has pancaked onto the ground floor, broken walls and
 * the roof lie on top, rebar sticks out of the slab and rubble spills into the street.
 */
export function CollapsedHouse({ variant }: { variant: number }) {
  const model = useMemo(
    () => cached(`collapsed-${variant % 8}`, () => buildCollapsed(variant % 8)),
    [variant],
  );
  return (
    <>
      <StaticModel model={model} />
      <LooseMasonry variant={variant} />
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Log cabin
// ---------------------------------------------------------------------------------------------

function buildCabin(): BuiltModel {
  const b = new PartBuilder();
  const hx = 3.6;
  const hz = 2.6;
  const base = 0.5;
  const log = 0.17;
  const courses = 8;
  const course = log * 2;
  const wallTop = base + courses * course;

  b.box('stone', [hx * 2 + 0.3, base, hz * 2 + 0.3], [0, base / 2, 0]);
  // Interlocking round logs: long walls and end walls offset by half a log, ends crossing at the
  // corners and sticking out.
  for (let i = 0; i < courses; i++) {
    const y = base + log + i * course;
    for (const side of [-1, 1]) {
      b.cyl('bark', log, hx * 2 + 0.6, [0, y, side * hz], [0, 0, Math.PI / 2], 10);
      b.cyl('bark', log, hz * 2 + 0.6, [side * hx, y + log, 0], [Math.PI / 2, 0, 0], 10);
    }
  }
  b.collider([hx + 0.2, (wallTop - base) / 2, hz + 0.2], [0, (wallTop + base) / 2, 0]);

  // Plank gable ends.
  const pitch = 1.9;
  for (const side of [-1, 1]) {
    b.add(
      'timber',
      gableGeometry(hz * 2 + 0.3, pitch, 0.12),
      [side > 0 ? hx - 0.12 : -hx, wallTop, 0],
      [0, Math.PI / 2, 0],
    );
  }
  // Mossy slate roof with overhang.
  const overhang = 0.6;
  const run = hz + overhang;
  const drop = (pitch * run) / hz;
  const slope = Math.hypot(run, drop);
  const angle = Math.atan2(pitch, hz);
  for (const side of [-1, 1]) {
    const rot: V3 = [side * angle, 0, 0];
    const cy = wallTop + pitch - drop / 2 + 0.1;
    b.box('roofSlate', [hx * 2 + 1.2, 0.14, slope], [0, cy, (side * run) / 2], rot);
    b.collider([hx + 0.6, 0.07, slope / 2], [0, cy, (side * run) / 2], rot);
    b.box(
      'timber',
      [hx * 2 + 1.2, 0.2, 0.06],
      [0, wallTop + pitch - drop + 0.05, side * (run + 0.02)],
    );
  }
  b.cyl('timber', 0.12, hx * 2 + 1.2, [0, wallTop + pitch + 0.15, 0], [0, 0, Math.PI / 2], 8);

  // Front: door and lit windows, porch with posts, railing and steps.
  b.frame([0, 0, hz + log], [0, 0, 0], () => {
    door(b, -1.3, 'woodDark', base);
    windowUnit(b, 1.5, 1.9, 1.1, 0.9, null, true);
  });
  b.frame([hx + log, 0, 0], [0, Math.PI / 2, 0], () => windowUnit(b, 0, 1.9, 1.0, 0.9, null, true));
  b.frame([-hx - log, 0, 0], [0, -Math.PI / 2, 0], () =>
    windowUnit(b, 0.6, 1.9, 1.0, 0.9, null, true),
  );
  const porchZ = hz + 1.25;
  b.box('timber', [hx * 2, 0.12, 1.9], [0, base - 0.06, porchZ]);
  b.collider([hx, 0.12, 0.95], [0, base - 0.12, porchZ]);
  for (const x of [-hx + 0.15, -1.3 - 0.9, 1.3, hx - 0.15]) {
    b.box('timber', [0.16, 2.2, 0.16], [x, base + 1.1, porchZ + 0.8]);
  }
  for (const [from, to] of [
    [-hx + 0.15, -2.2],
    [-0.4, hx - 0.15],
  ] as const) {
    const mid = (from + to) / 2;
    const len = to - from;
    b.box('timber', [len, 0.08, 0.08], [mid, base + 0.95, porchZ + 0.8]);
    b.box('timber', [len, 0.06, 0.06], [mid, base + 0.45, porchZ + 0.8]);
    for (let k = 1; k < Math.floor(len / 0.35); k++) {
      b.box('timber', [0.05, 0.5, 0.05], [from + k * 0.35, base + 0.7, porchZ + 0.8]);
    }
  }
  b.box('timber', [1.6, 0.1, 0.35], [-1.3, base * 0.66, porchZ + 1.1]);
  b.box('timber', [1.6, 0.1, 0.35], [-1.3, base * 0.33, porchZ + 1.4]);
  // Porch roof.
  b.box('roofSlate', [hx * 2 + 0.4, 0.1, 2.1], [0, base + 2.35, porchZ + 0.1], [0.22, 0, 0]);

  // Stone chimney on the east gable.
  b.box(
    'stone',
    [0.8, wallTop + pitch + 1.2 - base, 0.8],
    [hx + 0.55, (wallTop + pitch + 1.2 + base) / 2, -0.6],
  );
  b.collider(
    [0.4, (wallTop + pitch + 1.2 - base) / 2, 0.4],
    [hx + 0.55, (wallTop + pitch + 1.2 + base) / 2, -0.6],
  );
  // Firewood stack by the wall.
  for (let k = 0; k < 18; k++) {
    b.cyl(
      'bark',
      0.08,
      0.5,
      [-hx - 0.55, base + 0.1 + Math.floor(k / 6) * 0.16, -1.4 + (k % 6) * 0.17],
      [Math.PI / 2, 0, 0],
      7,
    );
  }
  return b.build();
}

/** Log cabin in the forest clearing. Origin at ground level, porch facing +Z. */
export function Cabin() {
  const model = useMemo(() => cached('cabin', buildCabin), []);
  return <StaticModel model={model} />;
}
