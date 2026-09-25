/**
 * Shared, render-agnostic state of the active scan pulse. The terrain shader, the pulse ring mesh
 * and the scan HUD overlay all read this one object each frame.
 */
export interface ScanPulseState {
  active: boolean;
  originX: number;
  originY: number;
  originZ: number;
  radius: number;
  maxRadius: number;
  /** 0..1 fades the ring out near the end of its range. */
  intensity: number;
}

export function createScanPulseState(): ScanPulseState {
  return {
    active: false,
    originX: 0,
    originY: 0,
    originZ: 0,
    radius: 0,
    maxRadius: 1,
    intensity: 0,
  };
}

const FADE_START = 0.75;

export function pulseIntensity(radius: number, maxRadius: number): number {
  const t = radius / maxRadius;
  if (t < FADE_START) return 1;
  return Math.max(0, 1 - (t - FADE_START) / (1 - FADE_START));
}
