import type {
  EnvironmentDefinition,
  PathDefinition,
  RegionDefinition,
  TerrainFeature,
} from '@/data/environments/environmentSchema';
import { SurfaceId } from '@/data/surfaces/surfaces';
import { createNoise2D, fbm, ridged, type Noise2D } from '@/utils/math/noise';
import {
  createPolyline,
  createProjection,
  projectOnPolyline,
  samplePolyline,
  smoothPolyline,
  type Polyline,
} from '@/utils/math/polyline';
import { DEG2RAD, lerp, smoothstep } from '@/utils/math/scalar';
import type { GeneratedPath, GeneratedRiver, TerrainData } from './TerrainData';
import { riverLevelAt, sampleGridHeight, sampleProfile } from './terrainMath';

const PATH_SMOOTHING = 6;
const PROFILE_SPACING = 3;
const PROFILE_SMOOTH_RADIUS = 9;
const RIVER_BANK_HEIGHT = 1.3;
const RIVER_VALLEY_SLOPE = 0.06;
const ROAD_RIVER_CLEARANCE = 4;
const ROAD_RIVER_BLEND = 12;
const EDGE_NOISE_SCALE = 180;
const EDGE_NOISE_AMPLITUDE = 45;
/** Road corridors are carved this far below the asphalt profile (the asphalt has its own collider). */
const ROADBED_DEPTH = 0.02;
/** Length (m) of the gravel/dirt run-out beyond a road's end. */
const ROAD_RUNOUT = 14;
const PAD_RADIUS = 11;
/** Extra level ground around a pad so its edge never overhangs a slope. */
const PAD_LEVEL_MARGIN = 3;
/** Distance over which the levelled pad blends back into the natural terrain. */
const PAD_BLEND = 10;

const WARP_SCALE = 260;
const WARP_AMPLITUDE = 60;
/** Relief (m above base height) where erosion starts and reaches full strength. */
const EROSION_START = 4;
const EROSION_FULL = 40;
const EROSION_SCALE = 85;
/** Gully depth as a fraction of relief, capped. */
const EROSION_DEPTH = 0.16;
const EROSION_MAX = 16;

/** Natural terrain before any man-made or hydrological shaping. */
class NaturalTerrain {
  private readonly hills: Noise2D;
  private readonly detail: Noise2D;
  private readonly peaks: Noise2D;
  private readonly warp: Noise2D;
  private readonly erosion: Noise2D;

  constructor(private readonly env: EnvironmentDefinition) {
    this.hills = createNoise2D(env.seed);
    this.detail = createNoise2D(env.seed + 101);
    this.peaks = createNoise2D(env.seed + 202);
    this.warp = createNoise2D(env.seed + 707);
    this.erosion = createNoise2D(env.seed + 808);
  }

  height(x: number, z: number): number {
    const t = this.env.terrain;
    // Domain warp: hills and valleys meander instead of forming round blobs.
    const wx = x + WARP_AMPLITUDE * fbm(this.warp, x / WARP_SCALE, z / WARP_SCALE, 2);
    const wz = z + WARP_AMPLITUDE * fbm(this.warp, x / WARP_SCALE + 31, z / WARP_SCALE - 17, 2);
    let h = t.baseHeight;
    h += t.hillAmplitude * fbm(this.hills, wx / t.hillScale, wz / t.hillScale, 4);
    h += t.detailAmplitude * fbm(this.detail, x / 38, z / 38, 3);

    // Surrounding mountain ring — a rounded square so the valley reads as a basin.
    const radial = Math.pow(Math.pow(Math.abs(x), 4) + Math.pow(Math.abs(z), 4), 0.25);
    const jitter =
      EDGE_NOISE_AMPLITUDE * this.hills(x / EDGE_NOISE_SCALE + 17, z / EDGE_NOISE_SCALE - 9);
    const ring = smoothstep(t.mountainInner, t.mountainOuter, radial + jitter);
    if (ring > 0) {
      const crest = 0.5 + 0.5 * ridged(this.peaks, wx / 210, wz / 210, 4);
      h += ring * ring * t.mountainHeight * crest;
    }

    for (const feature of t.features) h += this.featureContribution(feature, x, z);

    // Erosion: raised ground is carved into spurs and gullies, deeper the higher it stands, so
    // slopes read as weathered rather than smooth domes. Low valley floors are left alone.
    const relief = h - t.baseHeight;
    if (relief > EROSION_START) {
      const mask = smoothstep(EROSION_START, EROSION_FULL, relief);
      const ridges = ridged(this.erosion, wx / EROSION_SCALE, wz / EROSION_SCALE, 4);
      const depth = Math.min(relief * EROSION_DEPTH, EROSION_MAX);
      h += (ridges - 0.45) * depth * mask * t.erosion;
    }
    return h;
  }

