import type { CityEventId, CityEventSeverity, HealthBand } from '../state/gameState';

/**
 * Everything a city event definition is allowed to reason about.
 *
 * Built once per director tick from the store, so definitions stay declarative
 * and cheap, and so no definition can reach into simulation internals.
 */
export interface CityEventContext {
  health: number;
  band: HealthBand;
  simTime: number;
  runningRuns: number;
  /** Failed runs that ended within the last 240 simulated minutes. */
  recentFailures: number;
  /** Consecutive failures across recent history, newest first. */
  failureStreak: number;
  recentDeploys: number;
  successRate: number;
  openPrs: number;
  oldPrs: number;
  waitingPrs: number;
  averagePrAgeHours: number;
  /** Health now minus health about two real minutes ago. */
  healthDelta: number;
  activeSeverities: CityEventSeverity[];
}

export interface CityEventDefinition {
  id: CityEventId;
  name: string;
  blurb: string;
  severity: CityEventSeverity;
  durationMs: number;
  cooldownMs: number;
  canTrigger(ctx: CityEventContext): boolean;
  /** Relative selection weight. Zero means never right now. */
  weight(ctx: CityEventContext): number;
}
