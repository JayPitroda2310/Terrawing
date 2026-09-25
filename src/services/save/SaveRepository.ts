import type { SaveData } from './saveSchema';

/**
 * Persistence boundary. Gameplay and UI code depend only on this interface, so localStorage can
 * later be swapped for Supabase, Firebase or a custom backend without touching game code.
 */
export interface SaveRepository {
  load(): Promise<SaveData>;
  save(data: SaveData): Promise<void>;
  clear(): Promise<void>;
}
