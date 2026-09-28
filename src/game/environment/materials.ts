import {
  CanvasTexture,
  Color,
  MeshStandardMaterial,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  type Texture,
} from 'three';
import { STRUCTURE_TEXTURES } from '@/data/visualAssets';
import { createRandom } from '@/utils/math/random';
import { withScanBand, withTriplanar } from '@/game/effects/shaderChunks';

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
  /** Photo texture projected in world space; `scale` = metres per repeat. */
  photo?: { texture: keyof typeof STRUCTURE_TEXTURES; scale: number };
}

const SPECS = {
  wood: { color: '#c9b8a6', roughness: 0.85, scan: true, photo: { texture: 'planks', scale: 2.4 } },
  woodDark: {
    color: '#8a7b6c',
    roughness: 0.9,
    scan: true,
    photo: { texture: 'planks', scale: 2.4 },
  },
  roof: {
    color: '#b8aaa0',
    roughness: 0.6,
    metalness: 0.2,
    scan: true,
    photo: { texture: 'roofIron', scale: 2 },
  },
  concrete: {
    color: '#c4c4c0',
    roughness: 0.9,
    scan: true,
    photo: { texture: 'concrete', scale: 4 },
  },
  concreteDark: {
    color: '#8e8f8c',
    roughness: 0.92,
    scan: true,
    photo: { texture: 'concrete', scale: 4 },
  },
  stone: {
    color: '#b0aca6',
    roughness: 0.9,
    scan: true,
    photo: { texture: 'stoneWall', scale: 2.5 },
  },
  steel: { color: '#5b6166', roughness: 0.45, metalness: 0.6, scan: true },
  steelDark: { color: '#2c3135', roughness: 0.5, metalness: 0.5, scan: true },
  containerBlue: {
    color: '#4f7a8e',
    roughness: 0.55,
    metalness: 0.35,
    scan: true,
    photo: { texture: 'containerIron', scale: 2.2 },
  },
  tentOrange: {
    color: '#e0612c',
    roughness: 0.9,
    scan: true,
    photo: { texture: 'canvas', scale: 1.2 },
  },
  tentWhite: { color: '#e2e3df', roughness: 0.9, photo: { texture: 'canvas', scale: 1.2 } },
  carRed: { color: '#6b2a23', roughness: 0.45, metalness: 0.4, scan: true },
  glass: { color: '#1b2226', roughness: 0.08, metalness: 0.3 },
  rubber: { color: '#141516', roughness: 0.8 },
  rock: { color: '#65645f', roughness: 0.82, flatShading: true, scan: true },
  mud: { color: '#3d3226', roughness: 0.95, flatShading: true, scan: true },
  bark: { color: '#9a8878', roughness: 0.95, scan: true, photo: { texture: 'bark', scale: 1.6 } },
  fleece: { color: '#3a3f46', roughness: 0.95, photo: { texture: 'fleece', scale: 0.25 } },
  windowWarm: { color: '#2a2016', emissive: '#ffad5c', emissiveIntensity: 1.3 },
  lampWhite: { color: '#ffffff', emissive: '#fff4de', emissiveIntensity: 2.6 },
  beaconRed: { color: '#300', emissive: '#ff2a1f', emissiveIntensity: 3 },
  beaconGreen: { color: '#030', emissive: '#3dff6e', emissiveIntensity: 3 },
  cyanGlow: { color: '#062224', emissive: '#40e0d8', emissiveIntensity: 2 },
  orangePaint: { color: '#e0601c', roughness: 0.55 },
  whitePaint: { color: '#dfe3e4', roughness: 0.6 },
  plaster: {
    color: '#e2dccf',
    roughness: 0.92,
    scan: true,
    photo: { texture: 'plaster', scale: 3 },
  },
  plasterWarm: {
    color: '#e6c9a6',
    roughness: 0.92,
    scan: true,
    photo: { texture: 'plaster', scale: 3 },
  },
  plasterGrey: {
    color: '#b9bcb8',
    roughness: 0.92,
    scan: true,
    photo: { texture: 'plaster', scale: 3 },
  },
  brick: { color: '#d6c8c0', roughness: 0.9, scan: true, photo: { texture: 'brick', scale: 1.4 } },
  roofClay: {
    color: '#d8cabe',
    roughness: 0.8,
    scan: true,
    photo: { texture: 'roofClay', scale: 1.6 },
  },
  roofSlate: {
    color: '#c4c0b8',
    roughness: 0.75,
    scan: true,
    photo: { texture: 'roofSlate', scale: 1.8 },
  },
  timber: {
    color: '#b8a898',
    roughness: 0.9,
    scan: true,
    photo: { texture: 'weatheredPlanks', scale: 2 },
  },
  trimWhite: { color: '#e9e8e2', roughness: 0.55 },
  shutterGreen: {
    color: '#6f8f72',
    roughness: 0.7,
    photo: { texture: 'planks', scale: 1.2 },
  },
  shutterBlue: {
    color: '#6f86a0',
    roughness: 0.7,
    photo: { texture: 'planks', scale: 1.2 },
  },
  shutterRed: {
    color: '#a8645a',
    roughness: 0.7,
    photo: { texture: 'planks', scale: 1.2 },
  },
  gutter: { color: '#4a4f52', roughness: 0.45, metalness: 0.6 },
  rebar: { color: '#6b4a36', roughness: 0.7, metalness: 0.5 },
  windowDark: { color: '#161b1f', roughness: 0.05, metalness: 0.6 },
  sandbag: { color: '#b5a383', roughness: 0.95, photo: { texture: 'canvas', scale: 0.6 } },
  rope: { color: '#d9d2bd', roughness: 0.9 },
  nylonGreen: { color: '#3f6a3c', roughness: 0.55 },
  nylonBlue: { color: '#2e5b8c', roughness: 0.55 },
  nylonGrey: { color: '#5d6166', roughness: 0.6 },
  tentInterior: { color: '#141210', roughness: 1 },
  lampWarm: { color: '#fff3dc', emissive: '#ffc070', emissiveIntensity: 2.2 },
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
    if (spec.photo) {
      const source = STRUCTURE_TEXTURES[spec.photo.texture];
      material.map = loadTexture(source.diffuse, true);
      material.normalMap = loadTexture(source.normal, false);
      withTriplanar(material, 1 / spec.photo.scale, name);
    }
    cache.set(name, material);
  }
  return material;
}

