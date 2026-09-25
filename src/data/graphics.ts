import type { GraphicsQuality } from '@/services/save/saveSchema';

export interface GraphicsProfile {
  maxPixelRatio: number;
  antialias: boolean;
  shadows: boolean;
  shadowMapSize: number;
  /** Fraction of generated trees rendered. */
  treeFraction: number;
  /** Distance beyond which trees use the low-detail mesh. */
  treeLodDistance: number;
  rainDrops: number;
  particleBudget: number;
  bloom: boolean;
  mist: boolean;
  headlights: boolean;
  /** Far plane of the camera. */
  drawDistance: number;
}

export const GRAPHICS_PROFILES: Readonly<Record<GraphicsQuality, GraphicsProfile>> = {
  low: {
    maxPixelRatio: 1,
    antialias: false,
    shadows: false,
    shadowMapSize: 512,
    treeFraction: 0.55,
    treeLodDistance: 110,
    rainDrops: 2500,
    particleBudget: 250,
    bloom: false,
    mist: false,
    headlights: false,
    drawDistance: 1600,
  },
  medium: {
    maxPixelRatio: 1.5,
    antialias: true,
    shadows: true,
    shadowMapSize: 1024,
    treeFraction: 0.85,
    treeLodDistance: 170,
    rainDrops: 6000,
    particleBudget: 500,
    bloom: false,
    mist: true,
    headlights: true,
    drawDistance: 2200,
  },
  high: {
    maxPixelRatio: 2,
    antialias: true,
    shadows: true,
    shadowMapSize: 2048,
    treeFraction: 1,
    treeLodDistance: 240,
    rainDrops: 11000,
    particleBudget: 900,
    bloom: true,
    mist: true,
    headlights: true,
    drawDistance: 3000,
  },
};
