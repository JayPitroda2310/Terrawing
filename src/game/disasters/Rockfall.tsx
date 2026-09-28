import { useFrame } from '@react-three/fiber';
import { ConvexHullCollider, type RapierRigidBody, RigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import type { GameSession } from '@/game/core/GameSession';
import { type BoulderAsset, useBoulders } from '@/game/environment/boulders';
import type { HazardDefinition } from '@/game/missions/MissionDefinition';
import { createRandom, type RandomFn } from '@/utils/math/random';

/** Boulders kept per rockfall zone (reused oldest-first). */
const POOL = 5;
/** Seconds between falls: normally, and when rotor wash / an aftershock loosens the slope. */
const INTERVAL = [14, 30] as const;
const DISTURBED_INTERVAL = [3, 7] as const;
const PARK_Y = -400;

interface Rock {
  asset: BoulderAsset;
  hull: Float32Array;
  size: number;
}

/**
 * Rockfalls: loose boulders break off the slope above rockfall zones and tumble down under real
 * rigid-body physics (convex hulls of the scanned rocks), coming to rest where they land. Rotor
 * downwash over the slope and aftershocks bring them down far more often.
 */
export function Rockfalls({ session }: { session: GameSession }) {
  const zones = session.mission.hazards.filter((h) => h.kind === 'rockfall');
  if (zones.length === 0) return null;
  return (
    <>
      {zones.map((hazard, i) => (
        <RockfallZone key={hazard.id} session={session} hazard={hazard} seed={700 + i * 31} />
      ))}
    </>
  );
}

function RockfallZone({
  session,
  hazard,
  seed,
}: {
  session: GameSession;
  hazard: HazardDefinition;
  seed: number;
}) {
  const boulders = useBoulders();
  const random = useMemo(() => createRandom(seed), [seed]);
  const rocks = useMemo<Rock[]>(() => {
    const r = createRandom(seed + 1);
    return Array.from({ length: POOL }, (_, i) => {
      const asset = boulders[i % boulders.length]!;
      const size = 0.45 + r() * 0.55;
      return { asset, size, hull: asset.hull.map((v) => v * size) };
    });
  }, [boulders, seed]);
  const bodies = useRef<(RapierRigidBody | null)[]>([]);
  const state = useMemo(
    () => ({
      timer: 6 + random() * 8,
      next: 0,
      burst: 0,
      landed: new Array<boolean>(POOL).fill(true),
    }),
    [random],
  );

  if (import.meta.env.DEV) (window as unknown as { __twRocks?: unknown }).__twRocks = bodies;
  useEffect(
    () =>
      session.events.on('world:tremor', ({ intensity }) => {
        state.burst += 1 + Math.round(intensity * 2);
      }),
    [session, state],
  );

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    // A boulder that left the world (off the map edge) goes back to the pool.
    bodies.current.forEach((body, i) => {
      if (!body || state.landed[i]) return;
      const p = body.translation();
      if (p.y < session.terrain.heightAt(p.x, p.z) - 30) park(body, i);
    });
    const v = session.vehicle.state;
    const [hx, hz] = hazard.position;
    const nearby = Math.hypot(v.position.x - hx, v.position.z - hz) < hazard.radius * 1.6;
    const washing = nearby && v.mode === 'FLIGHT' && v.altitudeAGL < 22;
    state.timer -= dt * (washing ? 3 : 1);
    if (state.timer <= 0 || state.burst > 0) {
      if (state.burst > 0) state.burst--;
      else {
        const [lo, hi] = washing ? DISTURBED_INTERVAL : INTERVAL;
        state.timer = lo + random() * (hi - lo);
      }
      release(state.next, random);
      state.next = (state.next + 1) % POOL;
    }
  });

  /** Breaks a boulder loose from the high ground at the edge of the zone. */
  function release(index: number, rand: RandomFn): void {
    const body = bodies.current[index];
    if (!body) return;
    const [hx, hz] = hazard.position;
    // The slope above: the highest of several points around the zone edge.
    let best = { x: hx, z: hz, y: -Infinity };
    for (let k = 0; k < 10; k++) {
      const a = rand() * Math.PI * 2;
      const r = hazard.radius * (0.7 + rand() * 0.5);
      const x = hx + Math.cos(a) * r;
      const z = hz + Math.sin(a) * r;
      const y = session.terrain.heightAt(x, z);
      if (y > best.y) best = { x, z, y };
    }
    const toCentre = Math.atan2(hz - best.z, hx - best.x);
    body.setTranslation({ x: best.x, y: best.y + 2.5 + rand() * 2, z: best.z }, true);
    const q = [rand() - 0.5, rand() - 0.5, rand() - 0.5, 1];
    const n = Math.hypot(...q);
    body.setRotation({ x: q[0]! / n, y: q[1]! / n, z: q[2]! / n, w: q[3]! / n }, true);
    body.setGravityScale(1, true);
    const push = 2 + rand() * 3;
    body.setLinvel({ x: Math.cos(toCentre) * push, y: -1, z: Math.sin(toCentre) * push }, true);
    body.setAngvel({ x: (rand() - 0.5) * 4, y: (rand() - 0.5) * 2, z: (rand() - 0.5) * 4 }, true);
    state.landed[index] = false;
  }

  function park(body: RapierRigidBody, index: number): void {
    body.setGravityScale(0, false);
    body.setLinvel({ x: 0, y: 0, z: 0 }, false);
    body.setAngvel({ x: 0, y: 0, z: 0 }, false);
    body.setTranslation(
      { x: hazard.position[0], y: PARK_Y - index * 10, z: hazard.position[1] },
      false,
    );
    state.landed[index] = true;
  }

  function onHit(index: number): void {
    const body = bodies.current[index];
    if (!body || state.landed[index]) return;
    const speed = Math.hypot(body.linvel().x, body.linvel().y, body.linvel().z);
    if (speed < 3) return;
    const p = body.translation();
    session.events.emit('world:crash', {
      x: p.x,
      y: p.y,
      z: p.z,
      size: Math.min(1, rocks[index]!.size * speed * 0.12),
    });
  }

  return (
    <>
      {rocks.map((rock, i) => (
        <RigidBody
          key={i}
          ref={(body) => {
            bodies.current[i] = body;
          }}
          colliders={false}
          position={[hazard.position[0], PARK_Y - i * 10, hazard.position[1]]}
          gravityScale={0}
          linearDamping={0.05}
          angularDamping={0.4}
          ccd
          onCollisionEnter={() => onHit(i)}
        >
          <ConvexHullCollider args={[rock.hull]} density={2600} friction={0.9} restitution={0.15} />
          <mesh
            geometry={rock.asset.geometry}
            material={rock.asset.material}
            scale={rock.size}
            castShadow
            receiveShadow
          />
        </RigidBody>
      ))}
    </>
  );
}
