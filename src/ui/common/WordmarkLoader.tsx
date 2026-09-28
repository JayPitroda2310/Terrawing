import { useRef } from 'react';

const LOGO = '/assets/brand/terrawing-logo.png';

/**
 * Full-screen loader: the TerraWing wordmark on black with a light sweep, and a percentage bar
 * underneath. The shown figure never goes backwards (loaders keep discovering files) and holds
 * at 99% until the caller removes the loader. Transform-only CSS animation, so it stays smooth
 * even while the page is busy loading.
 */
export function WordmarkLoader({ percent }: { percent: number }) {
  const shown = useRef(0);
  shown.current = Math.max(shown.current, Math.min(99, Math.round(percent)));
  const value = shown.current;
  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-black"
      role="status"
      aria-live="polite"
      aria-label={`Loading ${value}%`}
    >
      <div className="flex w-[360px] max-w-[calc(100vw-32px)] flex-col items-center">
        <div className="tw-rise relative w-full">
          <img src={LOGO} alt="TerraWing" className="block w-full" />
          <div
            className="pointer-events-none absolute inset-0 overflow-hidden"
            style={{
              maskImage: `url(${LOGO})`,
              WebkitMaskImage: `url(${LOGO})`,
              maskSize: '100% 100%',
              WebkitMaskSize: '100% 100%',
            }}
          >
            <div className="tw-shine absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/85 to-transparent" />
          </div>
        </div>
        <div className="mt-12 flex w-full items-center gap-4">
          <div className="relative h-[2px] flex-1 overflow-hidden bg-white/12">
            <div
              className="absolute inset-y-0 left-0 w-full origin-left bg-brand transition-transform duration-300 ease-out"
              style={{ transform: `scaleX(${Math.max(0.01, value / 100)})` }}
            />
          </div>
          <span className="tabular w-10 text-right font-mono text-[12px] text-white/70">
            {value}%
          </span>
        </div>
      </div>
      <style>
        {`
        @keyframes tw-shine { 0% { transform: translateX(-120%); } 55%, 100% { transform: translateX(420%); } }
        @keyframes tw-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .tw-shine { animation: tw-shine 2.6s ease-in-out infinite; will-change: transform; }
        .tw-rise { animation: tw-rise 0.8s ease-out both; }
        @media (prefers-reduced-motion: reduce) { .tw-shine { animation: none; } }
        `}
      </style>
    </div>
  );
}
