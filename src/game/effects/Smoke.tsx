import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import type { GameSession } from '@/game/core/GameSession';
import { createRandom } from '@/utils/math/random';
import { useParticlePool } from './useParticlePool';

const FLARE_RATE = 7;
const DAMAGE_RATE = 10;

/**
 * Coloured signal-flare smoke over survivors that carry flares, and dark smoke from TerraWing when
 * its integrity is critical.
 */
export function Smoke({ session }: { session: GameSession }) {
  const pool = useParticlePool({
    capacity: 260,
    gravity: 0,
    drag: 0.35,
    additive: false,
    lift: 0.9,
    softness: 1,
  });
  const random = useMemo(() => createRandom(31), []);
  const timers = useMemo(() => ({ flare: 0, damage: 0 }), []);
  const flares = useMemo(
    () => session.survivors.survivors.filter((s) => s.definition.signalFlare),
    [session],
  );

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    pool.wind.x = session.weather.wind.x * 0.25;
    pool.wind.z = session.weather.wind.z * 0.25;

    timers.flare += FLARE_RATE * dt;
    while (timers.flare >= 1) {
      timers.flare -= 1;
      for (const survivor of flares) {
        // Flares burn out a while after the survivor has been secured.
        if (survivor.status === 'secured' && session.time - survivor.securedAt > 20) continue;
        pool.emit({
          x: survivor.position.x + 1.6 + (random() - 0.5) * 0.3,
          y: survivor.position.y + 0.3,
          z: survivor.position.z + (random() - 0.5) * 0.3,
          vx: (random() - 0.5) * 0.5,
          vy: 1.6 + random(),
          vz: (random() - 0.5) * 0.5,
          life: 5 + random() * 3,
          startSize: 0.6,
          endSize: 6 + random() * 3,
          r: 0.85,
          g: 0.28 + random() * 0.08,
          b: 0.2,
          alpha: 0.55,
        });
      }
    }

    const state = session.vehicle.state;
    if (session.damage.level === 'critical' || session.damage.level === 'destroyed') {
      timers.damage += DAMAGE_RATE * dt;
      while (timers.damage >= 1) {
        timers.damage -= 1;
        pool.emit({
          x: state.position.x + (random() - 0.5) * 0.6,
          y: state.position.y + 1.2,
          z: state.position.z + (random() - 0.5) * 0.6,
          vx: -state.velocity.x * 0.2,
          vy: 0.8 + random() * 0.5,
          vz: -state.velocity.z * 0.2,
          life: 2 + random() * 1.5,
          startSize: 0.4,
          endSize: 3,
          r: 0.12,
          g: 0.12,
          b: 0.13,
          alpha: 0.6,
        });
      }
    }
  });

  return <primitive object={pool.points} />;
}
