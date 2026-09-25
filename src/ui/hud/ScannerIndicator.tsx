import { formatKeyCode } from '@/game/input/actions';
import { useSettingsStore } from '@/store/settingsStore';

/** Scanner readiness ring and key hint. */
export function ScannerIndicator({ readiness, active }: { readiness: number; active: boolean }) {
  const key = useSettingsStore((s) => formatKeyCode(s.settings.keyBindings.scan[0] ?? 'KeyQ'));
  const ready = readiness >= 1;
  const circumference = 2 * Math.PI * 16;
  return (
    <div className="flex items-center gap-3">
      <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden>
        <circle
          cx="20"
          cy="20"
          r="16"
          fill="none"
          stroke="rgb(255 255 255 / 0.1)"
          strokeWidth="3"
        />
        <circle
          cx="20"
          cy="20"
          r="16"
          fill="none"
          stroke={ready ? '#52d6d0' : '#8b99a3'}
          strokeWidth="3"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - readiness)}
          transform="rotate(-90 20 20)"
        />
        <circle
          cx="20"
          cy="20"
          r={active ? 7 : 4}
          fill={ready ? '#52d6d0' : '#56636c'}
          className={active ? 'animate-pulse-soft' : ''}
        />
      </svg>
      <div>
        <div className="text-[10px] font-semibold tracking-[0.2em] text-ops-dim uppercase">
          Scanner
        </div>
        <div
          className={`font-mono text-xs font-semibold ${ready ? 'text-ops-cyan' : 'text-ops-dim'}`}
        >
          {active
            ? 'PULSE ACTIVE'
            : ready
              ? `READY [${key}]`
              : `CHARGING ${Math.round(readiness * 100)}%`}
        </div>
      </div>
    </div>
  );
}
