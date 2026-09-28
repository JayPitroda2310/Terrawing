import type { MissionDefinition } from '@/game/missions/MissionDefinition';
import { createNoise2D, type Noise2D } from '@/utils/math/noise';
import { createRandom, randomRange, type RandomFn } from '@/utils/math/random';
import { DEG2RAD } from '@/utils/math/scalar';

export type WeatherConfig = MissionDefinition['weather'];

const GUST_FREQUENCY = 0.18;
const THUNDER_INTERVAL: readonly [number, number] = [22, 55];
const WEATHER_SEED = 9001;
/** Time constant (s) for the ground to soak through. */
const RAIN_SOAK_SECONDS = 150;
/** Time for the weather front to build, and for the light to fade to dusk (s). */
const WEATHER_BUILD_SECONDS = 900;
const DUSK_SECONDS = 1500;
const DUSK_DIMMING = 0.4;

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
  /**
   * 0..1 how soaked the ground is. It was already raining before the mission, and keeps soaking
   * in towards a level set by the rain intensity (puddles grow, grip falls).
   */
  wetness: number;
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
    this.wetness = this.targetWetness * 0.55;
  }

  private get targetWetness(): number {
    return Math.min(1, this.config.rainIntensity * 1.15);
  }

  /**
   * Weather evolves through the mission: rain comes in bands and the front builds over the first
   * ~15 minutes; fog thickens with it.
   */
  private get front(): number {
    return Math.min(1, this.time / WEATHER_BUILD_SECONDS);
  }

  get rainIntensity(): number {
    const band = 0.62 + 0.38 * this.noise(this.time * 0.006, 41.7) + 0.35 * this.front;
    return Math.min(1, this.config.rainIntensity * Math.max(0.35, band));
  }

  /** Highest rain the evolving weather can reach (for sizing effects). */
  get maxRainIntensity(): number {
    return Math.min(1, this.config.rainIntensity * 1.35);
  }

  get fogDensity(): number {
    const drift = 0.1 * this.noise(this.time * 0.004, 77.1);
    return this.config.fogDensity * (0.85 + 0.45 * this.front + drift);
  }

  /** 0..1 daylight: the light slowly fades towards dusk as the mission goes on. */
  get daylight(): number {
    return 1 - DUSK_DIMMING * Math.min(1, this.time / DUSK_SECONDS);
  }

  get signalFactor(): number {
    return 1 - this.config.signalAttenuation;
  }

  /** Grip multiplier: the mission's wet-ground grip, reached as the ground soaks through. */
  get tractionMultiplier(): number {
    const target = this.targetWetness;
    const soaked = target > 0 ? this.wetness / target : 1;
    return 1 - (1 - this.config.tractionMultiplier) * (0.55 + 0.45 * soaked);
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
    // Rain: a downdraft that strengthens in gusts, plus vertical turbulence the drone must fight.
    const rain = this.config.rainIntensity;
    const turbulence = this.noise(this.time * 1.7, 21.9) * this.config.gustiness;
    this.wind.y = -rain * 0.7 * (1 + this.config.gustiness * Math.max(0, gust)) + turbulence * 0.6;
    this.wetness += (this.targetWetness - this.wetness) * Math.min(1, dt / RAIN_SOAK_SECONDS);
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
