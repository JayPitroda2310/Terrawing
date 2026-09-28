import { useFrame } from '@react-three/fiber';
import { CylinderCollider, RigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  type Group,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { getMaterial } from './materials';

import type { AirflowSampler } from './airflow';

export type { AirflowSampler };

const GRAVITY = -9.81;
const MAX_STEP = 1 / 60;

/** Converts world-space airflow at the object into its local frame (structures rotate about Y). */
function useLocalAirflow(getAirflow: AirflowSampler) {
  return useMemo(() => {
    const world = new Vector3();
    const inverse = new Quaternion();
    const position = new Vector3();
    return (group: Group, out: Vector3) => {
      group.getWorldPosition(position);
      group.getWorldQuaternion(inverse).invert();
      getAirflow(position.x, position.y + 5, position.z, world);
      return out.copy(world).applyQuaternion(inverse);
    };
  }, [getAirflow]);
}

// ---------------------------------------------------------------------------------------------
// Windsock
// ---------------------------------------------------------------------------------------------

const POLE_HEIGHT = 6;
const SOCK_NODES = 9;
const SOCK_LENGTH = 2.7;
const THROAT_RADIUS = 0.3;
const TIP_RADIUS = 0.12;
const RING_SEGMENTS = 14;
/** Drag coefficient (per m of air speed): the sock stands straight out at ~8 m/s (15 kt). */
const SOCK_DRAG = 0.34;

function createStripeTexture(bands: string[]): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  bands.forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, (i * 256) / bands.length, 4, 256 / bands.length);
  });
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * Airfield windsock with simulated fabric: a chain of points under gravity and quadratic
 * aerodynamic drag. It hangs limp in calm air, fills and streams out as the wind rises, flutters
 * in gusts, and swivels to point downwind.
 */
