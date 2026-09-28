import { z } from 'zod';

/** XZ ground-plane coordinate in metres. +X = east, +Z = south (so north is -Z). */
export const vec2Schema = z.tuple([z.number(), z.number()]);
export type Vec2 = z.infer<typeof vec2Schema>;

const terrainFeatureSchema = z.discriminatedUnion('kind', [
  /** Smooth hill or depression. */
  z.object({
    kind: z.literal('bump'),
    id: z.string(),
    center: vec2Schema,
    radius: z.number().positive(),
    height: z.number(),
    /** Exponent on the falloff; higher = steeper flanks. */
    sharpness: z.number().positive().default(1),
  }),
  /** Flattens terrain to a fixed height inside a radius, blending out over `blend` metres. */
  z.object({
    kind: z.literal('plateau'),
    id: z.string(),
    center: vec2Schema,
    radius: z.number().positive(),
    blend: z.number().positive(),
    /** Absolute height; when omitted, the natural terrain height at the centre is used. */
    height: z.number().optional(),
  }),
  /** A steep escarpment rising along a line, e.g. a cliff face. */
  z.object({
    kind: z.literal('cliff'),
    id: z.string(),
    from: vec2Schema,
    to: vec2Schema,
    /** Horizontal distance over which the cliff rises. */
    width: z.number().positive(),
    height: z.number(),
    /** Metres beyond the segment ends over which the cliff fades out. */
    taper: z.number().positive(),
  }),
]);
export type TerrainFeature = z.infer<typeof terrainFeatureSchema>;

const pathSchema = z.object({
  id: z.string(),
  points: z.array(vec2Schema).min(2),
  halfWidth: z.number().positive(),
  /** Blend distance either side of the flattened corridor. */
  shoulder: z.number().min(0),
  /** Normalised [from, to] ranges along the path where the surface is broken. */
  damagedSections: z.array(z.tuple([z.number(), z.number()])).default([]),
});
export type PathDefinition = z.infer<typeof pathSchema>;

const regionSchema = z.object({
  id: z.string(),
  kind: z.enum(['forest', 'landslide', 'clearing', 'mud', 'rocky', 'burnt']),
  center: vec2Schema,
  radius: vec2Schema,
  rotationDeg: z.number().default(0),
  /** Kind-specific intensity, 0..1 (e.g. tree density). */
  density: z.number().min(0).max(1).default(1),
});
export type RegionDefinition = z.infer<typeof regionSchema>;

const structureSchema = z.object({
  id: z.string(),
  kind: z.enum([
    'cabin',
    'bridge',
    'helipad',
    'tent',
    'antenna',
    'container',
    'floodlight',
    'carWreck',
    'rockShelter',
    'chargingPad',
    'landingZone',
    'fallenLogs',
    'debrisPile',
    'looseDebris',
    'windsock',
    'house',
    'collapsedHouse',
    'flag',
  ]),
  position: vec2Schema,
  rotationDeg: z.number().default(0),
  scale: z.number().positive().default(1),
  /** Optional vertical offset from the terrain surface. */
  elevation: z.number().default(0),
  /** Structure-specific numeric parameters (e.g. bridge span). */
  params: z.record(z.string(), z.number()).default({}),
});
export type StructureDefinition = z.infer<typeof structureSchema>;

export const environmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  regionName: z.string(),
  seed: z.number().int(),
  size: z.number().positive(),
  resolution: z.number().int().min(16).max(512),
  geo: z.object({ latitude: z.number(), longitude: z.number() }),
  terrain: z.object({
    baseHeight: z.number(),
    hillAmplitude: z.number(),
    hillScale: z.number().positive(),
    detailAmplitude: z.number(),
    mountainHeight: z.number(),
    mountainInner: z.number(),
    mountainOuter: z.number(),
    rockSlopeDeg: z.number(),
    treeline: z.number(),
    /** Strength of the eroded ridges and gullies carved into raised ground (0 = smooth). */
    erosion: z.number().min(0).default(1),
    features: z.array(terrainFeatureSchema),
  }),
  river: z.object({
    points: z.array(vec2Schema).min(2),
    halfWidth: z.number().positive(),
    depth: z.number().positive(),
    valleyWidth: z.number().positive(),
    /** Water surface height at the first and last point. */
    levelStart: z.number(),
    levelEnd: z.number(),
    /** Metres of muddy bank on either side of the water. */
    mudBank: z.number().min(0),
  }),
  roads: z.array(pathSchema),
  trails: z.array(pathSchema),
  regions: z.array(regionSchema),
  structures: z.array(structureSchema),
  /** Flood water: a flat lake surface covering all ground below `level`. */
  flood: z.object({ level: z.number() }).optional(),
  relay: z.object({ position: vec2Schema, mastHeight: z.number(), range: z.number().positive() }),
  bounds: z.object({ soft: z.number(), hard: z.number(), ceiling: z.number() }),
  vegetation: z.object({
    treeSpacing: z.number().positive(),
    scatterTreeChance: z.number().min(0).max(1),
    rockDensity: z.number().min(0),
  }),
  lighting: z.object({
    sunDirection: z.tuple([z.number(), z.number(), z.number()]),
    sunColor: z.string(),
    sunIntensity: z.number(),
    skyColor: z.string(),
    groundColor: z.string(),
    hemiIntensity: z.number(),
    fogColor: z.string(),
    /** Strength of image-based lighting from the sky HDRI. */
    environmentIntensity: z.number().min(0).default(1),
    /** Brightness of the visible HDRI sky. */
    skyIntensity: z.number().min(0).default(1),
    /** Night-time: vehicle and base lights switch on regardless of graphics preset. */
    night: z.boolean().default(false),
  }),
});

export type EnvironmentDefinition = z.infer<typeof environmentSchema>;
export type EnvironmentInput = z.input<typeof environmentSchema>;