const textureLoader = new TextureLoader();
const photoCache = new Map<string, Texture>();

/** Loads (once) a repeating photo texture; materials render untextured until it arrives. */
function loadTexture(url: string, color: boolean): Texture {
  let texture = photoCache.get(url);
  if (!texture) {
    texture = textureLoader.load(url);
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.colorSpace = color ? SRGBColorSpace : NoColorSpace;
    texture.anisotropy = 4;
    photoCache.set(url, texture);
  }
  return texture;
}

const textureCache = new Map<string, Texture>();

/** Procedural decal textures drawn on a canvas (landing pad markings). */
/** Pad markings canvas covers the pad's full diameter. */
const PAD_DIAMETER_M = 22;

/**
 * Painted landing-pad markings on a transparent canvas (the concrete shows through): heliport
 * layout after ICAO Annex 14 — white TLOF edge line, yellow touchdown/positioning circle, white
 * "H" and a boxed weight limit — or an extraction LZ with a dashed orange/white edge and "LZ".
 * The paint is worn, with skid/tyre scuffs and oil stains.
 */
export function getPadTexture(kind: 'helipad' | 'extraction'): Texture {
  const cached = textureCache.get(kind);
  if (cached) return cached;
  const size = 2048;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const px = size / PAD_DIAMETER_M;
    const c = size / 2;
    const random = createRandom(kind === 'helipad' ? 11 : 23);
    const ring = (radius: number, width: number, color: string, dash: number[] = []) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width * px;
      ctx.setLineDash(dash.map((d) => d * px));
      ctx.beginPath();
      ctx.arc(c, c, radius * px, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    };
    const rect = (x: number, y: number, w: number, h: number, color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(c + x * px, c + y * px, w * px, h * px);
    };
    const text = (value: string, y: number, height: number, color: string) => {
      ctx.fillStyle = color;
      ctx.font = `bold ${height * px}px "Arial Narrow", Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(value, c, c + y * px);
    };
    const white = '#eceee9';
    const yellow = '#f0bf2a';
    if (kind === 'helipad') {
      ring(10.05, 0.3, white);
      ring(3.75, 0.5, yellow);
      // "H": 3 m tall, 1.8 m wide, 0.4 m strokes.
      rect(-0.9, -1.5, 0.4, 3, white);
      rect(0.5, -1.5, 0.4, 3, white);
      rect(-0.9, -0.2, 1.8, 0.4, white);
      // Weight limit box (tonnes) and the heliport name.
      ctx.strokeStyle = white;
      ctx.lineWidth = 0.12 * px;
      ctx.strokeRect(c - 1.1 * px, c + 5.4 * px, 2.2 * px, 1.1 * px);
      text('4.5t', 5.97, 0.8, white);
      text('TW-1 BASE', -6.3, 0.9, white);
    } else {
      ring(10.05, 0.5, '#f26a1b', [1.2, 1.2]);
      ring(10.05, 0.5, white, [0, 1.2, 1.2, 0]);
      ring(3.75, 0.4, yellow);
      text('LZ', 0.15, 3.2, white);
    }
    // Weathering: flecks of paint worn away...
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 9000; i++) {
      const r = random() * 1.6 + 0.4;
      ctx.fillStyle = `rgba(0,0,0,${0.25 + random() * 0.6})`;
      ctx.beginPath();
      ctx.arc(random() * size, random() * size, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // ...and worn tracks where skids and tyres scrub the paint.
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 26; i++) {
      const angle = random() * Math.PI * 2;
      const radius = (1 + random() * 5) * px;
      ctx.strokeStyle = `rgba(20,20,18,${0.08 + random() * 0.12})`;
      ctx.lineWidth = (0.08 + random() * 0.18) * px;
      ctx.beginPath();
      ctx.arc(
        c + Math.cos(angle) * 0.8 * px,
        c + Math.sin(angle) * 0.8 * px,
        radius,
        angle,
        angle + 0.4 + random() * 0.9,
      );
      ctx.stroke();
    }
    // Oil and exhaust stains around the touchdown area.
    for (let i = 0; i < 7; i++) {
      const x = c + (random() - 0.5) * 7 * px;
      const y = c + (random() - 0.5) * 7 * px;
      const r = (0.4 + random() * 1.2) * px;
      const stain = ctx.createRadialGradient(x, y, 0, x, y, r);
      stain.addColorStop(0, 'rgba(15,14,12,0.35)');
      stain.addColorStop(1, 'rgba(15,14,12,0)');
      ctx.fillStyle = stain;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  textureCache.set(kind, texture);
  return texture;
}
