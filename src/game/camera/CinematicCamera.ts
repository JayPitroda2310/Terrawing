import type { CinematicShotId } from '@/game/core/GameState';
import { easeInOutCubic, lerp } from '@/utils/math/scalar';
import type { CameraPose } from './FollowCamera';

export interface ShotContext {
  /** Vehicle position and heading. */
  x: number;
  y: number;
  z: number;
  heading: number;
  /** Optional focus (e.g. survivor being assisted). */
  focusX: number;
  focusY: number;
  focusZ: number;
  groundHeightAt: (x: number, z: number) => number;
}

type ShotFn = (t: number, ctx: ShotContext, out: CameraPose) => void;

const CLEARANCE = 2;

/**
 * Data-light cinematic shots expressed as functions of normalised time. Each shot ends close to
 * the follow camera so hand-off back to gameplay is seamless.
 */
const SHOTS: Readonly<Record<CinematicShotId, ShotFn>> = {
  missionIntro(t, ctx, out) {
    // Wide establishing crane over the base that swoops down behind TerraWing.
    const k = easeInOutCubic(t);
    const startAngle = ctx.heading + Math.PI * 0.75;
    const endAngle = ctx.heading;
    const angle = lerp(startAngle, endAngle, k);
    const radius = lerp(70, 8, k);
    const height = lerp(45, 3, k);
    out.x = ctx.x - Math.sin(angle) * radius;
    out.z = ctx.z + Math.cos(angle) * radius;
    out.y = ctx.y + height;
    out.lookX = ctx.x;
    out.lookY = ctx.y + lerp(0, 1.2, k);
    out.lookZ = ctx.z;
    out.fov = lerp(48, 64, k);
    out.roll = 0;
  },
  missionComplete(t, ctx, out) {
    // Slow rising orbit as TerraWing powers down on the LZ.
    const angle = ctx.heading + Math.PI * 0.4 + t * Math.PI * 0.6;
    const radius = lerp(9, 22, easeInOutCubic(t));
    out.x = ctx.x - Math.sin(angle) * radius;
    out.z = ctx.z + Math.cos(angle) * radius;
    out.y = ctx.y + lerp(2.5, 14, easeInOutCubic(t));
    out.lookX = ctx.x;
    out.lookY = ctx.y + 1;
    out.lookZ = ctx.z;
    out.fov = 55;
    out.roll = 0;
  },
  rescue(t, ctx, out) {
    // Low orbit framing both vehicle and survivor.
    const mx = (ctx.x + ctx.focusX) / 2;
    const mz = (ctx.z + ctx.focusZ) / 2;
    const my = (ctx.y + ctx.focusY) / 2;
    const angle = ctx.heading + Math.PI * 0.55 + t * 0.9;
    const radius = 9;
    out.x = mx - Math.sin(angle) * radius;
    out.z = mz + Math.cos(angle) * radius;
    out.y = my + 3.2;
    out.lookX = mx;
    out.lookY = my + 0.8;
    out.lookZ = mz;
    out.fov = 52;
    out.roll = 0;
  },
};

export function evaluateShot(
  shot: CinematicShotId,
  t: number,
  ctx: ShotContext,
  out: CameraPose,
): CameraPose {
  SHOTS[shot](Math.min(1, Math.max(0, t)), ctx, out);
  out.y = Math.max(out.y, ctx.groundHeightAt(out.x, out.z) + CLEARANCE);
  return out;
}
