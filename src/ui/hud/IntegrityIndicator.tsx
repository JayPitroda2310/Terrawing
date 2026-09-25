import { SegmentBar } from '@/components/common/SegmentBar';
import type { IntegrityLevel } from '@/game/systems/DamageSystem';

export function IntegrityIndicator({ value, level }: { value: number; level: IntegrityLevel }) {
  return (
    <SegmentBar
      label="System integrity"
      value={value}
      tone={
        level === 'critical' || level === 'destroyed'
          ? 'critical'
          : level === 'damaged'
            ? 'caution'
            : 'normal'
      }
      status={level === 'critical' ? 'Critical damage' : level === 'damaged' ? 'Damaged' : null}
      pulse={level === 'critical'}
    />
  );
}
