/**
 * Every bindable player action. Controllers read actions, never raw keys.
 *
 * Flight uses a drone-style "Mode 2" layout by default:
 *   left stick  (W/S, A/D)     → throttle (altitude) and yaw
 *   right stick (arrows/numpad) → pitch (forward/back) and roll (sideways)
 * Rover actions are separate so the same keys can mean different things per mode.
 */
export const FLIGHT_ACTIONS = [
  'ascend',
  'descend',
  'yawLeft',
  'yawRight',
  'pitchForward',
  'pitchBack',
  'rollLeft',
  'rollRight',
] as const;

export const ROVER_ACTIONS = ['forward', 'backward', 'left', 'right', 'brake'] as const;

export const COMMON_ACTIONS = ['scan', 'interact', 'camera', 'pause', 'debug'] as const;

export const GAME_ACTIONS = [...FLIGHT_ACTIONS, ...ROVER_ACTIONS, ...COMMON_ACTIONS] as const;

export type FlightAction = (typeof FLIGHT_ACTIONS)[number];
export type RoverAction = (typeof ROVER_ACTIONS)[number];
export type GameAction = (typeof GAME_ACTIONS)[number];

export type KeyBindings = Record<GameAction, string[]>;

export type FlightControlPreset = 'drone' | 'arcade';

/** Flight bindings for each preset. `drone` is the classic dual-stick layout on the keyboard. */
export const FLIGHT_PRESETS: Readonly<Record<FlightControlPreset, Record<FlightAction, string[]>>> =
  {
    drone: {
      ascend: ['KeyW', 'Space'],
      descend: ['KeyS', 'ShiftLeft', 'ShiftRight'],
      yawLeft: ['KeyA'],
      yawRight: ['KeyD'],
      pitchForward: ['ArrowUp', 'Numpad8'],
      pitchBack: ['ArrowDown', 'Numpad2'],
      rollLeft: ['ArrowLeft', 'Numpad4'],
      rollRight: ['ArrowRight', 'Numpad6'],
    },
    arcade: {
      ascend: ['Space'],
      descend: ['ShiftLeft', 'ShiftRight'],
      yawLeft: ['KeyA'],
      yawRight: ['KeyD'],
      pitchForward: ['KeyW', 'ArrowUp', 'Numpad8'],
      pitchBack: ['KeyS', 'ArrowDown', 'Numpad2'],
      rollLeft: ['ArrowLeft', 'Numpad4'],
      rollRight: ['ArrowRight', 'Numpad6'],
    },
  };

/** Default bindings using `KeyboardEvent.code` so they are layout independent. */
export const DEFAULT_KEY_BINDINGS: KeyBindings = {
  ...FLIGHT_PRESETS.drone,
  forward: ['KeyW', 'ArrowUp', 'Numpad8'],
  backward: ['KeyS', 'ArrowDown', 'Numpad2'],
  left: ['KeyA', 'ArrowLeft', 'Numpad4'],
  right: ['KeyD', 'ArrowRight', 'Numpad6'],
  brake: ['Space'],
  scan: ['KeyQ'],
  interact: ['KeyE'],
  camera: ['KeyC'],
  pause: ['Escape', 'KeyP'],
  debug: ['F3'],
};

export const ACTION_LABELS: Readonly<Record<GameAction, string>> = {
  ascend: 'Climb (throttle up)',
  descend: 'Descend (throttle down)',
  yawLeft: 'Rotate left (yaw)',
  yawRight: 'Rotate right (yaw)',
  pitchForward: 'Fly forward (pitch)',
  pitchBack: 'Fly backward (pitch)',
  rollLeft: 'Slide left (roll)',
  rollRight: 'Slide right (roll)',
  forward: 'Drive forward',
  backward: 'Reverse',
  left: 'Steer left',
  right: 'Steer right',
  brake: 'Brake',
  scan: 'Scanner pulse',
  interact: 'Transform / Interact',
  camera: 'Camera view (chase / nose / gimbal)',
  pause: 'Pause',
  debug: 'Debug panel (dev)',
};

/** Actions grouped for the settings screen and for key-conflict resolution. */
export const ACTION_GROUPS: readonly {
  id: 'flight' | 'rover' | 'common';
  label: string;
  actions: readonly GameAction[];
}[] = [
  { id: 'flight', label: 'Drone (flight mode)', actions: FLIGHT_ACTIONS },
  { id: 'rover', label: 'Rover mode', actions: ROVER_ACTIONS },
  { id: 'common', label: 'General', actions: COMMON_ACTIONS.filter((a) => a !== 'debug') },
];

/** Actions the player may rebind in settings. */
export const REBINDABLE_ACTIONS: readonly GameAction[] = GAME_ACTIONS.filter(
  (action) => action !== 'debug',
);

/**
 * Actions that may share a key with `action`: flight and rover actions never run at the same
 * time, so the same key can drive both (e.g. W = climb in flight, forward on wheels).
 */
export function canShareKey(action: GameAction, other: GameAction): boolean {
  const isFlight = (a: GameAction) => (FLIGHT_ACTIONS as readonly GameAction[]).includes(a);
  const isRover = (a: GameAction) => (ROVER_ACTIONS as readonly GameAction[]).includes(a);
  return (isFlight(action) && isRover(other)) || (isRover(action) && isFlight(other));
}

/** Human-readable label for a `KeyboardEvent.code`. */
export function formatKeyCode(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  const arrows: Record<string, string> = {
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
  };
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
  return arrows[code] ?? names[code] ?? code;
}
