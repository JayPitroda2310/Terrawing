/** Every bindable player action. Controllers read actions, never raw keys. */
export const GAME_ACTIONS = [
  'forward',
  'backward',
  'left',
  'right',
  'ascend',
  'descend',
  'brake',
  'scan',
  'interact',
  'pause',
  'debug',
] as const;

export type GameAction = (typeof GAME_ACTIONS)[number];

export type KeyBindings = Record<GameAction, string[]>;

/** Default bindings using `KeyboardEvent.code` so they are layout independent. */
export const DEFAULT_KEY_BINDINGS: KeyBindings = {
  forward: ['KeyW', 'ArrowUp'],
  backward: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  ascend: ['Space'],
  descend: ['ShiftLeft', 'ShiftRight'],
  brake: ['Space'],
  scan: ['KeyQ'],
  interact: ['KeyE'],
  pause: ['Escape', 'KeyP'],
  debug: ['F3'],
};

export const ACTION_LABELS: Readonly<Record<GameAction, string>> = {
  forward: 'Forward',
  backward: 'Backward / Reverse',
  left: 'Yaw / Steer left',
  right: 'Yaw / Steer right',
  ascend: 'Ascend (flight)',
  descend: 'Descend (flight)',
  brake: 'Brake (rover)',
  scan: 'Scanner pulse',
  interact: 'Transform / Interact',
  pause: 'Pause',
  debug: 'Debug panel (dev)',
};

/** Actions the player may rebind in settings. */
export const REBINDABLE_ACTIONS: readonly GameAction[] = GAME_ACTIONS.filter(
  (action) => action !== 'debug',
);

/** Human-readable label for a `KeyboardEvent.code`. */
export function formatKeyCode(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Arrow')) return `${code.slice(5)} Arrow`;
  const names: Record<string, string> = {
    Space: 'Space',
    ShiftLeft: 'L-Shift',
    ShiftRight: 'R-Shift',
    ControlLeft: 'L-Ctrl',
    ControlRight: 'R-Ctrl',
    AltLeft: 'L-Alt',
    AltRight: 'R-Alt',
    Escape: 'Esc',
    Enter: 'Enter',
    Tab: 'Tab',
  };
  return names[code] ?? code;
}
