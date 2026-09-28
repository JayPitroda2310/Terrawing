import type { ScanCategory } from '@/game/missions/MissionDefinition';
import type { GameplayState, TransformDirection, VehicleMode } from './GameState';

export type NotificationTone = 'info' | 'success' | 'warning' | 'danger';
export type BatteryLevel = 'normal' | 'warning' | 'critical' | 'emergency' | 'depleted';
export type SignalState = 'good' | 'weak' | 'unstable';
export type FailureReason = 'BATTERY_DEPLETED' | 'SYSTEM_INTEGRITY_CRITICAL' | 'TIME_EXPIRED';

export interface Vec3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Every event the gameplay layer can publish. Audio, UI and effects subscribe to these. */
export interface GameEvents extends Record<string, unknown> {
  'state:changed': { next: GameplayState; previous: GameplayState };
  'vehicle:modeChanged': { mode: VehicleMode };
  'transform:started': { direction: TransformDirection };
  'transform:phase': {
    direction: TransformDirection;
    phaseId: string;
    label: string;
    sound?: string;
  };
  'transform:completed': { direction: TransformDirection };
  'transform:rejected': { reason: string };
  'vehicle:impact': { speed: number; damage: number; position: Vec3Like };
  'scan:pulse': { origin: Vec3Like; range: number };
  'scan:detected': {
    targetId: string;
    category: ScanCategory;
    classified: boolean;
    distance: number;
  };
  'scan:rejected': { reason: string };
  'battery:level': { level: BatteryLevel };
  'integrity:level': { level: 'nominal' | 'damaged' | 'critical' | 'destroyed' };
  'signal:state': { state: SignalState };
  'hazard:entered': { hazardId: string; warning: string };
  'hazard:exited': { hazardId: string };
  'interaction:started': { interactionId: string; label: string };
  'interaction:completed': { interactionId: string };
  'interaction:cancelled': { interactionId: string };
  'survivor:secured': { survivorId: string };
  'supply:loaded': { supplyId: string };
  'supply:delivered': { supplyId: string; survivorId: string };
  'objective:completed': { objectiveId: string; label: string };
  'mission:completed': Record<string, never>;
  'mission:failed': { reason: FailureReason };
  'radio:message': { id: string; speaker: string; text: string };
  notification: { text: string; tone: NotificationTone };
  'weather:thunder': { intensity: number; delay: number };
  /** The player switched camera view. */
  'camera:view': { view: 'chase' | 'nose' | 'gimbal' };
  /** An aftershock: the ground shakes (0..1 intensity). */
  'world:tremor': { intensity: number };
  /** Something heavy hit the ground (falling tree, boulder): size 0..1. */
  'world:crash': { x: number; y: number; z: number; size: number };
  'boundary:warning': { active: boolean };
  'cinematic:finished': { shot: string };
}
