import type { RigState, TransformPhaseConfig, VehicleConfig } from '@/data/vehicles';
import type { TransformDirection } from '@/game/core/GameState';
import { DEG2RAD, easeInOutCubic, lerp, moveTowards } from '@/utils/math/scalar';
import type { VehicleState, VelocityCommand } from './VehicleState';

export interface TransformPreconditions {
  mode: VehicleState['mode'];
  altitudeAGL: number;
  groundSlopeRad: number;
  overWater: boolean;
  /** Something (trees, debris, a roof) is between the vehicle and the ground. */
  obstructed: boolean;
  speed: number;
}

export type TransformStepResult =
  | { type: 'running' }
  | { type: 'phase'; phase: TransformPhaseConfig }
  | { type: 'completed'; direction: TransformDirection };

const GROUNDED_EPSILON = 0.15;
const DESCENT_FLARE_HEIGHT = 2.2;
const DESCENT_MIN_SPEED = 0.9;
const LIFTOFF_SPEED = 3;
const HORIZONTAL_SETTLE_RATE = 10;
const BRAKED_SPEED = 0.5;

const RIG_KEYS: readonly (keyof RigState)[] = [
  'armExtension',
  'wheelDeploy',
  'bodyLift',
  'rotorSpeed',
  'sensorMast',
];

/**
 * Runs the multi-phase FLIGHT ⇄ ROVER transformation. Phases are data (vehicle config), each with
 * rig keyframes; the controller only knows how to execute the phase kinds. A skeletal model can
 * follow the same rig values later.
 */
export class TransformationController {
  private direction: TransformDirection | null = null;
  private phases: readonly TransformPhaseConfig[] = [];
  private phaseIndex = 0;
  private phaseTime = 0;
  private readonly rigStart: RigState = {
    armExtension: 0,
    wheelDeploy: 0,
    bodyLift: 0,
    rotorSpeed: 0,
    sensorMast: 0,
  };

  constructor(private readonly config: VehicleConfig['transform']) {}

  get active(): boolean {
    return this.direction !== null;
  }

  get currentDirection(): TransformDirection | null {
    return this.direction;
  }

  get currentPhase(): TransformPhaseConfig | null {
    return this.direction ? (this.phases[this.phaseIndex] ?? null) : null;
  }

  /** Overall progress 0..1 across all phases. */
  get progress(): number {
    if (!this.direction || this.phases.length === 0) return 0;
    const phase = this.phases[this.phaseIndex];
    const within = phase ? Math.min(1, this.phaseTime / phase.duration) : 1;
    return (this.phaseIndex + within) / this.phases.length;
  }

  /** Returns a human-readable rejection reason, or null if the transformation may begin. */
  check(direction: TransformDirection, pre: TransformPreconditions): string | null {
    if (this.active) return 'TRANSFORMATION IN PROGRESS';
    if (direction === 'toRover') {
      if (pre.mode !== 'FLIGHT') return 'ALREADY IN ROVER MODE';
      if (pre.altitudeAGL > this.config.maxAltitudeAGL) {
        return `DESCEND BELOW ${Math.round(this.config.maxAltitudeAGL)} M TO LAND`;
      }
      if (pre.overWater) return 'CANNOT LAND ON WATER';
      if (pre.obstructed) return 'LANDING SITE OBSTRUCTED — FIND A CLEARING';
      if (pre.groundSlopeRad > this.config.maxGroundSlopeDeg * DEG2RAD)
        return 'GROUND TOO STEEP TO LAND';
      return null;
    }
    if (pre.mode !== 'ROVER') return 'ALREADY IN FLIGHT MODE';
    if (pre.speed > this.config.maxRoverSpeedToFlight) return 'SLOW DOWN TO TRANSFORM';
    return null;
  }

  /** Begins a transformation. Returns the first phase. */
  begin(direction: TransformDirection, rig: RigState): TransformPhaseConfig {
    this.direction = direction;
    this.phases = direction === 'toRover' ? this.config.toRover : this.config.toFlight;
    this.phaseIndex = 0;
    this.enterPhase(rig);
    return this.phases[0]!;
  }

  cancel(): void {
    this.direction = null;
  }

  update(state: VehicleState, dt: number, out: VelocityCommand): TransformStepResult {
    const direction = this.direction;
    const phase = this.phases[this.phaseIndex];
    if (!direction || !phase) return { type: 'running' };
    this.phaseTime += dt;

    // Horizontal motion always settles during a transformation.
    out.x = moveTowards(state.velocity.x, 0, HORIZONTAL_SETTLE_RATE * dt);
    out.z = moveTowards(state.velocity.z, 0, HORIZONTAL_SETTLE_RATE * dt);
    out.yawRate = 0;
    state.yawRate = 0;

    let finished = this.phaseTime >= phase.duration;
    switch (phase.kind) {
      case 'descend': {
        const speed = Math.max(
          DESCENT_MIN_SPEED,
          Math.min(
            this.config.descentSpeed,
            state.altitudeAGL * (this.config.descentSpeed / DESCENT_FLARE_HEIGHT),
          ),
        );
        out.y = -speed;
        out.gravityScale = 0;
        if (state.grounded || state.altitudeAGL < GROUNDED_EPSILON) finished = true;
        break;
      }
      case 'ascend':
        out.y = LIFTOFF_SPEED;
        out.gravityScale = 0;
        if (state.altitudeAGL >= this.config.liftoffHeight) finished = true;
        break;
      case 'brake':
        out.y = state.velocity.y;
        out.gravityScale = 1;
        if (Math.hypot(state.velocity.x, state.velocity.z) < BRAKED_SPEED) finished = true;
        break;
      case 'timed': {
        const t = easeInOutCubic(Math.min(1, this.phaseTime / phase.duration));
        for (const key of RIG_KEYS) {
          const target = phase.rigTarget[key];
          if (target !== undefined) state.rig[key] = lerp(this.rigStart[key], target, t);
        }
        // On the ground: let gravity hold the vehicle; after spin-up the rotors carry it.
        out.y = state.velocity.y;
        out.gravityScale = 1;
        break;
      }
    }

    if (!finished) return { type: 'running' };
    this.applyPhaseTarget(state.rig, phase);
    this.phaseIndex++;
    if (this.phaseIndex >= this.phases.length) {
      this.direction = null;
      return { type: 'completed', direction };
    }
    this.enterPhase(state.rig);
    return { type: 'phase', phase: this.phases[this.phaseIndex]! };
  }

  private enterPhase(rig: RigState): void {
    this.phaseTime = 0;
    for (const key of RIG_KEYS) this.rigStart[key] = rig[key];
  }

  private applyPhaseTarget(rig: RigState, phase: TransformPhaseConfig): void {
    for (const key of RIG_KEYS) {
      const target = phase.rigTarget[key];
      if (target !== undefined) rig[key] = target;
    }
  }
}
