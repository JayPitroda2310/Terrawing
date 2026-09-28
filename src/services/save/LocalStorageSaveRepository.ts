import { logger } from '@/utils/helpers/logger';
import { recommendQuality } from '@/utils/performance/gpuTier';
import type { SaveRepository } from './SaveRepository';
import { DEFAULT_KEY_BINDINGS } from '@/game/input/actions';
import { createDefaultSave, SAVE_VERSION, saveDataSchema, type SaveData } from './saveSchema';

const DEFAULT_KEY = 'terrawing.save.v1';

/** Stores save data as validated JSON in localStorage. Corrupt data falls back to defaults. */
export class LocalStorageSaveRepository implements SaveRepository {
  constructor(
    private readonly key: string = DEFAULT_KEY,
    private readonly storage: Storage | null = typeof localStorage !== 'undefined'
      ? localStorage
      : null,
  ) {}

  async load(): Promise<SaveData> {
    const raw = this.read();
    if (!raw) {
      // First run: start on the graphics preset that suits this GPU.
      const fresh = createDefaultSave();
      fresh.settings = { ...fresh.settings, graphics: recommendQuality() };
      return fresh;
    }
    try {
      const parsed = saveDataSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) {
        logger.warn('save', 'Save data failed validation; using defaults.', parsed.error.issues);
        return createDefaultSave();
      }
      const data = parsed.data;
      // Key bindings from before the drone control layout would conflict with the new actions.
      if (data.version < 2) data.settings = { ...data.settings, keyBindings: DEFAULT_KEY_BINDINGS };
      return { ...data, version: SAVE_VERSION };
    } catch (error) {
      logger.warn('save', 'Save data is not valid JSON; using defaults.', error);
      return createDefaultSave();
    }
  }

  async save(data: SaveData): Promise<void> {
    try {
      this.storage?.setItem(this.key, JSON.stringify(data));
    } catch (error) {
      // Quota exceeded or storage disabled (private mode) — progress stays in memory.
      logger.warn('save', 'Could not write save data.', error);
    }
  }

  async clear(): Promise<void> {
    try {
      this.storage?.removeItem(this.key);
    } catch (error) {
      logger.warn('save', 'Could not clear save data.', error);
    }
  }

  private read(): string | null {
    try {
      return this.storage?.getItem(this.key) ?? null;
    } catch {
      return null;
    }
  }
}
