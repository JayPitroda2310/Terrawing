import { clamp } from '@/utils/math/scalar';
import { DEFAULT_KEY_BINDINGS, GAME_ACTIONS, type GameAction, type KeyBindings } from './actions';
import { GamepadInput } from './GamepadInput';
import { KeyboardInput } from './KeyboardInput';
import { MouseInput } from './MouseInput';

export interface LookSettings {
  sensitivity: number;
  invertY: boolean;
}

/** Radians per pixel of mouse movement at sensitivity 1. */
const MOUSE_RADIANS_PER_PIXEL = 0.0022;
/** Radians per second at full gamepad stick deflection and sensitivity 1. */
const GAMEPAD_LOOK_SPEED = 2.4;

/** Continuous control values sampled once per physics step. */
export interface ControlAxes {
  /** -1 (back) .. 1 (forward). */
  throttle: number;
  /** -1 (left) .. 1 (right). */
  steer: number;
  /** -1 (descend) .. 1 (ascend). */
  lift: number;
  brake: boolean;
}

/**
 * Single entry point for player input. Combines keyboard, mouse and gamepad into
 * action-level queries so gameplay code is device-agnostic and rebindable.
 */
export class InputManager {
  readonly keyboard: KeyboardInput;
  readonly mouse = new MouseInput();
  readonly gamepad = new GamepadInput();

  private bindings: KeyBindings = DEFAULT_KEY_BINDINGS;
  private codeToActions = new Map<string, GameAction[]>();
  private capturedCodes = new Set<string>();
  private readonly pressedEdges = new Set<GameAction>();
  private readonly actionListeners = new Set<(action: GameAction) => void>();
  private look: LookSettings = { sensitivity: 1, invertY: false };
  private readonly mouseDelta = { x: 0, y: 0 };
  private enabled = true;

  constructor() {
    this.keyboard = new KeyboardInput(() => this.capturedCodes);
    this.setBindings(DEFAULT_KEY_BINDINGS);
    this.keyboard.onKeyDown((code) => {
      const actions = this.codeToActions.get(code);
      if (!actions) return;
      for (const action of actions) {
        if (this.enabled) this.pressedEdges.add(action);
        for (const listener of this.actionListeners) listener(action);
      }
    });
  }

  attach(): void {
    this.keyboard.attach();
  }

  detach(): void {
    this.keyboard.detach();
    this.mouse.detach();
  }

  setBindings(bindings: KeyBindings): void {
    this.bindings = bindings;
    this.codeToActions = new Map();
    for (const action of GAME_ACTIONS) {
      for (const code of bindings[action] ?? []) {
        const list = this.codeToActions.get(code) ?? [];
        list.push(action);
        this.codeToActions.set(code, list);
      }
    }
    this.capturedCodes = new Set(this.codeToActions.keys());
  }

  setLookSettings(look: LookSettings): void {
    this.look = look;
  }

  /** Gameplay input is disabled while menus are open; discrete UI actions still fire. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.pressedEdges.clear();
  }

  /** Subscribe to discrete action presses (used by the UI for pause/debug). */
  onAction(listener: (action: GameAction) => void): () => void {
    this.actionListeners.add(listener);
    return () => this.actionListeners.delete(listener);
  }

  isHeld(action: GameAction): boolean {
    if (!this.enabled) return false;
    const codes = this.bindings[action];
    for (const code of codes) if (this.keyboard.isHeld(code)) return true;
    return this.gamepad.isHeld(action);
  }

  /** True once per press; the edge is consumed. */
  consumePressed(action: GameAction): boolean {
    const keyboard = this.pressedEdges.delete(action);
    const pad = this.gamepad.consumePressed(action);
    return this.enabled && (keyboard || pad);
  }

  clearPressed(): void {
    this.pressedEdges.clear();
  }

  /** Poll devices that need polling. Call once per rendered frame. */
  poll(): void {
    this.gamepad.poll();
  }

  sampleAxes(out: ControlAxes): ControlAxes {
    const pad = this.gamepad.state;
    const key = (action: GameAction) => (this.isHeld(action) ? 1 : 0);
    out.throttle = clamp(
      key('forward') - key('backward') + (this.enabled ? pad.throttle : 0),
      -1,
      1,
    );
    out.steer = clamp(key('right') - key('left') + (this.enabled ? pad.steer : 0), -1, 1);
    out.lift = clamp(key('ascend') - key('descend') + (this.enabled ? pad.lift : 0), -1, 1);
    out.brake = this.isHeld('brake');
    return out;
  }

  /** Camera look delta in radians for this frame (yaw right-positive, pitch up-positive). */
  consumeLook(dt: number, out: { yaw: number; pitch: number }): { yaw: number; pitch: number } {
    this.mouse.consumeDelta(this.mouseDelta);
    const sensitivity = this.look.sensitivity;
    const invert = this.look.invertY ? -1 : 1;
    const pad = this.gamepad.state;
    out.yaw =
      (this.mouseDelta.x * MOUSE_RADIANS_PER_PIXEL + pad.lookX * GAMEPAD_LOOK_SPEED * dt) *
      sensitivity;
    out.pitch =
      -(this.mouseDelta.y * MOUSE_RADIANS_PER_PIXEL + pad.lookY * GAMEPAD_LOOK_SPEED * dt) *
      sensitivity *
      invert;
    if (!this.enabled) {
      out.yaw = 0;
      out.pitch = 0;
    }
    return out;
  }
}
