import type { GameEvent } from '../systems/events';
import type { BuildingId, Vec3 } from '../../domain/ids';

export type RepoId = 'geo' | 'b3d' | 'api' | 'web' | 'data' | 'infra';

export interface Repository {
  id: RepoId;
  name: string;
  short: string;
  color: number;
  factory: BuildingId;
}

export type PipelineStage = 'build' | 'test' | 'security' | 'package' | 'deploy';
export type RunStatus = 'running' | 'success' | 'failed';

export interface PipelineRun {
  id: string;
  repoId: RepoId;
  name: string;
  number: number;
  status: RunStatus;
  stage: PipelineStage;
  startedAtSim: number;
  endedAtSim: number | null;
  /** 0..1 within the current stage, updated on SIM_TICK. */
  progress: number;
}

export interface RunHistoryEntry {
  number: number;
  name: string;
  status: 'success' | 'failed';
  endedAtSim: number;
}

export type PrStatus = 'waiting' | 'changes-requested' | 'updating' | 'approved' | 'merged';
export type PrMood = 'happy' | 'calm' | 'watching' | 'pacing' | 'annoyed' | 'angry';

export interface PullRequest {
  id: string;
  number: number;
  repoId: RepoId;
  title: string;
  status: PrStatus;
  createdAtSim: number;
  reviewers: number;
}

export interface ActivityEntry {
  id: string;
  simTime: number;
  kind: 'pipeline' | 'deploy' | 'pr' | 'failure';
  text: string;
}

export interface SimClock {
  /** Simulated minutes since start. */
  time: number;
  speed: 1 | 2 | 4;
  running: boolean;
  seed: number;
}

/** Presentation only layer: funny city consequences of engineering health. */
export type CityEventSeverity = 'minor' | 'moderate' | 'major' | 'chaotic';
export type HealthBand = 'critical' | 'unstable' | 'healthy' | 'thriving';

export type CityEventId =
  | 'tornado'
  | 'ufo'
  | 'bug-invasion'
  | 'factory-fire'
  | 'pr-protest'
  | 'deployment-parade'
  | 'blackout'
  | 'traffic-jam'
  | 'meteor'
  | 'fireworks'
  | 'rainbow'
  | 'construction-boom'
  | 'repair-crew';

export interface ActiveCityEvent {
  id: CityEventId;
  /** Unique per occurrence, so repeats never collide on a timestamp. */
  key: string;
  name: string;
  blurb: string;
  severity: CityEventSeverity;
  startedAtSim: number;
  endsAtReal: number;
  /** World point the event happens at, for View Event and the edge marker. */
  focus: Vec3 | null;
}

export interface CityEventLogEntry {
  key: string;
  eventId: CityEventId;
  name: string;
  severity: CityEventSeverity;
  simTime: number;
}

export interface CityEventsState {
  active: ActiveCityEvent[];
  history: CityEventLogEntry[];
}

export interface GameState {
  sim: SimClock;
  repositories: Repository[];
  runs: PipelineRun[];
  history: Record<RepoId, RunHistoryEntry[]>;
  pullRequests: PullRequest[];
  activity: ActivityEntry[];
  cityHealth: number;
  followCamera: boolean;
  cityEvents: CityEventsState;
}

/** Health bands drive both the UI wording and which events can fire. */
export function healthBand(health: number): HealthBand {
  if (health >= 85) return 'thriving';
  if (health >= 65) return 'healthy';
  if (health >= 40) return 'unstable';
  return 'critical';
}

export const STAGES: readonly PipelineStage[] = ['build', 'test', 'security', 'package', 'deploy'];

export const REPOSITORIES: readonly Repository[] = [
  {
    id: 'geo',
    name: 'Geo',
    short: 'Geo',
    color: 0x4f8cff,
    factory: 'geo-build',
  },
  {
    id: 'b3d',
    name: 'b3d',
    short: 'b3d',
    color: 0xffb000,
    factory: 'b3d-build',
  },
  {
    id: 'api',
    name: 'Geo API',
    short: 'API',
    color: 0x32c997,
    factory: 'geo-build',
  },
  {
    id: 'web',
    name: 'Web Client',
    short: 'Web',
    color: 0x9b6bff,
    factory: 'geo-build',
  },
  {
    id: 'data',
    name: 'Data Service',
    short: 'Data',
    color: 0xf59e0b,
    factory: 'geo-build',
  },
  {
    id: 'infra',
    name: 'Infrastructure',
    short: 'Infra',
    color: 0xef5b73,
    factory: 'geo-build',
  },
];

// Two simulated minutes per real second. The city is meant to be watched and
// read, so a pipeline stage should take seconds to cross, not a blink.
export const SIM_MINUTES_PER_SECOND = 2;

