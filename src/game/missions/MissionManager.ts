import type { FailureReason } from '@/game/core/GameEvents';
import type { MissionDefinition } from './MissionDefinition';
import {
  evaluateObjective,
  factCompletes,
  type MissionContext,
  type MissionFact,
  type ObjectiveRuntime,
} from './MissionObjectives';

export type MissionState = 'running' | 'completed' | 'failed';

export interface MissionUpdateResult {
  completed: ObjectiveRuntime[];
  missionCompleted: boolean;
}

/**
 * Tracks mission progression independently of rendering and UI. Objectives unlock when their
 * `requires` list is complete; the mission completes when every required objective is done.
 */
export class MissionManager {
  readonly objectives: ObjectiveRuntime[];
  elapsed = 0;
  state: MissionState = 'running';
  failureReason: FailureReason | null = null;
  private readonly pending: MissionFact[] = [];
  private readonly result: MissionUpdateResult = { completed: [], missionCompleted: false };

  constructor(
    readonly mission: MissionDefinition,
    private readonly isInZone: MissionContext['isInZone'],
  ) {
    this.objectives = mission.objectives.map((definition) => ({
      definition,
      status: 'locked',
      progress: 0,
      completedAt: -1,
    }));
    this.refreshLocks();
  }

  get timeRemaining(): number {
    return Math.max(0, this.mission.timeLimit - this.elapsed);
  }

  /** The first active, incomplete objective — shown as the HUD's primary objective. */
  get currentObjective(): ObjectiveRuntime | null {
    return this.objectives.find((o) => o.status === 'active') ?? null;
  }

  getObjective(id: string): ObjectiveRuntime | undefined {
    return this.objectives.find((o) => o.definition.id === id);
  }

  /** Queue a gameplay fact; processed on the next update. */
  notify(fact: MissionFact): void {
    this.pending.push(fact);
  }

  update(dt: number, ctx: MissionContext): MissionUpdateResult {
    this.result.completed.length = 0;
    this.result.missionCompleted = false;
    if (this.state !== 'running') return this.result;
    this.elapsed += dt;

    // Facts can complete objectives that are active *or* still locked behind prerequisites
    // (e.g. delivering the med-kit before the survivor objective ticks), so check all incomplete ones.
    for (const fact of this.pending) {
      for (const objective of this.objectives) {
        if (objective.status === 'completed') continue;
        if (factCompletes(objective.definition, fact, this.isInZone)) this.complete(objective);
      }
    }
    this.pending.length = 0;

    for (const objective of this.objectives) {
      if (objective.status !== 'active') continue;
      objective.progress = evaluateObjective(objective, ctx, dt);
      if (objective.progress >= 1) this.complete(objective);
    }

    if (this.result.completed.length > 0) this.refreshLocks();

    if (this.objectives.every((o) => o.definition.optional || o.status === 'completed')) {
      this.state = 'completed';
      this.result.missionCompleted = true;
    } else if (this.elapsed >= this.mission.timeLimit) {
      this.fail('TIME_EXPIRED');
    }
    return this.result;
  }

  fail(reason: FailureReason): void {
    if (this.state !== 'running') return;
    this.state = 'failed';
    this.failureReason = reason;
  }

  private complete(objective: ObjectiveRuntime): void {
    if (objective.status === 'completed') return;
    objective.status = 'completed';
    objective.progress = 1;
    objective.completedAt = this.elapsed;
    this.result.completed.push(objective);
  }

  private refreshLocks(): void {
    // Loop until stable so chains of prerequisites unlock in a single update.
    let changed = true;
    while (changed) {
      changed = false;
      for (const objective of this.objectives) {
        if (objective.status !== 'locked') continue;
        const ready = objective.definition.requires.every(
          (id) => this.getObjective(id)?.status === 'completed',
        );
        if (ready) {
          objective.status = 'active';
          changed = true;
        }
      }
    }
  }
}
