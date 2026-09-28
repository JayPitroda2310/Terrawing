import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import type { GameSession } from '@/game/core/GameSession';
import { createRandom } from '@/utils/math/random';
import { useParticlePool } from './useParticlePool';

/** Signal-flare smoke: puffs per second per flare. */
const FLARE_RATE = 26;
/** Damage smoke is emitted by time and by distance travelled, so it stays a continuous plume. */
const DAMAGE_RATE = { critical: 30, destroyed: 55 };
const DAMAGE_SPACING = 0.22;
const MAX_PER_FRAME = 40;
/** Engine bay, behind the cabin (vehicle-local). */
const ENGINE = { back: 0.7, up: 1.15 };

const SMOKE_FADE = [0.46, 0.46, 0.47] as const;
const FLARE_FADE = [0.82, 0.62, 0.58] as const;

/**
 * Coloured signal-flare smoke over survivors carrying flares, and smoke from TerraWing's engine
 * bay when it is badly damaged. Both are dense streams of small, torn wisps that billow, curl in
 * the turbulence, drift with the wind and thin out as they rise — not a string of balls.
 */
export function Smoke({ session }: { session: GameSession }) {
  const damageSmoke = useParticlePool({
    capacity: 1400,
    gravity: 0,
    drag: 0.9,
    additive: false,
    lift: 1.6,
    softness: 1,
    wispy: true,
    turbulence: 1.8,
    fadeTo: SMOKE_FADE,
  });
  const flareSmoke = useParticlePool({
    capacity: 900,
    gravity: 0,
    drag: 0.5,
    additive: false,
    lift: 1.1,
    softness: 1,
    wispy: true,
    turbulence: 1.2,
    fadeTo: FLARE_FADE,
  });
  const random = useMemo(() => createRandom(31), []);
  const tracker = useMemo(() => ({ flare: 0, damage: 0, travelled: 0, x: NaN, y: 0, z: 0 }), []);
  const flares = useMemo(
    () => session.survivors.survivors.filter((s) => s.definition.signalFlare),
    [session],
  );

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const wind = session.weather.wind;
    for (const pool of [damageSmoke, flareSmoke]) {
      pool.wind.x = wind.x * 0.35;
      pool.wind.z = wind.z * 0.35;
    }

    tracker.flare += FLARE_RATE * dt;
    const flarePuffs = Math.floor(tracker.flare);
    tracker.flare -= flarePuffs;
    for (let k = 0; k < flarePuffs; k++) {
      for (const survivor of flares) {
        // Flares burn out a while after the survivor has been secured.
        if (survivor.status === 'secured' && session.time - survivor.securedAt > 20) continue;
        flareSmoke.emit({
          x: survivor.position.x + 1.6 + (random() - 0.5) * 0.15,
          y: survivor.position.y + 0.25,
          z: survivor.position.z + (random() - 0.5) * 0.15,
          vx: (random() - 0.5) * 0.6,
          vy: 2.2 + random() * 1.2,
          vz: (random() - 0.5) * 0.6,
          life: 4 + random() * 3,
          startSize: 0.25 + random() * 0.15,
          endSize: 3.5 + random() * 2.5,
          r: 0.95,
          g: 0.22 + random() * 0.08,
          b: 0.12,
          alpha: 0.4 + random() * 0.15,
        });
      }
    }

    const state = session.vehicle.state;
    const level = session.damage.level;
    const { x, y, z } = state.position;
    if (Number.isNaN(tracker.x)) {
      tracker.x = x;
      tracker.y = y;
      tracker.z = z;
    }
    const moved = Math.hypot(x - tracker.x, y - tracker.y, z - tracker.z);
    if (level === 'critical' || level === 'destroyed') {
      const heavy = level === 'destroyed';
      tracker.damage += DAMAGE_RATE[level] * dt + moved / DAMAGE_SPACING;
      const puffs = Math.min(MAX_PER_FRAME, Math.floor(tracker.damage));
      tracker.damage -= Math.floor(tracker.damage);
      const back = {
        x: Math.sin(state.heading) * ENGINE.back,
        z: -Math.cos(state.heading) * ENGINE.back,
      };
      for (let k = 0; k < puffs; k++) {
        // Spread the puffs along the path travelled this frame, so there are no gaps.
        const f = puffs > 1 ? k / (puffs - 1) : 1;
        const px = tracker.x + (x - tracker.x) * f - back.x;
        const py = tracker.y + (y - tracker.y) * f + ENGINE.up;
        const pz = tracker.z + (z - tracker.z) * f - back.z;
        const shade = heavy ? 0.05 + random() * 0.05 : 0.12 + random() * 0.08;
        damageSmoke.emit({
          x: px + (random() - 0.5) * 0.35,
          y: py + (random() - 0.5) * 0.15,
          z: pz + (random() - 0.5) * 0.35,
          // Smoke leaves the vehicle almost at rest in the air, so it streams out behind.
          vx: state.velocity.x * 0.1 + (random() - 0.5) * 0.8,
          vy: 0.8 + random() * 0.8,
          vz: state.velocity.z * 0.1 + (random() - 0.5) * 0.8,
          life: (heavy ? 3.2 : 2.4) + random() * 1.6,
          startSize: 0.2 + random() * 0.15,
          endSize: (heavy ? 4 : 2.8) + random() * 1.6,
          r: shade,
          g: shade,
          b: shade * 1.05,
          alpha: (heavy ? 0.55 : 0.38) * (0.7 + random() * 0.3),
        });
      }
    }
    tracker.x = x;
    tracker.y = y;
    tracker.z = z;
  });

  return (
    <>
      <primitive object={flareSmoke.points} />
      <primitive object={damageSmoke.points} />
    </>
  );
}
