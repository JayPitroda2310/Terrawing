/**
 * Ground surface catalogue. Terrain cells store a compact numeric id; gameplay systems look up
 * physical behaviour here, so tuning never touches controller code.
 */
export const SurfaceId = {
  GRASS: 0,
  FOREST_FLOOR: 1,
  ROCK: 2,
  MUD: 3,
  GRAVEL: 4,
  ROAD: 5,
  TRAIL: 6,
  WATER: 7,
  PAD: 8,
} as const;

export type SurfaceId = (typeof SurfaceId)[keyof typeof SurfaceId];

export interface SurfaceProperties {
  readonly label: string;
  /** Multiplier on rover top speed. */
  readonly speedMultiplier: number;
  /** 0..1 — how strongly the rover's velocity follows its heading (low = sliding). */
  readonly traction: number;
  /** 0..1 — drives camera shake, suspension jitter and dust. */
  readonly roughness: number;
  /** Colour of dust / spray kicked up by wheels and rotor wash. */
  readonly dustColor: string;
  /** Integrity loss per second while the rover is on this surface. */
  readonly damagePerSecond: number;
  /** Height (m) of the fine bumps under the wheels: stones, ruts, roots. */
  readonly bumpAmplitude: number;
  /** Rolling-resistance coefficient (fraction of wheel load resisting motion). */
  readonly rollingResistance: number;
}

export const SURFACES: Readonly<Record<SurfaceId, SurfaceProperties>> = {
  [SurfaceId.GRASS]: {
    label: 'GRASS',
    speedMultiplier: 0.82,
    traction: 0.8,
    roughness: 0.25,
    dustColor: '#6d7058',
    damagePerSecond: 0,
    bumpAmplitude: 0.014,
    rollingResistance: 0.035,
  },
  [SurfaceId.FOREST_FLOOR]: {
    label: 'FOREST',
    speedMultiplier: 0.7,
    traction: 0.75,
    roughness: 0.4,
    dustColor: '#5b5242',
    damagePerSecond: 0,
    bumpAmplitude: 0.028,
    rollingResistance: 0.05,
  },
  [SurfaceId.ROCK]: {
    label: 'ROCK',
    speedMultiplier: 0.55,
    traction: 0.7,
    roughness: 0.85,
    dustColor: '#8a8c88',
    damagePerSecond: 0,
    bumpAmplitude: 0.055,
    rollingResistance: 0.03,
  },
  [SurfaceId.MUD]: {
    label: 'MUD',
    speedMultiplier: 0.5,
    traction: 0.32,
    roughness: 0.35,
    dustColor: '#4a3c2c',
    damagePerSecond: 0,
    bumpAmplitude: 0.018,
    rollingResistance: 0.1,
  },
  [SurfaceId.GRAVEL]: {
    label: 'DEBRIS',
    speedMultiplier: 0.62,
    traction: 0.6,
    roughness: 0.7,
    dustColor: '#7b7468',
    damagePerSecond: 0,
    bumpAmplitude: 0.04,
    rollingResistance: 0.06,
  },
  [SurfaceId.ROAD]: {
    label: 'ROAD',
    speedMultiplier: 1,
    traction: 0.95,
    roughness: 0.05,
    dustColor: '#55595c',
    damagePerSecond: 0,
    bumpAmplitude: 0.003,
    rollingResistance: 0.015,
  },
  [SurfaceId.TRAIL]: {
    label: 'TRAIL',
    speedMultiplier: 0.85,
    traction: 0.78,
    roughness: 0.3,
    dustColor: '#5e5341',
    damagePerSecond: 0,
    bumpAmplitude: 0.022,
    rollingResistance: 0.03,
  },
  [SurfaceId.WATER]: {
    label: 'WATER',
    speedMultiplier: 0.22,
    traction: 0.25,
    roughness: 0.2,
    dustColor: '#9fb3bb',
    damagePerSecond: 4,
    bumpAmplitude: 0.02,
    rollingResistance: 0.25,
  },
  [SurfaceId.PAD]: {
    label: 'PAD',
    speedMultiplier: 1,
    traction: 0.95,
    roughness: 0.02,
    dustColor: '#5a5f63',
    damagePerSecond: 0,
    bumpAmplitude: 0.002,
    rollingResistance: 0.012,
  },
};

export function getSurface(id: SurfaceId): SurfaceProperties {
  return SURFACES[id];
}
