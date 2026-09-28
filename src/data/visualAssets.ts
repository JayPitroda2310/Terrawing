import { SurfaceId } from '@/data/surfaces/surfaces';

/**
 * Photographic assets (all CC0, from Poly Haven). Paths are relative to /public.
 * Swap any entry to change the look without touching rendering code.
 */
const TEX = '/assets/textures';

export interface TerrainLayer {
  id: string;
  diffuse: string;
  normal: string;
  /** Metres covered by one texture repeat. */
  scale: number;
  roughness: number;
  /** Normal-map strength. */
  normalStrength: number;
  /** Colour multiplier applied to the photo (grade the look without new textures). */
  tint: readonly [number, number, number];
}

/** Terrain texture layers, in texture-array order. */
export const TERRAIN_LAYERS: readonly TerrainLayer[] = [
  {
    id: 'grass',
    diffuse: `${TEX}/grass_diff.jpg`,
    normal: `${TEX}/grass_nor.jpg`,
    scale: 7,
    roughness: 0.95,
    normalStrength: 0.8,
    tint: [0.95, 1.0, 0.9],
  },
  {
    id: 'forest',
    diffuse: `${TEX}/forest_diff.jpg`,
    normal: `${TEX}/forest_nor.jpg`,
    scale: 4,
    roughness: 0.92,
    normalStrength: 0.9,
    tint: [0.9, 0.9, 0.85],
  },
  {
    // Aerial photo of weathered alpine rock with grass between the blocks.
    id: 'rock',
    diffuse: `${TEX}/rock_diff.jpg`,
    normal: `${TEX}/rock_nor.jpg`,
    scale: 16,
    roughness: 0.8,
    normalStrength: 1.3,
    tint: [0.9, 0.88, 0.86],
  },
  {
    id: 'mud',
    diffuse: `${TEX}/mud_diff.jpg`,
    normal: `${TEX}/mud_nor.jpg`,
    scale: 4,
    roughness: 0.45,
    normalStrength: 0.9,
    tint: [0.85, 0.82, 0.8],
  },
  {
    id: 'gravel',
    diffuse: `${TEX}/gravel_diff.jpg`,
    normal: `${TEX}/gravel_nor.jpg`,
    scale: 4,
    roughness: 0.85,
    normalStrength: 1.2,
    tint: [0.95, 0.95, 0.95],
  },
  {
    id: 'trail',
    diffuse: `${TEX}/trail_diff.jpg`,
    normal: `${TEX}/trail_nor.jpg`,
    scale: 4,
    roughness: 0.85,
    normalStrength: 1,
    tint: [0.9, 0.88, 0.85],
  },
  {
    // Alpine meadow above the treeline: short grass with gravel and stones showing through.
    id: 'alpine',
    diffuse: `${TEX}/alpine_diff.jpg`,
    normal: `${TEX}/alpine_nor.jpg`,
    scale: 9,
    roughness: 0.9,
    normalStrength: 1,
    tint: [0.92, 0.9, 0.84],
  },
  {
    id: 'snow',
    diffuse: `${TEX}/snow_diff.jpg`,
    normal: `${TEX}/snow_nor.jpg`,
    scale: 6,
    roughness: 0.6,
    normalStrength: 0.8,
    tint: [1, 1, 1],
  },
];

export const TERRAIN_LAYER = {
  GRASS: 0,
  FOREST: 1,
  ROCK: 2,
  MUD: 3,
  GRAVEL: 4,
  TRAIL: 5,
  ALPINE: 6,
  SNOW: 7,
} as const;

