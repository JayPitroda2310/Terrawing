import { useGameManager } from '@/app/GameManagerContext';
import { Button } from '@/components/common/Button';
import { ScreenFrame } from '@/components/common/ScreenFrame';
import type { FailureReason } from '@/game/core/GameEvents';
import { useGameStore } from '@/store/gameStore';

const REASONS: Readonly<Record<FailureReason, { title: string; advice: string }>> = {
  BATTERY_DEPLETED: {
    title: 'BATTERY DEPLETED',
    advice:
      'Flight and hovering drain power quickly. Drive where you can and recharge on the base or LZ pads.',
  },
  SYSTEM_INTEGRITY_CRITICAL: {
    title: 'SYSTEM INTEGRITY CRITICAL',
    advice:
      'Avoid hard impacts, the river and rockfall zones. Land and drive near unstable cliffs.',
  },
  TIME_EXPIRED: {
    title: 'TIME LIMIT EXCEEDED',
    advice: 'Use the scanner early to plan a route between survivors before committing.',
  },
};

export function MissionFailed() {
  const manager = useGameManager();
  const result = useGameStore((s) => s.lastResult);
  const reason = REASONS[result?.failureReason ?? 'TIME_EXPIRED'];
  return (
    <ScreenFrame dim="full">
      <div className="flex h-full items-center justify-center p-12">
        <div className="w-[560px] border border-ops-red/50 bg-ops-panel-strong p-8 animate-rise-in">
          <div className="text-[11px] font-semibold tracking-[0.4em] text-ops-red">
            ▲ MISSION FAILED
          </div>
          <div className="mt-4 text-[10px] tracking-[0.3em] text-ops-dim uppercase">Reason</div>
          <h1 className="mt-1 text-3xl font-bold tracking-[0.1em] text-ops-text">{reason.title}</h1>
          <p className="mt-4 text-sm leading-relaxed text-ops-dim">{reason.advice}</p>
          {result && (
            <p className="mt-3 font-mono text-xs text-ops-faint">
              Survivors secured {result.survivorsRescued}/{result.survivorsTotal}
            </p>
          )}
          <div className="mt-8 flex gap-3">
            <Button variant="primary" onClick={() => manager.retry()} autoFocus>
              Retry mission
            </Button>
            <Button onClick={() => manager.quitToMenu()}>Return to menu</Button>
          </div>
        </div>
      </div>
    </ScreenFrame>
  );
}
