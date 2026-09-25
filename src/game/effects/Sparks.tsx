import { useEffect, useMemo } from 'react';
import type { GameSession } from '@/game/core/GameSession';
import { createRandom } from '@/utils/math/random';
import { useParticlePool } from './useParticlePool';

const SPARKS_PER_DAMAGE = 5;
const MAX_SPARKS_PER_IMPACT = 60;

/** Bright sparks on collisions. */
export function Sparks({ session }: { session: GameSession }) {
  const pool = useParticlePool({
    capacity: 180,
    gravity: 9.8,
    drag: 0.8,
    additive: true,
    softness: 0.3,
  });
  const random = useMemo(() => createRandom(55), []);

  useEffect(
    () =>
      session.events.on('vehicle:impact', ({ damage, position }) => {
        const count = Math.min(MAX_SPARKS_PER_IMPACT, 8 + Math.round(damage * SPARKS_PER_DAMAGE));
        for (let i = 0; i < count; i++) {
          const angle = random() * Math.PI * 2;
          const speed = 3 + random() * 7;
          pool.emit({
            x: position.x,
            y: position.y + 0.8,
            z: position.z,
            vx: Math.cos(angle) * speed,
            vy: 2 + random() * 5,
            vz: Math.sin(angle) * speed,
            life: 0.3 + random() * 0.5,
            startSize: 0.12,
            endSize: 0.02,
            r: 1,
            g: 0.62 + random() * 0.25,
            b: 0.25,
            alpha: 1,
          });
        }
      }),
    [session, pool, random],
  );

  return <primitive object={pool.points} />;
}
