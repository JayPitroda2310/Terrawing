import { MenuOption } from '@/components/common/MenuOption';
import { useGameManager } from '@/app/GameManagerContext';
import { DEFAULT_MISSION_ID, loadMission } from '@/data/missions';
import { Screen } from '@/game/core/GameState';
import { useProgressStore } from '@/store/progressStore';
import { formatTime } from '@/utils/helpers/format';

/** Fine photographic grain, so the flat UI sits in the scene like print rather than a screen. */
const GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.55 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";

/** Mountain-rescue roundel: a ridge line under a rescue cross. */
function Emblem() {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
      <circle
        cx="17"
        cy="17"
        r="15.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        opacity="0.9"
      />
      <path
        d="M5.5 23.5 L12 15.5 L15.5 19.5 L20 13 L28.5 23.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M17 5.8v5.4M14.3 8.5h5.4" stroke="#7fda59" strokeWidth="2" strokeLinecap="square" />
    </svg>
  );
}

export function MainMenu() {
  const manager = useGameManager();
  const record = useProgressStore((s) => s.progress.missions[DEFAULT_MISSION_ID]);
  const mission = loadMission(DEFAULT_MISSION_ID);
  const missionName = mission.ok ? mission.mission.name : 'Mountain Collapse';

  return (
    <div className="absolute inset-0 z-20 animate-fade-in overflow-hidden font-sans text-[#f3efe7]">
      {/* Soft scrim anchored bottom-left, where the type sits; the scene stays open elsewhere. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 95% at 0% 100%, rgb(8 9 10 / 0.88) 0%, rgb(8 9 10 / 0.6) 40%, rgb(8 9 10 / 0) 72%), linear-gradient(90deg, rgb(8 9 10 / 0.55) 0%, rgb(8 9 10 / 0.3) 35%, rgb(8 9 10 / 0) 60%), linear-gradient(180deg, rgb(8 9 10 / 0.45) 0%, rgb(8 9 10 / 0) 22%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07] mix-blend-overlay"
        style={{ backgroundImage: GRAIN }}
      />

      <div className="relative flex h-full min-h-[620px] flex-col px-[clamp(2rem,5.5vw,6rem)] py-[clamp(1.75rem,4vh,3rem)]">
        {/* Masthead */}
        <header className="flex items-start justify-between animate-rise-in">
          <div className="flex items-center gap-3 text-[#f3efe7]/90">
            <Emblem />
            <div className="font-display text-[0.8rem] tracking-[0.08em] text-[#f3efe7]/70 uppercase">
              Alpine Search &amp; Rescue
            </div>
          </div>
          <div className="text-right text-[0.8rem] leading-snug text-[#f3efe7]/55">
            <div>Western Mountain Region</div>
            <div className="text-[#f3efe7]/40">Light rain, 6 °C · Relay online</div>
          </div>
        </header>

        {/* Title and menu, set low on the page over the darker ground. */}
        <main className="mt-auto max-w-[44rem]">
          <h1 className="animate-rise-in [animation-delay:80ms]">
            <img
              src="/assets/brand/terrawing-logo.png"
              alt="TerraWing"
              draggable={false}
              className="w-[clamp(20rem,44vw,46rem)] drop-shadow-[0_2px_24px_rgb(0_0_0/0.45)]"
            />
          </h1>
          <p className="mt-5 animate-rise-in text-[clamp(1.05rem,1.5vw,1.35rem)] font-light tracking-[0.02em] text-[#f3efe7]/80 [text-shadow:0_1px_18px_rgb(0_0_0/0.5)] [animation-delay:160ms]">
            Hybrid drone-rover search &amp; rescue. Every minute counts.
          </p>

          <nav
            aria-label="Main menu"
            className="mt-[clamp(2rem,6vh,3.5rem)] flex animate-rise-in flex-col gap-1 [animation-delay:260ms]"
          >
            <MenuOption
              autoFocus
              detail={`Mission 01 — ${missionName}`}
              onClick={() => manager.openBriefing(DEFAULT_MISSION_ID)}
            >
              Start mission
            </MenuOption>
            <MenuOption onClick={() => manager.navigate(Screen.MISSION_SELECT)}>
              Mission select
            </MenuOption>
            <MenuOption onClick={() => manager.openSettings()}>Settings</MenuOption>
            <MenuOption onClick={() => manager.navigate(Screen.CREDITS)}>Credits</MenuOption>
          </nav>
        </main>

        {/* Footer: record on the left, signature on the right. */}
        <footer className="mt-[clamp(2rem,6vh,3.5rem)] flex animate-rise-in items-end justify-between gap-8 border-t border-[#f3efe7]/12 pt-4 text-[0.8rem] text-[#f3efe7]/50 [animation-delay:360ms]">
          <div className="tabular-nums">
            {record?.completed ? (
              <>
                Best on {missionName}{' '}
                <span className="text-[#f3efe7]/80">{formatTime(record.bestTimeSeconds ?? 0)}</span>
                {' · '}
                {record.bestStars} of 3 stars
                {' · '}
                {(record.bestScore ?? 0).toLocaleString('en-US')} points
              </>
            ) : (
              'No operations flown yet'
            )}
          </div>
          <div className="flex items-baseline gap-5">
            <span className="font-display text-[0.78rem] tracking-[0.06em] text-[#f3efe7]/70">
              A game by <span className="text-brand">Jay Pitroda</span>
            </span>
            <span className="text-[#f3efe7]/35">v0.1</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
