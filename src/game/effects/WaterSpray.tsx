import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import {
  BufferAttribute,
  BufferGeometry,
  LineBasicMaterial,
  LineSegments,
  NormalBlending,
} from 'three';
import { SurfaceId } from '@/data/surfaces/surfaces';
import type { GameSession } from '@/game/core/GameSession';
import { createRandom } from '@/utils/math/random';

const CAPACITY = 1400;
const GRAVITY = 9.81;
const DRAG = 0.6;
/** Streak = distance travelled in this time (camera motion blur of a fast droplet). */
const STREAK_TIME = 0.05;
/** Minimum water under a tyre to throw spray. */
const WET = 0.1;

/**
 * Water thrown by the tyres, simulated as droplets drawn as short streaks along their velocity.
 * A tyre entering water throws a crown burst at once; while it keeps rolling through, it throws a
 * steady bow wave sideways and a rooster tail back off the tread, scaling with speed. Droplets fly
 * on ballistic arcs and break into a few tiny secondary droplets when they land.
 */
export function WaterSpray({ session }: { session: GameSession }) {
  const random = useMemo(() => createRandom(808), []);
  const sim = useMemo(() => {
    const geometry = new BufferGeometry();
    const positions = new Float32Array(CAPACITY * 6);
    for (let i = 1; i < positions.length; i += 3) positions[i] = -1e4;
    const colors = new Float32Array(CAPACITY * 8);
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('color', new BufferAttribute(colors, 4));
    const material = new LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
    });
    const lines = new LineSegments(geometry, material);
    lines.frustumCulled = false;
    return {
      lines,
      positions,
      colors,
      p: new Float32Array(CAPACITY * 3),
      v: new Float32Array(CAPACITY * 3),
      age: new Float32Array(CAPACITY),
      life: new Float32Array(CAPACITY),
      size: new Float32Array(CAPACITY),
      next: 0,
      wasWet: [false, false, false, false],
      carry: [0, 0, 0, 0],
    };
  }, []);

  useEffect(
    () => () => {
      sim.lines.geometry.dispose();
      (sim.lines.material as LineBasicMaterial).dispose();
    },
    [sim],
  );

  const emit = (
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    size: number,
  ) => {
    const i = sim.next;
    sim.next = (sim.next + 1) % CAPACITY;
    sim.p[i * 3] = x;
    sim.p[i * 3 + 1] = y;
    sim.p[i * 3 + 2] = z;
    sim.v[i * 3] = vx;
    sim.v[i * 3 + 1] = vy;
    sim.v[i * 3 + 2] = vz;
    sim.age[i] = 0;
    sim.life[i] = life;
    sim.size[i] = size;
  };

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const state = session.vehicle.state;
    const terrain = session.terrain;

    if (state.mode === 'ROVER' && state.grounded) {
      const wheelConfig = session.config.rover.wheel;
      const fx = Math.sin(state.heading);
      const fz = -Math.cos(state.heading);
      const rx = -fz;
      const rz = fx;
      const speed = state.speed;
      const dir = state.forwardSpeed >= 0 ? 1 : -1;
      for (let w = 0; w < 4; w++) {
        const wheel = state.wheels[w]!;
        const water = wheel.contact ? (wheel.surface === SurfaceId.WATER ? 1 : wheel.puddle) : 0;
        const wet = water > WET;
        const side = w % 2 === 0 ? 1 : -1;
        const along = w < 2 ? wheelConfig.axleOffset : -wheelConfig.axleOffset;
        const wx = state.position.x + rx * side * wheelConfig.trackHalf + fx * along;
        const wz = state.position.z + rz * side * wheelConfig.trackHalf + fz * along;
        const wy = terrain.heightAt(wx, wz) + 0.04;
        const throwDrop = (strength: number, crown: boolean) => {
          const bow = crown || random() < 0.45;
          const angle = random() * Math.PI * 2;
          const out = crown
            ? 0.6 + random() * 0.5
            : bow
              ? 0.5 + random() * 0.6
              : 0.15 + random() * 0.3;
          const back = crown
            ? Math.cos(angle) * 0.4
            : bow
              ? -0.2 + random() * 0.3
              : 0.6 + random() * 0.4;
          const lateral = crown ? Math.sin(angle) : side;
          const v = strength * (0.5 + random() * 0.5) + 1;
          emit(
            wx + (random() - 0.5) * 0.25,
            wy,
            wz + (random() - 0.5) * 0.25,
            // The tyre's own velocity plus the throw, so spray leaves from the wheel, not behind it.
            state.velocity.x + (rx * lateral * out - fx * back * dir) * v,
            (crown ? 0.9 : bow ? 0.55 : 0.75) * v * (0.6 + random() * 0.5),
            state.velocity.z + (rz * lateral * out - fz * back * dir) * v,
            0.5 + random() * 0.6,
            0.6 + random() * 0.8,
          );
        };
        if (wet && !sim.wasWet[w] && speed > 1) {
          const burst = Math.round(12 + speed * 4 * water);
          for (let k = 0; k < burst; k++) throwDrop(2 + speed * 0.55, true);
        }
        sim.wasWet[w] = wet;
        if (!wet || speed < 0.8) continue;
        sim.carry[w]! += water * (speed * speed * 2.4 + speed * 16) * dt;
        const count = Math.min(40, Math.floor(sim.carry[w]!));
        sim.carry[w]! -= count;
        for (let k = 0; k < count; k++) throwDrop(1.5 + speed * 0.7, false);
      }
    } else sim.wasWet.fill(false);

    const drag = Math.exp(-DRAG * dt);
    for (let i = 0; i < CAPACITY; i++) {
      if (sim.life[i]! <= 0) continue;
      const o = i * 3;
      const l = i * 6;
      sim.age[i]! += dt;
      const t = sim.age[i]! / sim.life[i]!;
      const ground = terrain.heightAt(sim.p[o]!, sim.p[o + 2]!);
      if (t >= 1 || sim.p[o + 1]! < ground) {
        // Landing: a heavy drop breaks into a couple of tiny droplets.
        if (t < 1 && sim.size[i]! > 0.9 && sim.v[o + 1]! < -2) {
          for (let k = 0; k < 2; k++) {
            const a = random() * Math.PI * 2;
            emit(
              sim.p[o]!,
              ground + 0.02,
              sim.p[o + 2]!,
              Math.cos(a) * 1.2,
              1 + random(),
              Math.sin(a) * 1.2,
              0.25,
              0.4,
            );
          }
        }
        sim.life[i] = 0;
        sim.positions[l + 1] = sim.positions[l + 4] = -1e4;
        continue;
      }
      sim.v[o] = sim.v[o]! * drag;
      sim.v[o + 1] = sim.v[o + 1]! * drag - GRAVITY * dt;
      sim.v[o + 2] = sim.v[o + 2]! * drag;
      sim.p[o]! += sim.v[o]! * dt;
      sim.p[o + 1]! += sim.v[o + 1]! * dt;
      sim.p[o + 2]! += sim.v[o + 2]! * dt;
      const k = STREAK_TIME * sim.size[i]!;
      sim.positions[l] = sim.p[o]!;
      sim.positions[l + 1] = sim.p[o + 1]!;
      sim.positions[l + 2] = sim.p[o + 2]!;
      sim.positions[l + 3] = sim.p[o]! - sim.v[o]! * k;
      sim.positions[l + 4] = sim.p[o + 1]! - sim.v[o + 1]! * k;
      sim.positions[l + 5] = sim.p[o + 2]! - sim.v[o + 2]! * k;
      const alpha = Math.min(1, (1 - t) * 1.2);
      const c = i * 8;
      sim.colors.set([0.86, 0.9, 0.93, alpha, 0.75, 0.8, 0.84, alpha * 0.25], c);
    }
    sim.lines.geometry.getAttribute('position').needsUpdate = true;
    sim.lines.geometry.getAttribute('color').needsUpdate = true;
  });

  return <primitive object={sim.lines} />;
}
