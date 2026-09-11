import { EventBus } from '../systems/EventBus';
import type { GameEvent } from '../systems/events';
import { createInitialState, reduce, type GameState } from './gameState';

/**
 * The single channel between local controls and the world.
 *
 * Dispatch reduces first, subscribers then observe the new state, and bus
 * handlers receive the same fresh snapshot.
 */
class GameStore {
  readonly bus = new EventBus();

  private state: GameState = createInitialState();
  private readonly subscribers = new Set<(state: GameState) => void>();

  getState = (): GameState => this.state;

  /** Subscribe to state snapshots. Returns an unsubscribe function. */
  subscribe = (listener: (state: GameState) => void): (() => void) => {
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener);
    };
  };

  dispatch = (event: GameEvent): void => {
    this.state = reduce(this.state, event);
    for (const listener of this.subscribers) listener(this.state);
    this.bus.emit(event);
  };
}

export const gameStore = new GameStore();
