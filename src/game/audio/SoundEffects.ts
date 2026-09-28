import type { SynthSoundId } from './SynthSounds';

export type SoundCategory = 'sfx' | 'music' | 'ambient' | 'ui';

export interface SoundDefinition {
  /**
   * Optional real audio files (e.g. `/audio/rotor.ogg`). When omitted or when loading fails the
   * procedural placeholder is used, so a missing asset never breaks the game.
   */
  src?: string[];
  synth: SynthSoundId;
  category: SoundCategory;
  volume: number;
  loop?: boolean;
  /** Positional sound (uses Web Audio panner). */
  spatial?: { refDistance: number; rolloff: number; maxDistance: number };
}

/** The sound manifest. Drop audio files into /public/audio and add their paths to `src`. */
export const SOUNDS = {
  rotor: { synth: 'rotorLoop', category: 'sfx', volume: 0.5, loop: true },
  engine: { synth: 'engineLoop', category: 'sfx', volume: 0.35, loop: true },
  wind: { synth: 'windLoop', category: 'ambient', volume: 0.35, loop: true },
  rain: { synth: 'rainLoop', category: 'ambient', volume: 0.3, loop: true },
  forest: { synth: 'forestLoop', category: 'ambient', volume: 0.25, loop: true },
  water: {
    synth: 'waterLoop',
    category: 'ambient',
    volume: 0.7,
    loop: true,
    spatial: { refDistance: 12, rolloff: 1.2, maxDistance: 300 },
  },
  machinery: {
    synth: 'machineryLoop',
    category: 'ambient',
    volume: 0.5,
    loop: true,
    spatial: { refDistance: 8, rolloff: 1.4, maxDistance: 200 },
  },
  siren: {
    synth: 'sirenLoop',
    category: 'sfx',
    volume: 0.6,
    loop: true,
    spatial: { refDistance: 18, rolloff: 1, maxDistance: 900 },
  },
  radioStatic: { synth: 'radioStaticLoop', category: 'sfx', volume: 0.12, loop: true },
  thunder: { synth: 'thunder', category: 'ambient', volume: 0.75 },
  transform: { synth: 'transform', category: 'sfx', volume: 0.6 },
  armFold: { synth: 'armFold', category: 'sfx', volume: 0.6 },
  armUnfold: { synth: 'armUnfold', category: 'sfx', volume: 0.6 },
  wheelsDeploy: { synth: 'wheelsDeploy', category: 'sfx', volume: 0.65 },
  wheelsRetract: { synth: 'wheelsRetract', category: 'sfx', volume: 0.6 },
  chassisLower: { synth: 'chassisLower', category: 'sfx', volume: 0.45 },
  chassisRaise: { synth: 'chassisRaise', category: 'sfx', volume: 0.45 },
  rotorSpinUp: { synth: 'rotorSpinUp', category: 'sfx', volume: 0.6 },
  rotorSpinDown: { synth: 'rotorSpinDown', category: 'sfx', volume: 0.6 },
  scanPing: { synth: 'scanPing', category: 'sfx', volume: 0.55 },
  scanDetect: { synth: 'scanDetect', category: 'sfx', volume: 0.45 },
  warning: { synth: 'warning', category: 'sfx', volume: 0.4 },
  alarmBeep: { synth: 'alarmBeep', category: 'sfx', volume: 0.4 },
  impact: { synth: 'impact', category: 'sfx', volume: 0.8 },
  radio: { synth: 'radio', category: 'sfx', volume: 0.45 },
  objective: { synth: 'objective', category: 'ui', volume: 0.55 },
  interact: { synth: 'interact', category: 'sfx', volume: 0.5 },
  survivorCall: {
    synth: 'survivorCall',
    category: 'sfx',
    volume: 0.9,
    spatial: { refDistance: 10, rolloff: 1.1, maxDistance: 220 },
  },
  uiClick: { synth: 'uiClick', category: 'ui', volume: 0.5 },
  uiConfirm: { synth: 'uiConfirm', category: 'ui', volume: 0.5 },
  missionComplete: { synth: 'missionComplete', category: 'ui', volume: 0.6 },
  missionFail: { synth: 'missionFail', category: 'ui', volume: 0.6 },
  musicAmbient: { synth: 'musicAmbient', category: 'music', volume: 0.5, loop: true },
  musicMenu: { synth: 'musicMenu', category: 'music', volume: 0.55, loop: true },
} as const satisfies Record<string, SoundDefinition>;

export type SoundId = keyof typeof SOUNDS;
