import { useProgress } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useBeforePhysicsStep } from '@react-three/rapier';
import { useEffect, useMemo } from 'react';
import { Vector3 } from 'three';
import { GameAudioDirector } from '@/game/audio/GameAudioDirector';
import { useLoadStore } from '@/services/loading/loadProgress';
import { createWarmupGate, showScene, stepWarmupGate } from '@/services/loading/sceneWarmup';
import { useGameStore } from '@/store/gameStore';
import type { GameManager } from './GameManager';
import type { GameSession } from './GameSession';
import { GRAPHICS_PROFILES } from '@/data/graphics';
import { useSettingsStore } from '@/store/settingsStore';
import { Screen } from './GameState';

/**
 * Frames to render, once everything has loaded, before handing control over: the first frames
 * build and compile the world's shaders, so they happen behind the loading screen.
 */
const WARMUP_FRAMES = 6;

/**
 * Bridges the render loop and the simulation:
 *  - fixed-step gameplay runs immediately before each physics step (paused physics = paused game)
 *  - per-frame work (telemetry publishing, audio listener) runs in useFrame
 */
export function GameLoop({ session, manager }: { session: GameSession; manager: GameManager }) {
  const gate = useMemo(createWarmupGate, [session]);
  const director = useMemo(() => new GameAudioDirector(session, manager.audio), [session, manager]);
  const forward = useMemo(() => new Vector3(), []);
  const listener = useMemo(() => ({ x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: -1 }), []);

  useEffect(() => () => director.dispose(), [director]);

  useBeforePhysicsStep((world) => {
    session.fixedUpdate(world.timestep);
  });

  useFrame(({ camera, gl, scene }, dt) => {
    manager.onFrame(dt);

    if (useGameStore.getState().screen === Screen.LOADING) {
      // Behind the loading screen the world is prepared without drawing it: files load, then
      // every shader compiles in the background, then a few warm-up frames — so the page and
      // its progress bar stay responsive and the first frames of play never stall.
      const busy = !session.ready || useProgress.getState().active;
      const report = (build: number) => useLoadStore.setState({ build });
      const bloom = GRAPHICS_PROFILES[useSettingsStore.getState().settings.graphics].bloom;
      if (stepWarmupGate(gate, gl, scene, camera, busy, WARMUP_FRAMES, report, bloom))
        manager.onWorldReady(session);
      return;
    }
    showScene(camera);

    camera.getWorldDirection(forward);
    listener.x = camera.position.x;
    listener.y = camera.position.y;
    listener.z = camera.position.z;
    listener.fx = forward.x;
    listener.fy = forward.y;
    listener.fz = forward.z;
    if (manager.audio.ready && session.phase !== 'loading')
      director.update(Math.min(dt, 0.1), listener);
  });

  return null;
}
