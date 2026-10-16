import type { MockOp, ProviderKind, RepoInfo, Snapshot } from "../../shared/types";

export interface FetchLimits {
  /** Repo ids to fetch PRs/pipelines for (already resolved from the watch list and cap). */
  repoIds: string[];
  maxPrsPerRepo: number;
  /** Pipeline name -> extra repo names it covers, from AppConfig.coverage. */
  coverage: Record<string, string[]>;
}

/**
 * A read-only source of repositories, pull requests and pipelines.
 * Implementations never write to the remote system and never expose credentials.
 */
export interface Provider {
  readonly kind: ProviderKind;
  /** Short, secret-free label for the status pill: scenario, org, or owner. */
  readonly label: string;
  /** Every repository the credentials can see. Cheap enough to call on each poll. */
  listRepos(): Promise<RepoInfo[]>;
  /** `repos` in the result are exactly the requested ones that still exist. */
  fetchSnapshot(limits: FetchLimits): Promise<Snapshot>;
}

export interface MockProvider extends Provider {
  readonly kind: "mock";
  scenarios(): string[];
  /** Throws ProviderError("notFound") for an unknown scenario. */
  load(scenario: string): void;
  apply(op: MockOp): void;
}

export type ProviderErrorCode = "auth" | "notFound" | "throttled" | "network" | "config";

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly retryAfterSeconds: number | undefined;

  constructor(code: ProviderErrorCode, message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Injected into HTTP providers so tests can run against a fake API. */
export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;
