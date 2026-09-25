import type { CameraProfile, VehicleConfig } from '@/data/vehicles';
import { clamp, damp, dampAngle, DEG2RAD, lerp } from '@/utils/math/scalar';
import { createNoise2D } from '@/utils/math/noise';

export interface CameraPose {
  x: number;
  y: number;
  z: number;
  lookX: number;
  lookY: number;
  lookZ: number;
  fov: number;
  roll: number;
}

export function createCameraPose(): CameraPose {
  return { x: 0, y: 10, z: 10, lookX: 0, lookY: 0, lookZ: 0, fov: 60, roll: 0 };
}

export interface FollowTarget {
  x: number;
  y: number;
  z: number;
  heading: number;
  speed: number;
  /** 0 = rover profile, 1 = flight profile. */
  flightBlend: number;
  visualRoll: number;
  /** Surface roughness × speed, drives subtle road shake. */
  roughness: number;
}

export interface CameraComfort {
  motionEffects: boolean;
  cameraShake: boolean;
  reducedMotion: boolean;
}

const SHAKE_DECAY = 1.6;
const SHAKE_AMPLITUDE = 0.35;
const SHAKE_FREQUENCY = 18;
const RECENTER_RATE = 1.5;
const MAX_SPEED_FOR_FOV = 30;
const ROLL_FACTOR = 0.35;

function blendProfiles(
  a: CameraProfile,
  b: CameraProfile,
  t: number,
  out: CameraProfile,
): CameraProfile {
  out.distance = lerp(a.distance, b.distance, t);
  out.height = lerp(a.height, b.height, t);
  out.lookHeight = lerp(a.lookHeight, b.lookHeight, t);
  out.lookAhead = lerp(a.lookAhead, b.lookAhead, t);
  out.fov = lerp(a.fov, b.fov, t);
  out.fovBoost = lerp(a.fovBoost, b.fovBoost, t);
  out.followDamping = lerp(a.followDamping, b.followDamping, t);
  out.rotationDamping = lerp(a.rotationDamping, b.rotationDamping, t);
  return out;
}

/**
 * Third-person chase camera. Smooth follow with mouse-look offsets that recentre after a delay,
 * speed-based FOV, subtle banking, trauma-based shake and terrain clearance.
 */
export class FollowCamera {
  readonly pose = createCameraPose();
  private yaw = 0;
  private yawOffset = 0;
  private pitchOffset = 0;
  private idle = 0;
  private trauma = 0;
  private time = 0;
  private initialized = false;
  private readonly noise = createNoise2D(4242);
  private readonly profile: CameraProfile = {
    distance: 0,
    height: 0,
    lookHeight: 0,
    lookAhead: 0,
    fov: 60,
    fovBoost: 0,
    followDamping: 1,
    rotationDamping: 1,
  };

  constructor(private readonly config: VehicleConfig['camera']) {}

  /** Adds screen shake (0..1). */
  addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** Snaps to the target without smoothing (used after cinematics and teleports). */
  reset(target: FollowTarget, from?: CameraPose): void {
    this.yaw = target.heading;
    this.initialized = false;
    if (from) Object.assign(this.pose, from);
  }

  update(
    dt: number,
    target: FollowTarget,
    look: { yaw: number; pitch: number },
    comfort: CameraComfort,
    fovOffset: number,
    groundHeightAt: (x: number, z: number) => number,
  ): CameraPose {
    this.time += dt;
    const p = blendProfiles(
      this.config.rover,
      this.config.flight,
      target.flightBlend,
      this.profile,
    );

    // Mouse look offsets, recentring after inactivity.
    if (look.yaw !== 0 || look.pitch !== 0) this.idle = 0;
    else this.idle += dt;
    const [minPitch, maxPitch] = this.config.pitchLimitsDeg;
    this.yawOffset += look.yaw;
    this.pitchOffset = clamp(this.pitchOffset + look.pitch, minPitch * DEG2RAD, maxPitch * DEG2RAD);
    if (this.idle > this.config.recenterDelay) {
      this.yawOffset = damp(this.yawOffset, 0, RECENTER_RATE, dt);
      this.pitchOffset = damp(this.pitchOffset, 0, RECENTER_RATE, dt);
    }

    if (!this.initialized) {
      this.yaw = target.heading;
    } else {
      this.yaw = dampAngle(this.yaw, target.heading, p.rotationDamping, dt);
    }
    const yaw = this.yaw + this.yawOffset;
    const baseElevation = Math.atan2(p.height, p.distance);
    const elevation = clamp(baseElevation + this.pitchOffset, -0.2, 1.35);
    const distance = Math.hypot(p.distance, p.height);
    const horizontal = Math.cos(elevation) * distance;

    const x = target.x - Math.sin(yaw) * horizontal;
    const z = target.z + Math.cos(yaw) * horizontal;
    let y = target.y + Math.sin(elevation) * distance;
    const ground = groundHeightAt(x, z) + this.config.minClearance;
    if (y < ground) y = ground;

    const speedRatio = clamp(target.speed / MAX_SPEED_FOR_FOV, 0, 1);
    const lookAhead = p.lookAhead * speedRatio;
    const lookX = target.x + Math.sin(target.heading) * lookAhead;
    const lookY = target.y + p.lookHeight;
    const lookZ = target.z - Math.cos(target.heading) * lookAhead;

    const pose = this.pose;
    if (!this.initialized) {
      pose.x = x;
      pose.y = y;
      pose.z = z;
      pose.lookX = lookX;
      pose.lookY = lookY;
      pose.lookZ = lookZ;
      this.initialized = true;
    } else {
      pose.x = damp(pose.x, x, p.followDamping, dt);
      pose.y = damp(pose.y, y, p.followDamping, dt);
      pose.z = damp(pose.z, z, p.followDamping, dt);
      pose.lookX = damp(pose.lookX, lookX, p.followDamping * 1.5, dt);
      pose.lookY = damp(pose.lookY, lookY, p.followDamping * 1.5, dt);
      pose.lookZ = damp(pose.lookZ, lookZ, p.followDamping * 1.5, dt);
    }
    // Never let smoothing drag the camera into the ground.
    pose.y = Math.max(pose.y, groundHeightAt(pose.x, pose.z) + this.config.minClearance);

    const motion = comfort.motionEffects && !comfort.reducedMotion;
    const targetFov = p.fov + (motion ? p.fovBoost * speedRatio : 0) + fovOffset;
    pose.fov = damp(pose.fov, targetFov, 3, dt);
    pose.roll = damp(pose.roll, motion ? -target.visualRoll * ROLL_FACTOR : 0, 4, dt);

    // Shake: trauma² for impacts, a gentle rumble for rough ground.
    this.trauma = Math.max(0, this.trauma - SHAKE_DECAY * dt);
    if (comfort.cameraShake && !comfort.reducedMotion) {
      const amount = this.trauma * this.trauma * SHAKE_AMPLITUDE + target.roughness * 0.02;
      if (amount > 0) {
        const t = this.time * SHAKE_FREQUENCY;
        pose.x += this.noise(t, 1.3) * amount;
        pose.y += this.noise(t, 7.1) * amount;
        pose.z += this.noise(t, 13.7) * amount;
      }
    }
    return pose;
  }
}
