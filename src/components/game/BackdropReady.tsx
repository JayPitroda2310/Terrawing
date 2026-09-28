import { useProgress } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import { useLoadStore } from '@/services/loading/loadProgress';
import { createWarmupGate, stepWarmupGate } from '@/services/loading/sceneWarmup';
import { GRAPHICS_PROFILES } from '@/data/graphics';
import { useSettingsStore } from '@/store/settingsStore';
import { useGameStore } from '@/store/gameStore';

/** Frames rendered once the shaders are ready, before the menu is revealed. */
const SETTLE_FRAMES = 6;

/**
 * Website loading: keeps the 3D menu backdrop undrawn while its files download and its shaders
 * compile in the background (so the page and the loading bar stay responsive), then lets it
 * render a few frames and signals that the loading screen can lift onto a smoothly running scene.
 */
export function BackdropReady() {
  const gate = useMemo(createWarmupGate, []);
  useFrame(({ gl, scene, camera }) => {
    const store = useGameStore.getState();
    if (store.backdropReady || store.session) return;
    const { active, total } = useProgress.getState();
    const report = (build: number) => useLoadStore.setState({ build });
    const bloom = GRAPHICS_PROFILES[useSettingsStore.getState().settings.graphics].bloom;
    if (
      stepWarmupGate(gate, gl, scene, camera, active || total === 0, SETTLE_FRAMES, report, bloom)
    )
      store.setBackdropReady(true);
  });
  return null;
}
