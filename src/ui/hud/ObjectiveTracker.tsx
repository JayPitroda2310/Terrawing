import { Panel } from '@/components/common/Panel';
import { useMissionStore, type ObjectiveView } from '@/store/missionStore';

const RECENT_MS = 1500;

function glyph(objective: ObjectiveView): string {
  if (objective.status === 'completed') return '✓';
  if (objective.status === 'active') return '○';
  return '·';
}

/** Compact objective list. Status is shown by glyph and text weight, not colour alone. */
export function ObjectiveTracker() {
  const objectives = useMissionStore((s) => s.objectives);
  const completed = objectives.filter((o) => o.status === 'completed').length;
  const now = performance.now();

  return (
    <Panel
      title="Objectives"
      dense
      aside={
        <span className="tabular font-mono text-[10px] text-ops-dim">
          {completed}/{objectives.length}
        </span>
      }
      className="w-[300px]"
    >
      <ul className="space-y-0.5" aria-label="Mission objectives">
        {objectives.map((objective) => {
          const recent = objective.completedAt !== null && now - objective.completedAt < RECENT_MS;
          const statusText =
            objective.status === 'completed'
              ? 'completed'
              : objective.status === 'active'
                ? 'active'
                : 'locked';
          return (
            <li
              key={objective.id}
              className={`flex items-start gap-2 px-1 py-0.5 text-[12px] leading-snug ${recent ? 'animate-objective-complete' : ''}`}
              aria-label={`${objective.label}, ${statusText}`}
            >
              <span
                className={`w-3 shrink-0 text-center font-mono ${
                  objective.status === 'completed'
                    ? 'text-ops-green'
                    : objective.status === 'active'
                      ? 'text-ops-orange'
                      : 'text-ops-faint'
                }`}
                aria-hidden
              >
                {glyph(objective)}
              </span>
              <span className="flex-1">
                <span
                  className={
                    objective.status === 'completed'
                      ? 'text-ops-dim line-through decoration-ops-faint'
                      : objective.status === 'active'
                        ? 'font-medium text-ops-text'
                        : 'text-ops-faint'
                  }
                >
                  {objective.label}
                </span>
                {objective.detail && objective.status === 'active' && (
                  <span className="block font-mono text-[10px] text-ops-dim">
                    {objective.detail}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