  private featureContribution(feature: TerrainFeature, x: number, z: number): number {
    switch (feature.kind) {
      case 'bump': {
        const d = Math.hypot(x - feature.center[0], z - feature.center[1]);
        if (d >= feature.radius) return 0;
        const falloff = 0.5 + 0.5 * Math.cos((Math.PI * d) / feature.radius);
        const roughness = 1 + 0.18 * this.detail(x / 30, z / 30);
        return feature.height * Math.pow(falloff, feature.sharpness) * roughness;
      }
      case 'cliff': {
        const [ax, az] = feature.from;
        const [bx, bz] = feature.to;
        const dx = bx - ax;
        const dz = bz - az;
        const length = Math.hypot(dx, dz);
        const ux = dx / length;
        const uz = dz / length;
        const along = (x - ax) * ux + (z - az) * uz;
        // Right-hand normal: the cliff rises on this side.
        const across = (x - ax) * -uz + (z - az) * ux;
        const overshoot = Math.max(-along, along - length, 0);
        const fade = 1 - smoothstep(0, feature.taper, overshoot);
        const edge = feature.width * (1 + 0.35 * this.detail(along / 25, 3.1));
        const rise = smoothstep(-edge * 0.5, edge * 0.5, across);
        return feature.height * rise * fade;
      }
      case 'plateau':
        return 0;
    }
  }
}

function pointInRegion(region: RegionDefinition, x: number, z: number): number {
  const angle = -region.rotationDeg * DEG2RAD;
  const dx = x - region.center[0];
  const dz = z - region.center[1];
  const rx = dx * Math.cos(angle) - dz * Math.sin(angle);
  const rz = dx * Math.sin(angle) + dz * Math.cos(angle);
  const nx = rx / region.radius[0];
  const nz = rz / region.radius[1];
  return nx * nx + nz * nz;
}

/** Returns an edge-softened 0..1 membership for an elliptical region. */
export function regionWeight(region: RegionDefinition, x: number, z: number): number {
  const r = pointInRegion(region, x, z);
  return 1 - smoothstep(0.7, 1, r);
}

function buildPathLine(definition: PathDefinition): Polyline {
  return createPolyline(smoothPolyline(definition.points, PATH_SMOOTHING));
}

function buildProfile(
  line: Polyline,
  heightAt: (x: number, z: number) => number,
  river: GeneratedRiver,
): Float32Array {
  const samples = Math.max(2, Math.ceil(line.length / PROFILE_SPACING) + 1);
  const raw = new Float32Array(samples);
  const point = { x: 0, z: 0 };
  const projection = createProjection();
  let lastValid = 0;
  for (let i = 0; i < samples; i++) {
    samplePolyline(line, i / (samples - 1), point);
    projectOnPolyline(river.line, point.x, point.z, projection);
    // Over the river, hold the last bank height so the profile spans the gap level.
    if (projection.distance < river.halfWidth + ROAD_RIVER_CLEARANCE) {
      raw[i] = lastValid;
      continue;
    }
    const h = heightAt(point.x, point.z);
    raw[i] = h;
    lastValid = h;
  }
  // Moving-average smoothing so roads follow the land without bumps.
  const smoothed = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    let sum = 0;
    let count = 0;
    for (let k = -PROFILE_SMOOTH_RADIUS; k <= PROFILE_SMOOTH_RADIUS; k++) {
      const j = Math.min(Math.max(i + k, 0), samples - 1);
      sum += raw[j]!;
      count++;
    }
    smoothed[i] = sum / count;
  }
  return smoothed;
}

