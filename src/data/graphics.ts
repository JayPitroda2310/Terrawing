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
  /** Trees cast shadows (expensive: alpha-tested foliage in the shadow pass). */
  treeShadows: boolean;
  rainDrops: number;
  particleBudget: number;
  bloom: boolean;
  mist: boolean;
  headlights: boolean;
  /** Far plane of the camera. */
  drawDistance: number;
  /** Resolution of terrain texture layers. */
  terrainTextureSize: number;
  /** Use the higher-resolution sky HDRI. */
  hdrSky: 'low' | 'high';
  /** Grass clumps kept around the camera (0 disables grass). */
  grassCount: number;
  /** Radius (m) of the grass patch around the camera. */
  grassRadius: number;
}

export const GRAPHICS_PROFILES: Readonly<Record<GraphicsQuality, GraphicsProfile>> = {
  low: {
    maxPixelRatio: 1,
    antialias: false,
    shadows: false,
    shadowMapSize: 512,
    treeFraction: 0.55,
    treeLodDistance: 45,
    treeShadows: false,
    rainDrops: 2500,
    particleBudget: 250,
    bloom: false,
    mist: false,
    headlights: false,
    drawDistance: 1600,
    terrainTextureSize: 512,
    hdrSky: 'low',
    grassCount: 1600,
    grassRadius: 18,
  },
  medium: {
    maxPixelRatio: 1.5,
    antialias: true,
    shadows: true,
    shadowMapSize: 1024,
    treeFraction: 0.85,
    treeLodDistance: 100,
    treeShadows: false,
    rainDrops: 6000,
    particleBudget: 500,
    bloom: false,
    mist: true,
    headlights: true,
    drawDistance: 2200,
    terrainTextureSize: 1024,
    hdrSky: 'high',
    grassCount: 3500,
    grassRadius: 30,
  },
  high: {
    maxPixelRatio: 2,
    antialias: true,
    shadows: true,
    shadowMapSize: 2048,
    treeFraction: 1,
    treeLodDistance: 150,
    treeShadows: true,
    rainDrops: 11000,
    particleBudget: 900,
    bloom: true,
    mist: true,
    headlights: true,
    drawDistance: 3000,
    terrainTextureSize: 1024,
    hdrSky: 'high',
    grassCount: 7000,
    grassRadius: 40,
  },
};
