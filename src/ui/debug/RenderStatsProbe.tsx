import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { useDebugStore } from '@/store/debugStore';

const SAMPLE_INTERVAL = 0.5;

/** Samples renderer statistics a couple of times per second for the debug panel. */
export function RenderStatsProbe() {
  const gl = useThree((s) => s.gl);
  const acc = useRef({ time: 0, frames: 0 });
  // Accumulate over every render pass in a frame (post-processing renders several).
  useEffect(() => {
    gl.info.autoReset = false;
    return () => {
      gl.info.autoReset = true;
    };
  }, [gl]);
  useFrame((_, dt) => {
    acc.current.time += dt;
    acc.current.frames++;
    const info = gl.info;
    if (acc.current.time < SAMPLE_INTERVAL) {
      info.reset();
      return;
    }
    useDebugStore.getState().setStats({
      fps: Math.round(acc.current.frames / acc.current.time),
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
    });
    acc.current.time = 0;
    acc.current.frames = 0;
    info.reset();
  });
  return null;
}
