import { createRng } from '../../simulation/MockData';
import { gameStore } from '../state/gameStore';
import {
  healthBand,
  prAgeHours,
  REPOSITORIES,
  type ActiveCityEvent,
  type CityEventId,
  type CityEventSeverity,
  type GameState,
} from '../state/gameState';
import { BUILDING_DOOR, CITY_CENTER, KEY_BUILDINGS } from '../world/cityLayout';
import { tileToWorld } from '../world/iso';
import { CITY_EVENT_DEFINITIONS } from './registry';
import type { CityEventContext, CityEventDefinition } from './types';

const EVALUATE_EVERY_MS = 2_000;
const MAX_ACTIVE_EVENTS = 3;
/** How much the last few events are punished so disasters do not repeat. */
const REPEAT_PENALTY = 0.12;
const RECENT_MEMORY = 3;

/** Global spacing between events of each severity, in real milliseconds. */
const SEVERITY_COOLDOWN: Record<CityEventSeverity, [number, number]> = {
  minor: [20_000, 40_000],
  moderate: [40_000, 90_000],
  major: [90_000, 180_000],
  chaotic: [240_000, 420_000],
};

/** Simulated minutes counted as "recent" for failures and deploys. */
const RECENT_WINDOW_SIM = 240;

/** Where each event should be watched from. */
const EVENT_FOCUS: Partial<Record<CityEventId, string>> = {
  'pr-protest': 'review-hall',
  'deployment-parade': 'deployment-port',
  fireworks: 'deployment-port',
  'bug-invasion': 'test-lab',
  'factory-fire': 'build-factory',
  'traffic-jam': 'packaging-station',
  'construction-boom': 'frontend-factory',
  'repair-crew': 'infra-factory',
};

/**
 * Watches the simulated engineering organization and stages funny city events.
 *
 * It only ever reads simulation state and only ever dispatches the two
 * presentation events, so a tornado can never delete a repository, a run or a
 * pull request. Selection is weighted and cooldown gated so rare disasters stay
 * rare and the same one does not repeat.
 */
export class CityEventDirector {
  private readonly rng: () => number;
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly endTimers = new Map<CityEventId, ReturnType<typeof setTimeout>>();
  private readonly cooldownUntil = new Map<CityEventId, number>();
  /** One global gate: the severity that fired decides how long the city rests. */
  private globalCooldownUntil = 0;
  private recent: CityEventId[] = [];
  /** Rolling health samples, newest last, used for the recovery signal. */
  private healthSamples: { at: number; health: number }[] = [];
  private offReset?: () => void;

  constructor(seed = 1337) {
    this.rng = createRng(seed);
  }

  start(): void {
    if (this.timer !== undefined) return;
    this.timer = setInterval(() => this.evaluate(), EVALUATE_EVERY_MS);
    // A fresh simulation deserves a fresh city: without this the cooldowns from
    // the previous run, up to seven minutes for a chaotic event, would silence
    // the reset city just when a presenter wants activity.
    this.offReset = gameStore.bus.on('SIM_RESET', () => this.reset());
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    this.offReset?.();
    this.offReset = undefined;
  }

  reset(): void {
    for (const [id, timer] of this.endTimers) {
      clearTimeout(timer);
      gameStore.dispatch({ type: 'CITY_EVENT_ENDED', eventId: id });
    }
    this.endTimers.clear();
    this.cooldownUntil.clear();
    this.globalCooldownUntil = 0;
    this.recent = [];
    this.healthSamples = [];
  }

  destroy(): void {
    this.stop();
    // reset() ends active events so nothing is left running without an end timer.
    this.reset();
  }

  /** Debug entry point. Same dispatch path as an automatic trigger. */
  force(id: CityEventId): void {
    const definition = CITY_EVENT_DEFINITIONS.find((candidate) => candidate.id === id);
    if (!definition) return;
    this.makeRoomFor(definition);
    this.fire(definition);
  }

  private evaluate() {
    const state = gameStore.getState();
    if (!state.sim.running) return;

    this.sampleHealth(state.cityHealth);
    const ctx = this.buildContext(state);
    const now = Date.now();

    if (state.cityEvents.active.length >= MAX_ACTIVE_EVENTS) return;
    if (this.globalCooldownUntil > now) return;

    const candidates: { definition: CityEventDefinition; weight: number }[] = [];
    for (const definition of CITY_EVENT_DEFINITIONS) {
      if ((this.cooldownUntil.get(definition.id) ?? 0) > now) continue;
      if (this.blockedByMajor(definition, ctx)) continue;
      if (!definition.canTrigger(ctx)) continue;

      let weight = definition.weight(ctx);
      if (weight <= 0) continue;
      const recentIndex = this.recent.indexOf(definition.id);
      if (recentIndex >= 0) weight *= REPEAT_PENALTY * (recentIndex + 1);
      candidates.push({ definition, weight });
    }

    if (candidates.length === 0) return;

    const total = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
    let roll = this.rng() * total;
    for (const candidate of candidates) {
      roll -= candidate.weight;
      if (roll <= 0) {
        this.fire(candidate.definition);
        return;
      }
    }
  }

