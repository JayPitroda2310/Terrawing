import { useFrame } from '@react-three/fiber';
import { useBeforePhysicsStep } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import { Vector3 } from 'three';
import { GameAudioDirector } from '@/game/audio/GameAudioDirector';
import { useGameStore } from '@/store/gameStore';
import type { GameManager } from './GameManager';
import type { GameSession } from './GameSession';
import { Screen } from './GameState';

/** Frames to render after the vehicle attaches before handing control over (shader warm-up). */
const WARMUP_FRAMES = 8;

/**
 * Bridges the render loop and the simulation:
 *  - fixed-step gameplay runs immediately before each physics step (paused physics = paused game)
 *  - per-frame work (telemetry publishing, audio listener) runs in useFrame
 */
export function GameLoop({ session, manager }: { session: GameSession; manager: GameManager }) {
  const warmup = useRef(0);
  const director = useMemo(() => new GameAudioDirector(session, manager.audio), [session, manager]);
  const forward = useMemo(() => new Vector3(), []);
  const listener = useMemo(() => ({ x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: -1 }), []);

  useEffect(() => () => director.dispose(), [director]);

  useBeforePhysicsStep((world) => {
    session.fixedUpdate(world.timestep);
  });

  useFrame(({ camera }, dt) => {
    manager.onFrame(dt);

    if (useGameStore.getState().screen === Screen.LOADING && session.ready) {
      warmup.current++;
      if (warmup.current >= WARMUP_FRAMES) manager.onWorldReady(session);
    }

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
