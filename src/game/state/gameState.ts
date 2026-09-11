import type { GameEvent } from '../systems/events';

/**
 * Central, normalized game state.
 *
 * Nothing in here knows about Azure DevOps, React or Phaser. Real ADO data
 * will later be translated into the same `GameEvent`s the demo controls emit.
 */

export type PipelineStatus = 'idle' | 'running' | 'success' | 'failed';

export interface Pipeline {
  id: string;
  name: string;
  status: PipelineStatus;
  /** Human readable stage, e.g. "Build" / "Waiting". */
  stage: string;
}

export interface GameState {
  cityHealth: number;
  pipelines: Pipeline[];
}

export const DEFAULT_CITY_HEALTH = 85;
export const HEALTH_ON_SUCCESS = 5;
export const HEALTH_ON_FAILURE = -15;

/** The pipeline the Build Factory visualises in Milestone 1. */
export const PRIMARY_PIPELINE_ID = 'backend';

export function createInitialState(): GameState {
  return {
    cityHealth: DEFAULT_CITY_HEALTH,
    pipelines: [
      { id: PRIMARY_PIPELINE_ID, name: 'Backend Pipeline', status: 'idle', stage: 'Waiting' },
    ],
  };
}

export function getPipeline(state: GameState, id: string = PRIMARY_PIPELINE_ID): Pipeline {
  const pipeline = state.pipelines.find((p) => p.id === id);
  if (!pipeline) throw new Error(`Unknown pipeline: ${id}`);
  return pipeline;
}

/**
 * Pure reducer: game event + state -> next state.
 * Health is clamped to 0-100.
 */
export function reduce(state: GameState, event: GameEvent): GameState {
  const patch = (id: string, next: Partial<Pipeline>, healthDelta = 0): GameState => ({
    cityHealth: Math.min(100, Math.max(0, state.cityHealth + healthDelta)),
    pipelines: state.pipelines.map((p) => (p.id === id ? { ...p, ...next } : p)),
  });

  switch (event.type) {
    case 'PIPELINE_STARTED':
      return patch(event.pipelineId, { status: 'running', stage: 'Build' });
    case 'PIPELINE_SUCCEEDED':
      return patch(event.pipelineId, { status: 'success', stage: 'Completed' }, HEALTH_ON_SUCCESS);
    case 'PIPELINE_FAILED':
      return patch(event.pipelineId, { status: 'failed', stage: 'Build (failed)' }, HEALTH_ON_FAILURE);
    case 'RESET_DEMO':
      return createInitialState();
  }
}
