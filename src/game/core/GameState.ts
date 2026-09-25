/**
 * Application-level and gameplay-level state machines.
 * Screens describe what the player is looking at; gameplay substates describe what TerraWing is doing.
 */

export const Screen = {
  MAIN_MENU: 'MAIN_MENU',
  MISSION_SELECT: 'MISSION_SELECT',
  MISSION_BRIEFING: 'MISSION_BRIEFING',
  LOADING: 'LOADING',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  MISSION_COMPLETE: 'MISSION_COMPLETE',
  MISSION_FAILED: 'MISSION_FAILED',
  SETTINGS: 'SETTINGS',
  CREDITS: 'CREDITS',
} as const;
export type Screen = (typeof Screen)[keyof typeof Screen];

/** Allowed screen transitions. Anything not listed here is rejected. */
const SCREEN_TRANSITIONS: Readonly<Record<Screen, readonly Screen[]>> = {
  MAIN_MENU: ['MISSION_SELECT', 'MISSION_BRIEFING', 'SETTINGS', 'CREDITS'],
  MISSION_SELECT: ['MAIN_MENU', 'MISSION_BRIEFING'],
  MISSION_BRIEFING: ['LOADING', 'MAIN_MENU', 'MISSION_SELECT'],
  LOADING: ['PLAYING', 'MAIN_MENU'],
  PLAYING: ['PAUSED', 'MISSION_COMPLETE', 'MISSION_FAILED'],
  PAUSED: ['PLAYING', 'SETTINGS', 'MAIN_MENU', 'LOADING'],
  MISSION_COMPLETE: ['MAIN_MENU', 'LOADING', 'MISSION_SELECT'],
  MISSION_FAILED: ['MAIN_MENU', 'LOADING'],
  SETTINGS: ['MAIN_MENU', 'PAUSED'],
  CREDITS: ['MAIN_MENU'],
};

export function canTransition(from: Screen, to: Screen): boolean {
  return SCREEN_TRANSITIONS[from].includes(to);
}

/** Screens during which a mission session exists and the 3D world shows the mission. */
export function isMissionScreen(screen: Screen): boolean {
  return (
    screen === Screen.LOADING ||
    screen === Screen.PLAYING ||
    screen === Screen.PAUSED ||
    screen === Screen.MISSION_COMPLETE ||
    screen === Screen.MISSION_FAILED
  );
}

/** Physical configuration of the vehicle. */
export type VehicleMode = 'FLIGHT' | 'ROVER';

export type TransformDirection = 'toRover' | 'toFlight';

/** Gameplay substate with the context each state needs. */
export type GameplayState =
  | { kind: 'FLIGHT' }
  | { kind: 'ROVER' }
  | { kind: 'TRANSFORMING'; direction: TransformDirection }
  | { kind: 'INTERACTING'; interactionId: string; resume: 'FLIGHT' | 'ROVER' }
  | { kind: 'CINEMATIC'; shot: CinematicShotId; resume: 'FLIGHT' | 'ROVER' | 'NONE' };

export type GameplayStateKind = GameplayState['kind'];

export type CinematicShotId = 'missionIntro' | 'missionComplete' | 'rescue';

const GAMEPLAY_TRANSITIONS: Readonly<Record<GameplayStateKind, readonly GameplayStateKind[]>> = {
  FLIGHT: ['TRANSFORMING', 'CINEMATIC', 'INTERACTING'],
  ROVER: ['TRANSFORMING', 'INTERACTING', 'CINEMATIC'],
  TRANSFORMING: ['FLIGHT', 'ROVER', 'CINEMATIC'],
  INTERACTING: ['FLIGHT', 'ROVER', 'CINEMATIC'],
  CINEMATIC: ['FLIGHT', 'ROVER', 'CINEMATIC'],
};

/** Guarded gameplay state machine. Listeners are told about every accepted change. */
export class GameplayStateMachine {
  private current: GameplayState;
  private readonly listeners = new Set<(next: GameplayState, previous: GameplayState) => void>();

  constructor(initial: GameplayState) {
    this.current = initial;
  }

  get state(): GameplayState {
    return this.current;
  }

  get kind(): GameplayStateKind {
    return this.current.kind;
  }

  is(kind: GameplayStateKind): boolean {
    return this.current.kind === kind;
  }

  transition(next: GameplayState): boolean {
    if (!GAMEPLAY_TRANSITIONS[this.current.kind].includes(next.kind)) return false;
    const previous = this.current;
    this.current = next;
    for (const listener of this.listeners) listener(next, previous);
    return true;
  }

  subscribe(listener: (next: GameplayState, previous: GameplayState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
