import type { GameAction } from './actions';

const DEADZONE = 0.18;

/** Standard-mapping button indices (https://w3c.github.io/gamepad/#remapping). */
const BUTTON_ACTIONS: ReadonlyArray<readonly [number, GameAction]> = [
  [0, 'interact'],
  [2, 'scan'],
  [1, 'brake'],
  [9, 'pause'],
];

export interface GamepadState {
  connected: boolean;
  throttle: number;
  steer: number;
  lift: number;
  lookX: number;
  lookY: number;
}

function applyDeadzone(value: number): number {
  if (Math.abs(value) < DEADZONE) return 0;
  return Math.sign(value) * ((Math.abs(value) - DEADZONE) / (1 - DEADZONE));
}

/**
 * Polls the first connected gamepad. Analog sticks map onto the same axes as the keyboard so
 * controllers need no gamepad-specific code.
 */
export class GamepadInput {
  readonly state: GamepadState = {
    connected: false,
    throttle: 0,
    steer: 0,
    lift: 0,
    lookX: 0,
    lookY: 0,
  };
  private readonly previousButtons: boolean[] = [];
  private readonly pressed = new Set<GameAction>();

  poll(): void {
    const pads =
      typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = Array.from(pads).find((p): p is Gamepad => p !== null);
    if (!pad) {
      this.state.connected = false;
      this.state.throttle = this.state.steer = this.state.lift = 0;
      this.state.lookX = this.state.lookY = 0;
      return;
    }
    this.state.connected = true;
    this.state.steer = applyDeadzone(pad.axes[0] ?? 0);
    this.state.throttle = -applyDeadzone(pad.axes[1] ?? 0);
    this.state.lookX = applyDeadzone(pad.axes[2] ?? 0);
    this.state.lookY = applyDeadzone(pad.axes[3] ?? 0);
    const rightTrigger = pad.buttons[7]?.value ?? 0;
    const leftTrigger = pad.buttons[6]?.value ?? 0;
    this.state.lift = rightTrigger - leftTrigger;

    for (const [index, action] of BUTTON_ACTIONS) {
      const down = pad.buttons[index]?.pressed ?? false;
      if (down && !this.previousButtons[index]) this.pressed.add(action);
      this.previousButtons[index] = down;
    }
  }

  isHeld(action: GameAction): boolean {
    if (!this.state.connected) return false;
    return action === 'brake' ? (this.previousButtons[1] ?? false) : false;
  }

  consumePressed(action: GameAction): boolean {
    return this.pressed.delete(action);
  }
}
