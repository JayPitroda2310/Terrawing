import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import { Color } from 'three';
import { getSurface, SurfaceId } from '@/data/surfaces/surfaces';
import type { GameSession } from '@/game/core/GameSession';
import { createRandom } from '@/utils/math/random';
import { useParticlePool } from './useParticlePool';

const SPRAY_COLOR = new Color('#b9c6cc');
const WASH_HEIGHT_FACTOR = 1.6;
const back = { x: 0, z: 0 };

/** Wheel dust / mud spray in rover mode and rotor-wash spray near the ground in flight. */
export function Dust({ session, budget }: { session: GameSession; budget: number }) {
  const pool = useParticlePool({
    capacity: budget,
    gravity: 1.2,
    drag: 1.4,
    additive: false,
    softness: 0.9,
  });
  const random = useMemo(() => createRandom(77), []);
  const color = useMemo(() => new Color(), []);
  const accumulator = useMemo(() => ({ wheel: 0, wash: 0 }), []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const state = session.vehicle.state;
    const { x, y, z } = state.position;
    pool.wind.x = session.weather.wind.x * 0.4;
    pool.wind.z = session.weather.wind.z * 0.4;

    // Wheels
    if (state.mode === 'ROVER' && state.grounded && state.speed > 1.5) {
      const surface = getSurface(state.surface);
      color.set(surface.dustColor);
      const rate = Math.min(60, state.speed * 4 * (0.4 + surface.roughness));
      accumulator.wheel += rate * dt;
      back.x = -Math.sin(state.heading);
      back.z = Math.cos(state.heading);
      while (accumulator.wheel >= 1) {
        accumulator.wheel -= 1;
        const side = random() > 0.5 ? 0.85 : -0.85;
        const px = x + back.x * 1 + Math.cos(state.heading) * side;
        const pz = z + back.z * 1 + Math.sin(state.heading) * side;
        pool.emit({
          x: px,
          y: y + 0.2,
          z: pz,
          vx: back.x * state.speed * 0.25 + (random() - 0.5) * 1.5,
          vy: 0.6 + random() * 1.2,
          vz: back.z * state.speed * 0.25 + (random() - 0.5) * 1.5,
          life: 0.9 + random() * 0.9,
          startSize: 0.4,
          endSize: 1.8 + random(),
          r: color.r,
          g: color.g,
          b: color.b,
          alpha: 0.35,
        });
      }
    }

    // Rotor wash
    const limit = session.config.flight.groundEffectHeight * WASH_HEIGHT_FACTOR;
    if (state.rig.rotorSpeed > 0.4 && state.altitudeAGL < limit) {
      const strength = (1 - state.altitudeAGL / limit) * state.rig.rotorSpeed;
      const groundY = y - state.altitudeAGL;
      const water = session.terrain.waterLevelAt(x, z);
      const isWater = water !== null && water > groundY - 0.5;
      const surfaceColor = isWater
        ? SPRAY_COLOR
        : color.set(getSurface(session.terrain.surfaceAt(x, z) as SurfaceId).dustColor);
      accumulator.wash += strength * 70 * dt;
      while (accumulator.wash >= 1) {
        accumulator.wash -= 1;
        const angle = random() * Math.PI * 2;
        const radius = 1 + random() * 1.5;
        const speed = 5 + random() * 5;
        pool.emit({
          x: x + Math.cos(angle) * radius,
          y: (isWater ? water : groundY) + 0.2,
          z: z + Math.sin(angle) * radius,
          vx: Math.cos(angle) * speed,
          vy: 0.4 + random(),
          vz: Math.sin(angle) * speed,
          life: 0.8 + random() * 0.8,
          startSize: 0.6,
          endSize: 2.4,
          r: surfaceColor.r,
          g: surfaceColor.g,
          b: surfaceColor.b,
          alpha: isWater ? 0.4 : 0.3,
        });
      }
    }
  });

  return <primitive object={pool.points} />;
}
