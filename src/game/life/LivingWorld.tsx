import { useMemo } from 'react';
import type { GraphicsProfile } from '@/data/graphics';
import type { GameSession } from '@/game/core/GameSession';
import { Citizen, type CitizenSpec } from './Citizens';
import { pickFoxSpots } from './foxSpots';
import { BirdFlock, Fox } from './Wildlife';

const HI_VIS = ['#f2c318', '#ef6a1d', '#f2c318', '#e8e8e2'];
const CIVILIAN = ['#2c3e57', '#5a2e2e', '#4a5a3a', '#6b6f75', '#8a5a2b', '#274a4a'];

/** Extra civilian areas per environment (streets, work sites). */
const CIVILIAN_AREAS: Record<string, { x: number; z: number; radius: number; count: number }[]> = {
  'earthquake-town': [
    { x: -20, z: 40, radius: 30, count: 4 },
    { x: 60, z: 40, radius: 22, count: 2 },
    { x: 0, z: 100, radius: 18, count: 2 },
  ],
  'mountain-collapse': [{ x: -118, z: 172, radius: 12, count: 2 }],
  'forest-fire': [{ x: -120, z: 110, radius: 15, count: 2 }],
};

/** People and animals that make the map feel inhabited. Counts follow graphics quality. */
export function LivingWorld({
  session,
  graphics,
}: {
  session: GameSession;
  graphics: GraphicsProfile;
}) {
  const density = graphics.treeFraction >= 1 ? 1 : graphics.treeFraction >= 0.8 ? 0.75 : 0.5;
  const citizens = useMemo<CitizenSpec[]>(() => {
    const list: CitizenSpec[] = [];
    const base = session.zones.get('base')?.position;
    if (base) {
      const workers = Math.round(6 * density);
      for (let i = 0; i < workers; i++) {
        list.push({
          id: `worker-${i}`,
          home: { x: base.x - 12, z: base.z + 4, radius: 26 },
          jacket: HI_VIS[i % HI_VIS.length]!,
          role: 'worker',
          seed: 100 + i,
        });
      }
    }
    for (const [k, area] of (CIVILIAN_AREAS[session.environment.id] ?? []).entries()) {
      const n = Math.max(1, Math.round(area.count * density));
      for (let i = 0; i < n; i++) {
        list.push({
          id: `civilian-${k}-${i}`,
          home: area,
          jacket: CIVILIAN[(i + k * 2) % CIVILIAN.length]!,
          role: 'civilian',
          seed: 300 + k * 17 + i,
        });
      }
    }
    return list;
  }, [session, density]);
  const foxes = useMemo(
    () => pickFoxSpots(session, Math.round(4 * density), 77),
    [session, density],
  );
  const flocks = useMemo(() => {
    const base = session.zones.get('base')?.position ?? { x: 0, z: 0 };
    return [
      { x: base.x * 0.3, z: base.z * 0.3 },
      { x: -base.x * 0.5, z: -base.z * 0.4 },
    ];
  }, [session]);

  return (
    <group>
      {citizens.map((spec) => (
        <Citizen key={spec.id} session={session} spec={spec} />
      ))}
      {foxes.map((spec, i) => (
        <Fox key={`fox-${i}`} session={session} spec={spec} />
      ))}
      {flocks.map((centre, i) => (
        <BirdFlock
          key={`flock-${i}`}
          session={session}
          centre={centre}
          count={Math.round(10 * density)}
          seed={900 + i}
        />
      ))}
    </group>
  );
}
