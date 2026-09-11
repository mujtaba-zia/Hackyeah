import { SIM_MINUTES_PER_SECOND } from '../game/state/gameState';

const TICK_INTERVAL_MS = 250;
const MAX_ELAPSED_MS = 1_000;

type SimulationSpeed = 1 | 2 | 4;
type IntervalId = number;

/** Converts wall-clock elapsed time into bounded simulated minutes. */
export class SimulationClock {
  private readonly onTick: (deltaSimMinutes: number) => void;
  private intervalId: IntervalId | null = null;
  private lastTickAt = 0;
  private speed: SimulationSpeed = 1;
  private destroyed = false;

  constructor(onTick: (deltaSimMinutes: number) => void) {
    this.onTick = onTick;
  }

  start(): void {
    if (this.destroyed || this.intervalId !== null) return;

    this.lastTickAt = performance.now();
    this.intervalId = setInterval(this.advance, TICK_INTERVAL_MS);
  }

  stop(): void {
    if (this.intervalId === null) return;

    clearInterval(this.intervalId);
    this.intervalId = null;
    this.lastTickAt = 0;
  }

  setSpeed(speed: SimulationSpeed): void {
    if (this.destroyed || this.speed === speed) return;

    if (this.intervalId !== null) this.advance();
    this.speed = speed;
  }

  destroy(): void {
    if (this.destroyed) return;

    this.stop();
    this.destroyed = true;
  }

  private advance = (): void => {
    const now = performance.now();
    const elapsedMs = Math.min(Math.max(now - this.lastTickAt, 0), MAX_ELAPSED_MS);
    this.lastTickAt = now;

    const deltaSimMinutes = (elapsedMs / 1_000) * SIM_MINUTES_PER_SECOND * this.speed;
    if (deltaSimMinutes > 0) this.onTick(deltaSimMinutes);
  };
}
