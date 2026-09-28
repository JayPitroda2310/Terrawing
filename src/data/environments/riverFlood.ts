import { environmentSchema, type EnvironmentInput } from './environmentSchema';

/** Flat roof top of a `house` structure, used to place rooftop survivors. */
export const HOUSE_ROOF_HEIGHT = 6.24;

/**
 * Mission 02 environment — a lowland valley after the river burst its banks.
 *
 * Layout (north is -Z):
 *   SW  — rescue base and extraction LZ on high ground
 *   C   — flooded village; water ~3.5 m deep, only roofs stay dry
 *   NW  — hill farm, cut off as an island
 *   E   — main river channel with a strong current
 */
const riverFlood: EnvironmentInput = {
  id: 'river-flood',
  name: 'Flood Response',
  regionName: 'Lower Valley Floodplain',
  seed: 2611,
  size: 1000,
  resolution: 256,
  geo: { latitude: 47.2291, longitude: 8.9142 },
  terrain: {
    baseHeight: 12,
    hillAmplitude: 7,
    hillScale: 220,
    detailAmplitude: 1.1,
    mountainHeight: 140,
    mountainInner: 320,
    mountainOuter: 540,
    rockSlopeDeg: 38,
    treeline: 140,
    features: [
      { kind: 'bump', id: 'farm-hill', center: [-205, -120], radius: 70, height: 16 },
      { kind: 'bump', id: 'east-rise', center: [300, -40], radius: 110, height: 22 },
      { kind: 'bump', id: 'south-ridge', center: [60, 330], radius: 120, height: 26 },
      { kind: 'plateau', id: 'base', center: [-315, 295], radius: 85, blend: 60, height: 22 },
      { kind: 'plateau', id: 'village', center: [-60, 60], radius: 80, blend: 45, height: 8.5 },
      { kind: 'plateau', id: 'farm-yard', center: [-205, -120], radius: 20, blend: 22 },
    ],
  },
  river: {
    points: [
      [150, -540],
      [170, -300],
      [130, -100],
      [160, 100],
      [120, 300],
      [150, 540],
    ],
    halfWidth: 20,
    depth: 3,
    valleyWidth: 80,
    levelStart: 11,
    levelEnd: 7,
    mudBank: 6,
  },
  flood: { level: 12 },
  roads: [
    {
      id: 'village-road',
      points: [
        [-300, 285],
        [-250, 235],
        [-195, 185],
        [-150, 140],
        [-118, 108],
      ],
      halfWidth: 4,
      shoulder: 7,
      damagedSections: [],
    },
  ],
  trails: [
    {
      id: 'farm-track',
      points: [
        [-205, -120],
        [-190, -70],
        [-170, -20],
      ],
      halfWidth: 2.4,
      shoulder: 3,
      damagedSections: [],
    },
  ],
  regions: [
    { id: 'west-woods', kind: 'forest', center: [-330, -60], radius: [120, 200], density: 0.8 },
    { id: 'south-woods', kind: 'forest', center: [80, 330], radius: [170, 90], density: 0.6 },
    { id: 'east-woods', kind: 'forest', center: [310, -60], radius: [110, 140], density: 0.7 },
    { id: 'base-clearing', kind: 'clearing', center: [-315, 295], radius: [90, 90] },
    { id: 'village', kind: 'clearing', center: [-60, 60], radius: [75, 75] },
    { id: 'farm-yard', kind: 'clearing', center: [-205, -120], radius: [26, 26] },
    { id: 'silt', kind: 'mud', center: [-150, 150], radius: [40, 30], rotationDeg: 40 },
  ],
  structures: [
    { id: 'base-flag', kind: 'flag', position: [-316, 287] },
    { id: 'base-helipad', kind: 'helipad', position: [-330, 305] },
    { id: 'tent-command', kind: 'tent', position: [-354, 322], rotationDeg: 15, scale: 1.2 },
    { id: 'tent-medical', kind: 'tent', position: [-364, 298], rotationDeg: 5 },
    { id: 'tent-supply', kind: 'tent', position: [-300, 334], rotationDeg: -10 },
    { id: 'base-container', kind: 'container', position: [-342, 270], rotationDeg: 80 },
    { id: 'relay-mast', kind: 'antenna', position: [-356, 282], params: { height: 30 } },
    { id: 'flood-1', kind: 'floodlight', position: [-312, 326], rotationDeg: 200 },
    { id: 'flood-2', kind: 'floodlight', position: [-346, 285], rotationDeg: 40 },
    { id: 'extraction-lz', kind: 'landingZone', position: [-286, 239] },
    { id: 'lz-windsock', kind: 'windsock', position: [-273, 229] },
    { id: 'house-1', kind: 'house', position: [-95, 35] },
    { id: 'house-2', kind: 'house', position: [-75, 32], params: { flatRoof: 1 } },
    { id: 'house-3', kind: 'house', position: [-52, 30], params: { flatRoof: 1 } },
    { id: 'house-4', kind: 'house', position: [-30, 38], rotationDeg: 8 },
    { id: 'house-5', kind: 'house', position: [-92, 70], rotationDeg: 180 },
    {
      id: 'house-6',
      kind: 'house',
      position: [-66, 78],
      rotationDeg: 180,
      params: { flatRoof: 1 },
    },
    { id: 'house-7', kind: 'house', position: [-40, 75], rotationDeg: 172 },
    {
      id: 'house-8',
      kind: 'house',
      position: [-18, 92],
      rotationDeg: 180,
      params: { flatRoof: 1 },
    },
    { id: 'farmhouse', kind: 'house', position: [-212, -130], rotationDeg: 20 },
    { id: 'farm-logs', kind: 'fallenLogs', position: [-188, -80], rotationDeg: 70, scale: 0.7 },
  ],
  relay: { position: [-356, 282], mastHeight: 30, range: 950 },
  bounds: { soft: 440, hard: 485, ceiling: 330 },
  vegetation: { treeSpacing: 9, scatterTreeChance: 0.06, rockDensity: 0.4 },
  lighting: {
    sunDirection: [-0.4, 0.7, 0.45],
    sunColor: '#d6dde2',
    sunIntensity: 0.9,
    skyColor: '#98a6b0',
    groundColor: '#26241f',
    hemiIntensity: 0.28,
    fogColor: '#7f8a90',
    environmentIntensity: 0.8,
    skyIntensity: 0.8,
  },
};

export const RIVER_FLOOD = environmentSchema.parse(riverFlood);
