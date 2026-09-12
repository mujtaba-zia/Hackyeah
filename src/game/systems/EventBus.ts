import type { GameEvent, GameEventType } from './events';

type Handler<E extends GameEvent = GameEvent> = (event: E) => void;

/**
 * Minimal typed pub/sub for game events.
 *
 * Deliberately not Phaser's emitter: the bus must stay usable from React,
 * tests and any future Azure DevOps adapter without a running game instance.
 */
export class EventBus {
  private readonly byType = new Map<GameEventType, Set<Handler>>();
  private readonly all = new Set<Handler>();

  /** Subscribe to one event type. Returns an unsubscribe function. */
  on<T extends GameEventType>(type: T, handler: Handler<Extract<GameEvent, { type: T }>>): () => void {
    let handlers = this.byType.get(type);
    if (!handlers) {
      handlers = new Set();
      this.byType.set(type, handlers);
    }
    handlers.add(handler as Handler);
    return () => {
      handlers!.delete(handler as Handler);
    };
  }

  /** Subscribe to every event. Returns an unsubscribe function. */
  onAny(handler: Handler): () => void {
    this.all.add(handler);
    return () => {
      this.all.delete(handler);
    };
  }

  emit(event: GameEvent): void {
    // Handlers are isolated: the simulation tick, the scene and the audio layer
    // all subscribe here, and one throwing listener must not abort the rest of
    // the dispatch or unwind into the simulation timer.
    for (const handler of this.all) this.safely(handler, event);
    const handlers = this.byType.get(event.type);
    if (handlers) for (const handler of handlers) this.safely(handler, event);
  }

  private safely(handler: Handler, event: GameEvent) {
    try {
      handler(event);
    } catch (error) {
      console.error('Event handler failed', event.type, error);
    }
  }
}
