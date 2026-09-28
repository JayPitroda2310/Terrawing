import { create } from 'zustand';
import { canTransition, Screen } from '@/game/core/GameState';
import type { GameSession } from '@/game/core/GameSession';
import type { MissionResult } from '@/game/missions/MissionRating';
import { logger } from '@/utils/helpers/logger';

interface GameStoreState {
  screen: Screen;
  /** Screen to return to when leaving SETTINGS. */
  settingsReturn: Screen;
  selectedMissionId: string;
  /** The live mission session. Treated as an opaque reference — never mutated through React. */
  session: GameSession | null;
  /** The 3D menu backdrop has loaded and rendered (the site-load loader can go). */
  backdropReady: boolean;
  setBackdropReady(ready: boolean): void;
  lastResult: MissionResult | null;
  /** Fatal errors (invalid mission data, WebGL unavailable). */
  fatalError: string | null;
  debugOpen: boolean;
  debugColliders: boolean;
  pointerLocked: boolean;
  /** The glass controls demo shown when a mission starts (the world is paused meanwhile). */
  controlsIntro: boolean;
  setScreen(screen: Screen): boolean;
  setSession(session: GameSession | null): void;
  setSelectedMission(id: string): void;
  setLastResult(result: MissionResult | null): void;
  setFatalError(message: string | null): void;
  toggleDebug(): void;
  setDebugColliders(value: boolean): void;
  setPointerLocked(value: boolean): void;
  setControlsIntro(value: boolean): void;
}

export const useGameStore = create<GameStoreState>((set, get) => ({
  screen: Screen.MAIN_MENU,
  settingsReturn: Screen.MAIN_MENU,
  selectedMissionId: 'mission-01',
  session: null,
  backdropReady: false,
  setBackdropReady: (backdropReady) => set({ backdropReady }),
  lastResult: null,
  fatalError: null,
  debugOpen: false,
  debugColliders: false,
  pointerLocked: false,
  controlsIntro: false,
  setScreen(screen) {
    const current = get().screen;
    if (current === screen) return true;
    if (!canTransition(current, screen)) {
      logger.warn('game', `Rejected screen transition ${current} → ${screen}`);
      return false;
    }
    set(screen === Screen.SETTINGS ? { screen, settingsReturn: current } : { screen });
    return true;
  },
  setSession: (session) => set({ session }),
  setSelectedMission: (selectedMissionId) => set({ selectedMissionId }),
  setLastResult: (lastResult) => set({ lastResult }),
  setFatalError: (fatalError) => set({ fatalError }),
  toggleDebug: () => set((s) => ({ debugOpen: !s.debugOpen })),
  setDebugColliders: (debugColliders) => set({ debugColliders }),
  setPointerLocked: (pointerLocked) => set({ pointerLocked }),
  setControlsIntro: (controlsIntro) => set({ controlsIntro }),
}));
