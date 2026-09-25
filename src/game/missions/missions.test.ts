import { describe, expect, it } from 'vitest';
import { MISSION_01 } from '@/data/missions/mission01';
import { loadMission } from '@/data/missions';
import { validateMission, type MissionDefinition } from './MissionDefinition';
import { MissionManager } from './MissionManager';
import type { MissionContext } from './MissionObjectives';
import { rateMission } from './MissionRating';

function mission(): MissionDefinition {
  const result = loadMission('mission-01');
  if (!result.ok) throw new Error(result.errors.join());
  return result.mission;
}

const context = (overrides: Partial<MissionContext> = {}): MissionContext => ({
  x: 0,
  z: 0,
  altitudeAGL: 0,
  speed: 0,
  mode: 'ROVER',
  grounded: true,
  isInZone: () => false,
  ...overrides,
});

describe('mission data validation', () => {
  it('accepts Mission 01', () => {
    expect(validateMission(MISSION_01).ok).toBe(true);
  });

  it('rejects dangling references with readable errors', () => {
    const broken = {
      ...MISSION_01,
      objectives: [
        ...MISSION_01.objectives,
        {
          id: 'ghost',
          type: 'secureSurvivor',
          label: 'Ghost',
          survivorId: 'nobody',
          requires: ['missing'],
        },
      ],
    };
    const result = validateMission(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join('\n')).toMatch(/unknown survivor "nobody"/);
      expect(result.errors.join('\n')).toMatch(/unknown objective "missing"/);
    }
  });
});

describe('MissionManager', () => {
  it('unlocks objectives as prerequisites complete', () => {
    const manager = new MissionManager(mission(), () => false);
    expect(manager.getObjective('scan')?.status).toBe('locked');
    manager.update(0.1, context({ mode: 'FLIGHT', altitudeAGL: 20 }));
    expect(manager.getObjective('deploy')?.status).toBe('completed');
    expect(manager.getObjective('scan')?.status).toBe('active');
    expect(manager.currentObjective?.definition.id).toBe('scan');
  });

  it('completes event-driven objectives from facts', () => {
    const manager = new MissionManager(mission(), (zone) => zone === 'disaster');
    manager.update(0.1, context({ mode: 'FLIGHT', altitudeAGL: 20 }));
    manager.notify({ type: 'scanPerformed', x: 0, z: 0 });
    manager.notify({ type: 'survivorSecured', survivorId: 'survivor-a' });
    const result = manager.update(0.1, context());
    expect(result.completed.map((o) => o.definition.id)).toEqual(['scan', 'survivor-a']);
  });

  it('requires holding still in the extraction zone', () => {
    const manager = new MissionManager(mission(), (zone) => zone === 'extraction');
    for (const objective of manager.objectives) {
      if (objective.definition.id !== 'extract') objective.status = 'completed';
    }
    manager.getObjective('extract')!.status = 'active';
    const inZone = (zone: string) => zone === 'extraction';
    manager.update(1, context({ speed: 5, isInZone: inZone }));
    expect(manager.getObjective('extract')?.progress).toBe(0);
    let completed = false;
    for (let i = 0; i < 40 && !completed; i++)
      completed = manager.update(0.1, context({ isInZone: inZone })).missionCompleted;
    expect(completed).toBe(true);
    expect(manager.state).toBe('completed');
  });

  it('fails when the time limit expires', () => {
    const manager = new MissionManager(mission(), () => false);
    manager.update(mission().timeLimit + 1, context());
    expect(manager.state).toBe('failed');
    expect(manager.failureReason).toBe('TIME_EXPIRED');
  });
});

describe('rateMission', () => {
  const stats = {
    survivorsRescued: 3,
    survivorsTotal: 3,
    batteryRemaining: 40,
    integrity: 100,
    timeSeconds: 500,
    scannerAccuracy: 100,
  };

  it('awards three stars for a clean, fast rescue', () => {
    const result = rateMission(mission(), stats, true, null);
    expect(result.stars).toBe(3);
    expect(result.rescueScore).toBeGreaterThan(9000);
  });

  it('degrades with time, damage and poor scanning but never below one star on success', () => {
    const slow = rateMission(
      mission(),
      { ...stats, timeSeconds: 1400, integrity: 30, scannerAccuracy: 20, batteryRemaining: 2 },
      true,
      null,
    );
    expect(slow.stars).toBeGreaterThanOrEqual(1);
    expect(slow.stars).toBeLessThan(3);
    expect(rateMission(mission(), stats, false, 'BATTERY_DEPLETED').stars).toBe(0);
  });
});
