import { AdditiveBlending, DoubleSide, MeshBasicMaterial, MeshStandardMaterial } from 'three';

/** TerraWing livery: matte dark body, safety-orange accents, white markings, cyan/green status lights. */
export function createVehicleMaterials() {
  return {
    hull: new MeshStandardMaterial({ color: '#1b1f22', roughness: 0.55, metalness: 0.35 }),
    shell: new MeshStandardMaterial({ color: '#262c30', roughness: 0.5, metalness: 0.3 }),
    trim: new MeshStandardMaterial({ color: '#0f1214', roughness: 0.6, metalness: 0.5 }),
    orange: new MeshStandardMaterial({ color: '#f0621d', roughness: 0.45, metalness: 0.1 }),
    white: new MeshStandardMaterial({ color: '#e4e8ea', roughness: 0.5 }),
    glass: new MeshStandardMaterial({ color: '#081014', roughness: 0.05, metalness: 0.85 }),
    tire: new MeshStandardMaterial({ color: '#141617', roughness: 0.85 }),
    hub: new MeshStandardMaterial({ color: '#3a4046', roughness: 0.35, metalness: 0.8 }),
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
}

export type VehicleMaterials = ReturnType<typeof createVehicleMaterials>;
