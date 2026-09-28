import { useEffect, useState } from 'react';
import { loadMission } from '@/data/missions';
import { prefetchProgress } from '@/services/loading/prefetch';
import { useGameStore } from '@/store/gameStore';

const LOGO = '/assets/brand/terrawing-logo.png';

const TIPS = [
  'Press C to look through the nose camera or the stabilised belly gimbal.',
  'Pulse the scanner (Q) to reveal survivors, hazards and supplies nearby.',
  'Drive gently with patients aboard — every jolt costs them.',
  'Rotor downwash loosens rockfall slopes. Land and drive across them.',
  'Park on a charging pad to top up the battery between flights.',
  'Aftershocks shake the ground — keep clear of unstable ruins.',
];

/** One ducted fan of the emblem: shroud, stator and a spinning three-blade rotor. */
function Fan({ delay, reverse }: { delay: number; reverse?: boolean }) {
  return (
    <div className="relative h-[54px] w-[54px]">
      <div className="absolute inset-0 rounded-full border-[3px] border-brand/80 shadow-[0_0_14px_rgb(127_218_89/0.35)]" />
      <div
        className="tw-spin absolute inset-[6px]"
        style={{ animationDelay: `${delay}s`, animationDirection: reverse ? 'reverse' : 'normal' }}
      >
        <svg viewBox="-20 -20 40 40" className="h-full w-full">
          {[0, 120, 240].map((a) => (
            <path
              key={a}
              d="M0 -2 C 6 -3 15 -3 18 -1 C 15 1 6 2 0 2 Z"
              fill="#cfe9c2"
              opacity="0.85"
              transform={`rotate(${a})`}
            />
          ))}
          <circle r="3.2" fill="#7fda59" />
        </svg>
      </div>
      {/* Rotor blur disc. */}
      <div className="tw-pulse absolute inset-[6px] rounded-full bg-brand/10" />
    </div>
  );
}

/**
 * Loading screen: an animated TerraWing emblem (four ducted fans spinning up around the hull,
 * a radar sweep), the wordmark with a light sweep, real download progress, status and tips.
 * All motion is transform / opacity CSS animation, which runs on the compositor — it stays
 * smooth even while the main thread is busy building the world.
 */
