import type { Telemetry } from '@/game/core/Telemetry';
import { Gauge } from './Gauge';

const SLIP_WARNING = 0.3;

/** Rover instruments: speedometer and tyre-grip dial, plus the terrain under the wheels. */
export function RoverHUD({ telemetry }: { telemetry: Telemetry }) {
  const grip = Math.max(0, Math.min(1, telemetry.traction * (1 - telemetry.slip)));
  const slipping = telemetry.slip > SLIP_WARNING;
  const status = telemetry.selfRighting
    ? 'SELF-RIGHTING'
    : slipping
      ? telemetry.speedKmh < 8
        ? 'WHEELSPIN'
        : 'SLIDING'
      : null;
  return (
    <div>
      <div className="flex items-start justify-around">
        <Gauge
          label="Speed"
          unit="km/h"
          value={telemetry.speedKmh}
          min={0}
          max={70}
          major={10}
          zones={[{ from: 55, to: 70, tone: 'danger' }]}
          size={122}
        />
        <div
          role="meter"
          aria-label="Tyre grip"
          aria-valuenow={Math.round(grip * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <Gauge
            label="Grip"
            unit="%"
            value={grip * 100}
            min={0}
            max={100}
            major={25}
            minor={5}
            zones={[{ from: 0, to: 30, tone: 'caution' }]}
            status={status}
            size={104}
          />
        </div>
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-ops-dim">
        <span>TERRAIN {telemetry.surface}</span>
        <span>HDG {Math.round(telemetry.headingDeg).toString().padStart(3, '0')}°</span>
      </div>
    </div>
  );
}
