import {
  AdditiveBlending,
  BackSide,
  DoubleSide,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
} from 'three';
import {
  BRAND_GREEN,
  createCarbonTexture,
  createLiveryTexture,
  createLogoTexture,
  createSidewallTexture,
} from './vehicleTextures';
import { createWearUniforms, wearAll } from './vehicleWear';

/**
 * TerraWing livery: clear-coated graphite paint, carbon-fibre arms, brand-green accents, white
 * markings and cyan/green status lights.
 */
export function createVehicleMaterials() {
  const wear = createWearUniforms();
  const materials = {
    hull: new MeshPhysicalMaterial({
      color: '#262c31',
      roughness: 0.42,
      metalness: 0.25,
      clearcoat: 0.6,
      clearcoatRoughness: 0.25,
    }),
    shell: new MeshPhysicalMaterial({
      color: '#303840',
      roughness: 0.4,
      metalness: 0.25,
      clearcoat: 0.6,
      clearcoatRoughness: 0.25,
    }),
    duct: new MeshPhysicalMaterial({
      color: '#262c31',
      roughness: 0.4,
      metalness: 0.25,
      clearcoat: 0.5,
      clearcoatRoughness: 0.3,
      side: DoubleSide,
    }),
    trim: new MeshStandardMaterial({ color: '#111416', roughness: 0.55, metalness: 0.5 }),
    /** Inside of the wheel arches (seen from under / inside the arch). */
    liner: new MeshStandardMaterial({ color: '#121416', roughness: 0.92, side: BackSide }),
    /** 3D-printed green frame parts (matte PLA, logo green). */
    frame: new MeshStandardMaterial({ color: '#6fcf4a', roughness: 0.72, metalness: 0 }),
    battery: new MeshStandardMaterial({ color: '#1f2326', roughness: 0.6 }),
    connector: new MeshStandardMaterial({ color: '#e8b21a', roughness: 0.5 }),
    wireRed: new MeshStandardMaterial({ color: '#b3231c', roughness: 0.5 }),
    wireBlack: new MeshStandardMaterial({ color: '#141414', roughness: 0.5 }),
    /** Clear-coated carbon weave. */
    carbon: new MeshPhysicalMaterial({
      map: createCarbonTexture(),
      roughness: 0.38,
      metalness: 0.25,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
    }),
    /** Brushed, anodised aluminium. */
    aluminium: new MeshPhysicalMaterial({
      color: '#a3abb0',
      roughness: 0.34,
      metalness: 0.92,
      anisotropy: 0.6,
    }),
    blade: new MeshStandardMaterial({ color: '#1a1d1f', roughness: 0.35, metalness: 0.2 }),
    accent: new MeshStandardMaterial({ color: BRAND_GREEN, roughness: 0.4, metalness: 0.1 }),
    logo: new MeshStandardMaterial({
      map: createLogoTexture(),
      transparent: true,
      roughness: 0.4,
      metalness: 0.1,
    }),
    white: new MeshStandardMaterial({ color: '#e4e8ea', roughness: 0.45 }),
    livery: new MeshStandardMaterial({
      map: createLiveryTexture(),
      transparent: true,
      roughness: 0.4,
      metalness: 0.1,
    }),
    glass: new MeshPhysicalMaterial({
      color: '#060b0e',
      roughness: 0.03,
      metalness: 0.2,
      clearcoat: 1,
    }),
    /** Tyre carcass with moulded sidewall lettering (height map on the lathe UVs). */
    tire: new MeshStandardMaterial({
      color: '#1b1d1e',
      roughness: 0.88,
      side: DoubleSide,
      bumpMap: createSidewallTexture(),
      bumpScale: 2.5,
    }),
    tread: new MeshStandardMaterial({ color: '#191b1c', roughness: 0.93 }),
    rim: new MeshStandardMaterial({
      color: '#2b3034',
      roughness: 0.35,
      metalness: 0.75,
      side: DoubleSide,
    }),
    hub: new MeshStandardMaterial({ color: '#3a4046', roughness: 0.3, metalness: 0.85 }),
    cyan: new MeshStandardMaterial({
      color: '#04191a',
      emissive: '#42e3db',
      emissiveIntensity: 2.4,
    }),
    green: new MeshStandardMaterial({
      color: '#041a08',
      emissive: '#4dff7a',
      emissiveIntensity: 2.4,
    }),
    red: new MeshStandardMaterial({
      color: '#1a0404',
      emissive: '#ff3322',
      emissiveIntensity: 2.4,
    }),
    headlight: new MeshStandardMaterial({
      color: '#ffffff',
      emissive: '#f2f6ff',
      emissiveIntensity: 3,
    }),
    ductGlow: new MeshStandardMaterial({
      color: '#04191a',
      emissive: '#42e3db',
      emissiveIntensity: 1,
    }),
    medical: new MeshStandardMaterial({ color: '#e9ecec', roughness: 0.5 }),
    rotorBlur: new MeshBasicMaterial({
      color: '#9aa4a8',
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      side: DoubleSide,
    }),
    lightCone: new MeshBasicMaterial({
      color: '#eaf2ff',
      transparent: true,
      opacity: 0.05,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    }),
  };
  // Used, not showroom: grain, fading, mud from the ground up, seams, brushed metal, wet look.
  wearAll(materials, wear, {
    hull: { mud: 0.55, grain: 1, variation: 0.08, seams: true },
    shell: { mud: 0.5, grain: 1, variation: 0.08 },
    duct: { mud: 0.3, grain: 0.8, variation: 0.08 },
    trim: { mud: 0.6, grain: 1, variation: 0.1 },
    liner: { mud: 0.9, grain: 1.5, variation: 0.1 },
    frame: { mud: 0.5, grain: 1.2, variation: 0.08 },
    carbon: { mud: 0.25, grain: 0.2, variation: 0.05 },
    aluminium: { mud: 0.3, grain: 0.3, variation: 0.06, brushed: true },
    white: { mud: 0.4, grain: 0.6, variation: 0.05 },
    tire: { mud: 0.55, grain: 1.5, variation: 0.08 },
    tread: { mud: 0.65, grain: 1.8, variation: 0.1 },
    rim: { mud: 0.45, grain: 0.5, variation: 0.08 },
    hub: { mud: 0.35, grain: 0.4, variation: 0.06, brushed: true },
    battery: { mud: 0.3, grain: 0.8, variation: 0.08 },
  });
  return Object.assign(materials, { wear });
}

export type VehicleMaterials = ReturnType<typeof createVehicleMaterials>;
