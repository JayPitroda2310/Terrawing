import type { MissionResult } from '@/game/missions/MissionRating';
import { LocalStorageSaveRepository } from './LocalStorageSaveRepository';
import type { SaveRepository } from './SaveRepository';
import {
  createDefaultSave,
  type MissionRecord,
  type Progress,
  type SaveData,
  type Settings,
} from './saveSchema';

const WRITE_DEBOUNCE_MS = 250;

/** Applies a mission result to progress, keeping personal bests. Pure — easy to test. */
export function applyMissionResult(
  progress: Progress,
  result: MissionResult,
  unlocks: readonly string[],
): Progress {
  const previous: MissionRecord = progress.missions[result.missionId] ?? {
    completed: false,
    attempts: 0,
    bestTimeSeconds: null,
    bestScore: null,
    bestStars: 0,
  };
  const record: MissionRecord = { ...previous, attempts: previous.attempts + 1 };
  if (result.success) {
    record.completed = true;
    record.bestTimeSeconds =
      previous.bestTimeSeconds === null
        ? result.timeSeconds
        : Math.min(previous.bestTimeSeconds, result.timeSeconds);
    record.bestScore =
      previous.bestScore === null
        ? result.rescueScore
        : Math.max(previous.bestScore, result.rescueScore);
    record.bestStars = Math.max(previous.bestStars, result.stars);
  }
  const unlocked = result.success
    ? Array.from(new Set([...progress.unlocked, ...unlocks]))
    : progress.unlocked;
  return { missions: { ...progress.missions, [result.missionId]: record }, unlocked };
}

/** Holds the in-memory save and writes through to the repository (debounced). */
export class SaveService {
  private data: SaveData = createDefaultSave();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly repository: SaveRepository = new LocalStorageSaveRepository()) {}

  async init(): Promise<SaveData> {
    this.data = await this.repository.load();
    return this.data;
  }

  get snapshot(): SaveData {
    return this.data;
  }

  updateSettings(settings: Settings): void {
    this.data = { ...this.data, settings };
    this.scheduleWrite();
  }

  recordMission(result: MissionResult, unlocks: readonly string[]): Progress {
    const progress = applyMissionResult(this.data.progress, result, unlocks);
    this.data = { ...this.data, progress };
    this.flush();
    return progress;
  }

  async reset(): Promise<SaveData> {
    await this.repository.clear();
    this.data = createDefaultSave();
    return this.data;
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    void this.repository.save(this.data);
  }

  private scheduleWrite(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), WRITE_DEBOUNCE_MS);
  }
}

export const saveService = new SaveService();
