import type { EnvironmentDefinition } from '@/data/environments/environmentSchema';
import type { VehicleConfig } from '@/data/vehicles';
import type { SignalState } from '@/game/core/GameEvents';
import type { TerrainQuery } from '@/game/environment/TerrainQuery';
import { clamp, damp } from '@/utils/math/scalar';
import { IntervalGate } from '@/utils/performance/throttle';

const LOS_SAMPLES = 40;
const SAMPLE_INTERVAL = 0.2;
const SMOOTHING = 2.5;
/** Fraction of signal lost when line-of-sight is fully blocked. */
const OCCLUSION_PENALTY = 0.78;
/** Share of the signal lost to distance at the edge of relay range (line of sight dominates). */
const DISTANCE_LOSS = 0.55;

export interface SignalBreakdown {
  distance: number;
  occlusion: number;
  weather: number;
}

/**
 * Radio link quality between TerraWing and the base relay. Depends on distance, terrain
 * line-of-sight and weather. A weak link never fails the mission; it degrades telemetry.
 */
export class SignalSystem {
  private strength = 100;
  private target = 100;
  private currentState: SignalState = 'good';
  private readonly gate = new IntervalGate(SAMPLE_INTERVAL);
  private readonly relayX: number;
  private readonly relayZ: number;
  private readonly relayTop: number;
  readonly breakdown: SignalBreakdown = { distance: 1, occlusion: 0, weather: 1 };

  constructor(
    private readonly relay: EnvironmentDefinition['relay'],
    private readonly config: VehicleConfig['signal'],
    private readonly terrain: TerrainQuery,
    private readonly weatherFactor: number,
  ) {
    this.relayX = relay.position[0];
    this.relayZ = relay.position[1];
    this.relayTop = terrain.heightAt(this.relayX, this.relayZ) + relay.mastHeight;
  }

  get percent(): number {
    return this.strength;
  }

  get state(): SignalState {
    return this.currentState;
  }

  /** Samples the link. Returns the new state when it changes, otherwise null. */
  update(dt: number, x: number, y: number, z: number): SignalState | null {
    if (this.gate.tick(dt)) this.target = this.compute(x, y, z);
    this.strength = damp(this.strength, this.target, SMOOTHING, dt);
    const next = this.classify(this.strength);
    if (next === this.currentState) return null;
    this.currentState = next;
    return next;
  }

  /** Immediately recomputes the signal (used on spawn / teleport). */
  reset(x: number, y: number, z: number): void {
    this.target = this.compute(x, y, z);
    this.strength = this.target;
    this.currentState = this.classify(this.strength);
  }

  private compute(x: number, y: number, z: number): number {
    const distance = Math.hypot(x - this.relayX, z - this.relayZ);
    const distanceFactor = clamp(
      1 - DISTANCE_LOSS * Math.pow(distance / this.relay.range, 2),
      0,
      1,
    );
    const occlusion = this.terrain.occlusion(
      this.relayX,
      this.relayTop,
      this.relayZ,
      x,
      y + this.config.antennaHeight,
      z,
      LOS_SAMPLES,
    );
    this.breakdown.distance = distanceFactor;
    this.breakdown.occlusion = occlusion;
    this.breakdown.weather = this.weatherFactor;
    return clamp(
      distanceFactor * (1 - occlusion * OCCLUSION_PENALTY) * this.weatherFactor * 100,
      0,
      100,
    );
  }

  private classify(value: number): SignalState {
    if (value < this.config.thresholds.unstable) return 'unstable';
    if (value < this.config.thresholds.weak) return 'weak';
    return 'good';
  }
}
