import { SegmentBar, type BarTone } from '@/components/common/SegmentBar';
import type { BatteryLevel } from '@/game/core/GameEvents';

const LEVEL_TONE: Record<BatteryLevel, BarTone> = {
  normal: 'normal',
  warning: 'caution',
  critical: 'warning',
  emergency: 'critical',
  depleted: 'critical',
};

const LEVEL_TEXT: Record<BatteryLevel, string | null> = {
  normal: null,
  warning: 'Low — plan return',
  critical: 'Critical',
  emergency: 'Emergency power',
  depleted: 'Depleted',
};

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
    <SegmentBar
      label="Battery"
      value={value}
      tone={charging ? 'charging' : LEVEL_TONE[level]}
      status={charging ? '⚡ Charging' : (LEVEL_TEXT[level] ?? drain)}
      pulse={level === 'emergency' || level === 'critical'}
    />
  );
}
