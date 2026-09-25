import { useGameManager } from '@/app/GameManagerContext';
import { Button } from '@/components/common/Button';
import { ScreenFrame } from '@/components/common/ScreenFrame';
import { useGameStore } from '@/store/gameStore';
import { useProgressStore } from '@/store/progressStore';
import { formatTime } from '@/utils/helpers/format';
import { RescueReport } from './RescueReport';

export function MissionComplete() {
  const manager = useGameManager();
  const result = useGameStore((s) => s.lastResult);
  const record = useProgressStore((s) =>
    result ? s.progress.missions[result.missionId] : undefined,
  );
  if (!result) return null;

  const stats: [string, string][] = [
    ['Survivors rescued', `${result.survivorsRescued} / ${result.survivorsTotal}`],
    ['Battery remaining', `${Math.round(result.batteryRemaining)}%`],
    ['System integrity', `${Math.round(result.integrity)}%`],
    ['Time', formatTime(result.timeSeconds)],
    ['Scanner accuracy', `${Math.round(result.scannerAccuracy)}%`],
  ];

  return (
    <ScreenFrame dim="full">
      <div className="mx-auto flex h-full min-h-[600px] max-w-4xl flex-col justify-center gap-6 px-12 py-10">
        <div className="animate-rise-in">
          <div className="text-[11px] font-semibold tracking-[0.4em] text-ops-green">
            ● OPERATION SUCCESSFUL
          </div>
          <h1 className="mt-2 text-4xl font-bold tracking-[0.12em] text-ops-text">
            RESCUE OPERATION COMPLETE
          </h1>
        </div>
        <div className="grid grid-cols-[1fr_1.1fr] gap-5">
          <dl className="divide-y divide-ops-line border border-ops-line bg-ops-panel">
            {stats.map(([label, value], i) => (
              <div
                key={label}
                className="flex items-center justify-between px-5 py-3 animate-rise-in"
                style={{ animationDelay: `${150 + i * 90}ms` }}
              >
                <dt className="text-xs tracking-[0.15em] text-ops-dim uppercase">{label}</dt>
                <dd className="tabular font-mono text-lg text-ops-text">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="animate-rise-in [animation-delay:400ms]">
            <RescueReport result={result} isNewBest={record?.bestScore === result.rescueScore} />
          </div>
        </div>
        <div className="flex gap-3">
          <Button variant="primary" onClick={() => manager.quitToMenu()} autoFocus>
            Return to base
          </Button>
          <Button onClick={() => manager.retry()}>Replay mission</Button>
        </div>
      </div>
    </ScreenFrame>
  );
}
