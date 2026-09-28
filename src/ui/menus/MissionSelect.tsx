import { useGameManager } from '@/app/GameManagerContext';
import { Button } from '@/components/common/Button';
import { ScreenFrame } from '@/components/common/ScreenFrame';
import { MISSION_CATALOG } from '@/data/missions';
import { Screen } from '@/game/core/GameState';
import { useProgressStore } from '@/store/progressStore';
import { formatTime } from '@/utils/helpers/format';

export function MissionSelect() {
  const manager = useGameManager();
  const progress = useProgressStore((s) => s.progress);

  return (
    <ScreenFrame dim="full">
      <div className="mx-auto flex h-full max-w-5xl flex-col px-12 py-14">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <div className="text-[10px] font-semibold tracking-[0.35em] text-ops-orange uppercase">
              Operations
            </div>
            <h1 className="mt-1 text-3xl font-semibold tracking-[0.12em]">MISSION SELECT</h1>
          </div>
          <Button variant="ghost" onClick={() => manager.navigate(Screen.MAIN_MENU)}>
            ← Back
          </Button>
        </div>

        <ul className="grid grid-cols-2 gap-3 xl:grid-cols-3">
          {MISSION_CATALOG.map((entry, index) => {
            const record = progress.missions[entry.id];
            // Every finished operation is open to play in any order.
            const unlocked = entry.available;
            return (
              <li
                key={entry.id}
                className="animate-rise-in"
                style={{ animationDelay: `${index * 60}ms` }}
              >
                <button
                  type="button"
                  disabled={!unlocked}
                  onClick={() => manager.openBriefing(entry.id)}
                  className="group flex h-full w-full flex-col border border-ops-line bg-ops-panel p-5 text-left transition-colors outline-none hover:border-ops-orange/70 focus-visible:ring-2 focus-visible:ring-ops-cyan disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <div className="flex items-center justify-between text-[10px] font-semibold tracking-[0.3em] text-ops-dim">
                    <span>{entry.code}</span>
                    <span className={unlocked ? 'text-ops-green' : 'text-ops-faint'}>
                      {unlocked ? (record?.completed ? '● COMPLETE' : '● AVAILABLE') : '🔒 LOCKED'}
                    </span>
                  </div>
                  <div className="mt-3 text-xl font-semibold tracking-wide text-ops-text">
                    {entry.name}
                  </div>
                  <div className="mt-1 text-xs text-ops-dim">{entry.teaser}</div>
                  <div className="mt-6 flex items-center justify-between font-mono text-[11px] text-ops-faint">
                    {record?.completed ? (
                      <>
                        <span>BEST {formatTime(record.bestTimeSeconds ?? 0)}</span>
                        <span
                          className="text-ops-amber"
                          aria-label={`${record.bestStars} of 3 stars`}
                        >
                          {'★'.repeat(record.bestStars)}
                          {'☆'.repeat(3 - record.bestStars)}
                        </span>
                      </>
                    ) : (
                      <span>{unlocked ? 'NOT ATTEMPTED' : 'COMPLETE PREVIOUS OPERATIONS'}</span>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </ScreenFrame>
  );
}
