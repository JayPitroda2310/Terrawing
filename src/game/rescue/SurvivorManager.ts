import type { SurvivorDefinition } from '@/game/missions/MissionDefinition';
import type { TerrainQuery } from '@/game/environment/TerrainQuery';

export type SurvivorStatus = 'missing' | 'secured';

export interface SurvivorRuntime {
  readonly definition: SurvivorDefinition;
  readonly position: { x: number; y: number; z: number };
  status: SurvivorStatus;
  medicalDelivered: boolean;
  /** Session time the survivor was secured (drives the beacon animation). */
  securedAt: number;
}

/** Owns the runtime state of every survivor in the mission. */
export class SurvivorManager {
  readonly survivors: SurvivorRuntime[];

  constructor(definitions: readonly SurvivorDefinition[], terrain: TerrainQuery) {
    this.survivors = definitions.map((definition) => {
      const [x, z] = definition.position;
      return {
        definition,
        position: { x, y: terrain.heightAt(x, z), z },
        status: 'missing' as const,
        medicalDelivered: false,
        securedAt: -1,
      };
    });
  }

  get(id: string): SurvivorRuntime | undefined {
    return this.survivors.find((s) => s.definition.id === id);
  }

  get securedCount(): number {
    return this.survivors.filter((s) => s.status === 'secured').length;
  }

  get total(): number {
    return this.survivors.length;
  }

  secure(id: string, now: number): boolean {
    const survivor = this.get(id);
    if (!survivor || survivor.status === 'secured') return false;
    survivor.status = 'secured';
    survivor.securedAt = now;
    return true;
  }

  deliverMedical(id: string): boolean {
    const survivor = this.get(id);
    if (!survivor || !survivor.definition.needsMedical || survivor.medicalDelivered) return false;
    survivor.medicalDelivered = true;
    return true;
  }
}
