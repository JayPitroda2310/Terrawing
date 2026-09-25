import { useGameStore } from '@/store/gameStore';

export interface DevSnapshot {
  screen: string;
  gameplay: string | null;
  mode: string | null;
  position: { x: number; y: number; z: number } | null;
  altitudeAGL: number | null;
  heading: number | null;
  speed: number | null;
  battery: number | null;
  signal: number | null;
  integrity: number | null;
  objectives: Record<string, string>;
  pulses: number;
}

declare global {
  interface Window {
    /** Development-only state probe used by automated browser checks. */
    __tw?: () => DevSnapshot;
    /** Development-only teleport used by automated browser checks. */
    __twTeleport?: (x: number, z: number) => void;
  }
}

/** Installs `window.__tw()` in development builds only. */
export function installDevHooks(): void {
  if (!import.meta.env.DEV) return;
  window.__tw = () => {
    const { screen, session } = useGameStore.getState();
    const state = session?.vehicle.state;
    return {
      screen,
      gameplay: session?.gameplay.kind ?? null,
      mode: state?.mode ?? null,
      position: state ? { ...state.position } : null,
      altitudeAGL: state?.altitudeAGL ?? null,
      heading: state?.heading ?? null,
      speed: state?.speed ?? null,
      battery: session?.battery.percent ?? null,
      signal: session?.signal.percent ?? null,
      integrity: session?.damage.integrity ?? null,
      objectives: Object.fromEntries(
        session?.missionManager.objectives.map((o) => [o.definition.id, o.status]) ?? [],
      ),
      pulses: session?.scanner.totalPulses ?? 0,
    };
  };
  window.__twTeleport = (x, z) => useGameStore.getState().session?.debugTeleport(x, z);
}
