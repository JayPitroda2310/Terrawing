import { describe, expect, it } from 'vitest';
import type { MissionResult } from '@/game/missions/MissionRating';
import { LocalStorageSaveRepository } from './LocalStorageSaveRepository';
import { applyMissionResult } from './SaveService';
import { createDefaultSave } from './saveSchema';

const result = (overrides: Partial<MissionResult>): MissionResult => ({
  missionId: 'mission-01',
  success: true,
  failureReason: null,
  survivorsRescued: 3,
  survivorsTotal: 3,
  batteryRemaining: 30,
  integrity: 90,
  timeSeconds: 600,
  scannerAccuracy: 80,
  score: 0.8,
  stars: 2,
  rescueScore: 8000,
  ...overrides,
});

describe('applyMissionResult', () => {
  it('records completion and keeps personal bests', () => {
    let progress = createDefaultSave().progress;
    progress = applyMissionResult(progress, result({}), ['mission-02']);
    progress = applyMissionResult(
      progress,
      result({ timeSeconds: 700, rescueScore: 9000, stars: 3 }),
      [],
    );
    const record = progress.missions['mission-01']!;
    expect(record.completed).toBe(true);
    expect(record.attempts).toBe(2);
    expect(record.bestTimeSeconds).toBe(600);
    expect(record.bestScore).toBe(9000);
    expect(record.bestStars).toBe(3);
    expect(progress.unlocked).toContain('mission-02');
  });

  it('counts failed attempts without touching bests', () => {
    const progress = applyMissionResult(
      createDefaultSave().progress,
      result({ success: false, stars: 0 }),
      ['x'],
    );
    expect(progress.missions['mission-01']).toMatchObject({
      completed: false,
      attempts: 1,
      bestScore: null,
    });
    expect(progress.unlocked).not.toContain('x');
  });
});

describe('LocalStorageSaveRepository', () => {
  it('round-trips data and survives corrupt storage', async () => {
    const repository = new LocalStorageSaveRepository('test.save');
    const data = createDefaultSave();
    data.settings.graphics = 'high';
    await repository.save(data);
    expect((await repository.load()).settings.graphics).toBe('high');

    localStorage.setItem('test.save', '{not json');
    expect((await repository.load()).settings.graphics).toBe('medium');
    await repository.clear();
  });
});

describe('recommendQuality', () => {
  it('starts integrated GPUs on Low and discrete GPUs higher', async () => {
    const { recommendQuality } = await import('@/utils/performance/gpuTier');
    expect(recommendQuality('ANGLE (Intel, Intel(R) UHD Graphics Direct3D11)')).toBe('low');
    expect(recommendQuality('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11)')).toBe('high');
    expect(recommendQuality('ANGLE (AMD, Radeon Pro 560)')).toBe('medium');
    expect(recommendQuality(null)).toBe('medium');
  });
});
