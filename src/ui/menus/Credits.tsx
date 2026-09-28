import { useGameManager } from '@/app/GameManagerContext';
import { Button } from '@/components/common/Button';
import { Panel } from '@/components/common/Panel';
import { ScreenFrame } from '@/components/common/ScreenFrame';
import { Screen } from '@/game/core/GameState';

export function Credits() {
  const manager = useGameManager();
  return (
    <ScreenFrame dim="full">
      <div className="flex h-full items-center justify-center p-12">
        <Panel title="Credits" className="w-[560px] animate-rise-in">
          <div className="py-4 text-center">
            <div className="text-[10px] font-semibold tracking-[0.35em] text-ops-orange uppercase">
              Created by
            </div>
            <h2 className="mt-3 text-4xl font-bold tracking-[0.12em] text-ops-text">JAY PITRODA</h2>
            <div className="mx-auto mt-4 h-px w-16 bg-ops-orange" />
            <p className="mx-auto mt-5 max-w-[440px] text-sm leading-relaxed text-ops-dim">
              TerraWing: Rescue Ops is Jay Pitroda's vision: a game where technology is used to save
              lives, and where careful thinking beats reckless speed. Every mountain, storm and
              rescue in it began as his idea, and his drive to build something meaningful is what
              brought TerraWing to life.
            </p>
            <p className="mx-auto mt-4 max-w-[440px] text-sm leading-relaxed text-ops-text">
              Thank you, Jay, for dreaming big and for building a world worth rescuing.
            </p>
          </div>
          <p className="mt-4 border-t border-ops-line pt-4 text-center text-xs leading-relaxed text-ops-faint">
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