export function Windsock({ getAirflow }: { getAirflow: AirflowSampler }) {
  const root = useRef<Group>(null);
  const swivel = useRef<Group>(null);
  const localAir = useLocalAirflow(getAirflow);
  const sim = useMemo(() => {
    const segment = SOCK_LENGTH / (SOCK_NODES - 1);
    const nodes = Array.from({ length: SOCK_NODES }, (_, i) => new Vector3(0, -i * segment, 0.4));
    return {
      segment,
      nodes,
      previous: nodes.map((n) => n.clone()),
      yaw: 0,
      yawRate: 0,
      air: new Vector3(),
      time: 0,
    };
  }, []);

  const { geometry, material } = useMemo(() => {
    const g = new BufferGeometry();
    const count = SOCK_NODES * (RING_SEGMENTS + 1);
    g.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(count * 3), 3));
    const uv = new Float32Array(count * 2);
    const index: number[] = [];
    for (let i = 0; i < SOCK_NODES; i++) {
      for (let j = 0; j <= RING_SEGMENTS; j++) {
        const k = i * (RING_SEGMENTS + 1) + j;
        uv[k * 2] = j / RING_SEGMENTS;
        uv[k * 2 + 1] = 1 - i / (SOCK_NODES - 1);
        if (i < SOCK_NODES - 1 && j < RING_SEGMENTS) {
          const a = k;
          const b = k + RING_SEGMENTS + 1;
          index.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }
    }
    g.setAttribute('uv', new BufferAttribute(uv, 2));
    g.setIndex(index);
    // ICAO windsock: five alternating bands, red/orange and white.
    const bands = ['#e8481c', '#f2f2ee', '#e8481c', '#f2f2ee', '#e8481c'];
    const m = new MeshStandardMaterial({
      map: createStripeTexture(bands),
      side: DoubleSide,
      roughness: 0.85,
    });
    return { geometry: g, material: m };
  }, []);

  useEffect(
    () => () => {
      geometry.dispose();
      material.map?.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  const tangent = useMemo(() => new Vector3(), []);
  const side = useMemo(() => new Vector3(), []);
  const up = useMemo(() => new Vector3(), []);
  const velocity = useMemo(() => new Vector3(), []);
  const relative = useMemo(() => new Vector3(), []);

  useFrame((_, rawDt) => {
    if (!root.current || !swivel.current) return;
    const dt = Math.min(rawDt, 0.05);
    const air = localAir(root.current, sim.air);
    sim.time += dt;
    const horizontal = Math.hypot(air.x, air.z);

    // Swivel: a damped spring turning the frame to point downwind.
    if (horizontal > 0.3) {
      let error = Math.atan2(air.x, air.z) - sim.yaw;
      error = Math.atan2(Math.sin(error), Math.cos(error));
      sim.yawRate += (error * 6 - sim.yawRate * 3) * dt;
    } else sim.yawRate *= 1 - dt * 2;
    sim.yaw += sim.yawRate * dt;
    swivel.current.rotation.y = sim.yaw;

    const cos = Math.cos(sim.yaw);
    const sin = Math.sin(sim.yaw);
    // Throat ring centre, 0.45 m downwind of the pole, facing along the heading.
    const throatX = sin * 0.45;
    const throatZ = cos * 0.45;
    const steps = Math.ceil(dt / MAX_STEP);
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      const nodes = sim.nodes;
      nodes[0]!.set(throatX, 0, throatZ);
      sim.previous[0]!.copy(nodes[0]!);
      for (let i = 1; i < SOCK_NODES; i++) {
        const p = nodes[i]!;
        const prev = sim.previous[i]!;
        velocity.subVectors(p, prev).divideScalar(h);
        // Turbulence: gusts along the wind plus lateral flutter that grows with wind speed.
        const flutter = Math.sin(sim.time * 9 + i * 1.3) * 0.12 * horizontal;
        // Lateral direction is perpendicular to the heading (sin, cos).
        relative.set(air.x + flutter * cos, air.y, air.z - flutter * sin).sub(velocity);
        const speed = relative.length();
        const drag = SOCK_DRAG * speed * (0.6 + 0.4 * (1 - i / SOCK_NODES));
        const ax = relative.x * drag;
        const ay = relative.y * drag + GRAVITY;
        const az = relative.z * drag;
        const nx = p.x + (p.x - prev.x) * 0.985 + ax * h * h;
        const ny = p.y + (p.y - prev.y) * 0.985 + ay * h * h;
        const nz = p.z + (p.z - prev.z) * 0.985 + az * h * h;
        prev.copy(p);
        p.set(nx, ny, nz);
      }
      for (let iteration = 0; iteration < 4; iteration++) {
        // The first segment is held along the throat ring's axis (the frame keeps the mouth open).
        const first = nodes[1]!;
        const axisX = nodes[0]!.x + sin * sim.segment;
        const axisZ = nodes[0]!.z + cos * sim.segment;
        first.x += (axisX - first.x) * 0.6;
        first.y += (0 - first.y) * 0.6;
        first.z += (axisZ - first.z) * 0.6;
        for (let i = 1; i < SOCK_NODES; i++) {
          const a = nodes[i - 1]!;
          const b = nodes[i]!;
          tangent.subVectors(b, a);
          const length = tangent.length() || 1e-6;
          const correction = (length - sim.segment) / length;
          if (i === 1) b.addScaledVector(tangent, -correction);
          else {
            a.addScaledVector(tangent, correction * 0.5);
            b.addScaledVector(tangent, -correction * 0.5);
          }
        }
      }
    }

    // Rebuild the tube: the fabric deflates towards the tip when the wind drops.
    const inflation = Math.min(1, horizontal / 7);
    const position = geometry.getAttribute('position') as BufferAttribute;
    for (let i = 0; i < SOCK_NODES; i++) {
      const a = sim.nodes[Math.max(0, i - 1)]!;
      const b = sim.nodes[Math.min(SOCK_NODES - 1, i + 1)]!;
      tangent.subVectors(b, a).normalize();
      up.set(0, 1, 0);
      if (Math.abs(tangent.y) > 0.95) up.set(sin, 0, cos);
      side.crossVectors(tangent, up).normalize();
      up.crossVectors(side, tangent).normalize();
      const t = i / (SOCK_NODES - 1);
      const full = THROAT_RADIUS + (TIP_RADIUS - THROAT_RADIUS) * t;
      const radius = i === 0 ? full : full * (0.35 + 0.65 * Math.max(inflation, 1 - t * 1.2));
      const flatten = i === 0 ? 1 : 0.55 + 0.45 * inflation;
      for (let j = 0; j <= RING_SEGMENTS; j++) {
        const angle = (j / RING_SEGMENTS) * Math.PI * 2;
        const c = Math.cos(angle) * radius;
        const sn = Math.sin(angle) * radius * flatten;
        const k = i * (RING_SEGMENTS + 1) + j;
        const node = sim.nodes[i]!;
        position.setXYZ(
          k,
          node.x + side.x * c + up.x * sn,
          node.y + side.y * c + up.y * sn,
          node.z + side.z * c + up.z * sn,
        );
      }
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
  });

  return (
    <RigidBody type="fixed" colliders={false}>
      <CylinderCollider args={[POLE_HEIGHT / 2, 0.08]} position={[0, POLE_HEIGHT / 2, 0]} />
      <group ref={root}>
        <mesh material={getMaterial('concrete')} position={[0, 0.15, 0]} receiveShadow>
          <boxGeometry args={[0.8, 0.3, 0.8]} />
        </mesh>
        <mesh material={getMaterial('steel')} position={[0, POLE_HEIGHT / 2, 0]} castShadow>
          <cylinderGeometry args={[0.045, 0.07, POLE_HEIGHT, 10]} />
        </mesh>
        {/* Swivel head: bearing, frame arm and the throat ring that holds the sock open. */}
        <group position={[0, POLE_HEIGHT, 0]}>
          <mesh material={getMaterial('steelDark')}>
            <cylinderGeometry args={[0.07, 0.07, 0.16, 10]} />
          </mesh>
          <group ref={swivel}>
            <mesh
              material={getMaterial('steel')}
              position={[0, 0, 0.22]}
              rotation={[Math.PI / 2, 0, 0]}
            >
              <cylinderGeometry args={[0.02, 0.02, 0.45, 6]} />
            </mesh>
            <mesh material={getMaterial('steel')} position={[0, 0, 0.45]}>
              <torusGeometry args={[THROAT_RADIUS, 0.018, 6, 24]} />
            </mesh>
          </group>
          <mesh geometry={geometry} material={material} castShadow frustumCulled={false} />
        </group>
      </group>
    </RigidBody>
  );
}

// ---------------------------------------------------------------------------------------------
// Flag
// ---------------------------------------------------------------------------------------------

const FLAG = { width: 2.4, height: 1.5, columns: 12, rows: 8, pole: 8 };

/** Black TerraWing flag with the green logo across its centre. */
function createFlagTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 640;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#121416';
  ctx.fillRect(0, 0, 1024, 640);
  // Slightly darker hoist sleeve where the flag wraps the rope.
  ctx.fillStyle = '#23272a';
  ctx.fillRect(0, 0, 26, 640);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  const logo = new Image();
  logo.onload = () => {
    const width = 900;
    const height = (width * logo.height) / logo.width;
    ctx.drawImage(logo, (1024 - width) / 2 + 13, (640 - height) / 2, width, height);
    texture.needsUpdate = true;
  };
  logo.src = '/assets/brand/terrawing-logo.png';
  return texture;
}

