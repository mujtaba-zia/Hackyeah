import { buildCity } from "../core/buildCity";
import { selectRepos } from "../core/selectRepos";
import { normalizeConfig } from "../shared/config";
import { RULE_IDS } from "../shared/types";
import type {
  AppConfig,
  CityModel,
  ClientState,
  MockOp,
  ProviderKind,
  RepoChoice,
  RepoInfo,
  RuleId,
  ServerStatus,
  Snapshot,
  Thresholds,
} from "../shared/types";
import { ProviderError, type MockProvider, type Provider } from "./providers/types";

const SECOND_MS = 1000;

export interface ProviderRegistry {
  mock: MockProvider;
  azure?: Provider;
  github?: Provider;
}

export type StateTimer = NodeJS.Timeout | number;

export interface StateTimers {
  setTimeout(callback: () => void, delayMs: number): StateTimer;
  clearTimeout(timer: StateTimer): void;
}

export interface StateLogger {
  log(message: string): void;
}

export interface GameStateOptions {
  config: AppConfig;
  providers: ProviderRegistry;
  now?: () => Date;
  timers?: StateTimers;
  logger?: StateLogger;
}

export interface StateCommandResult {
  error?: string;
}

const SYSTEM_TIMERS: StateTimers = {
  setTimeout(callback: () => void, delayMs: number): StateTimer {
    return setTimeout(callback, delayMs);
  },
  clearTimeout(timer: StateTimer): void {
    clearTimeout(timer);
  },
};

