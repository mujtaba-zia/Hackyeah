import type { PipelineStage } from '../state/gameState';

/** Events that coordinate the locally simulated pipeline journey. */
export type GameEvent =
  | { type: 'PIPELINE_STARTED' }
  | { type: 'PIPELINE_STAGE_STARTED'; stage: PipelineStage }
  | { type: 'PIPELINE_STAGE_SUCCEEDED'; stage: PipelineStage }
  | { type: 'PIPELINE_STAGE_FAILED'; stage: PipelineStage }
  | { type: 'PIPELINE_COMPLETED' }
  | { type: 'PIPELINE_RESET' }
  | { type: 'SET_FAIL_STAGE'; stage: PipelineStage | null }
  | { type: 'SET_FOLLOW_CAMERA'; follow: boolean };

export type GameEventType = GameEvent['type'];