/** Which texture layer each gameplay surface is painted with. */
export const SURFACE_LAYER: Readonly<Record<SurfaceId, number>> = {
  [SurfaceId.GRASS]: TERRAIN_LAYER.GRASS,
  [SurfaceId.FOREST_FLOOR]: TERRAIN_LAYER.FOREST,
  [SurfaceId.ROCK]: TERRAIN_LAYER.ROCK,
  [SurfaceId.MUD]: TERRAIN_LAYER.MUD,
  [SurfaceId.GRAVEL]: TERRAIN_LAYER.GRAVEL,
  [SurfaceId.ROAD]: TERRAIN_LAYER.GRAVEL,
  [SurfaceId.TRAIL]: TERRAIN_LAYER.TRAIL,
  [SurfaceId.WATER]: TERRAIN_LAYER.MUD,
  // Pads are covered by their concrete slab; the ground beneath is plain gravel.
  [SurfaceId.PAD]: TERRAIN_LAYER.GRAVEL,
};

export const ROAD_TEXTURES = {
  diffuse: `${TEX}/asphalt_diff.jpg`,
  normal: `${TEX}/asphalt_nor.jpg`,
  scale: 4,
};
export const PAD_TEXTURES = { diffuse: `${TEX}/pad_diff.jpg`, normal: `${TEX}/pad_nor.jpg` };
export const BARK_TEXTURES = { diffuse: `${TEX}/bark_diff.jpg`, normal: `${TEX}/bark_nor.jpg` };

/** Overcast sky used for the backdrop and image-based lighting. */
export const SKY_HDRI = {
  low: '/assets/hdri/overcast_puresky_1k.hdr',
  high: '/assets/hdri/overcast_puresky_2k.hdr',
};

/** Photo-scanned boulders, simplified to ~1k triangles each. */
export const BOULDER_MODELS = [
  '/assets/models/boulder_a.glb',
  '/assets/models/boulder_b.glb',
  '/assets/models/boulder_c.glb',
] as const;

/** Rigged, photo-textured human avatar used for survivors (posed procedurally). */
export const SURVIVOR_MODEL = '/assets/models/survivor.glb';

/** Detailed car model, repainted and weathered at runtime as the abandoned wreck. */
export const CAR_WRECK_MODEL = '/assets/models/car_wreck.glb';

/** Photo textures for buildings and props (projected in world space). */
export const STRUCTURE_TEXTURES = {
  planks: { diffuse: `${TEX}/planks_diff.jpg`, normal: `${TEX}/planks_nor.jpg` },
  roofIron: { diffuse: `${TEX}/roof_iron_diff.jpg`, normal: `${TEX}/roof_iron_nor.jpg` },
  stoneWall: { diffuse: `${TEX}/stone_wall_diff.jpg`, normal: `${TEX}/stone_wall_nor.jpg` },
  canvas: { diffuse: `${TEX}/canvas_diff.jpg`, normal: `${TEX}/canvas_nor.jpg` },
  containerIron: {
    diffuse: `${TEX}/container_iron_diff.jpg`,
    normal: `${TEX}/container_iron_nor.jpg`,
  },
  concrete: { diffuse: `${TEX}/pad_diff.jpg`, normal: `${TEX}/pad_nor.jpg` },
  bark: { diffuse: `${TEX}/bark_diff.jpg`, normal: `${TEX}/bark_nor.jpg` },
  fleece: { diffuse: `${TEX}/fleece_diff.jpg`, normal: `${TEX}/fleece_nor.jpg` },
  plaster: { diffuse: `${TEX}/plaster_diff.jpg`, normal: `${TEX}/plaster_nor.jpg` },
  brick: { diffuse: `${TEX}/brick_diff.jpg`, normal: `${TEX}/brick_nor.jpg` },
  roofClay: { diffuse: `${TEX}/roof_clay_diff.jpg`, normal: `${TEX}/roof_clay_nor.jpg` },
  roofSlate: { diffuse: `${TEX}/roof_slate_diff.jpg`, normal: `${TEX}/roof_slate_nor.jpg` },
  weatheredPlanks: {
    diffuse: `${TEX}/weathered_planks_diff.jpg`,
    normal: `${TEX}/weathered_planks_nor.jpg`,
  },
} as const;
