import { environmentSchema, type EnvironmentInput } from './environmentSchema';

/**
 * Mission 05 environment — an alpine valley at night, lit only by the moon.
 *
 * Layout (north is -Z):
 *   SE  — rescue base and extraction LZ
 *   C   — valley road with a stranded car
 *   NE  — high ridge with a saddle where a hiker is lost
 *   NW  — cliff band with a climber at its foot; a shepherd's hut nearby
 *   W   — river
 */
const nightRidge: EnvironmentInput = {
  id: 'night-ridge',
  name: 'Night Rescue',
  regionName: 'Northern Alps',
  seed: 9021,
  size: 1000,
  resolution: 256,
  geo: { latitude: 46.5586, longitude: 7.9786 },
  terrain: {
    baseHeight: 24,
    hillAmplitude: 15,
    hillScale: 250,
    detailAmplitude: 2.3,
    mountainHeight: 200,
    mountainInner: 290,
    mountainOuter: 520,
    rockSlopeDeg: 34,
    treeline: 120,
    features: [
      {
        kind: 'bump',
        id: 'ridge',
        center: [110, -90],
        radius: 130,
        height: 70,
        sharpness: 1.3,
      },
      {
        kind: 'cliff',
        id: 'north-cliff',
        from: [-120, -230],
        to: [60, -250],
        width: 22,
        height: 55,
        taper: 50,
      },
      { kind: 'plateau', id: 'base', center: [315, 295], radius: 78, blend: 60, height: 18 },
      { kind: 'plateau', id: 'saddle', center: [150, -40], radius: 15, blend: 22 },
      { kind: 'plateau', id: 'cliff-foot', center: [-30, -195], radius: 16, blend: 20 },
      { kind: 'plateau', id: 'hut', center: [-70, -130], radius: 16, blend: 20 },
      { kind: 'plateau', id: 'car-verge', center: [38, 106], radius: 9, blend: 12 },
    ],
  },
  river: {
    points: [
      [-150, -540],
      [-200, -300],
      [-170, -100],
      [-210, 80],
      [-160, 280],
      [-190, 540],
    ],
    halfWidth: 9,
    depth: 3,
    valleyWidth: 60,
    levelStart: 30,
    levelEnd: 10,
    mudBank: 5,
  },
  roads: [
    {
      id: 'valley-road',
      points: [
        [300, 285],
        [240, 230],
        [170, 175],
        [100, 140],
        [40, 105],
        [-20, 60],
        [-50, 0],
        [-62, -60],
      ],
      halfWidth: 4,
      shoulder: 6,
      damagedSections: [],
    },
  ],
  trails: [
    {
      id: 'hut-track',
      points: [
        [-62, -60],
        [-66, -100],
        [-70, -125],
      ],
      halfWidth: 2.5,
      shoulder: 3,
      damagedSections: [],
    },
    {
      id: 'cliff-path',
      points: [
        [-70, -135],
        [-50, -165],
        [-32, -188],
      ],
      halfWidth: 2.3,
      shoulder: 2,
      damagedSections: [],
    },
  ],
  regions: [
    { id: 'west-forest', kind: 'forest', center: [-60, 80], radius: [130, 150], density: 0.85 },
    { id: 'south-forest', kind: 'forest', center: [100, 320], radius: [160, 90], density: 0.6 },
    { id: 'north-forest', kind: 'forest', center: [-120, -170], radius: [110, 70], density: 0.7 },
    { id: 'base-clearing', kind: 'clearing', center: [315, 295], radius: [85, 85] },
    { id: 'saddle', kind: 'clearing', center: [150, -40], radius: [20, 20] },
    { id: 'cliff-foot', kind: 'clearing', center: [-30, -195], radius: [20, 20] },
    { id: 'hut', kind: 'clearing', center: [-70, -130], radius: [22, 22] },
    { id: 'car-verge', kind: 'clearing', center: [40, 105], radius: [16, 16] },
    { id: 'cliff-scree', kind: 'rocky', center: [-30, -215], radius: [70, 30], density: 0.8 },
  ],
  structures: [
    { id: 'base-flag', kind: 'flag', position: [316, 287] },
    { id: 'base-helipad', kind: 'helipad', position: [330, 305] },
    { id: 'tent-command', kind: 'tent', position: [354, 322], rotationDeg: -15, scale: 1.2 },
    { id: 'tent-medical', kind: 'tent', position: [364, 298], rotationDeg: -5 },
    { id: 'tent-supply', kind: 'tent', position: [300, 334], rotationDeg: 10 },
    { id: 'base-container', kind: 'container', position: [342, 270], rotationDeg: -80 },
    { id: 'relay-mast', kind: 'antenna', position: [356, 282], params: { height: 30 } },
    { id: 'flood-1', kind: 'floodlight', position: [312, 326], rotationDeg: 160 },
    { id: 'flood-2', kind: 'floodlight', position: [346, 285], rotationDeg: -40 },
    { id: 'flood-3', kind: 'floodlight', position: [275, 250], rotationDeg: 220 },
    { id: 'extraction-lz', kind: 'landingZone', position: [253, 272] },
    { id: 'lz-windsock', kind: 'windsock', position: [239, 260] },
    { id: 'stranded-car', kind: 'carWreck', position: [46, 100], rotationDeg: -55 },
    { id: 'shepherd-hut', kind: 'cabin', position: [-72, -134], rotationDeg: 15 },
    { id: 'road-logs', kind: 'fallenLogs', position: [-38, 30], rotationDeg: 25, scale: 0.8 },
  ],
  relay: { position: [356, 282], mastHeight: 30, range: 950 },
  bounds: { soft: 440, hard: 485, ceiling: 330 },
  vegetation: { treeSpacing: 9, scatterTreeChance: 0.06, rockDensity: 1 },
  lighting: {
    sunDirection: [0.35, 0.6, -0.5],
    sunColor: '#8fa6d8',
    sunIntensity: 0.22,
    skyColor: '#1c2638',
    groundColor: '#07080b',
    hemiIntensity: 0.14,
    fogColor: '#0c111a',
    environmentIntensity: 0.07,
    skyIntensity: 0.035,
    night: true,
  },
};

export const NIGHT_RIDGE = environmentSchema.parse(nightRidge);
