import type {
  ActiveCityEvent,
  ActivityEntry,
  CityEventId,
  PipelineRun,
  PipelineStage,
  PullRequest,
  PrStatus,
  RepoId,
  RunHistoryEntry,
} from '../state/gameState';

/** Events emitted by the local software-organization simulation. */
export type GameEvent =
  | { type: 'SIM_TICK'; deltaSim: number }
  | { type: 'SIM_SET_SPEED'; speed: 1 | 2 | 4 }
  | { type: 'SIM_SET_RUNNING'; running: boolean }
  | { type: 'SIM_RESET'; seed: number; snapshot: SimSnapshot }
  | { type: 'RUN_STARTED'; run: PipelineRun }
  | { type: 'RUN_STAGE_ADVANCED'; runId: string; stage: PipelineStage }
  | { type: 'RUN_SUCCEEDED'; runId: string }
  | { type: 'RUN_FAILED'; runId: string; stage: PipelineStage }
  | { type: 'PR_CREATED'; pr: PullRequest }
  | { type: 'PR_STATUS_CHANGED'; prId: string; status: PrStatus }
  | { type: 'PR_MERGED'; prId: string }
  | { type: 'SET_FOLLOW_CAMERA'; follow: boolean }
  | { type: 'CITY_EVENT_STARTED'; event: ActiveCityEvent }
  | { type: 'CITY_EVENT_ENDED'; eventId: CityEventId };

/** Whole world seed state, used for startup and simulation resets. */
export interface SimSnapshot {
  runs: PipelineRun[];
  history: Record<RepoId, RunHistoryEntry[]>;
  pullRequests: PullRequest[];
  activity: ActivityEntry[];
  time: number;
}


export type GameEventType = GameEvent['type'];
