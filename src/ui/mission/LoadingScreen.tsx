import { useGameStore } from '@/store/gameStore';

/** Covers the canvas while the mission world, physics and shaders initialise. */
export function LoadingScreen() {
  const session = useGameStore((s) => s.session);
  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-ops-bg"
      role="status"
      aria-live="polite"
    >
      <div className="w-80 text-center">
        <div className="text-[10px] font-semibold tracking-[0.4em] text-ops-orange">
          {session?.mission.code}
        </div>
        <div className="mt-2 text-xl font-semibold tracking-[0.2em]">DEPLOYING TERRAWING</div>
        <div className="mt-6 h-px w-full overflow-hidden bg-ops-line">
          <div className="h-full w-1/3 animate-[loading-bar_1.2s_ease-in-out_infinite] bg-ops-orange" />
        </div>
        <div className="mt-3 font-mono text-[11px] text-ops-dim">
          Establishing relay link · Initialising physics
        </div>
      </div>
      <style>
        {'@keyframes loading-bar{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}'}
      </style>
    </div>
  );
}