/**
 * Generates the full terrain grid for an environment. Deterministic for a given definition.
 */
export function generateTerrain(env: EnvironmentDefinition): TerrainData {
  const resolution = env.resolution;
  const verticesPerSide = resolution + 1;
  const cellSize = env.size / resolution;
  const half = env.size / 2;
  const count = verticesPerSide * verticesPerSide;
  const heights = new Float32Array(count);
  const natural = new NaturalTerrain(env);
  const projection = createProjection();

  const river: GeneratedRiver = {
    line: createPolyline(smoothPolyline(env.river.points, PATH_SMOOTHING)),
    halfWidth: env.river.halfWidth,
    levelStart: env.river.levelStart,
    levelEnd: env.river.levelEnd,
  };

  const plateaus = env.terrain.features
    .filter((f): f is Extract<TerrainFeature, { kind: 'plateau' }> => f.kind === 'plateau')
    .map((p) => ({ ...p, target: p.height ?? natural.height(p.center[0], p.center[1]) }));

  // Pass 1 — natural shape, plateaus and the river valley.
  for (let iz = 0; iz < verticesPerSide; iz++) {
    const z = -half + iz * cellSize;
    for (let ix = 0; ix < verticesPerSide; ix++) {
      const x = -half + ix * cellSize;
      let h = natural.height(x, z);

      for (const p of plateaus) {
        const d = Math.hypot(x - p.center[0], z - p.center[1]);
        if (d < p.radius + p.blend)
          h = lerp(p.target, h, smoothstep(p.radius, p.radius + p.blend, d));
      }

      projectOnPolyline(river.line, x, z, projection);
      const level = riverLevelAt(river, projection.t);
      const d = projection.distance;
      const valleyEdge = river.halfWidth + env.river.valleyWidth;
      if (d < valleyEdge) {
        const valley =
          level + RIVER_BANK_HEIGHT + Math.max(0, d - river.halfWidth) * RIVER_VALLEY_SLOPE;
        h = lerp(valley, h, smoothstep(river.halfWidth + 2, valleyEdge, d));
      }
      const channel = 1 - smoothstep(river.halfWidth * 0.55, river.halfWidth + 2.5, d);
      if (channel > 0) h = lerp(h, level - env.river.depth, channel);

      heights[iz * verticesPerSide + ix] = h;
    }
  }

  const gridHeight = (x: number, z: number) =>
    sampleGridHeight(heights, verticesPerSide, cellSize, half, x, z);

  // Pass 2 — carve roads and trails into the shaped terrain.
  const paths: GeneratedPath[] = [
    ...env.roads.map((definition) => ({ definition, kind: 'road' as const })),
    ...env.trails.map((definition) => ({ definition, kind: 'trail' as const })),
  ].map(({ definition, kind }) => {
    const line = buildPathLine(definition);
    return { definition, kind, line, profile: buildProfile(line, gridHeight, river) };
  });

  const pathProjection = createProjection();
  for (let iz = 0; iz < verticesPerSide; iz++) {
    const z = -half + iz * cellSize;
    for (let ix = 0; ix < verticesPerSide; ix++) {
      const x = -half + ix * cellSize;
      const index = iz * verticesPerSide + ix;
      projectOnPolyline(river.line, x, z, projection);
      const riverKeep = smoothstep(
        river.halfWidth + ROAD_RIVER_CLEARANCE,
        river.halfWidth + ROAD_RIVER_CLEARANCE + ROAD_RIVER_BLEND,
        projection.distance,
      );
      if (riverKeep <= 0) continue;
      let h = heights[index]!;
      for (const path of paths) {
        const { halfWidth, shoulder } = path.definition;
        projectOnPolyline(path.line, x, z, pathProjection);
        if (pathProjection.distance > halfWidth + shoulder + cellSize) continue;
        const target = sampleProfile(path.profile, pathProjection.t) - ROADBED_DEPTH;
        const w =
          (1 -
            smoothstep(halfWidth + 0.5, halfWidth + shoulder + cellSize, pathProjection.distance)) *
          riverKeep;
        h = lerp(h, target, w);
      }
      heights[index] = h;
    }
  }

  // Pass 3 — helipads and landing zones: level the ground to one height so the pad surface and the
  // physics ground are the same plane (no floating slab, no wheels sinking into it).
  for (const pad of env.structures) {
    if (pad.kind !== 'helipad' && pad.kind !== 'landingZone') continue;
    const [px, pz] = pad.position;
    const radius = PAD_RADIUS * pad.scale + PAD_LEVEL_MARGIN;
    const target = sampleGridHeight(heights, verticesPerSide, cellSize, half, px, pz);
    const reach = radius + PAD_BLEND;
    const minX = Math.max(0, Math.floor((px - reach + half) / cellSize));
    const maxX = Math.min(resolution, Math.ceil((px + reach + half) / cellSize));
    const minZ = Math.max(0, Math.floor((pz - reach + half) / cellSize));
    const maxZ = Math.min(resolution, Math.ceil((pz + reach + half) / cellSize));
    for (let iz = minZ; iz <= maxZ; iz++) {
      for (let ix = minX; ix <= maxX; ix++) {
        const d = Math.hypot(-half + ix * cellSize - px, -half + iz * cellSize - pz);
        if (d >= reach) continue;
        const index = iz * verticesPerSide + ix;
        heights[index] = lerp(target, heights[index]!, smoothstep(radius, reach, d));
      }
    }
  }

  // Slopes from central differences.
  const slopes = new Float32Array(count);
  let minHeight = Infinity;
  let maxHeight = -Infinity;
  for (let iz = 0; iz < verticesPerSide; iz++) {
    for (let ix = 0; ix < verticesPerSide; ix++) {
      const index = iz * verticesPerSide + ix;
      const hl = heights[iz * verticesPerSide + Math.max(ix - 1, 0)]!;
      const hr = heights[iz * verticesPerSide + Math.min(ix + 1, resolution)]!;
      const hd = heights[Math.max(iz - 1, 0) * verticesPerSide + ix]!;
      const hu = heights[Math.min(iz + 1, resolution) * verticesPerSide + ix]!;
      const gx = (hr - hl) / (2 * cellSize);
      const gz = (hu - hd) / (2 * cellSize);
      slopes[index] = Math.atan(Math.hypot(gx, gz));
      const h = heights[index]!;
      if (h < minHeight) minHeight = h;
      if (h > maxHeight) maxHeight = h;
    }
  }

  const surfaces = classifySurfaces(
    env,
    heights,
    slopes,
    verticesPerSide,
    cellSize,
    half,
    river,
    paths,
  );

  // Fire damage: 0..1 per vertex inside burnt regions, used to char the ground.
  const burnt = env.regions.filter((r) => r.kind === 'burnt');
  let scorch: Float32Array | undefined;
  if (burnt.length > 0) {
    scorch = new Float32Array(count);
    const edge = createNoise2D(env.seed + 505);
    for (let iz = 0; iz < verticesPerSide; iz++) {
      for (let ix = 0; ix < verticesPerSide; ix++) {
        const x = -half + ix * cellSize;
        const z = -half + iz * cellSize;
        let w = 0;
        for (const region of burnt) w = Math.max(w, regionWeight(region, x, z) * region.density);
        const n = edge(x / 18, z / 18) * 0.25;
        scorch[iz * verticesPerSide + ix] = smoothstep(0.15, 0.55, w + n);
      }
    }
  }

  return {
    floodLevel: env.flood?.level ?? null,
    treeline: env.terrain.treeline,
    scorch,
    size: env.size,
    resolution,
    verticesPerSide,
    cellSize,
    half,
    heights,
    surfaces,
    slopes,
    river,
    paths,
    minHeight,
    maxHeight,
  };
}