/** How long a failed run keeps hurting city health, in simulated minutes. */
export const FAILURE_MEMORY_MINUTES = 180;

const MAX_ACTIVITY = 8;
const MAX_CITY_EVENT_HISTORY = 10;
const MAX_HISTORY_PER_REPOSITORY = 5;
const MAX_RUNS = 12;
const STAGE_PROGRESS_SIM_MINUTES = 7;

export function prAgeHours(pr: PullRequest, simTime: number): number {
  return Math.max(0, (simTime - pr.createdAtSim) / 60);
}

export function prMood(ageHours: number, status: PrStatus): PrMood {
  if (ageHours >= 72) return 'angry';
  if (ageHours >= 48) return 'annoyed';
  if (ageHours >= 24) return 'pacing';
  if (ageHours >= 12) return 'watching';
  if (ageHours >= 4 || status === 'changes-requested') return 'calm';
  return 'happy';
}

export function runsForRepo(state: GameState, repoId: RepoId): PipelineRun[] {
  return state.runs.filter((run) => run.repoId === repoId);
}

export function prsForRepo(state: GameState, repoId: RepoId): PullRequest[] {
  return state.pullRequests.filter((pr) => pr.repoId === repoId);
}

export function computeCityHealth(state: GameState): number {
  // Tuned so a well run city sits in the high 80s rather than pinned at 100.
  // Headroom matters: without it every failure is invisible and the city event
  // director only ever sees a thriving band, so disasters never appear.
  let health = 78;

  // Only recent breakage should weigh on the city. Runs linger in `runs` for
  // the tooltips, so an aged failure must stop being punished or health would
  // ratchet down permanently.
  for (const run of state.runs) {
    if (run.status !== 'failed' || run.endedAtSim === null) continue;
    if (state.sim.time - run.endedAtSim <= FAILURE_MEMORY_MINUTES) health -= 9;
  }

  for (const pr of state.pullRequests) {
    const ageHours = prAgeHours(pr, state.sim.time);
    if (ageHours > 48) health -= 4;
    if (ageHours > 24) health -= 2;
  }

  let recentDeployBonus = 0;
  for (const run of state.runs) {
    if (run.status !== 'success' || run.stage !== 'deploy' || run.endedAtSim === null) continue;
    const elapsedSinceDeploy = state.sim.time - run.endedAtSim;
    if (elapsedSinceDeploy >= 0 && elapsedSinceDeploy <= 120) recentDeployBonus += 3;
  }
  health += Math.min(recentDeployBonus, 12);

  const recentHistory: RunHistoryEntry[] = [];
  for (const repository of REPOSITORIES) {
    recentHistory.push(...state.history[repository.id]);
  }
  recentHistory.sort((left, right) => right.endedAtSim - left.endedAtSim);

  const historyCount = Math.min(20, recentHistory.length);
  let successfulRuns = 0;
  for (let index = 0; index < historyCount; index += 1) {
    if (recentHistory[index].status === 'success') successfulRuns += 1;
  }
  // A strong green streak is worth real credit, a mediocre one is not.
  if (historyCount > 0) {
    const rate = successfulRuns / historyCount;
    if (rate >= 0.85) health += 8;
    else if (rate >= 0.65) health += 4;
    else if (rate < 0.5) health -= 6;
  }

  return Math.min(100, Math.max(0, health));
}

/** The simulator fills the empty shell through SIM_RESET after startup. */
export function createInitialState(): GameState {
  const state: GameState = {
    sim: {
      time: 0,
      speed: 1,
      running: true,
      seed: 42,
    },
    repositories: [...REPOSITORIES],
    runs: [],
    history: createEmptyHistory(),
    pullRequests: [],
    activity: [],
    cityHealth: 0,
    followCamera: true,
    cityEvents: { active: [], history: [] },
  };

  return { ...state, cityHealth: computeCityHealth(state) };
}

/** Finished work leaves before active work so live pipelines remain visible. */
function capRuns(runs: PipelineRun[]): PipelineRun[] {
  if (runs.length <= MAX_RUNS) return runs;

  const capped = [...runs];
  while (capped.length > MAX_RUNS) {
    let removeIndex = capped.length - 1;
    for (let index = capped.length - 1; index >= 0; index -= 1) {
      if (capped[index].status !== 'running') {
        removeIndex = index;
        break;
      }
    }
    capped.splice(removeIndex, 1);
  }
  return capped;
}

function createEmptyHistory(): Record<RepoId, RunHistoryEntry[]> {
  // Derived from REPOSITORIES so adding or renaming a repository cannot leave a
  // hole that computeCityHealth then spreads as undefined.
  const history = {} as Record<RepoId, RunHistoryEntry[]>;
  for (const repository of REPOSITORIES) history[repository.id] = [];
  return history;
}

