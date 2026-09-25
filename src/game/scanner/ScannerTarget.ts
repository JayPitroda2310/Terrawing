import type { ScanCategory } from '@/game/missions/MissionDefinition';

export interface ScannerTarget {
  readonly id: string;
  /** True category, revealed once classified. */
  readonly category: ScanCategory;
  readonly label: string;
  readonly identity: string;
  readonly position: { x: number; y: number; z: number };
  /** Persistent targets keep their marker after discovery (survivors, objectives, hazards). */
  readonly persistent: boolean;
  discovered: boolean;
  classified: boolean;
  /** Session time the target was last pinged by a pulse. */
  lastPing: number;
  /** When false the target no longer needs a marker (e.g. survivor already secured). */
  active: boolean;
}

export interface CategoryStyle {
  readonly label: string;
  readonly color: string;
  /** Shape glyph so categories are distinguishable without colour. */
  readonly glyph: string;
}

/** Visual language for scanner categories. Every category has a unique glyph as well as colour. */
export const CATEGORY_STYLES: Readonly<Record<ScanCategory, CategoryStyle>> = {
  SURVIVOR: { label: 'SURVIVOR', color: '#5fdc7c', glyph: '✚' },
  MEDICAL_SUPPLY: { label: 'MEDICAL', color: '#4ea4ff', glyph: '■' },
  HAZARD: { label: 'HAZARD', color: '#ff4d4d', glyph: '▲' },
  VEHICLE: { label: 'VEHICLE', color: '#ffb938', glyph: '◆' },
  UNKNOWN_SIGNAL: { label: 'UNKNOWN', color: '#b58cff', glyph: '?' },
  OBJECTIVE: { label: 'OBJECTIVE', color: '#e8eef2', glyph: '⬡' },
};

/** Category to display: unclassified targets show as UNKNOWN_SIGNAL. */
export function displayCategory(target: ScannerTarget): ScanCategory {
  return target.classified ? target.category : 'UNKNOWN_SIGNAL';
}
