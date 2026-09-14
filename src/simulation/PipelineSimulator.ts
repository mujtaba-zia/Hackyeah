import type { GameEvent } from '../game/systems/events';
import { REPOSITORIES, STAGES } from '../game/state/gameState';
import type {
  ActivityEntry,
  PipelineRun,
  PipelineStage,
  RepoId,
  RunHistoryEntry,
} from '../game/state/gameState';
import { pick, PIPELINE_NAMES, randomInt } from './MockData';

// Fewer, slower, legible runs: this is a repository visualiser, so a viewer
// should be able to follow one pipeline through its five stages.
const MAX_CONCURRENT_RUNS = 3;
const MAX_RUNS_PER_REPOSITORY = 1;
const SUCCESS_RATE = 0.85;
// At two simulated minutes per real second these read as: a stage every 7 to 13
// real seconds, a whole run in 35 to 65 seconds, and a new run starting every 25
// to 55 seconds, so one or two pipelines are usually in flight and the city is
// rarely completely idle.
const MIN_STAGE_MINUTES = 14;
const MAX_STAGE_MINUTES = 26;
const MIN_RUN_START_DELAY = 50;
const MAX_RUN_START_DELAY = 110;
const MIN_FAILURE_COOLDOWN = 90;
const MAX_FAILURE_COOLDOWN = 180;
const MAX_EVENTS_PER_TICK = 64;

type Dispatch = (event: GameEvent) => void;

interface ManagedRun {
  run: PipelineRun;
  stageEndsAt: number;
  willSucceed: boolean;
  failureStage: PipelineStage;
}

interface PipelineStartup {
  runs: PipelineRun[];
  history: Record<RepoId, RunHistoryEntry[]>;
  activity: ActivityEntry[];
}

/** Schedules run transitions from simulated time instead of wall-clock timers. */
export class PipelineSimulator {
  private readonly dispatch: Dispatch;
  private readonly rng: () => number;
  private readonly activeRuns = new Map<string, ManagedRun>();
  private readonly nextRunNumberByRepo = new Map<RepoId, number>();
  private readonly recoveryAtByRepo = new Map<RepoId, number>();
  private nextRunAt = 0;
  private nextStartAllowedAt = 0;

  constructor(dispatch: Dispatch, rng: () => number) {
    this.dispatch = dispatch;
    this.rng = rng;
  }

  createStartup(simTime: number): PipelineStartup {
    this.activeRuns.clear();
    this.nextRunNumberByRepo.clear();
    this.recoveryAtByRepo.clear();

    const history = this.createHistory(simTime);
    const failedRepo = REPOSITORIES[3]!;
    const failedEntry = history[failedRepo.id][0]!;
    failedEntry.status = 'failed';
    failedEntry.endedAtSim = simTime - 7;

    const runs: PipelineRun[] = [
      this.createFailedSnapshot(failedRepo.id, failedEntry),
    ];
    const activeStarts: readonly [RepoId, PipelineStage, number][] = [
      [REPOSITORIES[0]!.id, 'build', 0.2],
      [REPOSITORIES[1]!.id, 'test', 0.48],
      [REPOSITORIES[2]!.id, 'security', 0.72],
    ];

    for (const [repoId, stage, progress] of activeStarts) {
      const managed = this.createManagedRun(repoId, simTime, stage, progress);
      this.activeRuns.set(managed.run.id, managed);
      runs.push({ ...managed.run });
    }

    const deployedRepos = [REPOSITORIES[0]!, REPOSITORIES[1]!];
    const activity: ActivityEntry[] = [];
    for (const [index, repo] of deployedRepos.entries()) {
      const entry = history[repo.id][0]!;
      entry.status = 'success';
      entry.endedAtSim = simTime - (10 + index * 13);
      runs.push(this.createSuccessfulSnapshot(repo.id, entry));
      activity.push({
        id: `startup-deploy-${repo.id}-${entry.number}`,
        simTime: entry.endedAtSim,
        kind: 'deploy',
        text: `${repo.short} deployed successfully`,
      });
    }

    this.nextRunAt = simTime + randomInt(this.rng, MIN_RUN_START_DELAY, MAX_RUN_START_DELAY);
    this.nextStartAllowedAt = simTime + MIN_RUN_START_DELAY;
    return { runs, history, activity };
  }

