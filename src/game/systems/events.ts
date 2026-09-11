/**
 * The generic event vocabulary of the game world.
 *
 * Demo controls emit these today; an Azure DevOps adapter will emit the exact
 * same events later. Entities must never care about the source.
 */
export type GameEvent =
  | { type: 'PIPELINE_STARTED'; pipelineId: string }
  | { type: 'PIPELINE_SUCCEEDED'; pipelineId: string }
  | { type: 'PIPELINE_FAILED'; pipelineId: string }
  | { type: 'RESET_DEMO' };

export type GameEventType = GameEvent['type'];
