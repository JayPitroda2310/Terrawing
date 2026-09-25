import { useMemo } from 'react';
import { BufferAttribute, Color, MeshStandardMaterial, PlaneGeometry } from 'three';
import { createNoise2D, ridged } from '@/utils/math/noise';
import { smoothstep } from '@/utils/math/scalar';

const SIZE = 4200;
const SEGMENTS = 140;
/** Inside this radius the main terrain is shown; the backdrop sinks below it. */
const INNER = 470;

interface DistantMountainsProps {
  seed: number;
  color: string;
}

/** Visual-only mountain backdrop around the playable map. No physics. */
export function DistantMountains({ seed, color }: DistantMountainsProps) {
  const geometry = useMemo(() => {
    const noise = createNoise2D(seed + 505);
    const geo = new PlaneGeometry(SIZE, SIZE, SEGMENTS, SEGMENTS);
    geo.rotateX(-Math.PI / 2);
    const position = geo.getAttribute('position');
    const colors = new Float32Array(position.count * 3);
    const rock = new Color(color);
    const snow = new Color('#cfd5d9');
    const c = new Color();
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const z = position.getZ(i);
      const r = Math.max(Math.abs(x), Math.abs(z));
      const ring = smoothstep(INNER, 900, r);
      const crest = ridged(noise, x / 520, z / 520, 5);
      const h = r < INNER + 35 ? -60 : 90 + ring * (180 + 420 * crest);
      position.setY(i, h);
      c.copy(rock).lerp(snow, smoothstep(320, 520, h));
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }, [seed, color]);

  const material = useMemo(
    () => new MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: false }),
    [],
  );

  return <mesh geometry={geometry} material={material} position={[0, -2, 0]} />;
}
