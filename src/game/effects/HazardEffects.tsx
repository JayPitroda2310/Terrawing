import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import type { HazardDefinition } from '@/game/missions/MissionDefinition';
import type { GameSession } from '@/game/core/GameSession';
import { createRandom } from '@/utils/math/random';
import { useParticlePool } from './useParticlePool';

/** Burning spots per fire hazard, spread over the area the front can reach. */
const FIRE_SPOTS = 22;
/** Fully spread fire radius relative to its starting radius (see HazardSystem). */
const FIRE_MAX_SPREAD = 1.7;
const FLAME_RATE = 14;
const SMOKE_RATE = 3.2;

interface Spot {
  x: number;
  y: number;
  z: number;
  size: number;
  /** Fire: the hazard and how far out the spot is (it ignites once the front reaches it). */
  hazard?: HazardDefinition;
  reach?: number;
}

/**
 * Visuals for mission hazards: flames and towering smoke over wildfire zones, and rolling dust
 * bursts where aftershocks shake unstable ruins. Fires spread outward as the front grows.
 */
export function HazardEffects({ session }: { session: GameSession }) {
  const flames = useParticlePool({
    capacity: 1400,
    gravity: -2.5,
    drag: 1.2,
    additive: true,
    lift: 0,
    softness: 1,
  });
  const smoke = useParticlePool({
    capacity: 520,
    gravity: 0,
    drag: 0.25,
    additive: false,
    lift: 1.4,
    softness: 1,
  });
  const random = useMemo(() => createRandom(53), []);
  const { fires, quakes } = useMemo(() => {
    const spotRandom = createRandom(911);
    const fires: Spot[] = [];
    const quakes: Spot[] = [];
    for (const hazard of session.mission.hazards) {
      const [cx, cz] = hazard.position;
      if (hazard.kind === 'fire') {
        for (let i = 0; i < FIRE_SPOTS; i++) {
          const angle = spotRandom() * Math.PI * 2;
          const distance = Math.sqrt(spotRandom()) * hazard.radius * FIRE_MAX_SPREAD * 0.8;
          const x = cx + Math.cos(angle) * distance;
          const z = cz + Math.sin(angle) * distance;
          fires.push({
            x,
            y: session.terrain.heightAt(x, z),
            z,
            size: 0.7 + spotRandom() * 0.8,
            hazard,
            reach: distance / 0.8,
          });
        }
      } else if (hazard.kind === 'aftershock') {
        quakes.push({ x: cx, y: session.terrain.heightAt(cx, cz), z: cz, size: hazard.radius });
      }
    }
    return { fires, quakes };
  }, [session]);
  const timers = useMemo(() => ({ flame: 0, smoke: 0, quake: 0 }), []);
  useEffect(
    () => session.events.on('world:tremor', ({ intensity }) => (timers.quake = intensity)),
    [session, timers],
  );
  const crashes = useMemo<{ x: number; y: number; z: number; size: number }[]>(() => [], []);
  useEffect(
    () => session.events.on('world:crash', (crash) => void crashes.push(crash)),
    [session, crashes],
  );
  const burning = (spot: Spot) =>
    !spot.hazard || spot.reach! <= session.hazards.radiusOf(spot.hazard);

  useFrame((_, rawDt) => {
    // Dust thrown up where a tree or boulder hits the ground.
    for (const crash of crashes.splice(0)) {
      for (let i = 0; i < 12 + crash.size * 28; i++) {
        const angle = random() * Math.PI * 2;
        const speed = 1 + random() * 3 * crash.size;
        const shade = 0.42 + random() * 0.1;
        smoke.emit({
          x: crash.x + Math.cos(angle) * random() * 2,
          y: crash.y + 0.3,
          z: crash.z + Math.sin(angle) * random() * 2,
          vx: Math.cos(angle) * speed,
          vy: 0.4 + random() * 1.2,
          vz: Math.sin(angle) * speed,
          life: 2.5 + random() * 2.5,
          startSize: 1.2,
          endSize: 5 + random() * 5 * crash.size,
          r: shade,
          g: shade * 0.93,
          b: shade * 0.84,
          alpha: 0.4,
        });
      }
    }
    if (fires.length === 0 && quakes.length === 0) return;
    const dt = Math.min(rawDt, 0.05);
    const wind = session.weather.wind;
    smoke.wind.x = wind.x * 0.6;
    smoke.wind.z = wind.z * 0.6;
    flames.wind.x = wind.x * 0.2;
    flames.wind.z = wind.z * 0.2;

    timers.flame += FLAME_RATE * dt;
    while (timers.flame >= 1) {
      timers.flame -= 1;
      for (const spot of fires) {
        if (!burning(spot)) continue;
        const spread = 3 * spot.size;
        flames.emit({
          x: spot.x + (random() - 0.5) * spread,
          y: spot.y + 0.2,
          z: spot.z + (random() - 0.5) * spread,
          vx: (random() - 0.5) * 0.6,
          vy: 1.8 + random() * 2.2,
          vz: (random() - 0.5) * 0.6,
          life: 0.7 + random() * 0.6,
          startSize: 3.4 * spot.size,
          endSize: 0.4,
          r: 1,
          g: 0.42 + random() * 0.25,
          b: 0.08,
          alpha: 0.8,
        });
      }
    }

    timers.smoke += SMOKE_RATE * dt;
    while (timers.smoke >= 1) {
      timers.smoke -= 1;
      for (const spot of fires) {
        if (!burning(spot)) continue;
        const shade = 0.16 + random() * 0.1;
        smoke.emit({
          x: spot.x + (random() - 0.5) * 2,
          y: spot.y + 2.5,
          z: spot.z + (random() - 0.5) * 2,
          vx: (random() - 0.5) * 0.8,
          vy: 2.2 + random() * 1.2,
          vz: (random() - 0.5) * 0.8,
          life: 9 + random() * 5,
          startSize: 3 * spot.size,
          endSize: 22 + random() * 10,
          r: shade,
          g: shade * 0.97,
          b: shade * 0.95,
          alpha: 0.5,
        });
      }
    }

    // Aftershock: dust shaken off the ruins (the tremor event sets the burst strength).
    if (quakes.length > 0 && timers.quake > 0) {
      const strength = timers.quake;
      timers.quake = 0;
      {
        for (const quake of quakes) {
          for (let i = 0; i < 30 + strength * 40; i++) {
            const angle = random() * Math.PI * 2;
            const distance = Math.sqrt(random()) * quake.size * 0.8;
            smoke.emit({
              x: quake.x + Math.cos(angle) * distance,
              y: quake.y + 0.5,
              z: quake.z + Math.sin(angle) * distance,
              vx: Math.cos(angle) * 1.5,
              vy: 0.6 + random() * 0.8,
              vz: Math.sin(angle) * 1.5,
              life: 4 + random() * 3,
              startSize: 2,
              endSize: 10 + random() * 6,
              r: 0.55,
              g: 0.5,
              b: 0.44,
              alpha: 0.45,
            });
          }
        }
      }
    }
  });

  return (
    <>
      <primitive object={smoke.points} />
      <primitive object={flames.points} />
    </>
  );
}
