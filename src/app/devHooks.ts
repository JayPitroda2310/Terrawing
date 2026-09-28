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
  physics: {
    mode: string;
    slip: number;
    compressions: number[];
    uprightness: number;
    surface: number;
  } | null;
}

declare global {
  interface Window {
    /** Development-only state probe used by automated browser checks. */
    __tw?: () => DevSnapshot;
    /** Development-only access to the running session (inspection scripts). */
    __twSession?: () => unknown;
    /** Development-only terrain height query. */
    __twGround?: (x: number, z: number) => number;
    /** Development-only camera override for inspection screenshots. */
    __twCamera?: { position: [number, number, number]; target: [number, number, number] } | null;
    /** Development-only log of recent impact speeds (m/s). */
    __twImpacts?: number[];
    /** Development-only teleport used by automated browser checks. */
    __twTeleport?: (x: number, z: number, headingDeg?: number) => void;
    /** Development-only: opens or closes the pre-mission controls demo. */
    __twControlsIntro?: (open: boolean) => void;
    /** Development-only: damages TerraWing (integrity points) for effect checks. */
    __twDamage?: (amount: number) => void;
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
      prompt: session?.interaction.prompt
        ? {
            id: session.interaction.prompt.interactable.id,
            blocked: session.interaction.prompt.blockedReason,
          }
        : null,
      physics: session
        ? {
            mode: session.vehicle.physicsMode,
            slip: session.vehicle.state.slip,
            compressions: session.vehicle.state.wheels.map((w) => w.compression),
            uprightness: session.vehicle.state.uprightness,
            surface: session.vehicle.state.surface,
          }
        : null,
    };
  };
  window.__twTeleport = (x, z, headingDeg) =>
    useGameStore.getState().session?.debugTeleport(x, z, headingDeg);
  window.__twDamage = (amount) => useGameStore.getState().session?.damage.apply(amount, 'BODY');
  window.__twControlsIntro = (open) => useGameStore.getState().setControlsIntro(open);
  window.__twSession = () => useGameStore.getState().session;
  window.__twGround = (x, z) => useGameStore.getState().session?.terrain.heightAt(x, z) ?? 0;
  window.__twImpacts = [];
  let watched: unknown = null;
  useGameStore.subscribe((state) => {
    if (!state.session || state.session === watched) return;
    watched = state.session;
    state.session.events.on('vehicle:impact', ({ speed, damage }) => {
      window.__twImpacts?.push(Math.round(speed * 10) / 10, -Math.round(damage));
    });
  });
}
