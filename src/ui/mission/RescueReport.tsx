import type { MissionResult } from '@/game/missions/MissionRating';
import { formatTime } from '@/utils/helpers/format';

/** Star rating plus score — the "rescue report" summary. */
export function RescueReport({ result, isNewBest }: { result: MissionResult; isNewBest: boolean }) {
  return (
    <div className="border border-ops-line bg-ops-panel-strong p-5">
      <div className="mb-3 text-[10px] font-semibold tracking-[0.3em] text-ops-dim uppercase">
        Rescue report
      </div>
      <div className="flex items-center justify-between gap-6">
        <div className="flex gap-2 text-4xl" role="img" aria-label={`${result.stars} of 3 stars`}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`animate-rise-in ${i < result.stars ? 'text-ops-amber' : 'text-ops-faint'}`}
              style={{ animationDelay: `${500 + i * 250}ms` }}
            >
              {i < result.stars ? '★' : '☆'}
            </span>
          ))}
        </div>
        <div className="text-right">
          <div className="tabular font-mono text-3xl font-semibold text-ops-text">
            {result.rescueScore.toLocaleString()}
          </div>
          <div className="text-[10px] tracking-[0.25em] text-ops-dim uppercase">
            {isNewBest ? <span className="text-ops-green">New best score</span> : 'Rescue score'}
          </div>
        </div>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-ops-dim">{ratingComment(result)}</p>
    </div>
  );
}

function ratingComment(result: MissionResult): string {
  if (result.stars === 3)
    return 'Outstanding operation. All civilians recovered efficiently with minimal risk to the platform.';
  if (result.stars === 2)
    return `Solid operation. Completed in ${formatTime(result.timeSeconds)} — faster routing and more decisive scanning would raise the rating.`;
  return 'Operation complete. Review battery planning, scanner usage and flight discipline to improve.';
}
