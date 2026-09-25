import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { ParticlePool, type ParticlePoolOptions } from './ParticlePool';

/** Creates a particle pool bound to the component lifecycle and advances it every frame. */
export function useParticlePool(options: ParticlePoolOptions): ParticlePool {
  const { capacity, gravity, drag, additive, lift, softness } = options;
  const pool = useMemo(
    () => new ParticlePool({ capacity, gravity, drag, additive, lift, softness }),
    [capacity, gravity, drag, additive, lift, softness],
  );
  const height = useThree((s) => s.size.height);
  useEffect(() => pool.setViewportHeight(height), [pool, height]);
  useEffect(() => () => pool.dispose(), [pool]);
  useFrame((_, dt) => pool.update(Math.min(dt, 0.05)));
  return pool;
}