function sameStringLists(left: string[] | null, right: string[] | null): boolean {
  if (left === null || right === null) return left === right;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function sameThresholds(left: Thresholds, right: Thresholds): boolean {
  if (left.staleDays !== right.staleDays || left.waitingHours !== right.waitingHours) return false;
  if (left.crowdSize !== right.crowdSize || left.draftPileup !== right.draftPileup) return false;
  return left.failStreakHot === right.failStreakHot && left.releaseStaleDays === right.releaseStaleDays;
}

function sameRules(left: Record<RuleId, boolean>, right: Record<RuleId, boolean>): boolean {
  for (const ruleId of RULE_IDS) {
    if (left[ruleId] !== right[ruleId]) return false;
  }
  return true;
}

function sameCoverage(left: Record<string, string[]>, right: Record<string, string[]>): boolean {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  for (let index = 0; index < leftKeys.length; index += 1) {
    const key = leftKeys[index];
    if (key === undefined || key !== rightKeys[index] || !sameStringLists(left[key] ?? null, right[key] ?? null)) {
      return false;
    }
  }
  return true;
}

function copyConfig(config: AppConfig): AppConfig {
  const coverage: Record<string, string[]> = {};
  for (const [pipeline, repos] of Object.entries(config.coverage)) coverage[pipeline] = [...repos];
  return {
    ...config,
    watchedRepoIds: config.watchedRepoIds === null ? null : [...config.watchedRepoIds],
    thresholds: { ...config.thresholds },
    rules: { ...config.rules },
    coverage,
  };
}

function repoChoices(repos: RepoInfo[]): RepoChoice[] {
  const choices = repos.map(({ id, name, project }) => ({ id, name, project }));
  choices.sort((left, right) => {
    const byName = left.name.localeCompare(right.name);
    if (byName !== 0) return byName;
    return left.id.localeCompare(right.id);
  });
  return choices;
}


function pollError(error: unknown, config: AppConfig): { phase: "error" | "throttled"; message: string; delaySeconds: number } {
  if (error instanceof ProviderError) {
    if (error.code === "throttled") {
      const retryAfter = error.retryAfterSeconds !== undefined && Number.isFinite(error.retryAfterSeconds)
        ? Math.max(0, error.retryAfterSeconds)
        : 0;
      return {
        phase: "throttled",
        message: "The provider is temporarily throttling requests.",
        delaySeconds: Math.max(retryAfter, config.pollSeconds * 2),
      };
    }
    if (error.code === "auth") {
      return { phase: "error", message: "Provider authentication failed.", delaySeconds: config.pollSeconds };
    }
    if (error.code === "notFound") {
      return { phase: "error", message: "A requested provider resource was not found.", delaySeconds: config.pollSeconds };
    }
    if (error.code === "config") {
      return { phase: "error", message: "Provider configuration is invalid.", delaySeconds: config.pollSeconds };
    }
  }
  return { phase: "error", message: "The provider could not be reached.", delaySeconds: config.pollSeconds };
}

/** In-memory source of truth for every connected browser tab. */
export class GameState {
  private readonly providers: ProviderRegistry;
  private readonly clock: () => Date;
  private readonly timers: StateTimers;
  private readonly logger: StateLogger;
  private readonly listeners = new Set<() => void>();

  private config: AppConfig;
  private activeProvider: Provider;
  private lastSnapshot: Snapshot | null = null;
  private city: CityModel | null = null;
  private catalog: RepoChoice[] = [];
  private status: ServerStatus;
  private timer: StateTimer | undefined;
  private inFlight: Promise<void> | undefined;
  private generation = 0;
  private running = false;

  constructor(options: GameStateOptions) {
    this.providers = options.providers;
    this.clock = options.now ?? (() => new Date());
    this.timers = options.timers ?? SYSTEM_TIMERS;
    this.logger = options.logger ?? console;

    const requestedConfig = normalizeConfig(options.config);
    const configuredProvider = this.providerFor(requestedConfig.provider);
    this.activeProvider = configuredProvider ?? this.providers.mock;
    this.config = configuredProvider === undefined
      ? { ...requestedConfig, provider: "mock" }
      : requestedConfig;

    if (this.activeProvider.kind === "mock") this.providers.mock.load(this.config.scenario);
    this.status = { provider: this.config.provider, phase: "loading" };
  }

  getClientState(): ClientState {
    const available: Record<ProviderKind, boolean> = {
      mock: true,
      azure: this.providers.azure !== undefined,
      github: this.providers.github !== undefined,
    };
    return {
      config: copyConfig(this.config),
      status: { ...this.status },
      city: this.city,
      repoCatalog: this.catalog.map((repo) => ({ ...repo })),
      scenarios: this.activeProvider.kind === "mock" ? this.providers.mock.scenarios() : [],
      available,
      sourceLabel: this.activeProvider.label,
    };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.poll();
  }

  stop(): void {
    this.running = false;
    this.clearScheduledPoll();
  }

  poll(): Promise<void> {
    if (this.inFlight !== undefined) return this.inFlight;
    const promise = this.executePoll(this.generation);
    this.inFlight = promise;
    void promise.then(() => {
      if (this.inFlight === promise) this.inFlight = undefined;
    });
    return promise;
  }

  async refresh(): Promise<void> {
    this.clearScheduledPoll();
    await this.poll();
  }

  async setConfig(patch: unknown): Promise<StateCommandResult> {
    const nextConfig = normalizeConfig(patch, this.config);
    const targetProvider = this.providerFor(nextConfig.provider);
    if (targetProvider === undefined) return { error: "That provider is not configured on this server." };

    const providerChanged = targetProvider !== this.activeProvider;
    const scenarioChanged = nextConfig.provider === "mock" && nextConfig.scenario !== this.config.scenario;
    if ((providerChanged && targetProvider.kind === "mock") || scenarioChanged) {
      try {
        this.providers.mock.load(nextConfig.scenario);
      } catch {
        return { error: "That mock scenario is not available." };
      }
    }

    const limitsChanged =
      !sameStringLists(nextConfig.watchedRepoIds, this.config.watchedRepoIds) ||
      nextConfig.maxRepos !== this.config.maxRepos ||
      nextConfig.maxPrsPerRepo !== this.config.maxPrsPerRepo ||
      !sameCoverage(nextConfig.coverage, this.config.coverage);
    const cityRulesChanged =
      !sameThresholds(nextConfig.thresholds, this.config.thresholds) ||
      !sameRules(nextConfig.rules, this.config.rules);
    const pollIntervalChanged = nextConfig.pollSeconds !== this.config.pollSeconds;

    if (providerChanged || scenarioChanged) {
      this.activeProvider = targetProvider;
      this.config = nextConfig;
      this.lastSnapshot = null;
      this.city = null;
      this.catalog = [];
      this.beginReload();
      await this.reloadAfterCurrentPoll();
      return {};
    }

    this.config = nextConfig;
    if (limitsChanged) {
      this.beginReload();
      await this.reloadAfterCurrentPoll();
      return {};
    }

    let changed = cityRulesChanged || pollIntervalChanged;
    if (cityRulesChanged && this.lastSnapshot !== null) {
      this.city = buildCity(this.lastSnapshot, this.config, this.currentDate());
    }
    if (pollIntervalChanged) this.reschedulePoll();
    if (changed) this.emitChange();
    return {};
  }

  async applyMockOp(op: MockOp): Promise<StateCommandResult> {
    if (this.activeProvider.kind !== "mock") return { error: "Mock operations are only available for the mock provider." };
    try {
      this.providers.mock.apply(op);
    } catch (error) {
      if (error instanceof ProviderError && error.code === "notFound") {
        return { error: "The requested mock item was not found." };
      }
      return { error: "The mock operation could not be applied." };
    }

    this.beginReload();
    await this.reloadAfterCurrentPoll();
    return {};
  }

  private providerFor(kind: ProviderKind): Provider | undefined {
    switch (kind) {
      case "mock":
        return this.providers.mock;
      case "azure":
        return this.providers.azure;
      case "github":
        return this.providers.github;
    }
  }

  private beginReload(): void {
    this.generation += 1;
    this.clearScheduledPoll();
    this.status = {
      provider: this.config.provider,
      phase: "loading",
      lastSuccessAt: this.status.lastSuccessAt,
    };
    this.emitChange();
  }

  private async reloadAfterCurrentPoll(): Promise<void> {
    const existingPoll = this.inFlight;
    if (existingPoll !== undefined) {
      await existingPoll;
      if (this.inFlight === existingPoll) this.inFlight = undefined;
    }
    await this.poll();
  }

  private async executePoll(generation: number): Promise<void> {
    const provider = this.activeProvider;
    const config = this.config;
    try {
      const allRepos = await provider.listRepos();
      const selectedRepos = selectRepos(allRepos, config);
      const snapshot = await provider.fetchSnapshot({
        repoIds: selectedRepos.map((repo) => repo.id),
        maxPrsPerRepo: config.maxPrsPerRepo,
        coverage: config.coverage,
      });
      const now = this.currentDate();
      const city = buildCity(snapshot, config, now);
      if (generation !== this.generation || provider !== this.activeProvider) return;

      this.lastSnapshot = snapshot;
      this.city = city;
      this.catalog = repoChoices(allRepos);
      const delaySeconds = config.pollSeconds;
      this.status = {
        provider: config.provider,
        phase: "ok",
        lastSuccessAt: now.toISOString(),
        nextPollAt: new Date(now.getTime() + delaySeconds * SECOND_MS).toISOString(),
      };
      this.schedulePoll(delaySeconds);
      this.logger.log(`Poll ${provider.kind} completed: ${snapshot.repos.length} repos, ${city.incidents.length} incidents.`);
      this.emitChange();
    } catch (error) {
      if (generation !== this.generation || provider !== this.activeProvider) return;

      const now = this.currentDate();
      const outcome = pollError(error, config);
      this.status = {
        provider: config.provider,
        phase: outcome.phase,
        message: outcome.message,
        lastSuccessAt: this.status.lastSuccessAt,
        nextPollAt: new Date(now.getTime() + outcome.delaySeconds * SECOND_MS).toISOString(),
      };
      this.schedulePoll(outcome.delaySeconds);
      this.logger.log(`Poll ${provider.kind} ${outcome.phase}.`);
      this.emitChange();
    }
  }

  private currentDate(): Date {
    const now = this.clock();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
      throw new Error("The server clock returned an invalid date");
    }
    return now;
  }

  private schedulePoll(delaySeconds: number): void {
    if (!this.running) return;
    this.clearScheduledPoll();
    this.timer = this.timers.setTimeout(() => {
      this.timer = undefined;
      void this.poll();
    }, delaySeconds * SECOND_MS);
  }

  private reschedulePoll(): void {
    if (this.status.phase === "throttled") return;
    const now = this.currentDate();
    this.status = {
      ...this.status,
      nextPollAt: new Date(now.getTime() + this.config.pollSeconds * SECOND_MS).toISOString(),
    };
    this.schedulePoll(this.config.pollSeconds);
  }

  private clearScheduledPoll(): void {
    if (this.timer === undefined) return;
    this.timers.clearTimeout(this.timer);
    this.timer = undefined;
  }

  private emitChange(): void {
    for (const listener of this.listeners) listener();
  }
}

/** Creates a state manager with injectable providers, clock, timers, and logging for deterministic use. */
export function createGameState(options: GameStateOptions): GameState {
  return new GameState(options);
}
