import type { VehicleMode } from '@/game/core/GameState';

export interface Interactable {
  readonly id: string;
  /** Verb shown on the prompt, e.g. "ASSIST SURVIVOR A". */
  readonly label: string;
  /** Text shown while the interaction runs. */
  readonly progressLabel: string;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly radius: number;
  readonly duration: number;
  readonly requiresMode: VehicleMode | null;
  /** Checked every step; unavailable interactables are ignored. */
  isAvailable(): boolean;
  onComplete(): void;
}

export interface InteractionPrompt {
  interactable: Interactable;
  /** Set when the player is in range but cannot interact yet (e.g. must land first). */
  blockedReason: string | null;
}

export interface ActiveInteraction {
  interactable: Interactable;
  elapsed: number;
}

/**
 * Finds the nearest usable interactable and runs timed interactions. The E key is context
 * sensitive: it interacts when a prompt is available, otherwise it transforms.
 */
export class InteractionSystem {
  private readonly interactables: Interactable[] = [];
  prompt: InteractionPrompt | null = null;
  active: ActiveInteraction | null = null;

  register(interactable: Interactable): void {
    this.interactables.push(interactable);
  }

  /** Updates the prompt for the vehicle's current position and mode. */
  updatePrompt(x: number, y: number, z: number, mode: VehicleMode | null, grounded: boolean): void {
    let best: Interactable | null = null;
    let bestDistance = Infinity;
    for (const interactable of this.interactables) {
      if (!interactable.isAvailable()) continue;
      const dx = interactable.position.x - x;
      const dz = interactable.position.z - z;
      const horizontal = Math.hypot(dx, dz);
      // Flight prompts appear from a little further away so players know to land here.
      const reach = interactable.radius * (mode === 'FLIGHT' ? 2.5 : 1);
      if (horizontal > reach || Math.abs(interactable.position.y - y) > 25) continue;
      if (horizontal < bestDistance) {
        best = interactable;
        bestDistance = horizontal;
      }
    }
    if (!best) {
      this.prompt = null;
      return;
    }
    let blockedReason: string | null = null;
    if (mode === null) blockedReason = 'SYSTEMS BUSY';
    else if (best.requiresMode && best.requiresMode !== mode) {
      blockedReason =
        best.requiresMode === 'ROVER' ? 'LAND AND TRANSFORM TO ROVER' : 'SWITCH TO FLIGHT';
    } else if (!grounded && best.requiresMode === 'ROVER')
      blockedReason = 'VEHICLE MUST BE GROUNDED';
    else if (bestDistance > best.radius) blockedReason = 'MOVE CLOSER';
    this.prompt = { interactable: best, blockedReason };
  }

  /** Starts the prompted interaction if possible. */
  tryStart(): Interactable | null {
    if (this.active || !this.prompt || this.prompt.blockedReason) return null;
    this.active = { interactable: this.prompt.interactable, elapsed: 0 };
    return this.prompt.interactable;
  }

  /** Advances the active interaction. Returns the interactable when it completes. */
  update(dt: number): Interactable | null {
    if (!this.active) return null;
    this.active.elapsed += dt;
    if (this.active.elapsed < this.active.interactable.duration) return null;
    const done = this.active.interactable;
    this.active = null;
    this.prompt = null;
    done.onComplete();
    return done;
  }

  cancel(): Interactable | null {
    const cancelled = this.active?.interactable ?? null;
    this.active = null;
    return cancelled;
  }

  get progress(): number {
    if (!this.active) return 0;
    return Math.min(1, this.active.elapsed / this.active.interactable.duration);
  }
}
