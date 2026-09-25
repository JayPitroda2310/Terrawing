import type { VehicleConfig } from '@/data/vehicles';
import { createScanPulseState, pulseIntensity, type ScanPulseState } from './ScannerEffect';
import type { ScannerTarget } from './ScannerTarget';

export interface ScanDetection {
  target: ScannerTarget;
  distance: number;
  /** True the first time this target is discovered or newly classified. */
  isNew: boolean;
}

export type PulseRejection = 'cooldown' | 'battery';

/**
 * Scanner pulse logic. A pulse expands from the vehicle at `pulseSpeed`; targets are detected the
 * moment the wavefront reaches them. Targets beyond `classifyRange` (or while the relay link is
 * unstable) are reported only as unknown signals until scanned again from closer.
 */
export class Scanner {
  readonly pulse: ScanPulseState = createScanPulseState();
  readonly targets: ScannerTarget[] = [];
  private cooldownRemaining = 0;
  private readonly pinged = new Set<string>();
  private currentPulseUseful = false;
  /** Seconds since the last pulse started — drives HUD/camera scan effects. */
  sincePulse = Infinity;
  totalPulses = 0;
  usefulPulses = 0;

  constructor(private readonly config: VehicleConfig['scanner']) {}

  get ready(): boolean {
    return this.cooldownRemaining <= 0;
  }

  /** 0 = just fired, 1 = ready. */
  get readiness(): number {
    return 1 - this.cooldownRemaining / this.config.cooldown;
  }

  get range(): number {
    return this.config.range;
  }

  /** Percentage of pulses that revealed or classified something. */
  get accuracy(): number {
    if (this.totalPulses === 0) return 100;
    return (this.usefulPulses / this.totalPulses) * 100;
  }

  addTarget(target: ScannerTarget): void {
    this.targets.push(target);
  }

  getTarget(id: string): ScannerTarget | undefined {
    return this.targets.find((t) => t.id === id);
  }

  /** Attempts to fire a pulse. Returns a rejection reason, or null on success. */
  tryPulse(x: number, y: number, z: number, hasBattery: boolean): PulseRejection | null {
    if (!this.ready) return 'cooldown';
    if (!hasBattery) return 'battery';
    this.finishPulse();
    this.cooldownRemaining = this.config.cooldown;
    this.pulse.active = true;
    this.pulse.originX = x;
    this.pulse.originY = y;
    this.pulse.originZ = z;
    this.pulse.radius = 0;
    this.pulse.maxRadius = this.config.range;
    this.pulse.intensity = 1;
    this.pinged.clear();
    this.currentPulseUseful = false;
    this.totalPulses++;
    this.sincePulse = 0;
    return null;
  }

  /**
   * Advances the pulse. `canClassify` is false while the relay link is unstable.
   * Detections are appended to `out` (which is cleared first).
   */
  update(dt: number, now: number, canClassify: boolean, out: ScanDetection[]): ScanDetection[] {
    out.length = 0;
    this.cooldownRemaining = Math.max(0, this.cooldownRemaining - dt);
    this.sincePulse += dt;
    if (!this.pulse.active) return out;

    this.pulse.radius += this.config.pulseSpeed * dt;
    this.pulse.intensity = pulseIntensity(this.pulse.radius, this.pulse.maxRadius);
    for (const target of this.targets) {
      if (!target.active || this.pinged.has(target.id)) continue;
      const distance = Math.hypot(
        target.position.x - this.pulse.originX,
        target.position.y - this.pulse.originY,
        target.position.z - this.pulse.originZ,
      );
      if (distance > this.pulse.radius || distance > this.config.range) continue;
      this.pinged.add(target.id);
      const classifies = canClassify && distance <= this.config.classifyRange;
      const isNew = !target.discovered || (classifies && !target.classified);
      target.discovered = true;
      if (classifies) target.classified = true;
      target.lastPing = now;
      if (isNew) this.currentPulseUseful = true;
      out.push({ target, distance, isNew });
    }
    if (this.pulse.radius >= this.pulse.maxRadius) this.finishPulse();
    return out;
  }

  /** Classifies targets the player has physically reached. */
  classifyNearby(x: number, z: number, radius: number): ScannerTarget | null {
    for (const target of this.targets) {
      if (!target.discovered || target.classified || !target.active) continue;
      if (Math.hypot(target.position.x - x, target.position.z - z) <= radius) {
        target.classified = true;
        return target;
      }
    }
    return null;
  }

  /** Whether a discovered, non-persistent target's marker should still be shown. */
  isMarkerVisible(target: ScannerTarget, now: number): boolean {
    if (!target.active || !target.discovered) return false;
    if (target.persistent) return true;
    return now - target.lastPing < this.config.transientMarkerDuration;
  }

  /** 0..1 highlight strength after a ping. */
  highlight(target: ScannerTarget, now: number): number {
    const t = (now - target.lastPing) / this.config.highlightDuration;
    return t < 0 || t > 1 ? 0 : 1 - t;
  }

  private finishPulse(): void {
    if (!this.pulse.active) return;
    this.pulse.active = false;
    this.pulse.intensity = 0;
    if (this.currentPulseUseful) this.usefulPulses++;
  }
}
