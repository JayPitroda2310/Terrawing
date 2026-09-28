import { environmentSchema, type EnvironmentInput } from './environmentSchema';

/**
 * Mission 03 environment — a pine forest valley with a wildfire burning through its centre.
 *
 * Layout (north is -Z):
 *   SW  — rescue base and extraction LZ
 *   C   — burn scar: charred trunks and ash, still smouldering
 *   E/N — the active fire front
 *   W   — campsite in the forest
 *   NE  — fire lookout on a rocky knoll
 */
const forestFire: EnvironmentInput = {
  id: 'forest-fire',
  name: 'Forest Fire',
  regionName: 'Eastern Pine Forest',
  seed: 5183,
  size: 1000,
  resolution: 256,
  geo: { latitude: 38.4127, longitude: -120.3316 },
  terrain: {
    baseHeight: 30,
    hillAmplitude: 20,
    hillScale: 240,
    detailAmplitude: 2.2,
    mountainHeight: 170,
    mountainInner: 310,
    mountainOuter: 530,
    rockSlopeDeg: 36,
    treeline: 160,
    features: [
      {
        kind: 'bump',
        id: 'lookout-knoll',
        center: [165, -190],
        radius: 70,
        height: 38,
        sharpness: 1.3,
      },
      { kind: 'bump', id: 'west-hill', center: [-250, -60], radius: 100, height: 22 },
      { kind: 'plateau', id: 'base', center: [-315, 295], radius: 78, blend: 60, height: 26 },
      { kind: 'plateau', id: 'campsite', center: [-180, -120], radius: 22, blend: 24 },
      { kind: 'plateau', id: 'lookout', center: [165, -190], radius: 14, blend: 18 },
      { kind: 'plateau', id: 'scar-landing', center: [20, 40], radius: 18, blend: 22 },
    ],
  },
  river: {
    points: [
      [540, -200],
      [380, -120],
      [300, 40],
      [330, 200],
      [420, 340],
      [540, 420],
    ],
    halfWidth: 6,
    depth: 1.8,
    valleyWidth: 40,
    levelStart: 40,
    levelEnd: 22,
    mudBank: 3,
  },
  roads: [
    {
      id: 'forest-road',
      points: [
        [-300, 285],
        [-230, 215],
        [-160, 140],
        [-90, 80],
        [-20, 45],
        [50, 20],
        [110, -30],
        [135, -90],
      ],
      halfWidth: 4,
      shoulder: 6,
      damagedSections: [],
    },
  ],
  trails: [
    {
      id: 'camp-trail',
      points: [
        [-160, 140],
        [-168, 40],
        [-176, -50],
        [-180, -108],
      ],
      halfWidth: 2.6,
      shoulder: 3,
      damagedSections: [],
    },
  ],
  regions: [
    { id: 'west-forest', kind: 'forest', center: [-220, -80], radius: [210, 190], density: 1 },
    { id: 'south-forest', kind: 'forest', center: [20, 320], radius: [260, 120], density: 0.8 },
    { id: 'north-forest', kind: 'forest', center: [60, -270], radius: [240, 110], density: 0.9 },
    { id: 'east-forest', kind: 'forest', center: [260, 60], radius: [120, 170], density: 0.85 },
    { id: 'burn-scar', kind: 'burnt', center: [40, -10], radius: [150, 120], rotationDeg: -15 },
    { id: 'base-clearing', kind: 'clearing', center: [-315, 295], radius: [85, 85] },
    { id: 'campsite', kind: 'clearing', center: [-180, -120], radius: [26, 26] },
    { id: 'lookout', kind: 'clearing', center: [165, -190], radius: [22, 22] },
    { id: 'lookout-rocks', kind: 'rocky', center: [165, -190], radius: [40, 40], density: 0.6 },
    { id: 'scar-landing', kind: 'clearing', center: [20, 40], radius: [20, 20] },
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
    { id: 'extraction-lz', kind: 'landingZone', position: [-254, 270] },
    { id: 'lz-windsock', kind: 'windsock', position: [-240, 258] },
    {
      id: 'camp-tent-1',
      kind: 'tent',
      position: [-168, -130],
      rotationDeg: 30,
      params: { style: 1 },
    },
    {
      id: 'camp-tent-2',
      kind: 'tent',
      position: [-192, -112],
      rotationDeg: -20,
      params: { style: 1 },
    },
    { id: 'burnt-truck', kind: 'carWreck', position: [30, 26], rotationDeg: 110 },
    { id: 'scar-logs', kind: 'fallenLogs', position: [-40, 55], rotationDeg: 65 },
    { id: 'scar-logs-2', kind: 'fallenLogs', position: [85, 0], rotationDeg: 10, scale: 0.8 },
    { id: 'lookout-mast', kind: 'antenna', position: [176, -184], params: { height: 16 } },
    {
      id: 'loose-road',
      kind: 'looseDebris',
      position: [-60, 64],
      params: { count: 6, radius: 5 },
    },
  ],
  relay: { position: [-356, 282], mastHeight: 30, range: 950 },
  bounds: { soft: 440, hard: 485, ceiling: 330 },
  vegetation: { treeSpacing: 8.5, scatterTreeChance: 0.08, rockDensity: 0.8 },
  lighting: {
    sunDirection: [-0.55, 0.5, 0.3],
    sunColor: '#ffb277',
    sunIntensity: 1.5,
    skyColor: '#c6a07c',
    groundColor: '#2b2218',
    hemiIntensity: 0.3,
    fogColor: '#9a7f66',
    environmentIntensity: 0.65,
    skyIntensity: 0.7,
  },
};

export const FOREST_FIRE = environmentSchema.parse(forestFire);
