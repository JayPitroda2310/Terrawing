import { describe, expect, it } from 'vitest';
import { MOUNTAIN_COLLAPSE } from '@/data/environments/mountainCollapse';
import { SurfaceId } from '@/data/surfaces/surfaces';
import { generateTerrain } from './TerrainGenerator';
import { TerrainQuery } from './TerrainQuery';

describe('generateTerrain', () => {
  const started = performance.now();
  const terrain = generateTerrain(MOUNTAIN_COLLAPSE);
  const elapsed = performance.now() - started;
  const query = new TerrainQuery(terrain);

  it('generates finite heights on the configured grid', () => {
    expect(terrain.heights.length).toBe((MOUNTAIN_COLLAPSE.resolution + 1) ** 2);
    expect(terrain.heights.every(Number.isFinite)).toBe(true);
    // Generous bound: this also runs on a busy machine next to the browser and GPU.
    expect(elapsed).toBeLessThan(6000);
  });

  it('flattens the rescue base plateau', () => {
    expect(query.heightAt(-330, 305)).toBeCloseTo(14, 0);
    expect(query.surfaceAt(-330, 305)).toBe(SurfaceId.PAD);
  });

  it('carves the river below its water level', () => {
    const level = query.waterLevelAt(66, 76);
    expect(level).not.toBeNull();
    expect(query.heightAt(66, 76)).toBeLessThan(level!);
    expect(query.surfaceAt(66, 76)).toBe(SurfaceId.WATER);
  });

  it('marks the road and the damaged landslide section', () => {
    expect(query.surfaceAt(-240, 232)).toBe(SurfaceId.ROAD);
    expect(query.surfaceAt(-60, 150)).toBe(SurfaceId.GRAVEL);
  });

  it('keeps the east survivor in the radio shadow of the central spur', () => {
    const occlusion = query.occlusion(
      -356,
      44 + 30,
      282,
      238,
      query.heightAt(238, -166) + 2,
      -166,
      48,
    );
    expect(occlusion).toBeGreaterThan(0.2);
  });

  it('matches mesh triangulation at grid vertices', () => {
    const { verticesPerSide, cellSize, half, heights } = terrain;
    const ix = 40;
    const iz = 77;
    expect(query.heightAt(-half + ix * cellSize, -half + iz * cellSize)).toBeCloseTo(
      heights[iz * verticesPerSide + ix]!,
      4,
    );
  });
});
