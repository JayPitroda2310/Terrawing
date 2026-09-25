import type { ZoneDefinition } from '@/game/missions/MissionDefinition';
import type { TerrainQuery } from '@/game/environment/TerrainQuery';

/** Runtime wrapper around a mission zone (base, extraction LZ, scan area). */
export class RescuePoint {
  readonly position: { x: number; y: number; z: number };

  constructor(
    readonly definition: ZoneDefinition,
    terrain: TerrainQuery,
  ) {
    const [x, z] = definition.position;
    this.position = { x, y: terrain.heightAt(x, z), z };
  }

  get id(): string {
    return this.definition.id;
  }

  get charging(): boolean {
    return this.definition.charging;
  }

  contains(x: number, z: number, margin = 0): boolean {
    return Math.hypot(x - this.position.x, z - this.position.z) <= this.definition.radius + margin;
  }

  distanceTo(x: number, z: number): number {
    return Math.hypot(x - this.position.x, z - this.position.z);
  }
}
