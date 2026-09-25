import { useMemo } from 'react';
import { useGameManager } from '@/app/GameManagerContext';
import { Button } from '@/components/common/Button';
import { Panel } from '@/components/common/Panel';
import { ScreenFrame } from '@/components/common/ScreenFrame';
import { loadMission } from '@/data/missions';
import { Screen } from '@/game/core/GameState';
import { useGameStore } from '@/store/gameStore';
import { formatTime } from '@/utils/helpers/format';
import { ControlsReference } from '@/ui/menus/ControlsReference';

export function MissionBriefing() {
  const manager = useGameManager();
  const missionId = useGameStore((s) => s.selectedMissionId);
  const mission = useMemo(() => {
    const result = loadMission(missionId);
    return result.ok ? result.mission : null;
  }, [missionId]);
  if (!mission) return null;
  const b = mission.briefing;
  const facts: [string, string][] = [
    ['Location', b.location],
    ['Status', b.status],
    ['Weather', b.weather],
    ['Visibility', b.visibility],
    ['Risk', b.risk],
    ['Time limit', formatTime(mission.timeLimit)],
  ];

  return (
    <ScreenFrame dim="full">
      <div className="mx-auto flex h-full min-h-[640px] max-w-6xl items-center gap-6 px-12 py-10">
        <div className="flex flex-1 flex-col gap-5 animate-rise-in">
          <div>
            <div className="text-[11px] font-semibold tracking-[0.4em] text-ops-orange">
              {mission.code}
            </div>
            <h1 className="mt-2 text-5xl font-bold tracking-[0.1em] text-ops-text">
              {mission.name.toUpperCase()}
            </h1>
          </div>
          <dl className="grid grid-cols-3 gap-px border border-ops-line bg-ops-line">
            {facts.map(([label, value]) => (
              <div key={label} className="bg-ops-panel-strong px-4 py-3">
                <dt className="text-[9px] font-semibold tracking-[0.25em] text-ops-faint uppercase">
                  {label}
                </dt>
                <dd
                  className={`mt-1 font-mono text-sm ${label === 'Status' ? 'text-ops-orange' : 'text-ops-text'}`}
                >
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          <div className="space-y-2 border-l-2 border-ops-orange/70 pl-5 text-[15px] leading-relaxed text-ops-text">
            {b.paragraphs.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="primary" size="lg" onClick={() => manager.beginMission()} autoFocus>
              Begin rescue →
            </Button>
            <Button size="lg" variant="ghost" onClick={() => manager.navigate(Screen.MAIN_MENU)}>
              Back
            </Button>
          </div>
        </div>
        <div className="flex w-[380px] flex-col gap-4 animate-rise-in [animation-delay:120ms]">
          <Panel title="Field notes">
            <ul className="space-y-2 text-xs leading-relaxed text-ops-dim">
              {b.tips.map((tip) => (
                <li key={tip} className="flex gap-2">
                  <span className="text-ops-orange" aria-hidden>
                    ▸
                  </span>
                  {tip}
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Controls">
            <ControlsReference />
          </Panel>
        </div>
      </div>
    </ScreenFrame>
  );
}
