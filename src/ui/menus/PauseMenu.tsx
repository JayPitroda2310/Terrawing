import { useGameManager } from '@/app/GameManagerContext';
import { Button } from '@/components/common/Button';
import { Panel } from '@/components/common/Panel';
import { ScreenFrame } from '@/components/common/ScreenFrame';
import { useGameStore } from '@/store/gameStore';
import { useTelemetryStore } from '@/store/telemetryStore';
import { formatTime } from '@/utils/helpers/format';
import { ControlsReference } from './ControlsReference';

export function PauseMenu() {
  const manager = useGameManager();
  const session = useGameStore((s) => s.session);
  const telemetry = useTelemetryStore((s) => s.telemetry);

  return (
    <ScreenFrame dim="full">
      <div className="flex h-full items-center justify-center gap-6 p-12">
        <Panel className="w-80 animate-rise-in" title="Operation paused">
          <div className="mb-5 font-mono text-xs text-ops-dim">
            <div>
              {session?.mission.code} — {session?.mission.name.toUpperCase()}
            </div>
            <div className="mt-1">
              T+ {formatTime(telemetry.missionTime)} · {telemetry.survivorsSecured}/
              {telemetry.survivorsTotal} secured
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Button variant="primary" onClick={() => manager.resume()} autoFocus>
              Resume
            </Button>
            <Button onClick={() => manager.retry()}>Restart mission</Button>
            <Button onClick={() => manager.openSettings()}>Settings</Button>
            <Button variant="ghost" onClick={() => manager.quitToMenu()}>
              Abort to main menu
            </Button>
          </div>
        </Panel>
        <Panel className="w-[380px] animate-rise-in [animation-delay:80ms]" title="Controls">
          <ControlsReference />
        </Panel>
      </div>
    </ScreenFrame>
  );
}
