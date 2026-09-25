import { create } from 'zustand';
import { createTelemetry, type Telemetry } from '@/game/core/Telemetry';

/**
 * HUD telemetry, published by the game loop at a throttled rate (~10 Hz). High-frequency values
 * that need smooth animation (compass, markers) are read directly from the session instead.
 */
export const useTelemetryStore = create<{ telemetry: Telemetry; publish(t: Telemetry): void }>(
  (set) => ({
    telemetry: createTelemetry(),
    publish: (telemetry) => set({ telemetry: { ...telemetry } }),
  }),
);
