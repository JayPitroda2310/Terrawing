import { formatKeyCode, type GameAction } from '@/game/input/actions';
import { useSettingsStore } from '@/store/settingsStore';

const ROWS: readonly { label: string; flight: GameAction[]; rover: GameAction[] | string }[] = [
  { label: 'Forward / Back', flight: ['forward', 'backward'], rover: ['forward', 'backward'] },
  { label: 'Yaw / Steer', flight: ['left', 'right'], rover: ['left', 'right'] },
  { label: 'Ascend / Brake', flight: ['ascend'], rover: ['brake'] },
  { label: 'Descend', flight: ['descend'], rover: '—' },
  { label: 'Scanner pulse', flight: ['scan'], rover: ['scan'] },
  { label: 'Transform / Interact', flight: ['interact'], rover: ['interact'] },
  { label: 'Pause', flight: ['pause'], rover: ['pause'] },
];

/** Live key reference reflecting the player's current bindings. */
export function ControlsReference() {
  const bindings = useSettingsStore((s) => s.settings.keyBindings);
  const keys = (actions: GameAction[] | string) =>
    typeof actions === 'string'
      ? actions
      : actions.map((a) => formatKeyCode(bindings[a][0] ?? '?')).join(' / ');
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-[9px] tracking-[0.2em] text-ops-faint uppercase">
          <th className="pb-2 font-semibold">Action</th>
          <th className="pb-2 font-semibold">Flight</th>
          <th className="pb-2 font-semibold">Rover</th>
        </tr>
      </thead>
      <tbody>
        {ROWS.map((row) => (
          <tr key={row.label} className="border-t border-ops-line">
            <td className="py-1.5 text-ops-dim">{row.label}</td>
            <td className="py-1.5 font-mono text-ops-text">{keys(row.flight)}</td>
            <td className="py-1.5 font-mono text-ops-text">{keys(row.rover)}</td>
          </tr>
        ))}
        <tr className="border-t border-ops-line">
          <td className="py-1.5 text-ops-dim">Camera look</td>
          <td colSpan={2} className="py-1.5 font-mono text-ops-text">
            Mouse (click to capture)
          </td>
        </tr>
      </tbody>
    </table>
  );
}
