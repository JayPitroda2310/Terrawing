import { RoundedBox } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, type RapierRigidBody, RigidBody } from '@react-three/rapier';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import {
  BackSide,
  CanvasTexture,
  DoubleSide,
  BufferAttribute,
  BufferGeometry,
  ExtrudeGeometry,
  Material,
  Path,
  type Group,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type PointLight,
  Quaternion,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three';
import type { GameSession } from '@/game/core/GameSession';
import { applyWear, createWearUniforms } from '@/game/terrawing/vehicleWear';
import { SurvivorModel } from './SurvivorModel';
import {
  AMBULANCE_REAR,
  type AmbulancePose,
  ambulanceAt,
  BOX_FLOOR,
  doorOpening,
  type HandoverPlan,
  type HandoverUnit,
} from './handover';

const YELLOW = '#f4cf0c';
const GREEN = '#138a3a';
const WHEEL_RADIUS = 0.38;
const FRONT_AXLE = 2.45;
const REAR_AXLE = -1.75;
const TRACK = 1.9;
/** Box body (patient compartment): floor from the handover plan, roof, extent along Z. */
const BOX = { width: 2.3, top: 3.0, front: 1.25, rear: -AMBULANCE_REAR };
const BOX_HEIGHT = BOX.top - BOX_FLOOR;
const BOX_LENGTH = BOX.front - BOX.rear;
const CAB_WIDTH = 2.0;
const UP = new Vector3(0, 1, 0);

function canvas(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const texture = new CanvasTexture(c);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Battenburg: two rows of retro-reflective yellow / green blocks. */
function battenburg(ctx: CanvasRenderingContext2D, y: number, width: number, height: number) {
  const size = height / 2;
  const block = size * 1.6;
  for (let row = 0; row < 2; row++)
    for (let i = 0; i * block < width; i++) {
      ctx.fillStyle = (i + row) % 2 === 0 ? YELLOW : GREEN;
      ctx.fillRect(i * block, y + row * size, block + 0.5, size + 0.5);
    }
}

function starOfLife(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#1f5fb8';
  for (let k = 0; k < 3; k++) {
    ctx.rotate(Math.PI / 3);
    ctx.fillRect(-r * 0.2, -r, r * 0.4, r * 2);
  }
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = r * 0.07;
  ctx.beginPath();
  ctx.moveTo(0, r * 0.65);
  ctx.lineTo(0, -r * 0.7);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.45);
  ctx.bezierCurveTo(r * 0.25, -r * 0.35, -r * 0.25, -r * 0.15, 0, 0);
  ctx.bezierCurveTo(r * 0.25, r * 0.15, -r * 0.25, r * 0.3, 0, r * 0.45);
  ctx.stroke();
  ctx.restore();
}

/** Canvas px per metre on the box sides. */
const PX = 220;

function useLiveries() {
  return useMemo(() => {
    const W = Math.round(BOX_LENGTH * PX);
    const H = Math.round(BOX_HEIGHT * PX);
    // Box sides. `cabOnRight`: which end of the canvas is the cab end (the -X side reads with
    // the front on the viewer's right, the +X side with it on the left).
    const drawSide = (cabOnRight: boolean) =>
      canvas(W, H, (ctx) => {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#fdfdfb');
        g.addColorStop(1, '#eceeec');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        const my = (m: number) => H - (m - BOX_FLOOR) * PX; // height above ground → canvas y
        // Distance from the cab end (m) → canvas x; `span` extends away from the cab.
        const mx = (m: number, span = 0) => (cabOnRight ? W - (m + span) * PX : m * PX);
        battenburg(ctx, my(1.66), W, 0.6 * PX);
        ctx.fillStyle = GREEN;
        ctx.fillRect(0, my(1.76), W, 0.05 * PX);
        ctx.fillStyle = '#1f5fb8';
        ctx.fillRect(0, my(2.9), W, 0.035 * PX);
        // Side entry door behind the cab: shut-lines, window, grab handle.
        ctx.strokeStyle = '#9aa2a8';
        ctx.lineWidth = 3;
        ctx.strokeRect(mx(0.5, 1.05), my(2.82), 1.05 * PX, (2.82 - BOX_FLOOR - 0.05) * PX);
        ctx.fillStyle = '#20282e';
        ctx.fillRect(mx(0.62, 0.8), my(2.64), 0.8 * PX, 0.48 * PX);
        ctx.fillStyle = '#5d666c';
        ctx.fillRect(mx(1.35, 0.1), my(1.98), 0.1 * PX, 0.04 * PX);
        const textX = mx(2.72);
        ctx.fillStyle = GREEN;
        ctx.font = `bold ${0.3 * PX}px "Arial Black", Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('AMBULANCE', textX, my(2.25));
        ctx.fillStyle = '#1f5fb8';
        ctx.font = `bold ${0.12 * PX}px Arial, sans-serif`;
        ctx.fillText('EMERGENCY AMBULANCE SERVICE', textX, my(1.95));
        starOfLife(ctx, mx(BOX_LENGTH - 0.42), my(2.35), 0.26 * PX);
        ctx.strokeStyle = '#b5bcc1';
        ctx.lineWidth = 2;
        ctx.strokeRect(mx(BOX_LENGTH - 1.45, 1.2), my(1.0), 1.2 * PX, 0.12 * PX);
      });
    const side = drawSide(false);
    const sideMirror = drawSide(true);

    // Cab sides: extrude-cap UV = (z, y) metres; canvas spans z 1.0…3.4, y 0.4…2.5.
    const cab = canvas(480, 420, (ctx) => {
      ctx.fillStyle = '#fbfbf9';
      ctx.fillRect(0, 0, 480, 420);
      const cy = (m: number) => (2.5 - m) * 200;
      const cz = (m: number) => (m - 1.0) * 200;
      battenburg(ctx, cy(1.3), 480, 0.38 * 200);
      ctx.fillStyle = GREEN;
      ctx.fillRect(0, cy(1.36), 480, 8);
      ctx.strokeStyle = '#9aa2a8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cz(1.12), cy(2.3));
      ctx.lineTo(cz(1.12), cy(0.62));
      ctx.moveTo(cz(2.24), cy(1.42));
      ctx.lineTo(cz(2.24), cy(0.62));
      ctx.stroke();
      ctx.fillStyle = '#4a5156';
      ctx.fillRect(cz(1.24), cy(1.52), 26, 7);
    });
    cab.repeat.set(1 / 2.4, 1 / 2.1);
    cab.offset.set(-1.0 / 2.4, -0.4 / 2.1);

    const rear = canvas(512, 600, (ctx) => {
      ctx.fillStyle = '#f7f7f5';
      ctx.fillRect(0, 0, 512, 600);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 300, 512, 300);
      ctx.clip();
      for (let i = -10; i < 14; i++) {
        ctx.fillStyle = i % 2 === 0 ? '#d4231b' : YELLOW;
        ctx.beginPath();
        ctx.moveTo(i * 56, 600);
        ctx.lineTo(i * 56 + 56, 600);
        ctx.lineTo(i * 56 + 56 + 300, 300);
        ctx.lineTo(i * 56 + 300, 300);
        ctx.fill();
      }
      ctx.restore();
      ctx.fillStyle = '#1b2227';
      ctx.fillRect(56, 60, 400, 190);
    });
    const plate = (bg: string) =>
      canvas(256, 56, (ctx) => {
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, 256, 56);
        ctx.fillStyle = '#111';
        ctx.font = 'bold 40px "Arial Narrow", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('RX24 AMB', 128, 44);
      });
    return {
      side,
      sideMirror,
      cab,
      rear,
      frontPlate: plate('#f4f4f0'),
      rearPlate: plate('#f2c50f'),
    };
  }, []);
}

function useAmbulanceMaterials() {
  const liveries = useLiveries();
  return useMemo(() => {
    const paint = (map?: CanvasTexture) =>
      new MeshPhysicalMaterial({
        color: '#ffffff',
        roughness: 0.28,
        metalness: 0.05,
        clearcoat: 1,
        clearcoatRoughness: 0.12,
        ...(map ? { map } : {}),
      });
    const lamp = (color: string, emissive: string, intensity = 0) =>
      new MeshStandardMaterial({ color, emissive, emissiveIntensity: intensity, roughness: 0.2 });
    const materials = {
      body: paint(),
      side: paint(liveries.side),
      sideMirror: paint(liveries.sideMirror),
      cab: paint(liveries.cab),
      rear: paint(liveries.rear),
      frontPlate: new MeshStandardMaterial({ map: liveries.frontPlate, roughness: 0.5 }),
      rearPlate: new MeshStandardMaterial({ map: liveries.rearPlate, roughness: 0.5 }),
      interior: new MeshStandardMaterial({ color: '#dfe3e6', roughness: 0.7, side: BackSide }),
      floor: new MeshStandardMaterial({ color: '#3a4046', roughness: 0.9 }),
      cabinet: new MeshStandardMaterial({ color: '#c4ccd2', roughness: 0.5 }),
      plastic: new MeshStandardMaterial({ color: '#1d2023', roughness: 0.75 }),
      chassis: new MeshStandardMaterial({ color: '#15171a', roughness: 0.85 }),
      chrome: new MeshStandardMaterial({ color: '#d0d4d8', roughness: 0.18, metalness: 1 }),
      tyre: new MeshStandardMaterial({ color: '#151515', roughness: 0.92 }),
      rim: new MeshStandardMaterial({ color: '#b7bcc0', roughness: 0.35, metalness: 0.8 }),
      glass: new MeshPhysicalMaterial({
        color: '#0d1316',
        roughness: 0.04,
        metalness: 0.2,
        clearcoat: 1,
        side: DoubleSide,
      }),
      /** Side windows: tinted but see-through, so the cab and crew show. */
      window: new MeshPhysicalMaterial({
        color: '#1a2429',
        roughness: 0.03,
        metalness: 0.1,
        clearcoat: 1,
        transparent: true,
        opacity: 0.38,
        side: DoubleSide,
        depthWrite: false,
      }),
      cabin: new MeshStandardMaterial({ color: '#23272b', roughness: 0.85 }),
      seat: new MeshStandardMaterial({ color: '#2f3438', roughness: 0.9 }),
      headlight: lamp('#f4f6f8', '#fff3dc', 1.6),
      indicator: lamp('#6a4300', '#ffa21a', 0.2),
      tail: lamp('#4a0806', '#ff1a0c', 0.7),
      blueA: lamp('#10245e', '#2f6dff'),
      blueB: lamp('#10245e', '#2f6dff'),
      white: lamp('#ffffff', '#ffffff', 0.6),
      ceiling: lamp('#ffffff', '#f4f8ff', 1.2),
    };
    // Road dust and mud from the ground up, and a wet sheen in rain, like TerraWing.
    const wear = createWearUniforms();
    for (const [name, mud] of [
      ['body', 0.4],
      ['side', 0.35],
      ['sideMirror', 0.35],
      ['cab', 0.4],
      ['rear', 0.45],
      ['plastic', 0.55],
      ['chassis', 0.8],
      ['tyre', 0.7],
      ['rim', 0.5],
    ] as const)
      applyWear(materials[name], wear, { mud, grain: 0.8, variation: 0.05 });
    return { ...materials, wear };
  }, [liveries]);
}

type Materials = ReturnType<typeof useAmbulanceMaterials>;

/** Van cab side profile (z forward, y up) extruded across the cab, front wheel arch cut out. */
function useCabGeometry() {
  return useMemo(() => {
    const s = new Shape();
    s.moveTo(1.05, 0.52);
    s.lineTo(FRONT_AXLE - 0.47, 0.52);
    s.absarc(FRONT_AXLE, 0.44, 0.47, Math.PI - 0.17, 0.17, true);
    s.lineTo(3.12, 0.52);
    s.quadraticCurveTo(3.34, 0.54, 3.35, 0.78);
    s.lineTo(3.33, 1.0);
    s.quadraticCurveTo(3.3, 1.12, 3.12, 1.16);
    s.quadraticCurveTo(2.85, 1.24, 2.62, 1.34);
    s.lineTo(1.98, 2.3);
    s.quadraticCurveTo(1.9, 2.42, 1.72, 2.44);
    s.lineTo(1.05, 2.44);
    s.lineTo(1.05, 0.52);
    // Door window openings: see into the cab (and through it, as in a real van).
    const opening = new Path();
    opening.moveTo(1.22, 1.46);
    opening.lineTo(1.22, 2.2);
    opening.lineTo(1.97, 2.2);
    opening.lineTo(2.44, 1.46);
    opening.lineTo(1.22, 1.46);
    s.holes.push(opening);
    const depth = CAB_WIDTH - 0.1;
    const geometry = new ExtrudeGeometry(s, {
      depth,
      bevelEnabled: true,
      bevelThickness: 0.05,
      bevelSize: 0.05,
      bevelSegments: 4,
      curveSegments: 20,
    });
    const cabGeometry = splitWindowReveals(geometry);
    geometry.dispose();
    cabGeometry.rotateY(-Math.PI / 2);
    cabGeometry.translate(depth / 2, 0, 0);
    cabGeometry.computeVertexNormals();
    // Door glass behind the A-pillar.
    const win = new Shape();
    win.moveTo(1.22, 1.46);
    win.lineTo(2.44, 1.46);
    win.lineTo(1.97, 2.2);
    win.lineTo(1.22, 2.2);
    win.lineTo(1.22, 1.46);
    const window = new ShapeGeometry(win);
    window.rotateY(-Math.PI / 2);
    // Side skirts under the patient compartment, cut round the rear wheels.
    const skirt = new Shape();
    const bottom = 0.44;
    const archR = WHEEL_RADIUS + 0.12;
    const lift = Math.asin(Math.min(1, (bottom - WHEEL_RADIUS) / archR));
    skirt.moveTo(BOX.rear + 0.05, bottom);
    skirt.lineTo(REAR_AXLE - Math.cos(lift) * archR, bottom);
    skirt.absarc(REAR_AXLE, WHEEL_RADIUS, archR, Math.PI - lift, lift, true);
    skirt.lineTo(BOX.front - 0.1, bottom);
    skirt.lineTo(BOX.front - 0.1, BOX_FLOOR + 0.02);
    skirt.lineTo(BOX.rear + 0.05, BOX_FLOOR + 0.02);
    skirt.lineTo(BOX.rear + 0.05, bottom);
    const skirtGeometry = new ShapeGeometry(skirt, 12);
    skirtGeometry.rotateY(-Math.PI / 2);
    return { geometry: cabGeometry, window, skirt: skirtGeometry };
  }, []);
}

/**
 * Re-groups an extruded cab so the walls of the window openings get their own (dark interior)
 * material: group 0 caps (livery), 1 outer walls (paint), 2 window reveals. Reveal walls face
 * the opening, i.e. their normal points toward the window's centre.
 */
function splitWindowReveals(source: ExtrudeGeometry): BufferGeometry {
  const geometry = source.index ? source.toNonIndexed() : source.clone();
  const position = geometry.getAttribute('position') as BufferAttribute;
  const normal = geometry.getAttribute('normal') as BufferAttribute;
  const uv = geometry.getAttribute('uv') as BufferAttribute;
  const caps = source.groups.find((g) => g.materialIndex === 0);
  const walls = source.groups.find((g) => g.materialIndex === 1);
  if (!caps || !walls) return geometry;
  const centre = { x: 1.72, y: 1.83 };
  const inWindow = (x: number, y: number) => x > 1.12 && x < 2.55 && y > 1.36 && y < 2.3;
  const order: number[] = [];
  const reveal: number[] = [];
  for (let v = caps.start; v < caps.start + caps.count; v += 3) order.push(v);
  const capsCount = order.length * 3;
  for (let v = walls.start; v < walls.start + walls.count; v += 3) {
    let cx = 0;
    let cy = 0;
    let nx = 0;
    let ny = 0;
    for (let k = 0; k < 3; k++) {
      cx += position.getX(v + k) / 3;
      cy += position.getY(v + k) / 3;
      nx += normal.getX(v + k);
      ny += normal.getY(v + k);
    }
    const facesOpening = nx * (centre.x - cx) + ny * (centre.y - cy) > 0;
    (inWindow(cx, cy) && facesOpening ? reveal : order).push(v);
  }
  const wallsCount = order.length * 3 - capsCount;
  order.push(...reveal);
  const out = new BufferGeometry();
  for (const [name, attr] of [
    ['position', position],
    ['normal', normal],
    ['uv', uv],
  ] as const) {
    const size = attr.itemSize;
    const data = new Float32Array(order.length * 3 * size);
    order.forEach((v, t) => {
      for (let k = 0; k < 3; k++)
        for (let c = 0; c < size; c++)
          data[(t * 3 + k) * size + c] = attr.array[(v + k) * size + c]!;
    });
    out.setAttribute(name, new BufferAttribute(data, size));
  }
  out.addGroup(0, capsCount, 0);
  out.addGroup(capsCount, wallsCount, 1);
  out.addGroup(capsCount + wallsCount, reveal.length * 3, 2);
  geometry.dispose();
  return out;
}

function Wheel({ materials, dual }: { materials: Materials; dual?: boolean }) {
  const width = dual ? 0.46 : 0.24;
  return (
    <group rotation={[0, 0, Math.PI / 2]}>
      <mesh material={materials.tyre} castShadow>
        <cylinderGeometry args={[WHEEL_RADIUS, WHEEL_RADIUS, width, 28]} />
      </mesh>
      <mesh material={materials.rim} position={[0, width / 2 + 0.005, 0]}>
        <cylinderGeometry args={[0.22, 0.24, 0.03, 20]} />
      </mesh>
      {Array.from({ length: 6 }, (_, i) => (
        <mesh
          key={i}
          material={materials.plastic}
          position={[
            Math.cos((i / 6) * Math.PI * 2) * 0.13,
            width / 2 + 0.024,
            Math.sin((i / 6) * Math.PI * 2) * 0.13,
          ]}
        >
          <cylinderGeometry args={[0.018, 0.018, 0.02, 6]} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Front-line UK-style box ambulance on a van cab: shaped cab with raked windscreen, clearcoat
 * livery with Battenburg blocks, full blue-light system (roof bar, grille, side and corner
 * flashers, wig-wag headlights), lit treatment compartment behind opening rear doors, steered
 * and rolling wheels, and body pitch/roll on its springs. Drives the handover route kinematically.
 */
export function Ambulance({
  session,
  plan,
  unit,
}: {
  session: GameSession;
  plan: HandoverPlan;
  unit: HandoverUnit;
}) {
  const m = useAmbulanceMaterials();
  const cab = useCabGeometry();
  const cabMaterials = useMemo<Material[]>(() => [m.cab, m.body, m.cabin], [m]);
  const passenger = useRef<Group>(null);
  const body = useRef<RapierRigidBody>(null);
  const tilt = useRef<Group>(null);
  const wheels = useRef<(Group | null)[]>([]);
  const steer = useRef<(Group | null)[]>([]);
  const doors = useRef<(Group | null)[]>([]);
  const beacons = useRef<(PointLight | null)[]>([]);
  const pose = useMemo<AmbulancePose>(
    () => ({ x: 0, z: 0, yaw: 0, speed: 0, accel: 0, s: 0, visible: false }),
    [],
  );
  const ahead = useMemo<AmbulancePose>(() => ({ ...pose }), [pose]);
  const quat = useMemo(() => new Quaternion(), []);
  const smooth = useMemo(() => ({ pitch: 0 }), []);

  useEffect(
    () => () => {
      for (const material of Object.values(m)) if (material instanceof Material) material.dispose();
      cab.geometry.dispose();
      cab.window.dispose();
      cab.skirt.dispose();
    },
    [m, cab],
  );

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const t = session.handoverTime;
    ambulanceAt(plan, unit, t, pose);
    const terrain = session.terrain;
    const fx = Math.sin(pose.yaw);
    const fz = Math.cos(pose.yaw);
    const hf = terrain.heightAt(pose.x + fx * FRONT_AXLE, pose.z + fz * FRONT_AXLE);
    const hr = terrain.heightAt(pose.x + fx * REAR_AXLE, pose.z + fz * REAR_AXLE);
    const hl = terrain.heightAt(pose.x + fz * TRACK * 0.5, pose.z - fx * TRACK * 0.5);
    const hrt = terrain.heightAt(pose.x - fz * TRACK * 0.5, pose.z + fx * TRACK * 0.5);
    const y = (hf + hr + hl + hrt) / 4;
    m.wear.rootY.value = y;
    m.wear.wetness.value = session.vehicle.state.wetness;
    // The doctor rides in the passenger seat, and is out of it while helping at TerraWing.
    if (passenger.current) {
      const keys = unit.doctor;
      passenger.current.visible = !(
        unit.planned &&
        keys.length > 0 &&
        t >= keys[0]!.t &&
        t < keys[keys.length - 1]!.t
      );
    }
    body.current?.setNextKinematicTranslation({ x: pose.x, y, z: pose.z });
    body.current?.setNextKinematicRotation(quat.setFromAxisAngle(UP, pose.yaw));

    // Body on its springs: terrain slope plus nose dive under braking / squat pulling away.
    smooth.pitch += (pose.accel * 0.011 - smooth.pitch) * Math.min(1, dt * 6);
    if (tilt.current) {
      tilt.current.rotation.x = -Math.atan2(hf - hr, FRONT_AXLE - REAR_AXLE) + smooth.pitch;
      tilt.current.rotation.z = Math.atan2(hl - hrt, TRACK) * 0.9;
      tilt.current.visible = pose.visible;
    }
    const spin = pose.s / WHEEL_RADIUS;
    for (const wheel of wheels.current) if (wheel) wheel.rotation.x = spin;
    ambulanceAt(plan, unit, t + 0.35, ahead);
    let turn = ahead.yaw - pose.yaw;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    const steerAngle = Math.max(-0.55, Math.min(0.55, turn * (pose.speed > 0.3 ? 2.2 : 0)));
    for (const s of steer.current) if (s) s.rotation.y = steerAngle;

    const open = doorOpening(unit, t);
    doors.current.forEach((door, i) => {
      if (door) door.rotation.y = (i === 0 ? 1 : -1) * open * 1.85;
    });

    // Blue lights: alternating quad flash, left bank then right bank; wig-wag headlights.
    const cycle = (clock.elapsedTime * 1.6) % 1;
    const quad = (phase: number) => {
      const p = (cycle - phase + 1) % 1;
      return p < 0.4 && p % 0.1 < 0.055 ? 1 : 0;
    };
    const a = quad(0);
    const b = quad(0.5);
    // On standby at the base the vehicle is switched off: no beacons, no headlights.
    const live = t >= unit.start ? 1 : 0;
    m.blueA.emissiveIntensity = a * 10 * live;
    m.blueB.emissiveIntensity = b * 10 * live;
    if (beacons.current[0]) beacons.current[0].intensity = a * 60 * live;
    if (beacons.current[1]) beacons.current[1].intensity = b * 60 * live;
    m.headlight.emissiveIntensity = live
      ? pose.speed > 0.5
        ? cycle < 0.5
          ? 3
          : 0.5
        : 1.6
      : 0.05;
    m.tail.emissiveIntensity = live ? 0.7 : 0.08;
    m.ceiling.emissiveIntensity = 0.4 + open * 1.2;
  });

  const boxMidZ = (BOX.front + BOX.rear) / 2;
  const boxMidY = BOX_FLOOR + BOX_HEIGHT / 2;
  const sides = [-1, 1] as const;
  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[0, -200, 0]}>
      <CuboidCollider args={[1.15, 1.5, 3.35]} position={[0, 1.55, 0]} />
      <group ref={tilt} visible={false}>
        {/* Chassis: ladder frame, fuel tank, rear step. */}
        <mesh material={m.chassis} position={[0, 0.62, -0.4]}>
          <boxGeometry args={[1.2, 0.2, 5.4]} />
        </mesh>
        <mesh material={m.chassis} position={[0.75, 0.62, 0.3]}>
          <boxGeometry args={[0.35, 0.3, 0.9]} />
        </mesh>
        <RoundedBox
          args={[2.0, 0.12, 0.34]}
          radius={0.04}
          position={[0, 0.5, BOX.rear - 0.14]}
          material={m.plastic}
        />
        {/* Cab. */}
        <mesh geometry={cab.geometry} material={cabMaterials} castShadow receiveShadow />
        {sides.map((sx) => (
          <mesh
            key={`w${sx}`}
            geometry={cab.window}
            material={m.window}
            position={[sx * (CAB_WIDTH / 2 + 0.002), 0, 0]}
          />
        ))}
        <mesh material={m.glass} position={[0, 1.83, 2.33]} rotation={[-0.585, 0, 0]}>
          <planeGeometry args={[CAB_WIDTH - 0.16, 1.1]} />
        </mesh>
        {/* Cab interior seen through the side windows: dashboard, wheel, seats, crew. */}
        <mesh material={m.cabin} position={[0, 1.38, 2.36]} rotation={[-0.35, 0, 0]}>
          <boxGeometry args={[CAB_WIDTH - 0.2, 0.2, 0.45]} />
        </mesh>
        <mesh material={m.plastic} position={[-0.45, 1.62, 2.12]} rotation={[-1.05, 0, 0]}>
          <torusGeometry args={[0.19, 0.022, 8, 24]} />
        </mesh>
        {[-0.45, 0.45].map((x) => (
          <group key={`seat${x}`} position={[x, 0, 1.42]}>
            <RoundedBox
              args={[0.5, 0.14, 0.5]}
              radius={0.05}
              position={[0, 1.12, 0.15]}
              material={m.seat}
            />
            <RoundedBox
              args={[0.5, 0.72, 0.12]}
              radius={0.05}
              position={[0, 1.52, -0.12]}
              rotation={[-0.14, 0, 0]}
              material={m.seat}
            />
            <RoundedBox
              args={[0.28, 0.2, 0.1]}
              radius={0.04}
              position={[0, 2.02, -0.2]}
              material={m.seat}
            />
          </group>
        ))}
        <Suspense fallback={null}>
          {/* Driver (right-hand drive) in paramedic green; the doctor rides alongside. */}
          <group position={[-0.45, 0.72, 1.5]}>
            <SurvivorModel pose="sitting" jacket="#2f7a44" isCalm={() => true} />
          </group>
          <group ref={passenger} position={[0.45, 0.72, 1.5]}>
            <SurvivorModel pose="sitting" jacket="#f1f2ef" isCalm={() => true} />
          </group>
        </Suspense>
        {/* Wipers parked along the base of the windscreen. */}
        {[-0.42, 0.34].map((x) => (
          <mesh
            key={`wiper${x}`}
            material={m.plastic}
            position={[x, 1.42, 2.6]}
            rotation={[-0.585, 0, 0.08]}
          >
            <boxGeometry args={[0.62, 0.018, 0.02]} />
          </mesh>
        ))}
        {/* Side skirts round the rear wheels, arch trims and mud flaps. */}
        {sides.map((sx) => (
          <group key={`skirt${sx}`}>
            <mesh
              geometry={cab.skirt}
              material={m.body}
              position={[sx * (BOX.width / 2 + 0.001), 0, 0]}
              castShadow
            />
            <mesh
              material={m.plastic}
              position={[sx * (BOX.width / 2 + 0.02), WHEEL_RADIUS, REAR_AXLE]}
              rotation={[0, (sx * Math.PI) / 2, 0]}
            >
              <torusGeometry args={[WHEEL_RADIUS + 0.12, 0.03, 6, 24, Math.PI]} />
            </mesh>
            <mesh material={m.plastic} position={[sx * 0.98, 0.36, REAR_AXLE - 0.62]}>
              <boxGeometry args={[0.46, 0.4, 0.02]} />
            </mesh>
          </group>
        ))}
        {/* Front: grille, headlight clusters, flashers, bumper, fogs, plate, mirrors. */}
        <RoundedBox
          args={[0.98, 0.3, 0.06]}
          radius={0.03}
          position={[0, 0.94, 3.35]}
          material={m.plastic}
        />
        {[0.86, 0.94, 1.02].map((gy) => (
          <mesh key={gy} material={m.chrome} position={[0, gy, 3.385]}>
            <boxGeometry args={[0.9, 0.018, 0.01]} />
          </mesh>
        ))}
        {sides.map((sx) => (
          <group key={`front${sx}`}>
            <RoundedBox
              args={[0.4, 0.17, 0.1]}
              radius={0.04}
              position={[sx * 0.72, 1.02, 3.3]}
              rotation={[0, sx * 0.22, 0]}
              material={m.headlight}
            />
            <mesh
              material={m.white}
              position={[sx * 0.72, 1.11, 3.33]}
              rotation={[0, sx * 0.22, 0]}
            >
              <boxGeometry args={[0.34, 0.016, 0.012]} />
            </mesh>
            <mesh material={m.indicator} position={[sx * 0.93, 1.0, 3.26]}>
              <boxGeometry args={[0.08, 0.1, 0.06]} />
            </mesh>
            <mesh material={sx < 0 ? m.blueA : m.blueB} position={[sx * 0.3, 0.94, 3.39]}>
              <boxGeometry args={[0.14, 0.05, 0.02]} />
            </mesh>
            <mesh
              material={m.white}
              position={[sx * 0.72, 0.64, 3.43]}
              rotation={[Math.PI / 2, 0, 0]}
            >
              <cylinderGeometry args={[0.05, 0.05, 0.02, 14]} />
            </mesh>
            <mesh material={m.plastic} position={[sx * 1.1, 1.72, 2.36]}>
              <boxGeometry args={[0.22, 0.03, 0.03]} />
            </mesh>
            <RoundedBox
              args={[0.07, 0.38, 0.2]}
              radius={0.03}
              position={[sx * 1.24, 1.8, 2.34]}
              material={m.plastic}
            />
            <mesh
              material={m.plastic}
              position={[sx * (CAB_WIDTH / 2 + 0.03), 0.44, FRONT_AXLE]}
              rotation={[0, (sx * Math.PI) / 2, 0]}
            >
              <torusGeometry args={[0.49, 0.035, 6, 20, Math.PI * 0.9]} />
            </mesh>
          </group>
        ))}
        <RoundedBox
          args={[2.1, 0.28, 0.2]}
          radius={0.06}
          position={[0, 0.66, 3.32]}
          material={m.plastic}
          castShadow
        />
        <mesh material={m.frontPlate} position={[0, 0.66, 3.425]}>
          <planeGeometry args={[0.52, 0.11]} />
        </mesh>
        {/* Patient compartment: panels, so the rear opens into the lit interior. */}
        <group position={[0, boxMidY, boxMidZ]}>
          {sides.map((sx) => (
            <group key={sx} position={[(sx * BOX.width) / 2, 0, 0]}>
              <mesh material={m.body} castShadow receiveShadow>
                <boxGeometry args={[0.05, BOX_HEIGHT, BOX_LENGTH]} />
              </mesh>
              <mesh
                material={sx > 0 ? m.side : m.sideMirror}
                position={[sx * 0.026, 0, 0]}
                rotation={[0, (sx * Math.PI) / 2, 0]}
              >
                <planeGeometry args={[BOX_LENGTH, BOX_HEIGHT]} />
              </mesh>
              <mesh
                material={sx < 0 ? m.blueA : m.blueB}
                position={[sx * 0.03, BOX_HEIGHT / 2 - 0.35, -0.2]}
              >
                <boxGeometry args={[0.02, 0.08, 0.3]} />
              </mesh>
              <mesh material={m.white} position={[sx * 0.03, BOX_HEIGHT / 2 - 0.2, 0.9]}>
                <boxGeometry args={[0.02, 0.07, 0.34]} />
              </mesh>
            </group>
          ))}
          {sides.flatMap((sx) =>
            [1, -1].map((sz) => (
              <mesh
                key={`c${sx}${sz}`}
                material={m.body}
                position={[(sx * BOX.width) / 2, 0, (sz * BOX_LENGTH) / 2]}
              >
                <cylinderGeometry args={[0.05, 0.05, BOX_HEIGHT, 10]} />
              </mesh>
            )),
          )}
          <RoundedBox
            args={[BOX.width + 0.08, 0.12, BOX_LENGTH + 0.08]}
            radius={0.05}
            position={[0, BOX_HEIGHT / 2, 0]}
            material={m.body}
            castShadow
          />
          <mesh material={m.body} position={[0, 0, BOX_LENGTH / 2]}>
            <boxGeometry args={[BOX.width, BOX_HEIGHT, 0.05]} />
          </mesh>
          <mesh material={m.floor} position={[0, -BOX_HEIGHT / 2 + 0.03, 0]}>
            <boxGeometry args={[BOX.width - 0.06, 0.06, BOX_LENGTH]} />
          </mesh>
          <RoundedBox
            args={[0.9, 0.2, 1.0]}
            radius={0.06}
            position={[0, BOX_HEIGHT / 2 + 0.15, -0.9]}
            material={m.body}
          />
          {[-0.5, 0.4].map((z) => (
            <mesh key={z} material={m.plastic} position={[0.7, BOX_HEIGHT / 2 + 0.3, z]}>
              <cylinderGeometry args={[0.008, 0.012, 0.5, 6]} />
            </mesh>
          ))}
          {/* Interior: lining, ceiling light, cabinets, attendant seat, oxygen, stretcher rails. */}
          <mesh material={m.interior}>
            <boxGeometry args={[BOX.width - 0.12, BOX_HEIGHT - 0.12, BOX_LENGTH - 0.1]} />
          </mesh>
          <mesh material={m.ceiling} position={[0, BOX_HEIGHT / 2 - 0.08, 0]}>
            <boxGeometry args={[0.5, 0.02, 2.4]} />
          </mesh>
          <mesh material={m.cabinet} position={[-BOX.width / 2 + 0.3, 0.2, 0.4]}>
            <boxGeometry args={[0.42, 1.2, 2.6]} />
          </mesh>
          <mesh material={m.plastic} position={[BOX.width / 2 - 0.32, -0.6, 0.3]}>
            <boxGeometry args={[0.45, 0.45, 1.8]} />
          </mesh>
          <mesh material={m.chrome} position={[BOX.width / 2 - 0.2, 0, 1.5]}>
            <cylinderGeometry args={[0.09, 0.09, 1.0, 12]} />
          </mesh>
          {[-0.28, 0.28].map((x) => (
            <mesh key={x} material={m.chrome} position={[x, -BOX_HEIGHT / 2 + 0.09, 0]}>
              <boxGeometry args={[0.04, 0.04, BOX_LENGTH - 0.3]} />
            </mesh>
          ))}
          {sides.map((sx) => (
            <group
              key={`rear${sx}`}
              position={[(sx * BOX.width) / 2 - sx * 0.12, 0, -BOX_LENGTH / 2 - 0.03]}
            >
              <mesh material={m.tail} position={[0, -BOX_HEIGHT / 2 + 0.45, 0]}>
                <boxGeometry args={[0.16, 0.5, 0.03]} />
              </mesh>
              <mesh material={m.indicator} position={[0, -BOX_HEIGHT / 2 + 0.78, 0]}>
                <boxGeometry args={[0.16, 0.12, 0.03]} />
              </mesh>
              <mesh material={sx < 0 ? m.blueA : m.blueB} position={[0, BOX_HEIGHT / 2 - 0.12, 0]}>
                <boxGeometry args={[0.18, 0.14, 0.04]} />
              </mesh>
            </group>
          ))}
        </group>
        {/* Rear doors, hinged at the outer edges. */}
        {[0, 1].map((i) => {
          const sx = i === 0 ? -1 : 1;
          return (
            <group
              key={i}
              ref={(g) => {
                doors.current[i] = g;
              }}
              position={[(sx * BOX.width) / 2, boxMidY - 0.03, BOX.rear]}
            >
              <mesh material={m.body} position={[(-sx * BOX.width) / 4, 0, -0.02]} castShadow>
                <boxGeometry args={[BOX.width / 2 - 0.02, BOX_HEIGHT - 0.14, 0.05]} />
              </mesh>
              <mesh
                material={m.rear}
                position={[(-sx * BOX.width) / 4, 0, -0.047]}
                rotation={[0, Math.PI, 0]}
              >
                <planeGeometry args={[BOX.width / 2 - 0.05, BOX_HEIGHT - 0.18]} />
              </mesh>
              <mesh material={m.chrome} position={[-sx * (BOX.width / 2 - 0.12), -0.15, -0.06]}>
                <boxGeometry args={[0.03, 0.22, 0.03]} />
              </mesh>
            </group>
          );
        })}
        <mesh
          material={m.rearPlate}
          position={[0, 0.66, BOX.rear - 0.33]}
          rotation={[0, Math.PI, 0]}
        >
          <planeGeometry args={[0.52, 0.11]} />
        </mesh>
        {/* Light bar across the front of the box roof. */}
        <group position={[0, BOX.top + 0.08, BOX.front - 0.12]}>
          <RoundedBox args={[2.1, 0.1, 0.32]} radius={0.04} material={m.plastic} />
          {[-0.85, -0.6, -0.35, 0.35, 0.6, 0.85].map((x) => (
            <RoundedBox
              key={x}
              args={[0.22, 0.09, 0.28]}
              radius={0.03}
              position={[x, 0.08, 0]}
              material={x < 0 ? m.blueA : m.blueB}
            />
          ))}
          {[-0.1, 0.1].map((x) => (
            <mesh key={x} material={m.white} position={[x, 0.08, 0.02]}>
              <boxGeometry args={[0.16, 0.07, 0.26]} />
            </mesh>
          ))}
          <pointLight
            ref={(l) => {
              beacons.current[0] = l;
            }}
            color="#2f6dff"
            position={[-0.9, 0.3, 0.4]}
            distance={34}
            decay={1.6}
            intensity={0}
          />
          <pointLight
            ref={(l) => {
              beacons.current[1] = l;
            }}
            color="#2f6dff"
            position={[0.9, 0.3, 0.4]}
            distance={34}
            decay={1.6}
            intensity={0}
          />
        </group>
        {/* Wheels: steered fronts, dual rears. */}
        {[
          [-1, 1],
          [1, 1],
          [-1, -1],
          [1, -1],
        ].map(([sx, sz], i) => (
          <group
            key={i}
            position={[(sx! * TRACK) / 2, WHEEL_RADIUS, sz! > 0 ? FRONT_AXLE : REAR_AXLE]}
            ref={(g) => {
              if (sz! > 0) steer.current[i] = g;
            }}
          >
            <group
              ref={(g) => {
                wheels.current[i] = g;
              }}
            >
              <group scale={[sx!, 1, 1]}>
                <Wheel materials={m} dual={sz! < 0} />
              </group>
            </group>
          </group>
        ))}
      </group>
    </RigidBody>
  );
}
