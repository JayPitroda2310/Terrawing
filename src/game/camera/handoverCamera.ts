import { type AmbulancePose, ambulanceAt, type HandoverPlan } from '@/game/rescue/handover';
import { lerp, smoothstep } from '@/utils/math/scalar';
import type { ShotContext } from './CinematicCamera';
import type { CameraPose } from './FollowCamera';

const moving: AmbulancePose = { x: 0, z: 0, yaw: 0, speed: 0, accel: 0, s: 0, visible: true };
const parked: AmbulancePose = { ...moving };

/**
 * Closing shot after a patient handover: a wide view from beside TerraWing over the parked
 * ambulances, holding as they pull away one after the other and tracking the last one down the
 * road toward hospital, rising and tightening as it goes.
 */
export function handoverCamera(
  plan: HandoverPlan,
  t: number,
  ctx: ShotContext,
  out: CameraPose,
): CameraPose {
  const first = plan.units[0]!;
  const last = plan.units[plan.units.length - 1]!;
  const g = ctx.groundHeightAt;
  const follow = t >= last.depart - 0.3 ? last : first;
  ambulanceAt(plan, follow, t, moving);
  ambulanceAt(plan, first, first.arrive, parked);
  const gy = g(ctx.x, ctx.z);
  // From TerraWing toward the ambulances, and its perpendicular: the camera sits off to the side.
  let ux = parked.x - ctx.x;
  let uz = parked.z - ctx.z;
  const d = Math.hypot(ux, uz) || 1;
  ux /= d;
  uz /= d;
  const nx = -uz;
  const nz = ux;
  const since = Math.max(0, t - first.depart);
  out.x = ctx.x - ux * 6 + nx * 13;
  out.z = ctx.z - uz * 6 + nz * 13;
  out.y = gy + 4.5 + since * 0.45;
  out.lookX = moving.x;
  out.lookZ = moving.z;
  out.lookY = g(moving.x, moving.z) + 1.6;
  out.fov = lerp(50, 32, smoothstep(0, 7, since));
  out.roll = 0;
  return out;
}
