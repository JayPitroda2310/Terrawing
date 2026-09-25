import type { MissionDefinition } from '@/game/missions/MissionDefinition';
import { createNoise2D, type Noise2D } from '@/utils/math/noise';
import { createRandom, randomRange, type RandomFn } from '@/utils/math/random';
import { DEG2RAD } from '@/utils/math/scalar';

export type WeatherConfig = MissionDefinition['weather'];

const GUST_FREQUENCY = 0.18;
const THUNDER_INTERVAL: readonly [number, number] = [22, 55];
const WEATHER_SEED = 9001;

export interface ThunderStrike {
  intensity: number;
  /** Seconds between the flash and the sound. */
  delay: number;
}

/**
 * Weather is a gameplay system: it produces wind that pushes the drone, reduces traction and
 * radio signal, and drives the rain/fog visuals.
 */
export class WeatherSystem {
  /** Wind velocity in m/s (world space). */
  readonly wind = { x: 0, y: 0, z: 0 };
  /** 0..1 lightning flash intensity, decays quickly. */
  flash = 0;
  private time = 0;
  private nextThunder: number;
  private readonly noise: Noise2D;
  private readonly random: RandomFn;
  private readonly baseDirection: { x: number; z: number };

  constructor(readonly config: WeatherConfig) {
    this.noise = createNoise2D(WEATHER_SEED);
    this.random = createRandom(WEATHER_SEED);
    const angle = config.windDirectionDeg * DEG2RAD;
    // Direction the wind blows towards, heading convention (0 = north = -Z).
    this.baseDirection = { x: Math.sin(angle), z: -Math.cos(angle) };
    this.nextThunder = randomRange(this.random, THUNDER_INTERVAL[0], THUNDER_INTERVAL[1]);
  }

  get rainIntensity(): number {
    return this.config.rainIntensity;
  }

  get fogDensity(): number {
    return this.config.fogDensity;
  }

  get signalFactor(): number {
    return 1 - this.config.signalAttenuation;
  }

  get tractionMultiplier(): number {
    return this.config.tractionMultiplier;
  }

  /** Returns a thunder strike when one occurs this step. */
  update(dt: number): ThunderStrike | null {
    this.time += dt;
    const gust = this.noise(this.time * GUST_FREQUENCY, 3.7);
    const strength = this.config.windStrength * (1 + this.config.gustiness * gust);
    const veer = this.noise(this.time * GUST_FREQUENCY * 0.5, 11.3) * 0.5;
    const cos = Math.cos(veer);
    const sin = Math.sin(veer);
    this.wind.x = (this.baseDirection.x * cos - this.baseDirection.z * sin) * strength;
    this.wind.z = (this.baseDirection.x * sin + this.baseDirection.z * cos) * strength;
    this.flash = Math.max(0, this.flash - dt * 4);

    if (!this.config.thunder) return null;
    this.nextThunder -= dt;
    if (this.nextThunder > 0) return null;
    this.nextThunder = randomRange(this.random, THUNDER_INTERVAL[0], THUNDER_INTERVAL[1]);
    const intensity = randomRange(this.random, 0.4, 1);
    this.flash = intensity;
    return { intensity, delay: randomRange(this.random, 0.8, 3.5) };
  }
}
