import { useFrame, useThree } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import { PerspectiveCamera, Vector3, type Group } from 'three';
import { getSurface } from '@/data/surfaces/surfaces';
import type { GameSession } from '@/game/core/GameSession';
import type { InputManager } from '@/game/input/InputManager';
import { useSettingsStore } from '@/store/settingsStore';
import { clamp, lerp } from '@/utils/math/scalar';
import { evaluateShot, type ShotContext } from './CinematicCamera';
import { createCameraPose, FollowCamera, type CameraPose, type FollowTarget } from './FollowCamera';

const CINEMATIC_BLEND_OUT = 0.9;
const SCAN_ZOOM_DURATION = 1.2;
const IMPACT_TRAUMA_SCALE = 0.05;
const RESCUE_BLEND_RATE = 2;
/** Keep the camera this far in front of whatever blocks the view. */
const OBSTACLE_MARGIN = 0.45;
const OBSTACLE_RELAX = 3;

interface CameraRigProps {
  session: GameSession;
  input: InputManager;
  /** Interpolated visual root of TerraWing (smoother than raw physics positions). */
  getVisualRoot: () => Group | null;
}

/** Drives the scene camera: follow camera during play, cinematic shots when the gameplay asks. */
export function CameraRig({ session, input, getVisualRoot }: CameraRigProps) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const follow = useMemo(() => new FollowCamera(session.config.camera), [session]);
  const cinematicPose = useMemo(createCameraPose, []);
  const blended = useMemo(createCameraPose, []);
  const look = useMemo(() => ({ yaw: 0, pitch: 0 }), []);
  const worldPosition = useMemo(() => new Vector3(), []);
  const target = useMemo<FollowTarget>(
    () => ({ x: 0, y: 0, z: 0, heading: 0, speed: 0, flightBlend: 0, visualRoll: 0, roughness: 0 }),
    [],
  );
  const shotContext = useMemo<ShotContext>(
    () => ({
      x: 0,
      y: 0,
      z: 0,
      heading: 0,
      focusX: 0,
      focusY: 0,
      focusZ: 0,
      groundHeightAt: (x, z) => session.terrain.heightAt(x, z),
    }),
    [session],
  );
  const blend = useRef({ cinematic: 1, rescue: 0, lastShot: 'missionIntro' as string });
  const { world, rapier } = useRapier();
  const ray = useMemo(() => new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }), [rapier]);
  const obstruction = useRef(1);

  useEffect(
    () =>
      session.events.on('vehicle:impact', ({ damage }) => {
        follow.addTrauma(clamp(damage * IMPACT_TRAUMA_SCALE, 0.1, 0.8));
      }),
    [session, follow],
  );

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const state = session.vehicle.state;
    const root = getVisualRoot();
    if (root) root.getWorldPosition(worldPosition);
    else worldPosition.set(state.position.x, state.position.y, state.position.z);

    target.x = worldPosition.x;
    target.y = worldPosition.y;
    target.z = worldPosition.z;
    target.heading = state.heading;
    target.speed = state.speed;
    target.flightBlend = state.rig.armExtension;
    target.visualRoll = state.visualRoll;
    target.roughness = state.grounded
      ? getSurface(state.surface).roughness * clamp(state.speed / 10, 0, 1)
      : 0;

    const settings = useSettingsStore.getState().settings;
    input.consumeLook(dt, look);
    const scanZoom =
      session.scanner.sincePulse < SCAN_ZOOM_DURATION
        ? session.config.scanner.zoomFovDelta *
          Math.sin((session.scanner.sincePulse / SCAN_ZOOM_DURATION) * Math.PI)
        : 0;
    const followPose = follow.update(
      dt,
      target,
      look,
      {
        motionEffects: settings.motionEffects,
        cameraShake: settings.cameraShake,
        reducedMotion: settings.reducedMotion,
      },
      scanZoom,
      (x, z) => session.terrain.heightAt(x, z),
    );

    const gameplay = session.gameplay.state;
    shotContext.x = worldPosition.x;
    shotContext.y = worldPosition.y;
    shotContext.z = worldPosition.z;
    shotContext.heading = state.heading;

    let pose: CameraPose = followPose;
    if (gameplay.kind === 'CINEMATIC') {
      blend.current.cinematic = 1;
      blend.current.lastShot = gameplay.shot;
      pose = evaluateShot(gameplay.shot, session.cinematicProgress, shotContext, cinematicPose);
    } else if (blend.current.cinematic > 0) {
      blend.current.cinematic = Math.max(0, blend.current.cinematic - dt / CINEMATIC_BLEND_OUT);
      pose = mixPoses(followPose, cinematicPose, blend.current.cinematic, blended);
    }

    // Gentle orbit around the survivor while assisting ("major rescue" moment).
    const assisting =
      gameplay.kind === 'INTERACTING' && gameplay.interactionId.startsWith('secure:');
    blend.current.rescue = clamp(
      blend.current.rescue + (assisting ? dt : -dt) * RESCUE_BLEND_RATE,
      0,
      1,
    );
    if (blend.current.rescue > 0 && !settings.reducedMotion) {
      const survivorId = assisting ? gameplay.interactionId.slice('secure:'.length) : null;
      const survivor = survivorId ? session.survivors.get(survivorId) : null;
      if (survivor) {
        shotContext.focusX = survivor.position.x;
        shotContext.focusY = survivor.position.y;
        shotContext.focusZ = survivor.position.z;
      }
      const rescuePose = evaluateShot(
        'rescue',
        session.interaction.progress,
        shotContext,
        cinematicPose,
      );
      pose = mixPoses(pose, rescuePose, smooth(blend.current.rescue), blended);
    }

    // Pull the camera in front of static obstacles (trees, rocks, structures) between it and the
    // vehicle. Dynamic bodies (TerraWing itself, loose debris) are ignored.
    const dx = pose.x - pose.lookX;
    const dy = pose.y - pose.lookY;
    const dz = pose.z - pose.lookZ;
    const length = Math.hypot(dx, dy, dz);
    let allowed = 1;
    if (length > 0.5) {
      ray.origin.x = pose.lookX;
      ray.origin.y = pose.lookY;
      ray.origin.z = pose.lookZ;
      ray.dir.x = dx / length;
      ray.dir.y = dy / length;
      ray.dir.z = dz / length;
      const hit = world.castRay(
        ray,
        length,
        true,
        undefined,
        undefined,
        undefined,
        undefined,
        (collider) => Boolean(collider.parent()?.isFixed()),
      );
      if (hit) allowed = Math.max(0.12, (hit.timeOfImpact - OBSTACLE_MARGIN) / length);
    }
    obstruction.current =
      allowed < obstruction.current
        ? allowed
        : Math.min(allowed, obstruction.current + dt * OBSTACLE_RELAX);
    const k = obstruction.current;
    camera.position.set(pose.lookX + dx * k, pose.lookY + dy * k, pose.lookZ + dz * k);
    camera.up.set(0, 1, 0);
    camera.lookAt(pose.lookX, pose.lookY, pose.lookZ);
    camera.rotateZ(pose.roll);
    if (Math.abs(camera.fov - pose.fov) > 0.01) {
      camera.fov = pose.fov;
      camera.updateProjectionMatrix();
    }
  });

  return null;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function mixPoses(a: CameraPose, b: CameraPose, t: number, out: CameraPose): CameraPose {
  out.x = lerp(a.x, b.x, t);
  out.y = lerp(a.y, b.y, t);
  out.z = lerp(a.z, b.z, t);
  out.lookX = lerp(a.lookX, b.lookX, t);
  out.lookY = lerp(a.lookY, b.lookY, t);
  out.lookZ = lerp(a.lookZ, b.lookZ, t);
  out.fov = lerp(a.fov, b.fov, t);
  out.roll = lerp(a.roll, b.roll, t);
  return out;
}
