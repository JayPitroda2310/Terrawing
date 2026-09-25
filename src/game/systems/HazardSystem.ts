import type { VehicleMode } from '@/game/core/GameState';
import type { HazardDefinition } from '@/game/missions/MissionDefinition';

export interface HazardTransition {
  hazard: HazardDefinition;
  entered: boolean;
}

/** Tracks which hazard zones the vehicle is inside and how much damage they deal. */
export class HazardSystem {
  private readonly inside = new Set<string>();
  /** Hazards whose effect is currently active (inside and dealing damage). */
  readonly activeHazards = new Set<string>();

  constructor(readonly hazards: readonly HazardDefinition[]) {}

  /**
   * Updates membership. Returns total damage per second at this position/mode and appends enter/exit
   * transitions to `transitions`.
   */
  update(x: number, z: number, mode: VehicleMode, transitions: HazardTransition[]): number {
    transitions.length = 0;
    this.activeHazards.clear();
    let damage = 0;
    for (const hazard of this.hazards) {
      const inside = Math.hypot(x - hazard.position[0], z - hazard.position[1]) <= hazard.radius;
      const wasInside = this.inside.has(hazard.id);
      if (inside !== wasInside) {
        if (inside) this.inside.add(hazard.id);
        else this.inside.delete(hazard.id);
        transitions.push({ hazard, entered: inside });
      }
      if (inside) {
        const dps = hazard.damagePerSecond[mode];
        if (dps > 0) {
          this.activeHazards.add(hazard.id);
          damage += dps;
        }
      }
    }
    return damage;
  }

  isInside(id: string): boolean {
    return this.inside.has(id);
  }
}
