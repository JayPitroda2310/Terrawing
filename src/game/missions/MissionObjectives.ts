import type { VehicleMode } from '@/game/core/GameState';
import type { ObjectiveDefinition } from './MissionDefinition';

export type ObjectiveStatus = 'locked' | 'active' | 'completed';

export interface ObjectiveRuntime {
  readonly definition: ObjectiveDefinition;
  status: ObjectiveStatus;
  /** 0..1 for objectives with duration (extraction hold). */
  progress: number;
  completedAt: number;
}

/** Snapshot of the world that state-based objectives are evaluated against. */
export interface MissionContext {
  x: number;
  z: number;
  altitudeAGL: number;
  speed: number;
  mode: VehicleMode | null;
  grounded: boolean;
  isInZone(zoneId: string, x: number, z: number): boolean;
}

/** Discrete gameplay facts that complete event-based objectives. */
export type MissionFact =
  | { type: 'scanPerformed'; x: number; z: number }
  | { type: 'survivorSecured'; survivorId: string }
  | { type: 'supplyDelivered'; supplyId: string; survivorId: string };

const EXTRACTION_MAX_SPEED = 1.2;

/**
 * Evaluates a state-based objective. Returns the new progress (1 = complete).
 * Event-based objectives return their current progress unchanged.
 */
export function evaluateObjective(
  objective: ObjectiveRuntime,
  ctx: MissionContext,
  dt: number,
): number {
  const def = objective.definition;
  switch (def.type) {
    case 'deploy':
      return ctx.mode === 'FLIGHT' && ctx.altitudeAGL >= def.minAltitude ? 1 : 0;
    case 'reachZone':
      return ctx.isInZone(def.zoneId, ctx.x, ctx.z) ? 1 : 0;
    case 'extract': {
      const holding =
        ctx.isInZone(def.zoneId, ctx.x, ctx.z) &&
        ctx.mode === 'ROVER' &&
        ctx.grounded &&
        ctx.speed < EXTRACTION_MAX_SPEED;
      if (!holding) return Math.max(0, objective.progress - dt / def.holdSeconds);
      return Math.min(1, objective.progress + dt / def.holdSeconds);
    }
    case 'scan':
    case 'secureSurvivor':
    case 'deliverSupply':
      return objective.progress;
  }
}

/** Whether a fact completes an event-based objective. */
export function factCompletes(
  definition: ObjectiveDefinition,
  fact: MissionFact,
  isInZone: MissionContext['isInZone'],
): boolean {
  switch (definition.type) {
    case 'scan':
      return fact.type === 'scanPerformed' && isInZone(definition.zoneId, fact.x, fact.z);
    case 'secureSurvivor':
      return fact.type === 'survivorSecured' && fact.survivorId === definition.survivorId;
    case 'deliverSupply':
      return (
        fact.type === 'supplyDelivered' &&
        fact.supplyId === definition.supplyId &&
        fact.survivorId === definition.survivorId
      );
    default:
      return false;
  }
}
