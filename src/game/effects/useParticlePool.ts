import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { ParticlePool, type ParticlePoolOptions } from './ParticlePool';

/** Creates a particle pool bound to the component lifecycle and advances it every frame. */
export function useParticlePool(options: ParticlePoolOptions): ParticlePool {
  const { capacity, gravity, drag, additive, lift, softness, wispy, turbulence, fadeTo } = options;
  const pool = useMemo(
    () =>
      new ParticlePool({
        capacity,
        gravity,
        drag,
        additive,
        lift,
        softness,
        wispy,
        turbulence,
        fadeTo,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fadeTo is a constant per caller
    [capacity, gravity, drag, additive, lift, softness, wispy, turbulence],
  );
  const height = useThree((s) => s.size.height);
  useEffect(() => pool.setViewportHeight(height), [pool, height]);
  useEffect(() => () => pool.dispose(), [pool]);
  useFrame((_, dt) => pool.update(Math.min(dt, 0.05)));
  return pool;
}
