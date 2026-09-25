import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { Screen } from '@/game/core/GameState';
import { MainMenu } from '@/ui/menus/MainMenu';

type ScreenComponent = ComponentType | LazyExoticComponent<ComponentType>;

/**
 * Overlay component for each screen. The main menu is eager (first paint); everything else is
 * code-split and loaded on demand. PLAYING renders the HUD, which is handled by the App directly.
 */
export const SCREEN_ROUTES: Readonly<Record<Screen, ScreenComponent | null>> = {
  [Screen.MAIN_MENU]: MainMenu,
  [Screen.MISSION_SELECT]: lazy(() =>
    import('@/ui/menus/MissionSelect').then((m) => ({ default: m.MissionSelect })),
  ),
  [Screen.MISSION_BRIEFING]: lazy(() =>
    import('@/ui/mission/MissionBriefing').then((m) => ({ default: m.MissionBriefing })),
  ),
  [Screen.LOADING]: lazy(() =>
    import('@/ui/mission/LoadingScreen').then((m) => ({ default: m.LoadingScreen })),
  ),
  [Screen.PLAYING]: null,
  [Screen.PAUSED]: lazy(() =>
    import('@/ui/menus/PauseMenu').then((m) => ({ default: m.PauseMenu })),
  ),
  [Screen.MISSION_COMPLETE]: lazy(() =>
    import('@/ui/mission/MissionComplete').then((m) => ({ default: m.MissionComplete })),
  ),
  [Screen.MISSION_FAILED]: lazy(() =>
    import('@/ui/mission/MissionFailed').then((m) => ({ default: m.MissionFailed })),
  ),
  [Screen.SETTINGS]: lazy(() =>
    import('@/ui/menus/SettingsMenu').then((m) => ({ default: m.SettingsMenu })),
  ),
  [Screen.CREDITS]: lazy(() => import('@/ui/menus/Credits').then((m) => ({ default: m.Credits }))),
};

export const DebugPanel = import.meta.env.DEV ? lazy(() => import('@/ui/debug/DebugPanel')) : null;
