import type { ReactNode } from 'react';
import { MenuOption } from '@/components/common/MenuOption';
import { useGameManager } from '@/app/GameManagerContext';
import type { GameAction } from '@/game/input/actions';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useTelemetryStore } from '@/store/telemetryStore';
import { ICONS } from '@/ui/hud/icons';
import { Keycap } from '@/ui/hud/keycaps';
import { formatTime } from '@/utils/helpers/format';

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-ops-panel-strong px-4 py-3">
      <div className="text-[0.7rem] text-[#f3efe7]/50">{label}</div>
      <div className={`mt-0.5 font-display text-[1.05rem] tabular-nums ${tone ?? ''}`}>{value}</div>
    </div>
  );
}

function ControlRow({ codes, icon, label }: { codes: string[]; icon: ReactNode; label: string }) {
  return (
    <li className="flex items-center gap-3 py-1.5">
      <div className="flex w-[4.6rem] shrink-0 gap-1">
        {codes.map((code) => (
          <Keycap key={code} code={code} />
        ))}
      </div>
      <span className="text-brand">{icon}</span>
      <span className="text-[0.85rem] text-[#f3efe7]/80">{label}</span>
    </li>
  );
}

const DRONE: [GameAction[], ReactNode, string][] = [
  [['ascend', 'descend'], ICONS.altitude, 'Altitude'],
  [['yawLeft', 'yawRight'], ICONS.rotate, 'Rotate'],
  [['pitchForward', 'pitchBack'], ICONS.fly, 'Fly forward / back'],
  [['rollLeft', 'rollRight'], ICONS.slide, 'Slide sideways'],
];
const ROVER: [GameAction[], ReactNode, string][] = [
  [['forward', 'backward'], ICONS.drive, 'Drive / reverse'],
  [['left', 'right'], ICONS.steer, 'Steer'],
  [['brake'], ICONS.brake, 'Brake'],
];
const COMMON: [GameAction[], ReactNode, string][] = [
  [['scan'], ICONS.scan, 'Scanner pulse'],
  [['interact'], ICONS.transform, 'Transform / interact'],
  [['camera'], ICONS.camera, 'Camera view'],
  [['pause'], ICONS.pause, 'Pause'],
];

export function PauseMenu() {
  const manager = useGameManager();
  const session = useGameStore((s) => s.session);
  const telemetry = useTelemetryStore((s) => s.telemetry);
  const bindings = useSettingsStore((s) => s.settings.keyBindings);
  const codes = (actions: GameAction[]) =>
    actions.map((a) => bindings[a]?.[0] ?? '').filter(Boolean);
  const rows = (list: typeof DRONE) =>
    list.map(([actions, icon, label]) => (
      <ControlRow key={label} codes={codes(actions)} icon={icon} label={label} />
    ));
  const battery = Math.round(telemetry.battery);
  const integrity = Math.round(telemetry.integrity);

  return (
    <div className="absolute inset-0 z-20 animate-fade-in overflow-y-auto bg-[rgb(7_9_11/0.82)] font-sans text-[#f3efe7]">
      <div className="mx-auto grid min-h-full max-w-6xl grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] items-center gap-12 px-[clamp(2rem,5vw,5rem)] py-12">
        <section className="animate-rise-in">
          <div className="font-display text-[0.8rem] tracking-[0.14em] text-brand uppercase">
            Operation paused
          </div>
          <h1 className="mt-2 font-display text-[clamp(2.2rem,4.2vw,3.6rem)] leading-none tracking-[0.02em] uppercase">
            {session?.mission.name}
          </h1>
          <div className="mt-1 text-[0.85rem] text-[#f3efe7]/50">{session?.mission.code}</div>

          <div className="mt-7 grid grid-cols-4 gap-px border border-ops-line bg-ops-line">
            <Stat label="Mission time" value={formatTime(telemetry.missionTime)} />
            <Stat
              label="Survivors"
              value={`${telemetry.survivorsSecured} / ${telemetry.survivorsTotal}`}
              tone="text-brand"
            />
            <Stat
              label="Battery"
              value={`${battery}%`}
              tone={battery < 20 ? 'text-ops-red' : undefined}
            />
            <Stat
              label="Integrity"
              value={`${integrity}%`}
              tone={integrity < 35 ? 'text-ops-red' : undefined}
            />
          </div>

          <nav aria-label="Pause menu" className="mt-9 flex flex-col gap-1">
            <MenuOption autoFocus onClick={() => manager.resume()}>
              Resume
            </MenuOption>
            <MenuOption onClick={() => manager.retry()}>Restart mission</MenuOption>
            <MenuOption onClick={() => manager.openSettings()}>Settings</MenuOption>
            <div className="my-2 ml-5 h-px w-40 bg-[#f3efe7]/10" />
            <MenuOption danger onClick={() => manager.quitToMenu()}>
              Abort mission
            </MenuOption>
          </nav>
        </section>

        <section className="animate-rise-in border border-ops-line bg-ops-panel-strong p-6 [animation-delay:80ms]">
          <div className="font-display text-[0.8rem] tracking-[0.14em] text-[#f3efe7]/70 uppercase">
            Controls
          </div>
          <div className="mt-4 grid grid-cols-2 gap-6">
            <div>
              <div className="mb-1 text-[0.75rem] text-brand">Drone</div>
              <ul>{rows(DRONE)}</ul>
            </div>
            <div>
              <div className="mb-1 text-[0.75rem] text-brand">Rover</div>
              <ul>{rows(ROVER)}</ul>
            </div>
          </div>
          <div className="mt-4 border-t border-ops-line pt-4">
            <ul className="grid grid-cols-2 gap-x-6">{rows(COMMON)}</ul>
            <div className="mt-2 flex items-center gap-3 text-[0.85rem] text-[#f3efe7]/60">
              <span className="keycap w-[4.6rem] text-brand">{ICONS.mouse}</span>
              Click to capture the mouse and look around
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
