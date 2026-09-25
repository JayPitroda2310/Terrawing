import { create } from 'zustand';
import type { GameAction } from '@/game/input/actions';
import { createDefaultSettings, type Settings } from '@/services/save/saveSchema';

interface SettingsStoreState {
  settings: Settings;
  /** Replaces all settings (used when loading a save). */
  hydrate(settings: Settings): void;
  update<K extends keyof Settings>(key: K, value: Settings[K]): void;
  rebind(action: GameAction, code: string): void;
  resetDefaults(): void;
}

export const useSettingsStore = create<SettingsStoreState>((set) => ({
  settings: createDefaultSettings(),
  hydrate: (settings) => set({ settings }),
  update: (key, value) => set((state) => ({ settings: { ...state.settings, [key]: value } })),
  rebind: (action, code) =>
    set((state) => {
      // A key can only drive one conflicting action; remove it from others (except shared defaults
      // like Space for ascend/brake which live in different vehicle modes).
      const sharedPairs: Record<string, GameAction> = { ascend: 'brake', brake: 'ascend' };
      const keyBindings = { ...state.settings.keyBindings };
      for (const other of Object.keys(keyBindings) as GameAction[]) {
        if (other === action || sharedPairs[action] === other) continue;
        keyBindings[other] = keyBindings[other].filter((c) => c !== code);
      }
      keyBindings[action] = [code];
      return { settings: { ...state.settings, keyBindings } };
    }),
  resetDefaults: () => set({ settings: createDefaultSettings() }),
}));
