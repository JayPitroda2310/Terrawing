import type { VehicleConfig } from '@/data/vehicles';
import { clamp } from '@/utils/math/scalar';

export const DAMAGE_COMPONENTS = ['BODY', 'PROPULSION', 'WHEELS', 'SENSORS'] as const;
export type DamageComponent = (typeof DAMAGE_COMPONENTS)[number];
export type IntegrityLevel = 'nominal' | 'damaged' | 'critical' | 'destroyed';
export type DamageSource = 'impact' | 'hazard' | 'terrain' | 'water';

/**
 * Tracks system integrity. Version 0.1 exposes a single overall integrity value, but damage is
 * already attributed to components so per-component effects can be layered on later.
 */
export class DamageSystem {
  private readonly components: Record<DamageComponent, number> = {
    BODY: 100,
    PROPULSION: 100,
    WHEELS: 100,
    SENSORS: 100,
  };
  private overall = 100;
  private currentLevel: IntegrityLevel = 'nominal';
  private cooldown = 0;
  /** Seconds since damage was last taken — used for HUD flashes. */
  sinceLastDamage = Infinity;

  constructor(private readonly config: VehicleConfig['damage']) {}

  get integrity(): number {
    return this.overall;
  }

  get level(): IntegrityLevel {
    return this.currentLevel;
  }

  get destroyed(): boolean {
    return this.overall <= 0;
  }

  componentIntegrity(component: DamageComponent): number {
    return this.components[component];
  }

  tick(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.sinceLastDamage += dt;
  }

  /**
   * Converts a collision speed change into damage. Returns damage dealt (0 if below threshold
   * or still in the impact cooldown).
   */
  applyImpact(impactSpeed: number, component: DamageComponent): number {
    if (impactSpeed < this.config.impactThreshold || this.cooldown > 0) return 0;
    this.cooldown = this.config.impactCooldown;
    const damage = (impactSpeed - this.config.impactThreshold) * this.config.damagePerImpactSpeed;
    this.apply(damage, component);
    return damage;
  }

  /** Returns the new level if it changed, otherwise null. */
  apply(amount: number, component: DamageComponent): IntegrityLevel | null {
    if (amount <= 0) return null;
    this.components[component] = clamp(this.components[component] - amount * 1.5, 0, 100);
    this.overall = clamp(this.overall - amount, 0, 100);
    this.sinceLastDamage = 0;
    const level = this.classify();
    if (level === this.currentLevel) return null;
    this.currentLevel = level;
    return level;
  }

  private classify(): IntegrityLevel {
    if (this.overall <= 0) return 'destroyed';
    if (this.overall <= this.config.thresholds.critical) return 'critical';
    if (this.overall <= this.config.thresholds.damaged) return 'damaged';
    return 'nominal';
  }
}
