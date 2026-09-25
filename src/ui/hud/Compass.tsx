import { useMemo, useRef } from 'react';
import type { GameSession } from '@/game/core/GameSession';
import { CATEGORY_STYLES, displayCategory } from '@/game/scanner/ScannerTarget';
import { RAD2DEG } from '@/utils/math/scalar';
import { useAnimationFrame } from './useAnimationFrame';

const WIDTH = 460;
const PX_PER_DEG = 3.2;
const LABELS: Record<number, string> = {
  0: 'N',
  45: 'NE',
  90: 'E',
  135: 'SE',
  180: 'S',
  225: 'SW',
  270: 'W',
  315: 'NW',
};

/** Heading strip with bearing markers for known targets. Animated directly via refs at 60 fps. */
export function Compass({ session }: { session: GameSession }) {
  const strip = useRef<HTMLDivElement>(null);
  const headingText = useRef<HTMLSpanElement>(null);
  const markerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const targets = session.scanner.targets;

  const ticks = useMemo(() => {
    const list: { deg: number; label: string | null; major: boolean }[] = [];
    for (let deg = -360; deg <= 720; deg += 15) {
      const norm = ((deg % 360) + 360) % 360;
      list.push({
        deg,
        label: LABELS[norm] ?? (norm % 45 === 0 ? String(norm) : null),
        major: norm % 45 === 0,
      });
    }
    return list;
  }, []);

  useAnimationFrame(() => {
    const state = session.vehicle.state;
    const heading = (((state.heading * RAD2DEG) % 360) + 360) % 360;
    if (strip.current)
      strip.current.style.transform = `translateX(${WIDTH / 2 - heading * PX_PER_DEG}px)`;
    if (headingText.current)
      headingText.current.textContent = String(Math.round(heading)).padStart(3, '0');

    const unstable = session.signal.state === 'unstable';
    targets.forEach((target, i) => {
      const el = markerRefs.current[i];
      if (!el) return;
      const visible =
        session.scanner.isMarkerVisible(target, session.time) && !(unstable && Math.random() < 0.3);
      if (!visible) {
        el.style.display = 'none';
        return;
      }
      const dx = target.position.x - state.position.x;
      const dz = target.position.z - state.position.z;
      const bearing = (Math.atan2(dx, -dz) * RAD2DEG + 360) % 360;
      let delta = bearing - heading;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      const x = Math.max(-WIDTH / 2 + 8, Math.min(WIDTH / 2 - 8, delta * PX_PER_DEG));
      el.style.display = 'block';
      el.style.transform = `translateX(${WIDTH / 2 + x}px)`;
      el.style.opacity = Math.abs(delta * PX_PER_DEG) > WIDTH / 2 ? '0.45' : '1';
      const style = CATEGORY_STYLES[displayCategory(target)];
      el.style.color = style.color;
      el.textContent = style.glyph;
    });
  });

  return (
    <div className="relative" style={{ width: WIDTH }} aria-label="Compass">
      <div className="relative h-9 overflow-hidden border-x border-ops-line bg-ops-panel [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
        <div ref={strip} className="absolute top-0 left-0 h-full will-change-transform">
          {ticks.map((tick) => (
            <div
              key={tick.deg}
              className="absolute top-0 flex flex-col items-center"
              style={{ left: tick.deg * PX_PER_DEG, transform: 'translateX(-50%)' }}
            >
              <div
                className={`w-px ${tick.major ? 'h-2.5 bg-ops-text/70' : 'h-1.5 bg-ops-text/30'}`}
              />
              {tick.label && (
                <span
                  className={`mt-0.5 font-mono text-[10px] ${tick.label.length <= 2 ? 'font-semibold text-ops-text' : 'text-ops-faint'}`}
                >
                  {tick.label}
                </span>
              )}
            </div>
          ))}
        </div>
        {targets.map((target, i) => (
          <div
            key={target.id}
            ref={(el) => {
              markerRefs.current[i] = el;
            }}
            className="absolute bottom-0 left-0 -translate-x-1/2 text-[11px] leading-none"
            style={{ display: 'none' }}
          />
        ))}
      </div>
      <div className="absolute -bottom-5 left-1/2 flex -translate-x-1/2 flex-col items-center">
        <div className="h-0 w-0 border-x-4 border-b-4 border-x-transparent border-b-ops-orange" />
        <span
          ref={headingText}
          className="tabular font-mono text-[11px] font-semibold text-ops-orange"
        >
          000
        </span>
      </div>
    </div>
  );
}
