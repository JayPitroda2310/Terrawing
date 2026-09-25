import { CanvasTexture, Color, MeshStandardMaterial, SRGBColorSpace, type Texture } from 'three';
import { withScanBand } from '@/game/effects/shaderChunks';

/**
 * Shared material palette for props and structures. Created lazily and reused so the scene has a
 * small number of distinct materials (fewer shader programs, better batching).
 */
const cache = new Map<string, MeshStandardMaterial>();

interface MaterialSpec {
  color: string;
  roughness?: number;
  metalness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  flatShading?: boolean;
  scan?: boolean;
}

const SPECS = {
  wood: { color: '#5b4331', roughness: 0.85, scan: true },
  woodDark: { color: '#3a2b20', roughness: 0.9, scan: true },
  roof: { color: '#2a2c2f', roughness: 0.7, scan: true },
  concrete: { color: '#7c7d78', roughness: 0.9, scan: true },
  concreteDark: { color: '#4d4f4d', roughness: 0.92, scan: true },
  steel: { color: '#5b6166', roughness: 0.45, metalness: 0.6, scan: true },
  steelDark: { color: '#2c3135', roughness: 0.5, metalness: 0.5, scan: true },
  containerBlue: { color: '#2d4957', roughness: 0.6, metalness: 0.3, scan: true },
  tentOrange: { color: '#b9481f', roughness: 0.85, scan: true },
  tentWhite: { color: '#d5d7d4', roughness: 0.85 },
  carRed: { color: '#6b2a23', roughness: 0.45, metalness: 0.4, scan: true },
  glass: { color: '#1b2226', roughness: 0.08, metalness: 0.3 },
  rubber: { color: '#141516', roughness: 0.8 },
  rock: { color: '#65645f', roughness: 0.82, flatShading: true, scan: true },
  mud: { color: '#3d3226', roughness: 0.95, flatShading: true, scan: true },
  bark: { color: '#3b2e24', roughness: 0.95, scan: true },
  windowWarm: { color: '#2a2016', emissive: '#ffad5c', emissiveIntensity: 1.3 },
  lampWhite: { color: '#ffffff', emissive: '#fff4de', emissiveIntensity: 2.6 },
  beaconRed: { color: '#300', emissive: '#ff2a1f', emissiveIntensity: 3 },
  beaconGreen: { color: '#030', emissive: '#3dff6e', emissiveIntensity: 3 },
  cyanGlow: { color: '#062224', emissive: '#40e0d8', emissiveIntensity: 2 },
  orangePaint: { color: '#e0601c', roughness: 0.55 },
  whitePaint: { color: '#dfe3e4', roughness: 0.6 },
} as const satisfies Record<string, MaterialSpec>;

export type MaterialName = keyof typeof SPECS;

export function getMaterial(name: MaterialName): MeshStandardMaterial {
  let material = cache.get(name);
  if (!material) {
    const spec: MaterialSpec = SPECS[name];
    material = new MeshStandardMaterial({
      color: new Color(spec.color),
      roughness: spec.roughness ?? 0.7,
      metalness: spec.metalness ?? 0,
      emissive: new Color(spec.emissive ?? '#000000'),
      emissiveIntensity: spec.emissiveIntensity ?? 1,
      transparent: spec.transparent ?? false,
      opacity: spec.opacity ?? 1,
      flatShading: spec.flatShading ?? false,
    });
    if (spec.scan) withScanBand(material, name);
    cache.set(name, material);
  }
  return material;
}

const textureCache = new Map<string, Texture>();

/** Procedural decal textures drawn on a canvas (landing pad markings). */
export function getPadTexture(kind: 'helipad' | 'extraction'): Texture {
  const cached = textureCache.get(kind);
  if (cached) return cached;
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const c = size / 2;
    ctx.fillStyle = '#3b3e41';
    ctx.fillRect(0, 0, size, size);
    // Subtle grime.
    for (let i = 0; i < 1400; i++) {
      ctx.fillStyle = `rgba(${Math.random() > 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.04})`;
      ctx.fillRect(
        Math.random() * size,
        Math.random() * size,
        6 + Math.random() * 20,
        6 + Math.random() * 20,
      );
    }
    ctx.lineWidth = 18;
    if (kind === 'helipad') {
      ctx.strokeStyle = '#e6e8e6';
      ctx.beginPath();
      ctx.arc(c, c, size * 0.4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#e6e8e6';
      const w = size * 0.07;
      const h = size * 0.36;
      ctx.fillRect(c - size * 0.16, c - h / 2, w, h);
      ctx.fillRect(c + size * 0.16 - w, c - h / 2, w, h);
      ctx.fillRect(c - size * 0.16, c - w / 2, size * 0.32, w);
    } else {
      ctx.strokeStyle = '#ff6a1a';
      ctx.setLineDash([46, 26]);
      ctx.beginPath();
      ctx.arc(c, c, size * 0.42, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = '#e6e8e6';
      ctx.lineWidth = 22;
      ctx.beginPath();
      ctx.moveTo(c - size * 0.18, c - size * 0.18);
      ctx.lineTo(c + size * 0.18, c + size * 0.18);
      ctx.moveTo(c + size * 0.18, c - size * 0.18);
      ctx.lineTo(c - size * 0.18, c + size * 0.18);
      ctx.stroke();
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  textureCache.set(kind, texture);
  return texture;
}
