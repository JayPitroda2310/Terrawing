export type BarTone = 'normal' | 'caution' | 'warning' | 'critical' | 'charging';

const TONE_COLOR: Record<BarTone, string> = {
  normal: 'bg-ops-text',
  caution: 'bg-ops-amber',
  warning: 'bg-ops-orange',
  critical: 'bg-ops-red',
  charging: 'bg-ops-cyan',
};

const TONE_TEXT: Record<BarTone, string> = {
  normal: 'text-ops-text',
  caution: 'text-ops-amber',
  warning: 'text-ops-orange',
  critical: 'text-ops-red',
  charging: 'text-ops-cyan',
};

interface SegmentBarProps {
  label: string;
  value: number;
  tone: BarTone;
  /** Text status shown alongside colour so state is never conveyed by colour alone. */
  status?: string | null;
  segments?: number;
  pulse?: boolean;
}

/**
 * Segmented resource bar, e.g.
 *   BATTERY            82%
 *   ████████░░
 */
export function SegmentBar({
  label,
  value,
  tone,
  status,
  segments = 10,
  pulse = false,
}: SegmentBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const filled = clamped / (100 / segments);
  return (
    <div
      className="w-full"
      role="meter"
      aria-label={label}
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-semibold tracking-[0.2em] text-ops-dim uppercase">
          {label}
        </span>
        <span
          className={`tabular font-mono text-sm font-semibold ${TONE_TEXT[tone]} ${pulse ? 'animate-pulse-soft' : ''}`}
        >
          {Math.round(clamped)}%
        </span>
      </div>
      <div className="flex gap-[3px]">
        {Array.from({ length: segments }, (_, i) => {
          const fill = Math.max(0, Math.min(1, filled - i));
          return (
            <div key={i} className="relative h-2 flex-1 overflow-hidden bg-white/[0.07]">
              <div
                className={`absolute inset-y-0 left-0 transition-[width] duration-300 ease-out ${TONE_COLOR[tone]}`}
                style={{ width: `${fill * 100}%` }}
              />
            </div>
          );
        })}
      </div>
      {status && (
        <div
          className={`mt-1 text-[9px] font-semibold tracking-[0.2em] uppercase ${TONE_TEXT[tone]}`}
        >
          {status}
        </div>
      )}
    </div>
  );
}