  /** Only one headline disaster at a time; minor events may overlap. */
  private blockedByMajor(definition: CityEventDefinition, ctx: CityEventContext): boolean {
    const heavy = definition.severity === 'major' || definition.severity === 'chaotic';
    if (!heavy) return false;
    return ctx.activeSeverities.some((severity) => severity === 'major' || severity === 'chaotic');
  }

  private makeRoomFor(definition: CityEventDefinition) {
    const heavy = definition.severity === 'major' || definition.severity === 'chaotic';
    if (heavy) {
      for (const active of gameStore.getState().cityEvents.active) {
        if (active.severity === 'major' || active.severity === 'chaotic') this.end(active.id);
      }
    }
    // Forcing must not exceed the active cap either, or the debug grid could
    // stack thirteen simultaneous controllers.
    let active = gameStore.getState().cityEvents.active.filter((a) => a.id !== definition.id);
    while (active.length >= MAX_ACTIVE_EVENTS) {
      const oldest = active[active.length - 1];
      this.end(oldest.id);
      active = active.slice(0, -1);
    }
  }

  private fire(definition: CityEventDefinition) {
    const now = Date.now();
    const [minCooldown, maxCooldown] = SEVERITY_COOLDOWN[definition.severity];
    this.cooldownUntil.set(definition.id, now + definition.cooldownMs);
    this.globalCooldownUntil = now + minCooldown + this.rng() * (maxCooldown - minCooldown);
    this.recent = [definition.id, ...this.recent.filter((id) => id !== definition.id)].slice(
      0,
      RECENT_MEMORY,
    );

    const event: ActiveCityEvent = {
      id: definition.id,
      name: definition.name,
      blurb: definition.blurb,
      severity: definition.severity,
      startedAtSim: gameStore.getState().sim.time,
      endsAtReal: now + definition.durationMs,
      focus: this.focusFor(definition.id),
    };
    gameStore.dispatch({ type: 'CITY_EVENT_STARTED', event });

    clearTimeout(this.endTimers.get(definition.id));
    this.endTimers.set(
      definition.id,
      setTimeout(() => this.end(definition.id), definition.durationMs),
    );
  }

  private end(id: CityEventId) {
    clearTimeout(this.endTimers.get(id));
    this.endTimers.delete(id);
    gameStore.dispatch({ type: 'CITY_EVENT_ENDED', eventId: id });
  }

  private focusFor(id: CityEventId): { x: number; y: number } | null {
    const buildingId = EVENT_FOCUS[id];
    if (buildingId) {
      const def = KEY_BUILDINGS.find((candidate) => candidate.id === buildingId);
      if (def) return tileToWorld(def.tile);
      const door = BUILDING_DOOR[buildingId as keyof typeof BUILDING_DOOR];
      if (door) return tileToWorld(door);
    }
    if (id === 'tornado' || id === 'meteor' || id === 'ufo') return tileToWorld(CITY_CENTER);
    return null;
  }

  private sampleHealth(health: number) {
    const now = Date.now();
    this.healthSamples.push({ at: now, health });
    // Keep a little over two real minutes of samples.
    this.healthSamples = this.healthSamples.filter((sample) => now - sample.at <= 140_000);
  }

  private buildContext(state: GameState): CityEventContext {
    const simTime = state.sim.time;
    // `runs` is capped at 12 and evicts finished runs first, so completed
    // outcomes can vanish while still inside the recent window. History keeps
    // them, which is what these signals are defined to measure.
    const flatHistory = REPOSITORIES.flatMap((repo) => state.history[repo.id] ?? []).sort(
      (a, b) => b.endedAtSim - a.endedAtSim,
    );
    const recent = flatHistory.filter((entry) => simTime - entry.endedAtSim <= RECENT_WINDOW_SIM);
    const recentFailures = recent.filter((entry) => entry.status === 'failed').length;
    const recentDeploys = recent.filter((entry) => entry.status === 'success').length;
    const window = flatHistory.slice(0, 20);
    const successes = window.filter((entry) => entry.status === 'success').length;
    let failureStreak = 0;
    for (const entry of flatHistory) {
      if (entry.status !== 'failed') break;
      failureStreak += 1;
    }

    const ages = state.pullRequests.map((pr) => prAgeHours(pr, simTime));
    const oldest = ages.filter((age) => age > 48).length;
    const averageAge = ages.length > 0 ? ages.reduce((a, b) => a + b, 0) / ages.length : 0;

    const oldestSample = this.healthSamples[0];
    const healthDelta = oldestSample ? state.cityHealth - oldestSample.health : 0;

    return {
      health: state.cityHealth,
      band: healthBand(state.cityHealth),
      simTime,
      runningRuns: state.runs.filter((run) => run.status === 'running').length,
      recentFailures,
      failureStreak,
      recentDeploys,
      successRate: window.length > 0 ? successes / window.length : 1,
      openPrs: state.pullRequests.length,
      oldPrs: oldest,
      waitingPrs: state.pullRequests.filter((pr) => pr.status === 'waiting').length,
      averagePrAgeHours: averageAge,
      healthDelta,
      activeSeverities: state.cityEvents.active.map((active) => active.severity),
    };
  }
}

export const cityEvents = new CityEventDirector();