function copyHistory(history: Record<RepoId, RunHistoryEntry[]>): Record<RepoId, RunHistoryEntry[]> {
  const copied = createEmptyHistory();
  for (const repository of REPOSITORIES) {
    copied[repository.id] = history[repository.id]
      .slice(0, MAX_HISTORY_PER_REPOSITORY)
      .map((entry) => ({ ...entry }));
  }
  return copied;
}

function prependHistory(
  history: Record<RepoId, RunHistoryEntry[]>,
  repoId: RepoId,
  entry: RunHistoryEntry,
): Record<RepoId, RunHistoryEntry[]> {
  return {
    ...history,
    [repoId]: [entry, ...history[repoId]].slice(0, MAX_HISTORY_PER_REPOSITORY),
  };
}

function findRun(state: GameState, runId: string): PipelineRun | undefined {
  return state.runs.find((run) => run.id === runId);
}


function repositoryShort(state: GameState, repoId: RepoId): string {
  return state.repositories.find((repository) => repository.id === repoId)?.short ?? repoId;
}

function runLabel(state: GameState, run: PipelineRun): string {
  return `${repositoryShort(state, run.repoId)} ${run.name}`;
}

function nextActivityId(state: GameState, event: GameEvent): string {
  const existingIds = new Set(state.activity.map((entry) => entry.id));
  let suffix = 0;
  let id = `${event.type.toLowerCase()}-${state.sim.time}-${suffix}`;
  while (existingIds.has(id)) {
    suffix += 1;
    id = `${event.type.toLowerCase()}-${state.sim.time}-${suffix}`;
  }
  return id;
}

function makeActivity(
  state: GameState,
  event: GameEvent,
  kind: ActivityEntry['kind'],
  text: string,
): ActivityEntry {
  return {
    id: nextActivityId(state, event),
    simTime: state.sim.time,
    kind,
    text,
  };
}

function activityFor(
  state: GameState,
  previousState: GameState,
  event: GameEvent,
): ActivityEntry | null {
  switch (event.type) {
    case 'RUN_STARTED':
      return makeActivity(state, event, 'pipeline', `${runLabel(state, event.run)} started`);
    case 'RUN_SUCCEEDED': {
      const run = findRun(state, event.runId);
      if (!run) return makeActivity(state, event, 'pipeline', `Pipeline run ${event.runId} succeeded`);
      return makeActivity(
        state,
        event,
        run.stage === 'deploy' ? 'deploy' : 'pipeline',
        `${runLabel(state, run)} ${run.stage === 'deploy' ? 'deployed' : 'succeeded'}`,
      );
    }
    case 'RUN_FAILED': {
      const run = findRun(state, event.runId);
      if (!run) return makeActivity(state, event, 'failure', `Pipeline run ${event.runId} failed`);
      return makeActivity(state, event, 'failure', `${runLabel(state, run)} failed at ${event.stage}`);
    }
    case 'PR_CREATED':
      return makeActivity(
        state,
        event,
        'pr',
        `${repositoryShort(state, event.pr.repoId)} PR #${event.pr.number} opened`,
      );
    case 'PR_STATUS_CHANGED': {
      if (event.status !== 'approved' && event.status !== 'changes-requested') return null;
      const pr = state.pullRequests.find((candidate) => candidate.id === event.prId);
      const label = pr
        ? `${repositoryShort(state, pr.repoId)} PR #${pr.number}`
        : `Pull request ${event.prId}`;
      const status = event.status === 'changes-requested' ? 'changes requested' : 'approved';
      return makeActivity(state, event, 'pr', `${label} ${status}`);
    }
    case 'PR_MERGED': {
      const pr = previousState.pullRequests.find((candidate) => candidate.id === event.prId);
      const label = pr
        ? `${repositoryShort(previousState, pr.repoId)} PR #${pr.number}`
        : `Pull request ${event.prId}`;
      return makeActivity(state, event, 'pr', `${label} merged`);
    }
    case 'SIM_TICK':
    case 'SIM_SET_SPEED':
    case 'SIM_SET_RUNNING':
    case 'SIM_RESET':
    case 'RUN_STAGE_ADVANCED':
    case 'SET_FOLLOW_CAMERA':
    case 'CITY_EVENT_STARTED':
    case 'CITY_EVENT_ENDED':
      return null;
    default: {
      const unhandledEvent: never = event;
      throw new Error(`Unhandled game event: ${unhandledEvent}`);
    }
  }
}

function appendActivity(state: GameState, previousState: GameState, event: GameEvent): GameState {
  const activity = activityFor(state, previousState, event);
  if (!activity) return state;
  return {
    ...state,
    activity: [activity, ...state.activity].slice(0, MAX_ACTIVITY),
  };
}

