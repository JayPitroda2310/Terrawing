import { Suspense, useEffect, useMemo, useState } from 'react';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { FatalScreen } from '@/components/common/FatalScreen';
import { GameCanvas } from '@/components/game/GameCanvas';
import { GameManager } from '@/game/core/GameManager';
import { isMissionScreen, Screen } from '@/game/core/GameState';
import { useGameStore } from '@/store/gameStore';
import { ControlsIntro } from '@/ui/hud/ControlsIntro';
import { HUD } from '@/ui/hud/HUD';
import { detectWebGL } from '@/utils/performance/webgl';
import { GameManagerContext } from './GameManagerContext';
import { DebugPanel, SCREEN_ROUTES } from './routes';

const MIN_WIDTH = 1280;

export function App() {
  const [manager] = useState(() => new GameManager());
  const webgl = useMemo(detectWebGL, []);

  useEffect(() => {
    void manager.init();
    return () => manager.dispose();
  }, [manager]);

  if (!webgl.supported) {
    return (
      <FatalScreen
        title="WebGL unavailable"
        message={`TerraWing needs WebGL 2 to render the mission area.\n${webgl.reason ?? ''}\nTry an up-to-date Chrome, Edge or Firefox with hardware acceleration enabled.`}
      />
    );
  }

  return (
    <GameManagerContext.Provider value={manager}>
      <ErrorBoundary
        fallback={(error, reset) => (
          <FatalScreen
            title="Something went wrong"
            message={
              import.meta.env.DEV ? `${error.message}\n\n${error.stack ?? ''}` : error.message
            }
            actionLabel="Return to main menu"
            onAction={() => {
              manager.quitToMenu();
              reset();
            }}
          />
        )}
      >
        <GameShell />
      </ErrorBoundary>
    </GameManagerContext.Provider>
  );
}

function GameShell() {
  const screen = useGameStore((s) => s.screen);
  const controlsIntro = useGameStore((s) => s.controlsIntro);
  const session = useGameStore((s) => s.session);
  const fatalError = useGameStore((s) => s.fatalError);
  const debugOpen = useGameStore((s) => s.debugOpen);
  const setFatalError = useGameStore((s) => s.setFatalError);
  const Overlay = SCREEN_ROUTES[screen];
  const showHud = session && isMissionScreen(screen) && screen !== Screen.LOADING;

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ minWidth: MIN_WIDTH }}>
      <GameCanvas />
      {showHud && screen === Screen.PLAYING && <HUD session={session} />}
      {screen === Screen.PLAYING && controlsIntro && <ControlsIntro />}
      <Suspense fallback={null}>{Overlay && <Overlay />}</Suspense>
      {DebugPanel && debugOpen && (
        <Suspense fallback={null}>
          <DebugPanel />
        </Suspense>
      )}
      {fatalError && (
        <FatalScreen
          title="Mission data error"
          message={fatalError}
          actionLabel="Dismiss"
          onAction={() => setFatalError(null)}
        />
      )}
    </div>
  );
}
