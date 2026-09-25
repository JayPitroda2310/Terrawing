import { useGameManager } from '@/app/GameManagerContext';
import { Button } from '@/components/common/Button';
import { ScreenFrame } from '@/components/common/ScreenFrame';
import { DEFAULT_MISSION_ID } from '@/data/missions';
import { Screen } from '@/game/core/GameState';
import { useProgressStore } from '@/store/progressStore';
import { formatTime } from '@/utils/helpers/format';

export function MainMenu() {
  const manager = useGameManager();
  const record = useProgressStore((s) => s.progress.missions[DEFAULT_MISSION_ID]);

  return (
    <ScreenFrame>
      <div className="flex h-full min-h-[640px] flex-col justify-between px-16 py-14">
        <header className="animate-rise-in">
          <div className="mb-3 flex items-center gap-3 text-[10px] font-semibold tracking-[0.35em] text-ops-dim uppercase">
            <span
              className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-ops-green"
              aria-hidden
            />
            Relay online · Western Mountain Region
          </div>
          <h1 className="text-[76px] leading-[0.9] font-bold tracking-[0.08em] text-ops-text">
            TERRAWING
          </h1>
          <div className="mt-3 flex items-center gap-4">
            <span className="h-px w-14 bg-ops-orange" />
            <span className="text-lg font-semibold tracking-[0.55em] text-ops-orange">
              RESCUE OPS
            </span>
          </div>
        </header>

        <nav
          className="flex w-72 flex-col gap-2.5 animate-rise-in [animation-delay:120ms]"
          aria-label="Main menu"
        >
          <Button
            variant="primary"
            size="lg"
            onClick={() => manager.openBriefing(DEFAULT_MISSION_ID)}
            autoFocus
          >
            <span className="text-[10px] opacity-60">01</span> Start mission
          </Button>
          <Button size="lg" onClick={() => manager.navigate(Screen.MISSION_SELECT)}>
            <span className="text-[10px] opacity-40">02</span> Mission select
          </Button>
          <Button size="lg" onClick={() => manager.openSettings()}>
            <span className="text-[10px] opacity-40">03</span> Settings
          </Button>
          <Button size="lg" onClick={() => manager.navigate(Screen.CREDITS)}>
            <span className="text-[10px] opacity-40">04</span> Credits
          </Button>
        </nav>

        <footer className="flex items-end justify-between gap-8 text-[10px] tracking-[0.2em] text-ops-faint uppercase">
          <div className="space-y-1">
            <div>TW-1 Hybrid Rescue Platform · Build 0.1</div>
            {record?.completed ? (
              <div className="text-ops-dim">
                Mission 01 best · {formatTime(record.bestTimeSeconds ?? 0)} ·{' '}
                {'★'.repeat(record.bestStars)}
                {'☆'.repeat(3 - record.bestStars)} · {record.bestScore ?? 0} pts
              </div>
            ) : (
              <div>No completed operations on record</div>
            )}
          </div>
        </footer>
      </div>
    </ScreenFrame>
  );
}
