import { create } from 'zustand';
import {
  canShareKey,
  FLIGHT_PRESETS,
  type FlightControlPreset,
  type GameAction,
} from '@/game/input/actions';
import { createDefaultSettings, type Settings } from '@/services/save/saveSchema';

interface SettingsStoreState {
  settings: Settings;
  /** Replaces all settings (used when loading a save). */
  hydrate(settings: Settings): void;
  update<K extends keyof Settings>(key: K, value: Settings[K]): void;
  rebind(action: GameAction, code: string): void;
  applyFlightPreset(preset: FlightControlPreset): void;
  resetDefaults(): void;
}

export const useSettingsStore = create<SettingsStoreState>((set) => ({
  settings: createDefaultSettings(),
  hydrate: (settings) => set({ settings }),
  update: (key, value) => set((state) => ({ settings: { ...state.settings, [key]: value } })),
  rebind: (action, code) =>
    set((state) => {
      // A key drives only one action per vehicle mode; flight and rover actions may share keys.
      const keyBindings = { ...state.settings.keyBindings };
      for (const other of Object.keys(keyBindings) as GameAction[]) {
        if (other === action || canShareKey(action, other)) continue;
        keyBindings[other] = keyBindings[other].filter((c) => c !== code);
      }
      keyBindings[action] = [code];
      return { settings: { ...state.settings, keyBindings } };
    }),
  applyFlightPreset: (preset) =>
    set((state) => ({
      settings: {
        ...state.settings,
        keyBindings: { ...state.settings.keyBindings, ...FLIGHT_PRESETS[preset] },
      },
    })),
  resetDefaults: () => set({ settings: createDefaultSettings() }),
}));