/** Health is derived here so every consumer receives the same current score. */
function finalize(state: GameState, previousState: GameState, event: GameEvent): GameState {
  const withActivity = appendActivity(state, previousState, event);
  return {
    ...withActivity,
    cityHealth: computeCityHealth(withActivity),
  };
}

function reduceEvent(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case 'SIM_TICK':
      return {
        ...state,
        sim: { ...state.sim, time: state.sim.time + event.deltaSim },
        runs: state.runs.map((run) => (
          run.status === 'running'
            ? {
              ...run,
              progress: Math.min(
                1,
                Math.max(0, run.progress + event.deltaSim / STAGE_PROGRESS_SIM_MINUTES),
              ),
            }
            : run
        )),
      };
    case 'CITY_EVENT_STARTED':
      return {
        ...state,
        cityEvents: {
          active: [event.event, ...state.cityEvents.active.filter((a) => a.id !== event.event.id)],
          history: [
            {
              key: event.event.key,
              eventId: event.event.id,
              name: event.event.name,
              severity: event.event.severity,
              simTime: state.sim.time,
            },
            ...state.cityEvents.history,
          ].slice(0, MAX_CITY_EVENT_HISTORY),
        },
      };
    case 'CITY_EVENT_ENDED':
      return {
        ...state,
        cityEvents: {
          ...state.cityEvents,
          active: state.cityEvents.active.filter((a) => a.id !== event.eventId),
        },
      };
    case 'SIM_SET_SPEED':
      return { ...state, sim: { ...state.sim, speed: event.speed } };
    case 'SIM_SET_RUNNING':
      return { ...state, sim: { ...state.sim, running: event.running } };
    case 'SIM_RESET':
      return {
        ...state,
        sim: {
          ...state.sim,
          time: event.snapshot.time,
          running: true,
          seed: event.seed,
        },
        runs: capRuns(event.snapshot.runs.map((run) => ({ ...run }))),
        history: copyHistory(event.snapshot.history),
        pullRequests: event.snapshot.pullRequests.map((pr) => ({ ...pr })),
        activity: event.snapshot.activity
          .slice(0, MAX_ACTIVITY)
          .map((entry) => ({ ...entry })),
        followCamera: state.followCamera,
        // A fresh simulation starts a fresh city: no lingering disasters.
        cityEvents: { active: [], history: [] },
      };
    case 'RUN_STARTED':
      return {
        ...state,
        runs: capRuns([{ ...event.run }, ...state.runs]),
      };
    case 'RUN_STAGE_ADVANCED':
      return {
        ...state,
        runs: state.runs.map((run) => (
          run.id === event.runId
            ? { ...run, stage: event.stage, progress: 0 }
            : run
        )),
      };
    case 'RUN_SUCCEEDED': {
      const run = findRun(state, event.runId);
      if (!run) return state;
      const endedAtSim = state.sim.time;
      return {
        ...state,
        runs: state.runs.map((candidate) => (
          candidate.id === event.runId
            ? { ...candidate, status: 'success', endedAtSim }
            : candidate
        )),
        history: prependHistory(state.history, run.repoId, {
          number: run.number,
          name: run.name,
          status: 'success',
          endedAtSim,
        }),
      };
    }
    case 'RUN_FAILED': {
      const run = findRun(state, event.runId);
      if (!run) return state;
      const endedAtSim = state.sim.time;
      return {
        ...state,
        runs: state.runs.map((candidate) => (
          candidate.id === event.runId
            ? { ...candidate, status: 'failed', stage: event.stage, endedAtSim }
            : candidate
        )),
        history: prependHistory(state.history, run.repoId, {
          number: run.number,
          name: run.name,
          status: 'failed',
          endedAtSim,
        }),
      };
    }
    case 'PR_CREATED':
      return {
        ...state,
        pullRequests: [{ ...event.pr }, ...state.pullRequests],
      };
    case 'PR_STATUS_CHANGED':
      return {
        ...state,
        pullRequests: state.pullRequests.map((pr) => (
          pr.id === event.prId ? { ...pr, status: event.status } : pr
        )),
      };
    case 'PR_MERGED':
      return {
        ...state,
        pullRequests: state.pullRequests.filter((pr) => pr.id !== event.prId),
      };
    case 'SET_FOLLOW_CAMERA':
      return { ...state, followCamera: event.follow };
    default: {
      const unhandledEvent: never = event;
      throw new Error(`Unhandled game event: ${unhandledEvent}`);
    }
  }
}

/** Pure event reduction keeps city state independent from rendering and timing. */
export function reduce(state: GameState, event: GameEvent): GameState {
  return finalize(reduceEvent(state, event), state, event);
}
