import type { BatteryLevel, SignalState } from './GameEvents';
import type { GameplayStateKind, VehicleMode } from './GameState';
import type { IntegrityLevel } from '@/game/systems/DamageSystem';

export type WarningSeverity = 'caution' | 'warning' | 'critical';

export interface HudWarning {
  id: string;
  text: string;
  severity: WarningSeverity;
}

/** Low-frequency HUD snapshot published to React (about 10 Hz). */
export interface Telemetry {
  battery: number;
  batteryLevel: BatteryLevel;
  batteryRate: number;
  charging: boolean;
  signal: number;
  signalState: SignalState;
  integrity: number;
  integrityLevel: IntegrityLevel;
  recentlyDamaged: boolean;
  altitudeAGL: number;
  altitudeASL: number;
  speedKmh: number;
  verticalSpeed: number;
  headingDeg: number;
  x: number;
  z: number;
  mode: VehicleMode;
  substate: GameplayStateKind;
  transformLabel: string | null;
  transformProgress: number;
  scannerReadiness: number;
  scannerActive: boolean;
  prompt: { label: string; blockedReason: string | null } | null;
  interaction: { label: string; progress: number } | null;
  payload: string | null;
  surface: string;
  missionTime: number;
  timeRemaining: number;
  extractionProgress: number;
  survivorsSecured: number;
  survivorsTotal: number;
  warnings: HudWarning[];
}

export function createTelemetry(): Telemetry {
  return {
    battery: 100,
    batteryLevel: 'normal',
    batteryRate: 0,
    charging: false,
    signal: 100,
    signalState: 'good',
    integrity: 100,
    integrityLevel: 'nominal',
    recentlyDamaged: false,
    altitudeAGL: 0,
    altitudeASL: 0,
    speedKmh: 0,
    verticalSpeed: 0,
    headingDeg: 0,
    x: 0,
    z: 0,
    mode: 'ROVER',
    substate: 'ROVER',
    transformLabel: null,
    transformProgress: 0,
    scannerReadiness: 1,
    scannerActive: false,
    prompt: null,
    interaction: null,
    payload: null,
    surface: '',
    missionTime: 0,
    timeRemaining: 0,
    extractionProgress: 0,
    survivorsSecured: 0,
    survivorsTotal: 0,
    warnings: [],
  };
}
