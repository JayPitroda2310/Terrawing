import type { VehicleConfig } from '@/data/vehicles';
import type { BatteryLevel } from '@/game/core/GameEvents';
import { clamp } from '@/utils/math/scalar';

export type BatteryActivity =
  'flight' | 'hover' | 'rover' | 'roverIdle' | 'transforming' | 'interacting' | 'idle';

export interface BatteryUpdate {
  activity: BatteryActivity;
  carryingPayload: boolean;
  charging: boolean;
}

/** Tracks battery charge (percent) and reports threshold crossings. */
export class BatterySystem {
  private charge: number;
  private currentLevel: BatteryLevel;
  /** Percent per second being drained (negative while charging); exposed for the HUD. */
  rate = 0;

  constructor(
    private readonly config: VehicleConfig['battery'],
    initialPercent: number,
  ) {
    this.charge = clamp(initialPercent, 0, 100);
    this.currentLevel = this.classify(this.charge);
  }

  get percent(): number {
    return this.charge;
  }

  get level(): BatteryLevel {
    return this.currentLevel;
  }

  get depleted(): boolean {
    return this.charge <= 0;
  }

  /**
   * Advances the battery. Returns the new level when a threshold was crossed, otherwise null.
   */
  update(dt: number, update: BatteryUpdate): BatteryLevel | null {
    const drain = this.config.drain;
    let perSecond = 0;
    switch (update.activity) {
      case 'flight':
        perSecond = drain.flight;
        break;
      case 'hover':
        perSecond = drain.hover;
        break;
      case 'rover':
        perSecond = drain.rover;
        break;
      case 'roverIdle':
        perSecond = drain.roverIdle;
        break;
      case 'interacting':
        perSecond = drain.emergency;
        break;
      case 'transforming':
      case 'idle':
        perSecond = drain.roverIdle;
        break;
    }
    if (update.carryingPayload && (update.activity === 'flight' || update.activity === 'hover')) {
      perSecond *= drain.payloadMultiplier;
    }
    if (update.charging) perSecond = -this.config.rechargeRate;
    this.rate = perSecond;
    return this.set(this.charge - perSecond * dt);
  }

  /** Instant consumption (scanner pulse, transformation). Returns false if there was not enough. */
  consume(amount: number): boolean {
    if (this.charge < amount) return false;
    this.set(this.charge - amount);
    return true;
  }

  /** Returns the level if it changed. */
  set(percent: number): BatteryLevel | null {
    this.charge = clamp(percent, 0, 100);
    const level = this.classify(this.charge);
    if (level === this.currentLevel) return null;
    this.currentLevel = level;
    return level;
  }

  private classify(percent: number): BatteryLevel {
    const t = this.config.thresholds;
    if (percent <= 0) return 'depleted';
    if (percent <= t.emergency) return 'emergency';
    if (percent <= t.critical) return 'critical';
    if (percent <= t.warning) return 'warning';
    return 'normal';
  }
}
