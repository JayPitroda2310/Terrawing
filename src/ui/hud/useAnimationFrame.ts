import { useEffect, useRef } from 'react';

/**
 * Runs a callback every animation frame without re-rendering. Used by HUD widgets that animate
 * continuously (compass) and write directly to DOM refs.
 */
export function useAnimationFrame(callback: (dt: number) => void): void {
  const saved = useRef(callback);
  useEffect(() => {
    saved.current = callback;
  });
  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      saved.current(Math.min(0.1, (now - last) / 1000));
      last = now;
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);
}
