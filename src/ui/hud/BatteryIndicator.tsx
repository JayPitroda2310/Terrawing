import { Gauge } from './Gauge';
import type { BatteryLevel } from '@/game/core/GameEvents';

const LEVEL_TEXT: Record<BatteryLevel, string | null> = {
  normal: null,
  warning: 'Low — plan return',
  critical: 'Critical',
  emergency: 'Emergency power',
  depleted: 'Depleted',
};

/** Battery dial: charge with low-charge bands, and a status (drain rate, charging, warnings). */
export function BatteryIndicator({
  value,
  level,
  charging,
  rate,
}: {
  value: number;
  level: BatteryLevel;
  charging: boolean;
  rate: number;
}) {
  const drain = rate > 0 ? `−${rate.toFixed(2)}%/s` : null;
  return (
    <div
      role="meter"
      aria-label="Battery"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <Gauge
        label="Battery"
        unit="%"
        value={value}
        min={0}
        max={100}
        major={25}
        minor={5}
        zones={[
          { from: 0, to: 10, tone: 'danger' },
          { from: 10, to: 20, tone: 'caution' },
        ]}
        status={charging ? '⚡ Charging' : (LEVEL_TEXT[level] ?? drain)}
        size={112}
      />
    </div>
  );
}
