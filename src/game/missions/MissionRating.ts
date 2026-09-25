import { clamp01 } from '@/utils/math/scalar';
import type { FailureReason } from '@/game/core/GameEvents';
import type { MissionDefinition } from './MissionDefinition';

export interface MissionStats {
  survivorsRescued: number;
  survivorsTotal: number;
  batteryRemaining: number;
  integrity: number;
  timeSeconds: number;
  scannerAccuracy: number;
}

export interface MissionResult extends MissionStats {
  missionId: string;
  success: boolean;
  failureReason: FailureReason | null;
  /** 0..1 weighted performance score. */
  score: number;
  /** 0..3 stars. */
  stars: number;
  /** Integer score shown to the player and saved as a best score. */
  rescueScore: number;
}

/** Battery above this percentage counts as full marks. */
const BATTERY_FULL_MARKS = 40;
const RESCUE_SCORE_SCALE = 10_000;

export function rateMission(
  mission: MissionDefinition,
  stats: MissionStats,
  success: boolean,
  failureReason: FailureReason | null,
): MissionResult {
  const { weights, parTimeSeconds, starThresholds } = mission.rewards;
  const components = {
    survivors: stats.survivorsTotal > 0 ? stats.survivorsRescued / stats.survivorsTotal : 1,
    time:
      stats.timeSeconds <= parTimeSeconds
        ? 1
        : clamp01(1 - (stats.timeSeconds - parTimeSeconds) / parTimeSeconds),
    integrity: clamp01(stats.integrity / 100),
    battery: clamp01(stats.batteryRemaining / BATTERY_FULL_MARKS),
    scanner: clamp01(stats.scannerAccuracy / 100),
  };
  const totalWeight =
    weights.survivors + weights.time + weights.integrity + weights.battery + weights.scanner;
  const weighted =
    components.survivors * weights.survivors +
    components.time * weights.time +
    components.integrity * weights.integrity +
    components.battery * weights.battery +
    components.scanner * weights.scanner;
  const score = success && totalWeight > 0 ? weighted / totalWeight : 0;
  const stars = success ? Math.max(1, starThresholds.filter((t) => score >= t).length) : 0;
  return {
    ...stats,
    missionId: mission.id,
    success,
    failureReason,
    score,
    stars,
    rescueScore: Math.round(score * RESCUE_SCORE_SCALE),
  };
}