/**
 * Rescue flag on a pole: a cloth grid (Verlet particles with structural and shear links) pinned
 * along the hoist, pushed by the airflow through its surface normal, so it hangs, lifts, ripples
 * and snaps like fabric.
 */
export function Flag({ getAirflow }: { getAirflow: AirflowSampler }) {
  const root = useRef<Group>(null);
  const localAir = useLocalAirflow(getAirflow);
  const { geometry, material, sim } = useMemo(() => {
    const g = new PlaneGeometry(FLAG.width, FLAG.height, FLAG.columns - 1, FLAG.rows - 1);
    // Hoist (left edge) at x = 0, fly towards +X.
    g.translate(FLAG.width / 2, 0, 0);
    const position = g.getAttribute('position') as BufferAttribute;
    const points = Array.from({ length: position.count }, (_, i) =>
      new Vector3().fromBufferAttribute(position, i),
    );
    const links: [number, number, number][] = [];
    const id = (c: number, r: number) => r * FLAG.columns + c;
    for (let r = 0; r < FLAG.rows; r++) {
      for (let c = 0; c < FLAG.columns; c++) {
        const neighbours: [number, number][] = [
          [c + 1, r],
          [c, r + 1],
          [c + 1, r + 1],
          [c - 1, r + 1],
          [c + 2, r],
          [c, r + 2],
        ];
        for (const [nc, nr] of neighbours) {
          if (nc < 0 || nc >= FLAG.columns || nr >= FLAG.rows) continue;
          const a = id(c, r);
          const b = id(nc, nr);
          links.push([a, b, points[a]!.distanceTo(points[b]!)]);
        }
      }
    }
    const m = new MeshStandardMaterial({
      map: createFlagTexture(),
      side: DoubleSide,
      roughness: 0.8,
    });
    return {
      geometry: g,
      material: m,
      sim: {
        points,
        previous: points.map((p) => p.clone()),
        rest: points.map((p) => p.clone()),
        links,
        air: new Vector3(),
        time: 0,
      },
    };
  }, []);

  useEffect(
    () => () => {
      geometry.dispose();
      material.map?.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  const normal = useMemo(() => new Vector3(), []);
  const delta = useMemo(() => new Vector3(), []);

  useFrame((_, rawDt) => {
    if (!root.current) return;
    const dt = Math.min(rawDt, 0.05);
    sim.time += dt;
    const air = localAir(root.current, sim.air);
    const normals = geometry.getAttribute('normal') as BufferAttribute;
    const steps = Math.ceil(dt / MAX_STEP);
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      for (let i = 0; i < sim.points.length; i++) {
        const column = i % FLAG.columns;
        const p = sim.points[i]!;
        const prev = sim.previous[i]!;
        if (column === 0) {
          // Hoist: tied to the pole.
          p.copy(sim.rest[i]!);
          prev.copy(p);
          continue;
        }
        normal.fromBufferAttribute(normals, i);
        // Gusty airflow: pressure acts through the cloth normal, plus a little skin friction.
        const gust = 1 + 0.35 * Math.sin(sim.time * 3.1 + column * 0.7) * Math.sin(sim.time * 1.7);
        const vx = air.x * gust - (p.x - prev.x) / h;
        const vy = air.y * gust - (p.y - prev.y) / h;
        const vz = air.z * gust - (p.z - prev.z) / h;
        // Quadratic aerodynamics: pressure through the normal plus skin friction along the cloth.
        const speed = Math.hypot(vx, vy, vz);
        const pressure = (vx * normal.x + vy * normal.y + vz * normal.z) * speed * 0.5;
        const friction = speed * 0.4;
        const ax = normal.x * pressure + vx * friction;
        const ay = normal.y * pressure + vy * friction + GRAVITY;
        const az = normal.z * pressure + vz * friction;
        const nx = p.x + (p.x - prev.x) * 0.99 + ax * h * h;
        const ny = p.y + (p.y - prev.y) * 0.99 + ay * h * h;
        const nz = p.z + (p.z - prev.z) * 0.99 + az * h * h;
        prev.copy(p);
        p.set(nx, ny, nz);
      }
      for (let iteration = 0; iteration < 5; iteration++) {
        for (const [a, b, rest] of sim.links) {
          const pa = sim.points[a]!;
          const pb = sim.points[b]!;
          delta.subVectors(pb, pa);
          const length = delta.length() || 1e-6;
          const correction = (length - rest) / length;
          const aPinned = a % FLAG.columns === 0;
          const bPinned = b % FLAG.columns === 0;
          if (aPinned && bPinned) continue;
          if (aPinned) pb.addScaledVector(delta, -correction);
          else if (bPinned) pa.addScaledVector(delta, correction);
          else {
            pa.addScaledVector(delta, correction * 0.5);
            pb.addScaledVector(delta, -correction * 0.5);
          }
        }
      }
    }
    const position = geometry.getAttribute('position') as BufferAttribute;
    sim.points.forEach((p, i) => position.setXYZ(i, p.x, p.y, p.z));
    position.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
  });

  return (
    <RigidBody type="fixed" colliders={false}>
      <CylinderCollider args={[FLAG.pole / 2, 0.08]} position={[0, FLAG.pole / 2, 0]} />
      <group ref={root}>
        <mesh material={getMaterial('concrete')} position={[0, 0.15, 0]} receiveShadow>
          <boxGeometry args={[0.7, 0.3, 0.7]} />
        </mesh>
        <mesh material={getMaterial('whitePaint')} position={[0, FLAG.pole / 2, 0]} castShadow>
          <cylinderGeometry args={[0.04, 0.065, FLAG.pole, 10]} />
        </mesh>
        <mesh material={getMaterial('steel')} position={[0, FLAG.pole + 0.08, 0]}>
          <sphereGeometry args={[0.08, 12, 8]} />
        </mesh>
        <mesh
          geometry={geometry}
          material={material}
          position={[0.05, FLAG.pole - FLAG.height / 2 - 0.1, 0]}
          castShadow
          frustumCulled={false}
        />
      </group>
    </RigidBody>
  );
}