function classifySurfaces(
  env: EnvironmentDefinition,
  heights: Float32Array,
  slopes: Float32Array,
  verticesPerSide: number,
  cellSize: number,
  half: number,
  river: GeneratedRiver,
  paths: readonly GeneratedPath[],
): Uint8Array {
  const surfaces = new Uint8Array(heights.length);
  const detail = createNoise2D(env.seed + 303);
  const projection = createProjection();
  const rockSlope = env.terrain.rockSlopeDeg * DEG2RAD;
  const pads = env.structures.filter((s) => s.kind === 'helipad' || s.kind === 'landingZone');

  for (let iz = 0; iz < verticesPerSide; iz++) {
    const z = -half + iz * cellSize;
    for (let ix = 0; ix < verticesPerSide; ix++) {
      const x = -half + ix * cellSize;
      const index = iz * verticesPerSide + ix;
      surfaces[index] = classifyPoint(x, z, heights[index]!, slopes[index]!);
    }
  }
  return surfaces;

  function classifyPoint(x: number, z: number, height: number, slope: number): SurfaceId {
    projectOnPolyline(river.line, x, z, projection);
    if (projection.distance < river.halfWidth - 0.5) return SurfaceId.WATER;

    if (env.flood && height < env.flood.level - 0.2) return SurfaceId.MUD;

    for (const pad of pads) {
      if (Math.hypot(x - pad.position[0], z - pad.position[1]) < PAD_RADIUS * pad.scale) {
        return SurfaceId.PAD;
      }
    }

    for (const path of paths) {
      projectOnPolyline(path.line, x, z, projection);
      // Beyond a road's end the roadbed runs on as a worn gravel/dirt track that narrows into the
      // grass, so the road doesn't stop at a hard edge.
      if (
        path.kind === 'road' &&
        (projection.t <= 0.0005 || projection.t >= 0.9995) &&
        projection.distance <
          path.definition.halfWidth * 0.9 + ROAD_RUNOUT * (0.6 + 0.4 * detail(x / 9, z / 9))
      ) {
        const runout = Math.min(
          Math.hypot(x - path.line.points[0]![0], z - path.line.points[0]![1]),
          Math.hypot(
            x - path.line.points[path.line.points.length - 1]![0],
            z - path.line.points[path.line.points.length - 1]![1],
          ),
        );
        if (runout < ROAD_RUNOUT)
          return runout < ROAD_RUNOUT * 0.45 ? SurfaceId.GRAVEL : SurfaceId.TRAIL;
      }
      if (projection.distance < path.definition.halfWidth + 0.6) {
        const damaged = path.definition.damagedSections.some(
          ([from, to]) => projection.t >= from && projection.t <= to,
        );
        if (damaged) return SurfaceId.GRAVEL;
        return path.kind === 'road' ? SurfaceId.ROAD : SurfaceId.TRAIL;
      }
    }

    projectOnPolyline(river.line, x, z, projection);
    if (projection.distance < river.halfWidth + env.river.mudBank) return SurfaceId.MUD;

    const n = detail(x / 22, z / 22);
    for (const region of env.regions) {
      const w = regionWeight(region, x, z);
      if (w <= 0.35 + 0.25 * n) continue;
      if (region.kind === 'landslide') return SurfaceId.GRAVEL;
      if (region.kind === 'mud') return SurfaceId.MUD;
      if (region.kind === 'rocky' && n > -0.3) return SurfaceId.ROCK;
      if (region.kind === 'burnt') return n > 0.45 ? SurfaceId.GRAVEL : SurfaceId.FOREST_FLOOR;
    }

    if (slope > rockSlope + n * 0.08) return SurfaceId.ROCK;
    // Above the treeline: dry alpine meadow on gentle ground, scree and outcrops on the slopes.
    if (height > env.terrain.treeline + 25 * n) {
      if (slope < rockSlope * 0.45) return SurfaceId.GRASS;
      return n > 0.25 ? SurfaceId.ROCK : SurfaceId.GRAVEL;
    }

    for (const region of env.regions) {
      if (region.kind === 'forest' && regionWeight(region, x, z) > 0.3 + 0.2 * n) {
        return SurfaceId.FOREST_FLOOR;
      }
    }
    return SurfaceId.GRASS;
  }
}
