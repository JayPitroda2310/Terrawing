import { createContext, useContext } from 'react';
import type { GameManager } from '@/game/core/GameManager';

export const GameManagerContext = createContext<GameManager | null>(null);

export function useGameManager(): GameManager {
  const manager = useContext(GameManagerContext);
  if (!manager) throw new Error('useGameManager must be used inside <GameManagerContext.Provider>');
  return manager;
}
