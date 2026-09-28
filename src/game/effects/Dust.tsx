import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import { Color } from 'three';
import { getSurface, SurfaceId } from '@/data/surfaces/surfaces';
import type { GameSession } from '@/game/core/GameSession';
import { createRandom } from '@/utils/math/random';
import { useParticlePool } from './useParticlePool';

const SPRAY_COLOR = new Color('#c9d4d9');
const HAZE_COLOR = new Color('#c8c3b6');
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
    wispy: true,
  });
  // Fine mist that hangs behind the wheels at speed through water (droplets: WaterSpray).
  const mist = useParticlePool({
    capacity: Math.round(budget * 0.8),
    gravity: 0.6,
    drag: 1.6,
    additive: false,
    softness: 1,
    wispy: true,
  });
  const splashAccumulator = useMemo(() => [0, 0, 0, 0], []);
  // Rotor downwash: a low sheet of fine dust racing outward, slowed by air drag.
  const wash = useParticlePool({
    capacity: Math.round(budget * 1.2),
    gravity: 0.15,
    drag: 1.9,
    additive: false,
    softness: 1,
    wispy: true,
  });
  const random = useMemo(() => createRandom(77), []);
  const washColor = useMemo(() => new Color(), []);
  const color = useMemo(() => new Color(), []);
  const accumulator = useMemo(() => ({ wheel: 0, wash: 0 }), []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const state = session.vehicle.state;
    const { x, y, z } = state.position;
    pool.wind.x = session.weather.wind.x * 0.4;
    pool.wind.z = session.weather.wind.z * 0.4;

    // Wheels
    if (state.mode === 'ROVER' && state.grounded && (state.speed > 1.5 || state.slip > 0.2)) {
      const surface = getSurface(state.surface);
      color.set(surface.dustColor);
      // Wheelspin throws much more spray than rolling.
      const rate = Math.min(90, (state.speed * 4 + state.slip * 50) * (0.4 + surface.roughness));
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

    // Tyres through standing water: the faster the rover, the more water is thrown, the harder
    // and further. Droplets leave from the contact patch: a bow wave fanning forward/outward and
    // a rooster tail kicked back off the tread; mist follows at speed.
    if (state.mode === 'ROVER' && state.grounded && state.speed > 1.2) {
      const config = session.config.rover.wheel;
      const fx = Math.sin(state.heading);
      const fz = -Math.cos(state.heading);
      const rx = -fz;
      const rz = fx;
      const speed = state.speed;
      const direction = state.forwardSpeed >= 0 ? 1 : -1;
      for (let i = 0; i < 4; i++) {
        const wheel = state.wheels[i]!;
        if (!wheel.contact) continue;
        const water = wheel.surface === SurfaceId.WATER ? 1 : wheel.puddle;
        if (water < 0.12) continue;
        const side = i % 2 === 0 ? 1 : -1;
        const along = i < 2 ? config.axleOffset : -config.axleOffset;
        const wx = x + rx * side * config.trackHalf + fx * along;
        const wz = z + rz * side * config.trackHalf + fz * along;
        const wy = session.terrain.heightAt(wx, wz) + 0.05;
        const rate = water * Math.min(160, speed * speed * 1.2 + speed * 6);
        splashAccumulator[i]! += rate * dt;
        while (splashAccumulator[i]! >= 1) {
          splashAccumulator[i]! -= 1;
          if (speed > 5 && random() < 0.12) {
            mist.emit({
              x: wx - fx * 0.4 * direction,
              y: wy + 0.2,
              z: wz - fz * 0.4 * direction,
              vx: -fx * direction * speed * 0.25 + (random() - 0.5),
              vy: 0.4 + random() * 0.6,
              vz: -fz * direction * speed * 0.25 + (random() - 0.5),
              life: 0.9 + random() * 0.7,
              startSize: 0.4,
              endSize: 1.6 + random(),
              r: 0.82,
              g: 0.86,
              b: 0.88,
              alpha: 0.18,
            });
          }
        }
      }
    }

    // Rotor wash
    wash.wind.x = session.weather.wind.x * 0.5;
    wash.wind.z = session.weather.wind.z * 0.5;
    const limit = session.config.flight.groundEffectHeight * WASH_HEIGHT_FACTOR;
    if (state.rig.rotorSpeed > 0.4 && state.altitudeAGL < limit) {
      const strength = (1 - state.altitudeAGL / limit) * state.rig.rotorSpeed;
      const groundY = y - state.altitudeAGL;
      const water = session.terrain.waterLevelAt(x, z);
      const isWater = water !== null && water > groundY - 0.5;
      const surfaceId = session.terrain.surfaceAt(x, z) as SurfaceId;
      // Paved surfaces only give off a faint haze; loose ground throws up real dust.
      const paved = surfaceId === SurfaceId.PAD || surfaceId === SurfaceId.ROAD;
      if (isWater) washColor.copy(SPRAY_COLOR);
      else {
        // Airborne dust looks paler than the ground it comes from.
        washColor.set(getSurface(surfaceId).dustColor).lerp(HAZE_COLOR, paved ? 0.7 : 0.45);
      }
      const rate = (paved ? 28 : 95) * strength;
      accumulator.wash += rate * dt;
      while (accumulator.wash >= 1) {
        accumulator.wash -= 1;
        const angle = random() * Math.PI * 2;
        const radius = 1.2 + random() * 1.8;
        const speed = (7 + random() * 7) * (0.5 + strength * 0.5);
        const sheet = random();
        wash.emit({
          x: x + Math.cos(angle) * radius,
          y: (isWater ? water : groundY) + 0.08 + sheet * 0.25,
          z: z + Math.sin(angle) * radius,
          vx: Math.cos(angle) * speed,
          vy: 0.15 + sheet * 0.6,
          vz: Math.sin(angle) * speed,
          life: 1.2 + random() * 1.3,
          startSize: 0.8 + random() * 0.6,
          endSize: 4 + random() * 3.5,
          r: washColor.r,
          g: washColor.g,
          b: washColor.b,
          alpha: (isWater ? 0.32 : paved ? 0.12 : 0.22) * (0.6 + random() * 0.4),
        });
      }
    }
  });

  return (
    <>
      <primitive object={pool.points} />
      <primitive object={wash.points} />
      <primitive object={mist.points} />
    </>
  );
}