export function LoadingScreen() {
  const session = useGameStore((s) => s.session);
  const missionId = useGameStore((s) => s.selectedMissionId);
  const [progress, setProgress] = useState(prefetchProgress);
  const [tip, setTip] = useState(() => Math.floor(Math.random() * TIPS.length));
  useEffect(() => {
    const id = setInterval(() => setProgress(prefetchProgress()), 200);
    const tips = setInterval(() => setTip((t) => (t + 1) % TIPS.length), 4500);
    return () => {
      clearInterval(id);
      clearInterval(tips);
    };
  }, []);
  const mission = loadMission(missionId);
  const downloading = !session;
  const percent = downloading ? Math.round(progress * 100) : 100;
  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center overflow-hidden bg-[#06080a]"
      role="status"
      aria-live="polite"
    >
      {/* Backdrop: soft green glow and a faint survey grid. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgb(127_218_89/0.10)_0%,transparent_60%)]" />
      <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgb(255_255_255/0.6)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/0.6)_1px,transparent_1px)] [background-size:48px_48px]" />

      <div className="relative flex w-[440px] max-w-[calc(100vw-32px)] flex-col items-center">
        {/* Emblem: radar sweep behind four fans around the hull. */}
        <div className="relative mb-9 h-[170px] w-[170px]">
          <div className="absolute inset-0 rounded-full border border-brand/15" />
          <div className="absolute inset-[22px] rounded-full border border-brand/10" />
          <div className="tw-sweep absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,rgb(127_218_89/0.28),transparent_28%)]" />
          <div className="absolute inset-0 grid grid-cols-2 place-items-center p-[18px]">
            <Fan delay={0} />
            <Fan delay={-0.13} reverse />
            <Fan delay={-0.07} reverse />
            <Fan delay={-0.2} />
          </div>
          {/* Hull. */}
          <div className="absolute top-1/2 left-1/2 h-[46px] w-[30px] -translate-x-1/2 -translate-y-1/2 rounded-[8px] border-2 border-brand/70 bg-[#0d1410]">
            <div className="tw-blink absolute top-[6px] left-1/2 h-[5px] w-[5px] -translate-x-1/2 rounded-full bg-brand" />
          </div>
        </div>

        {/* Wordmark with a light sweep masked to the logo. */}
        <div className="relative w-[300px] max-w-full">
          <img src={LOGO} alt="TerraWing" className="tw-glow block w-full" />
          <div
            className="pointer-events-none absolute inset-0 overflow-hidden"
            style={{
              maskImage: `url(${LOGO})`,
              WebkitMaskImage: `url(${LOGO})`,
              maskSize: '100% 100%',
              WebkitMaskSize: '100% 100%',
            }}
          >
            <div className="tw-shine absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/80 to-transparent" />
          </div>
        </div>
        <div className="mt-3 font-mono text-[10px] tracking-[0.5em] text-ops-dim">RESCUE OPS</div>

        {/* Mission and progress. */}
        <div className="mt-10 w-full">
          <div className="mb-2 flex items-baseline justify-between font-mono text-[10px] tracking-[0.25em]">
            <span className="text-brand">{mission.ok ? mission.mission.code : ''}</span>
            <span className="text-ops-text">
              {mission.ok ? mission.mission.name.toUpperCase() : ''}
            </span>
            <span className="tabular text-ops-dim">{percent}%</span>
          </div>
          <div className="relative h-[3px] w-full overflow-hidden bg-white/10">
            <div
              className="absolute inset-y-0 left-0 w-full origin-left bg-brand transition-transform duration-300"
              style={{ transform: `scaleX(${Math.max(0.02, percent / 100)})` }}
            />
            <div className="tw-glint absolute inset-y-0 w-1/4 bg-gradient-to-r from-transparent via-white/70 to-transparent" />
          </div>
          <div className="mt-3 text-center font-mono text-[11px] text-ops-dim">
            {downloading
              ? 'Downloading terrain, textures and models'
              : 'Building the world · Preparing shaders · Linking relay'}
            <span className="tw-dots" />
          </div>
        </div>

        <div className="mt-8 min-h-[34px] max-w-[380px] text-center text-[12px] leading-relaxed text-ops-text/75">
          <span className="mr-2 font-mono text-[10px] tracking-[0.25em] text-brand">TIP</span>
          {TIPS[tip]}
        </div>
      </div>

      <style>
        {`
        @keyframes tw-spin { to { transform: rotate(360deg); } }
        @keyframes tw-sweep { to { transform: rotate(360deg); } }
        @keyframes tw-shine { 0% { transform: translateX(-120%); } 60%, 100% { transform: translateX(420%); } }
        @keyframes tw-glint { 0% { transform: translateX(-100%); } 100% { transform: translateX(500%); } }
        @keyframes tw-pulse { 0%, 100% { opacity: 0.35; transform: scale(0.96); } 50% { opacity: 0.9; transform: scale(1); } }
        @keyframes tw-glow { 0%, 100% { filter: drop-shadow(0 0 6px rgb(127 218 89 / 0.25)); } 50% { filter: drop-shadow(0 0 16px rgb(127 218 89 / 0.55)); } }
        @keyframes tw-blink { 0%, 55% { opacity: 1; } 60%, 100% { opacity: 0.15; } }
        @keyframes tw-dots { 0% { content: ''; } 33% { content: '.'; } 66% { content: '..'; } 100% { content: '...'; } }
        .tw-spin { animation: tw-spin 0.32s linear infinite; will-change: transform; }
        .tw-sweep { animation: tw-sweep 3.2s linear infinite; will-change: transform; }
        .tw-shine { animation: tw-shine 2.8s ease-in-out infinite; will-change: transform; }
        .tw-glint { animation: tw-glint 1.6s linear infinite; will-change: transform; }
        .tw-pulse { animation: tw-pulse 1.2s ease-in-out infinite; }
        .tw-glow { animation: tw-glow 2.4s ease-in-out infinite; }
        .tw-blink { animation: tw-blink 1s steps(1) infinite; }
        .tw-dots::after { content: ''; animation: tw-dots 1.4s steps(1) infinite; }
        @media (prefers-reduced-motion: reduce) {
          .tw-spin { animation-duration: 2.4s; }
          .tw-sweep, .tw-shine, .tw-glint, .tw-pulse, .tw-glow { animation: none; }
        }
        `}
      </style>
    </div>
  );
}
