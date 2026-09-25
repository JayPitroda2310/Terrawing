import { validateMission, type MissionValidationResult } from '@/game/missions/MissionDefinition';
import { MISSION_01 } from './mission01';

/** Summary shown in mission select, including missions that are not yet playable. */
export interface MissionCatalogEntry {
  id: string;
  code: string;
  name: string;
  available: boolean;
  teaser: string;
}

const RAW_MISSIONS: Readonly<Record<string, unknown>> = {
  [MISSION_01.id]: MISSION_01,
};

export const MISSION_CATALOG: readonly MissionCatalogEntry[] = [
  {
    id: 'mission-01',
    code: 'MISSION 01',
    name: 'Mountain Collapse',
    available: true,
    teaser: 'Landslide · 3 hikers missing · Light rain',
  },
  {
    id: 'mission-02',
    code: 'MISSION 02',
    name: 'Flood Response',
    available: false,
    teaser: 'Classified',
  },
  {
    id: 'mission-03',
    code: 'MISSION 03',
    name: 'Forest Fire',
    available: false,
    teaser: 'Classified',
  },
  {
    id: 'mission-04',
    code: 'MISSION 04',
    name: 'Earthquake',
    available: false,
    teaser: 'Classified',
  },
  {
    id: 'mission-05',
    code: 'MISSION 05',
    name: 'Night Rescue',
    available: false,
    teaser: 'Classified',
  },
];

export const DEFAULT_MISSION_ID = 'mission-01';

const cache = new Map<string, MissionValidationResult>();

/** Loads and validates a mission. The result is cached per id. */
export function loadMission(id: string): MissionValidationResult {
  const cached = cache.get(id);
  if (cached) return cached;
  const raw = RAW_MISSIONS[id];
  const result: MissionValidationResult = raw
    ? validateMission(raw)
    : { ok: false, errors: [`Mission "${id}" does not exist`] };
  cache.set(id, result);
  return result;
}
