import { useState } from 'react';
import { useGameManager } from '@/app/GameManagerContext';
import { useDebugStore } from '@/store/debugStore';
import { useGameStore } from '@/store/gameStore';
import { useMissionStore } from '@/store/missionStore';
import { useTelemetryStore } from '@/store/telemetryStore';
import { useAnimationFrame } from '@/ui/hud/useAnimationFrame';

/**
 * Development-only diagnostics (toggle with F3). This module is lazy-loaded behind
 * `import.meta.env.DEV`, so it never ships in production bundles.
 */
export default function DebugPanel() {
  const manager = useGameManager();
  const session = useGameStore((s) => s.session);
  const screen = useGameStore((s) => s.screen);
  const colliders = useGameStore((s) => s.debugColliders);
  const setColliders = useGameStore((s) => s.setDebugColliders);
  const stats = useDebugStore((s) => s.stats);
  const telemetry = useTelemetryStore((s) => s.telemetry);
  const objectives = useMissionStore((s) => s.objectives);
  const [live, setLive] = useState({ vx: 0, vy: 0, vz: 0, grounded: false, gravity: 0 });

  useAnimationFrame(() => {
    if (!session) return;
    const v = session.vehicle.state.velocity;
    const command = session.vehicle.command;
    if (Math.abs(v.x - live.vx) + Math.abs(v.y - live.vy) + Math.abs(v.z - live.vz) > 0.05) {
      setLive({
        vx: v.x,
        vy: v.y,
        vz: v.z,
        grounded: session.vehicle.state.grounded,
        gravity: command.gravityScale,
      });
    }
  });

  const teleports: [string, number, number][] = session
    ? [
        ['Base', ...session.mission.spawn.position],
        ...session.mission.survivors.map((s): [string, number, number] => [
          s.callsign,
          s.position[0] - 10,
          s.position[1],
        ]),
        [
          'Extraction',
          ...(session.zones.get(session.mission.extractionZoneId)?.definition.position ?? [0, 0]),
        ],
      ]
    : [];

  const row = (label: string, value: string | number) => (
    <div className="flex justify-between gap-4">
      <span className="text-ops-faint">{label}</span>
      <span className="tabular text-ops-text">{value}</span>
    </div>
  );

  return (
    <div className="pointer-events-auto absolute top-[350px] left-5 z-40 w-[300px] border border-ops-cyan/50 bg-black/85 p-3 font-mono text-[11px] text-ops-dim">
      <div className="mb-2 flex justify-between text-[10px] font-semibold tracking-[0.2em] text-ops-cyan">
        <span>DEBUG · F3</span>
        <span>{import.meta.env.MODE}</span>
      </div>
      {row('FPS', stats.fps)}
      {row('Draw calls', stats.drawCalls)}
      {row('Triangles', stats.triangles.toLocaleString())}
      {row('Geometries / textures', `${stats.geometries} / ${stats.textures}`)}
      <div className="my-2 border-t border-ops-line" />
      {row('Screen', screen)}
      {row('Gameplay', session?.gameplay.kind ?? '—')}
      {row('Session phase', session?.phase ?? '—')}
      {row('Position', `${telemetry.x.toFixed(1)}, ${telemetry.z.toFixed(1)}`)}
      {row(
        'Altitude AGL / MSL',
        `${telemetry.altitudeAGL.toFixed(1)} / ${telemetry.altitudeASL.toFixed(1)}`,
      )}
      {row('Velocity', `${live.vx.toFixed(1)}, ${live.vy.toFixed(1)}, ${live.vz.toFixed(1)}`)}
      {row('Grounded / gravity', `${live.grounded} / ${live.gravity}`)}
      {row(
        'Battery / signal',
        `${telemetry.battery.toFixed(1)}% / ${telemetry.signal.toFixed(0)}%`,
      )}
      {row(
        'Objectives',
        `${objectives.filter((o) => o.status === 'completed').length}/${objectives.length}`,
      )}
      {session && (
        <>
          <div className="my-2 border-t border-ops-line" />
          <div className="mb-1 text-[10px] tracking-[0.2em] text-ops-faint">TELEPORT</div>
          <div className="flex flex-wrap gap-1">
            {teleports.map(([label, x, z]) => (
              <DebugButton key={label} onClick={() => session.debugTeleport(x, z)}>
                {label}
              </DebugButton>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            <DebugButton onClick={() => setColliders(!colliders)}>
              {colliders ? 'Hide' : 'Show'} colliders
            </DebugButton>
            <DebugButton onClick={() => session.tryScan()}>Scan</DebugButton>
            <DebugButton onClick={() => session.debugRefill()}>Refill battery</DebugButton>
            <DebugButton onClick={() => (session.invulnerable = !session.invulnerable)}>
              Toggle invulnerable
            </DebugButton>
            <DebugButton onClick={() => manager.retry()}>Reset mission</DebugButton>
          </div>
        </>
      )}
    </div>
  );
}

function DebugButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border border-ops-line-strong px-2 py-1 text-[10px] text-ops-text hover:border-ops-cyan hover:text-ops-cyan"
    >
      {children}
    </button>
  );
}
