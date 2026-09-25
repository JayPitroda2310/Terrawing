import { z } from 'zod';
import { DEFAULT_KEY_BINDINGS, GAME_ACTIONS, type KeyBindings } from '@/game/input/actions';

export const SAVE_VERSION = 1;

export const graphicsQualitySchema = z.enum(['low', 'medium', 'high']);
export type GraphicsQuality = z.infer<typeof graphicsQualitySchema>;

const keyBindingsSchema = z
  .record(z.string(), z.array(z.string()))
  .transform((raw): KeyBindings => {
    const bindings = { ...DEFAULT_KEY_BINDINGS };
    for (const action of GAME_ACTIONS) {
      const codes = raw[action];
      if (Array.isArray(codes) && codes.length > 0) bindings[action] = codes;
    }
    return bindings;
  });

export const settingsSchema = z.object({
  graphics: graphicsQualitySchema.default('medium'),
  masterVolume: z.number().min(0).max(1).default(0.8),
  musicVolume: z.number().min(0).max(1).default(0.5),
  sfxVolume: z.number().min(0).max(1).default(0.8),
  mouseSensitivity: z.number().min(0.1).max(3).default(1),
  invertY: z.boolean().default(false),
  keyBindings: keyBindingsSchema.default(DEFAULT_KEY_BINDINGS),
  cameraShake: z.boolean().default(true),
  motionEffects: z.boolean().default(true),
  reducedMotion: z.boolean().default(false),
  showSubtitles: z.boolean().default(true),
});
export type Settings = z.infer<typeof settingsSchema>;

export const missionRecordSchema = z.object({
  completed: z.boolean().default(false),
  attempts: z.number().int().min(0).default(0),
  bestTimeSeconds: z.number().nullable().default(null),
  bestScore: z.number().nullable().default(null),
  bestStars: z.number().int().min(0).max(3).default(0),
});
export type MissionRecord = z.infer<typeof missionRecordSchema>;

export const progressSchema = z.object({
  missions: z.record(z.string(), missionRecordSchema).default({}),
  unlocked: z.array(z.string()).default(['mission-01']),
});
export type Progress = z.infer<typeof progressSchema>;

export const saveDataSchema = z.object({
  version: z.number().int(),
  settings: settingsSchema.default(settingsSchema.parse({})),
  progress: progressSchema.default(progressSchema.parse({})),
});
export type SaveData = z.infer<typeof saveDataSchema>;

export function createDefaultSave(): SaveData {
  return saveDataSchema.parse({ version: SAVE_VERSION });
}

export function createDefaultSettings(): Settings {
  return settingsSchema.parse({});
}
