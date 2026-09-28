import type { IntegrityLevel } from '@/game/systems/DamageSystem';
import { Gauge } from './Gauge';

/** Structural integrity dial with damaged / critical bands. */
export function IntegrityIndicator({ value, level }: { value: number; level: IntegrityLevel }) {
  return (
    <div
      role="meter"
      aria-label="System integrity"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <Gauge
        label="Integrity"
        unit="%"
        value={value}
        min={0}
        max={100}
        major={25}
        minor={5}
        zones={[
          { from: 0, to: 25, tone: 'danger' },
          { from: 25, to: 60, tone: 'caution' },
        ]}
        status={level === 'critical' ? 'Critical damage' : level === 'damaged' ? 'Damaged' : null}
        size={112}
      />
    </div>
  );
}
