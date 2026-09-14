import type { GameEvent, SimSnapshot } from '../game/systems/events';
import { gameStore } from '../game/state/gameStore';
import { createRng } from './MockData';
import { PipelineSimulator } from './PipelineSimulator';
import { PullRequestSimulator } from './PullRequestSimulator';
import { SimulationClock } from './SimulationClock';

const DEFAULT_SEED = 20_260_911;

type SimulationSpeed = 1 | 2 | 4;
type Dispatch = (event: GameEvent) => void;

/** Owns deterministic simulation state and sends its domain events through the store. */
export class SimulationEngine {
  private readonly dispatch: Dispatch;
  private clock: SimulationClock;
  private seed: number;
  private speed: SimulationSpeed = 1;
  private simTime = 0;
  private initialized = false;
  private runningRequested = true;
  private clockRunning = false;
  private destroyed = false;
  private pipelineSimulator: PipelineSimulator;
  private pullRequestSimulator: PullRequestSimulator;

  constructor(seed = DEFAULT_SEED) {
    this.seed = normalizeSeed(seed);
    this.dispatch = gameStore.dispatch;
    this.pipelineSimulator = new PipelineSimulator(this.dispatch, createRng(this.seed));
    this.pullRequestSimulator = new PullRequestSimulator(this.dispatch, createRng(this.seed));
    this.clock = new SimulationClock(this.handleClockTick);
  }

  /** Builds the startup ecosystem and dispatches SIM_RESET before any clock tick. */
  start(): void {
    // A remount must revive the singleton rather than freeze the city. The
    // clock's destroyed flag is terminal, so a new one is built here instead of
    // merely clearing the engine flag.
    if (this.destroyed) {
      this.clock = new SimulationClock(this.handleClockTick);
      this.clock.setSpeed(this.speed);
      this.destroyed = false;
      this.initialized = false;
    }

    if (!this.initialized) this.initialize();
    if (this.runningRequested) this.startClock();
  }

  stop(): void {
    this.stopClock();
  }

  reset(seed = this.seed): void {
    if (this.destroyed) return;

    const resumeAfterReset = this.clockRunning;
    this.stopClock();
    this.seed = normalizeSeed(seed);
    this.initialize();

    if (resumeAfterReset && this.runningRequested) this.startClock();
  }

  setSpeed(speed: SimulationSpeed): void {
    if (this.destroyed) return;

    this.clock.setSpeed(speed);
    this.speed = speed;
    this.dispatch({ type: 'SIM_SET_SPEED', speed });
  }

  setRunning(running: boolean): void {
    if (this.destroyed) return;

    this.runningRequested = running;
    this.dispatch({ type: 'SIM_SET_RUNNING', running });

    if (!this.initialized) return;
    if (running) {
      this.startClock();
    } else {
      this.stopClock();
    }
  }

  triggerFailure(): void {
    if (!this.initialized || this.destroyed) return;

    this.pipelineSimulator.triggerFailure(this.simTime);
  }

  triggerDeployment(): void {
    if (!this.initialized || this.destroyed) return;

    this.pipelineSimulator.triggerDeployment(this.simTime);
  }

  createPullRequest(): void {
    if (!this.initialized || this.destroyed) return;

    this.pullRequestSimulator.createPullRequest(this.simTime);
  }

  destroy(): void {
    if (this.destroyed) return;

    this.stopClock();
    this.clock.destroy();
    this.pipelineSimulator.destroy();
    this.pullRequestSimulator.destroy();
    this.initialized = false;
    this.destroyed = true;
  }

  private initialize(): void {
    this.simTime = 0;
    this.recreateSimulators();

    const pipelineStartup = this.pipelineSimulator.createStartup(this.simTime);
    const snapshot: SimSnapshot = {
      runs: pipelineStartup.runs,
      history: pipelineStartup.history,
      pullRequests: this.pullRequestSimulator.createStartup(this.simTime),
      activity: pipelineStartup.activity,
      time: this.simTime,
    };

    this.dispatch({ type: 'SIM_RESET', seed: this.seed, snapshot });
    this.initialized = true;

    if (this.speed !== 1) this.dispatch({ type: 'SIM_SET_SPEED', speed: this.speed });
    if (!this.runningRequested) this.dispatch({ type: 'SIM_SET_RUNNING', running: false });
  }

  private recreateSimulators(): void {
    this.pipelineSimulator.destroy();
    this.pullRequestSimulator.destroy();

    const pipelineRng = createRng(this.seed);
    const pullRequestRng = createRng(this.seed ^ 0x9e3779b9);
    this.pipelineSimulator = new PipelineSimulator(this.dispatch, pipelineRng);
    this.pullRequestSimulator = new PullRequestSimulator(this.dispatch, pullRequestRng);
  }

  private startClock(): void {
    if (this.clockRunning || this.destroyed) return;

    this.clock.start();
    this.clockRunning = true;
  }

  private stopClock(): void {
    if (!this.clockRunning) return;

    this.clock.stop();
    this.clockRunning = false;
  }

  private handleClockTick = (deltaSimMinutes: number): void => {
    if (!this.initialized || !this.runningRequested || !this.clockRunning) return;

    this.simTime += deltaSimMinutes;
    this.dispatch({ type: 'SIM_TICK', deltaSim: deltaSimMinutes });
    this.pipelineSimulator.tick(this.simTime);
    this.pullRequestSimulator.tick(this.simTime);
  };
}

function normalizeSeed(seed: number): number {
  if (!Number.isFinite(seed)) return DEFAULT_SEED;
  return Math.trunc(seed) >>> 0;
}

export const simulation = new SimulationEngine();
