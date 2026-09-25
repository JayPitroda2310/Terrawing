import type { Telemetry } from '@/game/core/Telemetry';

/** Rover telemetry cluster: speed, terrain type and payload. */
export function RoverHUD({ telemetry }: { telemetry: Telemetry }) {
  return (
    <div className="flex items-end gap-6">
      <div>
        <div className="text-[9px] font-semibold tracking-[0.22em] text-ops-faint uppercase">
          Speed
        </div>
        <div className="tabular font-mono text-3xl leading-tight font-semibold text-ops-text">
          {telemetry.speedKmh.toFixed(0)}
          <span className="ml-1 text-[10px] font-normal text-ops-dim">km/h</span>
        </div>
      </div>
      <div>
        <div className="text-[9px] font-semibold tracking-[0.22em] text-ops-faint uppercase">
          Terrain
        </div>
        <div className="font-mono text-sm font-semibold text-ops-text">{telemetry.surface}</div>
      </div>
    </div>
  );
}
