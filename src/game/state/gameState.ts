import type { GameEvent } from '../systems/events';
import type { BuildingId } from '../world/cityLayout';

export type PipelineStage = 'build' | 'test' | 'security' | 'package' | 'deploy';
export type StageStatus = 'pending' | 'running' | 'success' | 'failed';
export type PipelineStatus = 'idle' | 'running' | 'success' | 'failed';

export const STAGES: readonly PipelineStage[] = ['build', 'test', 'security', 'package', 'deploy'];

export const STAGE_BUILDING: Record<PipelineStage, BuildingId> = {
  build: 'build-factory',
  test: 'test-lab',
  security: 'security-hub',
  package: 'packaging-station',
  deploy: 'deployment-port',
};

export interface PipelineState {
  id: string;
  name: string;
  status: PipelineStatus;
  currentStage: PipelineStage | null;
  stages: Record<PipelineStage, StageStatus>;
  /** Demo only: presenter arms a stage to fail. */
  failAt: PipelineStage | null;
}

export interface GameState {
  cityHealth: number;
  pipeline: PipelineState;
  followCamera: boolean;
}

const INITIAL_CITY_HEALTH = 85;

function createPendingStages(): Record<PipelineStage, StageStatus> {
  return {
    build: 'pending',
    test: 'pending',
    security: 'pending',
    package: 'pending',
    deploy: 'pending',
  };
}

export function createInitialState(): GameState {
  return {
    cityHealth: INITIAL_CITY_HEALTH,
    pipeline: {
      id: 'backend',
      name: 'Backend Pipeline',
      status: 'idle',
      currentStage: null,
      stages: createPendingStages(),
      failAt: null,
    },
    followCamera: true,
  };
}

/**
 * Pure reducer for the local pipeline demo. Health never leaves the 0..100 range.
 */
export function reduce(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case 'PIPELINE_STARTED':
      return {
        ...state,
        pipeline: {
          ...state.pipeline,
          status: 'running',
          currentStage: null,
          stages: createPendingStages(),
        },
      };
    case 'PIPELINE_STAGE_STARTED':
      return {
        ...state,
        pipeline: {
          ...state.pipeline,
          currentStage: event.stage,
          stages: { ...state.pipeline.stages, [event.stage]: 'running' },
        },
      };
    case 'PIPELINE_STAGE_SUCCEEDED':
      return {
        ...state,
        cityHealth: Math.min(100, Math.max(0, state.cityHealth + (event.stage === 'deploy' ? 5 : 1))),
        pipeline: {
          ...state.pipeline,
          stages: { ...state.pipeline.stages, [event.stage]: 'success' },
        },
      };
    case 'PIPELINE_STAGE_FAILED':
      return {
        ...state,
        cityHealth: Math.min(100, Math.max(0, state.cityHealth - (event.stage === 'deploy' ? 15 : 10))),
        pipeline: {
          ...state.pipeline,
          status: 'failed',
          currentStage: null,
          stages: { ...state.pipeline.stages, [event.stage]: 'failed' },
        },
      };
    case 'PIPELINE_COMPLETED':
      return {
        ...state,
        pipeline: { ...state.pipeline, status: 'success' },
      };
    case 'PIPELINE_RESET':
      return { ...createInitialState(), followCamera: state.followCamera };
    case 'SET_FAIL_STAGE':
      return {
        ...state,
        pipeline: { ...state.pipeline, failAt: event.stage },
      };
    case 'SET_FOLLOW_CAMERA':
      return { ...state, followCamera: event.follow };
    default: {
      const unhandledEvent: never = event;
      throw new Error(`Unhandled game event: ${unhandledEvent}`);
    }
  }
}
