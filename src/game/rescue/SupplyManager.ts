import type { SupplyDefinition } from '@/game/missions/MissionDefinition';
import type { TerrainQuery } from '@/game/environment/TerrainQuery';

export type SupplyStatus = 'available' | 'carried' | 'delivered';

export interface SupplyRuntime {
  readonly definition: SupplyDefinition;
  readonly position: { x: number; y: number; z: number };
  status: SupplyStatus;
}

/** Tracks transportable supplies such as the medical kit. */
export class SupplyManager {
  readonly supplies: SupplyRuntime[];

  constructor(definitions: readonly SupplyDefinition[], terrain: TerrainQuery) {
    this.supplies = definitions.map((definition) => {
      const [x, z] = definition.position;
      return {
        definition,
        position: { x, y: terrain.heightAt(x, z), z },
        status: 'available' as const,
      };
    });
  }

  get(id: string): SupplyRuntime | undefined {
    return this.supplies.find((s) => s.definition.id === id);
  }

  load(id: string): boolean {
    const supply = this.get(id);
    if (!supply || supply.status !== 'available') return false;
    supply.status = 'carried';
    return true;
  }

  deliver(id: string): boolean {
    const supply = this.get(id);
    if (!supply || supply.status !== 'carried') return false;
    supply.status = 'delivered';
    return true;
  }
}
