import { useSyncExternalStore } from 'react';
import { gameStore } from '../game/state/gameStore';
import type { GameState } from '../game/state/gameState';

/** React view of the single game state. */
export function useGameState(): GameState {
  return useSyncExternalStore(gameStore.subscribe, gameStore.getState);
}
