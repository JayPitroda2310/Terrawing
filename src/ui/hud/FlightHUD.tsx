import type { Telemetry } from '@/game/core/Telemetry';

function Readout({
  label,
  value,
  unit,
  emphasis = false,
}: {
  label: string;
  value: string;
  unit: string;
  emphasis?: boolean;
}) {
  return (
    <div>
      <div className="text-[9px] font-semibold tracking-[0.22em] text-ops-faint uppercase">
        {label}
      </div>
      <div
        className={`tabular font-mono ${emphasis ? 'text-3xl' : 'text-lg'} leading-tight font-semibold text-ops-text`}
      >
        {value}
        <span className="ml-1 text-[10px] font-normal text-ops-dim">{unit}</span>
      </div>
    </div>
  );
}

/** Flight telemetry cluster: altitude, speed and climb rate. */
export function FlightHUD({ telemetry }: { telemetry: Telemetry }) {
  const climb = telemetry.verticalSpeed;
  const climbArrow = climb > 0.5 ? '▲' : climb < -0.5 ? '▼' : '■';
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-2">
      <Readout label="Altitude AGL" value={telemetry.altitudeAGL.toFixed(0)} unit="m" emphasis />
      <Readout label="Speed" value={telemetry.speedKmh.toFixed(0)} unit="km/h" emphasis />
      <Readout label="Altitude MSL" value={telemetry.altitudeASL.toFixed(0)} unit="m" />
      <Readout label={`Climb ${climbArrow}`} value={climb.toFixed(1)} unit="m/s" />
    </div>
  );
}