  tick(simTime: number): void {
    let processedEvents = 0;

    while (processedEvents < MAX_EVENTS_PER_TICK) {
      const stageRun = this.nextDueStage(simTime);
      const recoveryRepo = this.nextDueRecovery(simTime);
      const stageAt = stageRun?.stageEndsAt ?? Number.POSITIVE_INFINITY;
      const recoveryAt = recoveryRepo === null
        ? Number.POSITIVE_INFINITY
        : this.recoveryAtByRepo.get(recoveryRepo)!;
      const regularAt = this.nextRunAt <= simTime && simTime >= this.nextStartAllowedAt
        ? this.nextRunAt
        : Number.POSITIVE_INFINITY;
      const nextAt = Math.min(stageAt, recoveryAt, regularAt);

      if (!Number.isFinite(nextAt)) return;

      if (stageRun !== null && stageAt === nextAt) {
        this.completeStage(stageRun, stageAt);
      } else if (recoveryRepo !== null && recoveryAt === nextAt) {
        this.recoveryAtByRepo.delete(recoveryRepo);
        this.startRun(recoveryRepo, simTime);
      } else {
        this.startRegularRun(simTime);
      }

      processedEvents += 1;
    }
  }

  triggerFailure(simTime: number): void {
    const candidates = [...this.activeRuns.values()];
    if (candidates.length === 0) return;

    this.failRun(pick(this.rng, candidates), simTime);
  }

  triggerDeployment(simTime: number): void {
    const candidates = this.regularStartCandidates();
    if (candidates.length === 0) return;

    const repo = pick(this.rng, candidates);
    this.startRun(repo.id, simTime, 'deploy', 0, true, PIPELINE_NAMES[4]!);
  }

  destroy(): void {
    this.nextStartAllowedAt = 0;
    this.activeRuns.clear();
    this.nextRunNumberByRepo.clear();
    this.recoveryAtByRepo.clear();
  }

  private createHistory(simTime: number): Record<RepoId, RunHistoryEntry[]> {
    const history = {} as Record<RepoId, RunHistoryEntry[]>;

    for (const repo of REPOSITORIES) {
      const baseNumber = 4_780 + randomInt(this.rng, 0, 40);
      const entryCount = randomInt(this.rng, 4, 5);
      const entries: RunHistoryEntry[] = [];

      for (let index = 0; index < entryCount; index += 1) {
        const status: RunHistoryEntry['status'] = this.rng() < SUCCESS_RATE ? 'success' : 'failed';
        entries.push({
          number: baseNumber + entryCount - index - 1,
          name: pick(this.rng, PIPELINE_NAMES),
          status,
          endedAtSim: simTime - (28 + index * 54 + randomInt(this.rng, 0, 20)),
        });
      }

      history[repo.id] = entries;
      this.nextRunNumberByRepo.set(repo.id, baseNumber + entryCount);
    }

    return history;
  }

  private createFailedSnapshot(repoId: RepoId, entry: RunHistoryEntry): PipelineRun {
    return {
      id: `run-${repoId}-${entry.number}`,
      repoId,
      name: entry.name,
      number: entry.number,
      status: 'failed',
      stage: 'security',
      startedAtSim: entry.endedAtSim - 19,
      endedAtSim: entry.endedAtSim,
      progress: 1,
    };
  }

  private createSuccessfulSnapshot(repoId: RepoId, entry: RunHistoryEntry): PipelineRun {
    return {
      id: `run-${repoId}-${entry.number}`,
      repoId,
      name: entry.name,
      number: entry.number,
      status: 'success',
      stage: 'deploy',
      startedAtSim: entry.endedAtSim - 27,
      endedAtSim: entry.endedAtSim,
      progress: 1,
    };
  }

  private createManagedRun(
    repoId: RepoId,
    simTime: number,
    stage: PipelineStage,
    progress: number,
    forceSuccess = false,
    name?: string,
  ): ManagedRun {
    const stageIndex = STAGES.indexOf(stage);
    const stageDuration = randomInt(this.rng, MIN_STAGE_MINUTES, MAX_STAGE_MINUTES);
    const willSucceed = forceSuccess || this.rng() < SUCCESS_RATE;
    const failureStages = STAGES.slice(stageIndex);
    const failureStage = willSucceed ? stage : pick(this.rng, failureStages);
    const number = this.takeRunNumber(repoId);
    const run: PipelineRun = {
      id: `run-${repoId}-${number}`,
      repoId,
      name: name ?? pick(this.rng, PIPELINE_NAMES),
      number,
      status: 'running',
      stage,
      startedAtSim: simTime - (stageIndex * 6 + stageDuration * progress),
      endedAtSim: null,
      progress,
    };

    return {
      run,
      stageEndsAt: simTime + stageDuration * (1 - progress),
      willSucceed,
      failureStage,
    };
  }

