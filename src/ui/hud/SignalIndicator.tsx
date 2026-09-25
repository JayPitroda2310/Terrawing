import { SegmentBar } from '@/components/common/SegmentBar';
import type { SignalState } from '@/game/core/GameEvents';

export function SignalIndicator({ value, state }: { value: number; state: SignalState }) {
  return (
    <SegmentBar
      label="Signal"
      value={value}
      tone={state === 'unstable' ? 'critical' : state === 'weak' ? 'caution' : 'normal'}
      status={state === 'unstable' ? 'Link unstable' : state === 'weak' ? 'Weak link' : null}
      pulse={state === 'unstable'}
    />
  );
}
