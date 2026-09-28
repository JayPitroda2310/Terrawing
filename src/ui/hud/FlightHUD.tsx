import type { Telemetry } from '@/game/core/Telemetry';
import { Gauge } from './Gauge';

/** Flight instruments: airspeed, altitude above ground and vertical speed dials. */
export function FlightHUD({ telemetry }: { telemetry: Telemetry }) {
  return (
    <div>
      <div className="flex items-start justify-between gap-1">
        <Gauge
          label="Airspeed"
          unit="km/h"
          value={telemetry.speedKmh}
          min={0}
          max={120}
          major={20}
          zones={[{ from: 100, to: 120, tone: 'danger' }]}
          size={104}
        />
        <Gauge
          label="Alt AGL"
          unit="m"
          value={telemetry.altitudeAGL}
          min={0}
          max={150}
          major={25}
          minor={5}
          zones={[{ from: 0, to: 4, tone: 'caution' }]}
          decimals={telemetry.altitudeAGL < 10 ? 1 : 0}
          size={104}
        />
        <Gauge
          label="Climb"
          unit="m/s"
          value={telemetry.verticalSpeed}
          min={-8}
          max={8}
          major={4}
          zones={[{ from: -8, to: -5, tone: 'danger' }]}
          decimals={1}
          size={104}
        />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-ops-dim">
        <span>MSL {telemetry.altitudeASL.toFixed(0)} m</span>
        <span>HDG {Math.round(telemetry.headingDeg).toString().padStart(3, '0')}°</span>
      </div>
    </div>
  );
}