  private takeRunNumber(repoId: RepoId): number {
    const nextNumber = this.nextRunNumberByRepo.get(repoId);
    if (nextNumber === undefined) {
      throw new Error(`Missing run number for ${repoId}`);
    }

    this.nextRunNumberByRepo.set(repoId, nextNumber + 1);
    return nextNumber;
  }

  private nextDueStage(simTime: number): ManagedRun | null {
    let next: ManagedRun | null = null;

    for (const managed of this.activeRuns.values()) {
      if (managed.stageEndsAt > simTime) continue;
      if (next === null || managed.stageEndsAt < next.stageEndsAt) next = managed;
    }

    return next;
  }

  private nextDueRecovery(simTime: number): RepoId | null {
    if (simTime < this.nextStartAllowedAt || this.activeRuns.size >= MAX_CONCURRENT_RUNS) {
      return null;
    }
    let nextRepo: RepoId | null = null;
    let nextAt = Number.POSITIVE_INFINITY;
    for (const repo of REPOSITORIES) {
      const recoveryAt = this.recoveryAtByRepo.get(repo.id);
      if (recoveryAt === undefined || recoveryAt > simTime || !this.canStart(repo.id)) continue;
      if (recoveryAt < nextAt) {
        nextRepo = repo.id;
        nextAt = recoveryAt;
      }
    }

    return nextRepo;
  }

  private completeStage(managed: ManagedRun, simTime: number): void {
    const stageIndex = STAGES.indexOf(managed.run.stage);

    if (!managed.willSucceed && managed.failureStage === managed.run.stage) {
      this.failRun(managed, simTime);
      return;
    }

    if (stageIndex === STAGES.length - 1) {
      this.dispatch({ type: 'RUN_SUCCEEDED', runId: managed.run.id });
      this.activeRuns.delete(managed.run.id);
      return;
    }

    const stage = STAGES[stageIndex + 1]!;
    managed.run.stage = stage;
    managed.run.progress = 0;
    managed.stageEndsAt = simTime + randomInt(this.rng, MIN_STAGE_MINUTES, MAX_STAGE_MINUTES);
    this.dispatch({ type: 'RUN_STAGE_ADVANCED', runId: managed.run.id, stage });
  }

  private failRun(managed: ManagedRun, simTime: number): void {
    this.dispatch({
      type: 'RUN_FAILED',
      runId: managed.run.id,
      stage: managed.run.stage,
    });
    this.activeRuns.delete(managed.run.id);
    const recoveryAt = simTime + randomInt(
      this.rng,
      MIN_FAILURE_COOLDOWN,
      MAX_FAILURE_COOLDOWN,
    );
    this.recoveryAtByRepo.set(managed.run.repoId, recoveryAt);
    this.nextStartAllowedAt = Math.min(this.nextStartAllowedAt, recoveryAt);
  }

  private startRegularRun(simTime: number): void {
    const candidates = this.regularStartCandidates();
    if (candidates.length > 0) {
      this.startRun(pick(this.rng, candidates).id, simTime);
    }

    this.nextRunAt = simTime + randomInt(this.rng, MIN_RUN_START_DELAY, MAX_RUN_START_DELAY);
  }

  private startRun(
    repoId: RepoId,
    simTime: number,
    stage: PipelineStage = 'build',
    progress = 0,
    forceSuccess = false,
    name?: string,
  ): void {
    const managed = this.createManagedRun(repoId, simTime, stage, progress, forceSuccess, name);
    this.activeRuns.set(managed.run.id, managed);
    this.nextStartAllowedAt = simTime + randomInt(
      this.rng,
      MIN_RUN_START_DELAY,
      MAX_RUN_START_DELAY,
    );
    this.dispatch({ type: 'RUN_STARTED', run: { ...managed.run } });
  }

  private regularStartCandidates(): typeof REPOSITORIES[number][] {
    if (this.activeRuns.size >= MAX_CONCURRENT_RUNS) return [];

    return REPOSITORIES.filter((repo) => (
      !this.recoveryAtByRepo.has(repo.id) && this.canStart(repo.id)
    ));
  }

  private canStart(repoId: RepoId): boolean {
    if (this.activeRuns.size >= MAX_CONCURRENT_RUNS) return false;

    let count = 0;
    for (const managed of this.activeRuns.values()) {
      if (managed.run.repoId === repoId) count += 1;
    }

    return count < MAX_RUNS_PER_REPOSITORY;
  }
}
