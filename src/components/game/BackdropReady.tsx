import { useProgress } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { useGameStore } from '@/store/gameStore';

/** Frames rendered after every load finishes (shaders compile in the first few), before reveal. */
const SETTLE_FRAMES = 20;

/**
 * Signals when the menu backdrop is fully loaded and has rendered a few frames, so the website's
 * loading screen can lift onto a finished, smoothly running scene.
 */
export function BackdropReady() {
  const frames = useRef(0);
  useFrame(() => {
    const store = useGameStore.getState();
    if (store.backdropReady) return;
    const { active, total } = useProgress.getState();
    if (active || total === 0) {
      frames.current = 0;
      return;
    }
    if (++frames.current >= SETTLE_FRAMES) store.setBackdropReady(true);
  });
  return null;
}
