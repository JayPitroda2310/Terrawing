import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  LineBasicMaterial,
  LineSegments,
} from 'three';
import type { GameSession } from '@/game/core/GameSession';
import { createRandom } from '@/utils/math/random';

const CAPACITY = 240;
const SPARKS_PER_DAMAGE = 5;
const MAX_SPARKS_PER_IMPACT = 70;
const GRAVITY = 9.81;
/** Air drag on a tiny hot metal fleck (per second). */
const DRAG = 1.1;
/** Streak length = distance travelled in this time (camera-shutter motion blur). */
const STREAK_TIME = 0.035;
/** Fraction of vertical speed kept on bouncing, and horizontal speed kept by the scrape. */
const BOUNCE = 0.35;
const SKID = 0.6;

/**
 * Collision sparks as real hot metal fragments: each is a streak drawn along its velocity (motion
 * blur), thrown out along the impact, falling under gravity with air drag, bouncing and skidding
 * off the ground, and cooling from white-hot to orange to dull red as it dies.
 */
export function Sparks({ session }: { session: GameSession }) {
  const random = useMemo(() => createRandom(55), []);
  const sim = useMemo(() => {
    const geometry = new BufferGeometry();
    const positions = new Float32Array(CAPACITY * 6);
    const colors = new Float32Array(CAPACITY * 6);
    for (let i = 0; i < CAPACITY * 6; i += 3) positions[i + 1] = -1e4;
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    const material = new LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
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
      next: 0,
    };
  }, []);

  useEffect(
    () => () => {
      sim.lines.geometry.dispose();
      (sim.lines.material as LineBasicMaterial).dispose();
    },
    [sim],
  );

  useEffect(
    () =>
      session.events.on('vehicle:impact', ({ damage, position }) => {
        const count = Math.min(MAX_SPARKS_PER_IMPACT, 10 + Math.round(damage * SPARKS_PER_DAMAGE));
        const v = session.vehicle.state.velocity;
        const speed = Math.hypot(v.x, v.z);
        // Sparks spray forward along the direction of travel, in a cone, scraped off the contact.
        const dirX = speed > 0.5 ? v.x / speed : 0;
        const dirZ = speed > 0.5 ? v.z / speed : 0;
        for (let k = 0; k < count; k++) {
          const i = sim.next;
          sim.next = (sim.next + 1) % CAPACITY;
          const angle = random() * Math.PI * 2;
          const spread = 3 + random() * 7;
          const push = 2 + speed * (0.4 + random() * 0.5);
          sim.p[i * 3] = position.x + (random() - 0.5) * 0.4;
          sim.p[i * 3 + 1] = position.y + 0.5 + random() * 0.4;
          sim.p[i * 3 + 2] = position.z + (random() - 0.5) * 0.4;
          sim.v[i * 3] = Math.cos(angle) * spread * 0.6 + dirX * push;
          sim.v[i * 3 + 1] = 1.5 + random() * 5.5;
          sim.v[i * 3 + 2] = Math.sin(angle) * spread * 0.6 + dirZ * push;
          sim.age[i] = 0;
          sim.life[i] = 0.35 + random() * 0.8;
        }
      }),
    [session, sim, random],
  );

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const drag = Math.exp(-DRAG * dt);
    const terrain = session.terrain;
    for (let i = 0; i < CAPACITY; i++) {
      const o = i * 3;
      const l = i * 6;
      if (sim.life[i]! <= 0) continue;
      sim.age[i]! += dt;
      const t = sim.age[i]! / sim.life[i]!;
      if (t >= 1) {
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
      const ground = terrain.heightAt(sim.p[o]!, sim.p[o + 2]!) + 0.02;
      if (sim.p[o + 1]! < ground) {
        sim.p[o + 1] = ground;
        if (sim.v[o + 1]! < 0) sim.v[o + 1] = -sim.v[o + 1]! * BOUNCE;
        sim.v[o] = sim.v[o]! * SKID;
        sim.v[o + 2] = sim.v[o + 2]! * SKID;
      }
      // Head at the spark, tail back along its velocity.
      sim.positions[l] = sim.p[o]!;
      sim.positions[l + 1] = sim.p[o + 1]!;
      sim.positions[l + 2] = sim.p[o + 2]!;
      sim.positions[l + 3] = sim.p[o]! - sim.v[o]! * STREAK_TIME;
      sim.positions[l + 4] = sim.p[o + 1]! - sim.v[o + 1]! * STREAK_TIME;
      sim.positions[l + 5] = sim.p[o + 2]! - sim.v[o + 2]! * STREAK_TIME;
      // Cooling: white-hot → yellow → orange → dull red, fading out.
      const heat = 1 - t;
      const fade = heat * heat;
      const r = fade;
      const g = fade * (0.35 + 0.65 * heat);
      const b = fade * Math.max(0, heat - 0.55) * 1.6;
      sim.colors[l] = r;
      sim.colors[l + 1] = g;
      sim.colors[l + 2] = b;
      sim.colors[l + 3] = r * 0.35;
      sim.colors[l + 4] = g * 0.25;
      sim.colors[l + 5] = b * 0.2;
    }
    sim.lines.geometry.getAttribute('position').needsUpdate = true;
    sim.lines.geometry.getAttribute('color').needsUpdate = true;
  });

  return <primitive object={sim.lines} />;
}
