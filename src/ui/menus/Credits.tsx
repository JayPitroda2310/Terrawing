import { useGameManager } from '@/app/GameManagerContext';
import { Button } from '@/components/common/Button';
import { Panel } from '@/components/common/Panel';
import { ScreenFrame } from '@/components/common/ScreenFrame';
import { Screen } from '@/game/core/GameState';

const CREDITS: readonly [string, string][] = [
  ['Game design & engineering', 'TerraWing Rescue Ops team'],
  ['Rendering', 'three.js · React Three Fiber · drei'],
  ['Physics', 'Rapier'],
  ['Audio', 'Howler.js · procedural placeholder synthesis'],
  ['Interface', 'React · Tailwind CSS · Zustand'],
  ['Typefaces', 'Inter · JetBrains Mono'],
];

export function Credits() {
  const manager = useGameManager();
  return (
    <ScreenFrame dim="full">
      <div className="flex h-full items-center justify-center p-12">
        <Panel title="Credits" className="w-[520px] animate-rise-in">
          <dl className="space-y-3 py-2">
            {CREDITS.map(([role, name]) => (
              <div
                key={role}
                className="flex justify-between gap-6 border-b border-ops-line pb-2 text-sm"
              >
                <dt className="text-ops-dim">{role}</dt>
                <dd className="text-right text-ops-text">{name}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs leading-relaxed text-ops-faint">
            Dedicated to mountain rescue volunteers everywhere.
          </p>
          <div className="mt-6 flex justify-end">
            <Button onClick={() => manager.navigate(Screen.MAIN_MENU)} autoFocus>
              Back
            </Button>
          </div>
        </Panel>
      </div>
    </ScreenFrame>
  );
}
