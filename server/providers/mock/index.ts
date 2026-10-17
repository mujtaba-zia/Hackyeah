import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { isRecord } from "../../../shared/guards";
import type {
  CheckState,
  MockOp,
  PipelineInfo,
  PipelineKind,
  PipelineRun,
  PullRequestInfo,
  RepoInfo,
  ReviewVerdict,
  RunResult,
  Snapshot,
} from "../../../shared/types";
import { ProviderError, type FetchLimits, type MockProvider } from "../types";

const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_SCENARIO_DIR = fileURLToPath(new URL("./scenarios", import.meta.url));

const REVIEW_VERDICTS: Record<ReviewVerdict, true> = {
  none: true,
  approved: true,
  changesRequested: true,
  waitingOnAuthor: true,
  rejected: true,
};

const CHECK_STATES: Record<CheckState, true> = {
  none: true,
  pending: true,
  success: true,
  failure: true,
};

const RUN_RESULTS: Record<RunResult, true> = {
  success: true,
  failure: true,
  partial: true,
  cancelled: true,
  running: true,
  queued: true,
  none: true,
};

const PIPELINE_KINDS: Record<PipelineKind, true> = {
  ci: true,
  release: true,
};

const COMPLETED_RUN_RESULTS: Record<RunResult, boolean> = {
  success: true,
  failure: true,
  partial: true,
  cancelled: true,
  running: false,
  queued: false,
  none: false,
};

const GENERATED_PIPELINE_NAMES = ["Lint", "Unit tests", "Integration tests", "Security scan", "Docs build", "Nightly"];
const GENERATED_RELEASE_NAMES = ["Deploy staging", "Release", "Deploy production"];

const GENERATED_TITLES = [
  "Tighten audit logging",
  "Polish the deployment summary",
  "Improve cache warming",
  "Clarify the account handoff",
  "Simplify the build matrix",
] as const;

const GENERATED_AUTHORS = ["Avery Chen", "Noor Patel", "Mika Sato", "Jordan Bell", "Riley Morgan"] as const;

interface ScenarioData {
  repos: RepoInfo[];
  pullRequests: PullRequestInfo[];
  pipelines: PipelineInfo[];
}

export interface MockProviderOptions {
  now?: () => Date;
  scenarioDir?: string;
}

function invalidScenario(scenario: string, detail: string): never {
  throw new ProviderError("config", `Mock scenario \"${scenario}\" is invalid: ${detail}`);
}

function requiredObject(value: unknown, scenario: string, path: string): Record<string, unknown> {
  if (!isRecord(value)) invalidScenario(scenario, `${path} must be an object`);
  return value;
}

function requiredArray(value: unknown, scenario: string, path: string): unknown[] {
  if (!Array.isArray(value)) invalidScenario(scenario, `${path} must be an array`);
  return value;
}

function requiredString(record: Record<string, unknown>, key: string, scenario: string, path: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    invalidScenario(scenario, `${path}.${key} must be a non-empty string`);
  }
  return value;
}

function optionalString(record: Record<string, unknown>, key: string, scenario: string, path: string): string | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") invalidScenario(scenario, `${path}.${key} must be a string`);
  return value;
}

function requiredBoolean(record: Record<string, unknown>, key: string, scenario: string, path: string): boolean {
  const value = record[key];
  if (typeof value !== "boolean") invalidScenario(scenario, `${path}.${key} must be a boolean`);
  return value;
}

function requiredNumber(
  record: Record<string, unknown>,
  key: string,
  scenario: string,
  path: string,
  minimum = 0,
): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    invalidScenario(scenario, `${path}.${key} must be a finite number at least ${minimum}`);
  }
  return value;
}

function requiredInteger(
  record: Record<string, unknown>,
  key: string,
  scenario: string,
  path: string,
  minimum = 0,
): number {
  const value = requiredNumber(record, key, scenario, path, minimum);
  if (!Number.isSafeInteger(value)) invalidScenario(scenario, `${path}.${key} must be an integer`);
  return value;
}

function enumValue<T extends string>(
  record: Record<string, unknown>,
  key: string,
  values: Record<T, true>,
  scenario: string,
  path: string,
): T {
  const value = requiredString(record, key, scenario, path);
  if (!Object.hasOwn(values, value)) invalidScenario(scenario, `${path}.${key} is not supported`);
  return value as T;
}

function ageTimestamp(now: Date, ageHours: number): string {
  return new Date(now.getTime() - ageHours * HOUR_MS).toISOString();
}


function parseRepo(value: unknown, scenario: string, index: number): RepoInfo {
  const path = `repos[${index}]`;
  const record = requiredObject(value, scenario, path);
  const repo: RepoInfo = {
    id: requiredString(record, "id", scenario, path),
    name: requiredString(record, "name", scenario, path),
    project: optionalString(record, "project", scenario, path) ?? "Mock",
  };
  const url = optionalString(record, "url", scenario, path);
  const defaultBranch = optionalString(record, "defaultBranch", scenario, path);
  if (url !== undefined) repo.url = url;
  if (defaultBranch !== undefined) repo.defaultBranch = defaultBranch;
  return repo;
}

function parsePullRequest(value: unknown, scenario: string, index: number, now: Date): PullRequestInfo {
  const path = `pullRequests[${index}]`;
  const record = requiredObject(value, scenario, path);
  const ageHours = requiredNumber(record, "ageHours", scenario, path);
  const pullRequest: PullRequestInfo = {
    id: requiredString(record, "id", scenario, path),
    repoId: requiredString(record, "repoId", scenario, path),
    number: requiredInteger(record, "number", scenario, path, 1),
    title: requiredString(record, "title", scenario, path),
    author: requiredString(record, "author", scenario, path),
    draft: requiredBoolean(record, "draft", scenario, path),
    createdAt: ageTimestamp(now, ageHours),
    updatedAt: ageTimestamp(now, ageHours),
    reviewers: requiredInteger(record, "reviewers", scenario, path),
    verdict: enumValue(record, "verdict", REVIEW_VERDICTS, scenario, path),
    hasConflicts: requiredBoolean(record, "hasConflicts", scenario, path),
    checks: enumValue(record, "checks", CHECK_STATES, scenario, path),
  };
  const url = optionalString(record, "url", scenario, path);
  if (url !== undefined) pullRequest.url = url;
  return pullRequest;
}

function parseRun(value: unknown, scenario: string, pipelinePath: string, index: number, now: Date): PipelineRun {
  const path = `${pipelinePath}.runs[${index}]`;
  const record = requiredObject(value, scenario, path);
  const ageHours = requiredNumber(record, "ageHours", scenario, path);
  const result = enumValue(record, "result", RUN_RESULTS, scenario, path);
  const timestamp = ageTimestamp(now, ageHours);
  const run: PipelineRun = {
    id: requiredString(record, "id", scenario, path),
    result,
    startedAt: timestamp,
  };
  if (COMPLETED_RUN_RESULTS[result]) run.finishedAt = timestamp;
  const branch = optionalString(record, "branch", scenario, path);
  const url = optionalString(record, "url", scenario, path);
  if (branch !== undefined) run.branch = branch;
  if (url !== undefined) run.url = url;
  return run;
}

function parsePipeline(value: unknown, scenario: string, index: number, now: Date): PipelineInfo {
  const path = `pipelines[${index}]`;
  const record = requiredObject(value, scenario, path);
  const homeRepoIdValue = record.homeRepoId;
  if (homeRepoIdValue !== null && (typeof homeRepoIdValue !== "string" || homeRepoIdValue.length === 0)) {
    invalidScenario(scenario, `${path}.homeRepoId must be a non-empty string or null`);
  }
  const coversValues = requiredArray(record.coversRepoIds, scenario, `${path}.coversRepoIds`);
  const coversRepoIds = coversValues.map((coveredRepoId, coveredIndex) => {
    if (typeof coveredRepoId !== "string" || coveredRepoId.length === 0) {
      invalidScenario(scenario, `${path}.coversRepoIds[${coveredIndex}] must be a non-empty string`);
    }
    return coveredRepoId;
  });
  const runsValue = requiredArray(record.runs, scenario, `${path}.runs`);
  const pipeline: PipelineInfo = {
    id: requiredString(record, "id", scenario, path),
    name: requiredString(record, "name", scenario, path),
    homeRepoId: homeRepoIdValue,
    coversRepoIds,
    kind: enumValue(record, "kind", PIPELINE_KINDS, scenario, path),
    runs: runsValue.map((run, runIndex) => parseRun(run, scenario, path, runIndex, now)),
  };
  const url = optionalString(record, "url", scenario, path);
  if (url !== undefined) pipeline.url = url;
  pipeline.runs.sort((left, right) => Date.parse(right.startedAt ?? "") - Date.parse(left.startedAt ?? ""));
  return pipeline;
}

function ensureUniqueIds<T extends { id: string }>(items: T[], scenario: string, label: string): void {
  const ids: Record<string, true> = Object.create(null);
  for (const item of items) {
    if (Object.hasOwn(ids, item.id)) invalidScenario(scenario, `${label} contains duplicate id \"${item.id}\"`);
    ids[item.id] = true;
  }
}

function parseScenario(text: string, scenario: string, now: Date): ScenarioData {
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    invalidScenario(scenario, "it is not valid JSON");
  }

  const record = requiredObject(raw, scenario, "root");
  const repos = requiredArray(record.repos, scenario, "repos").map((repo, index) => parseRepo(repo, scenario, index));
  const pullRequests = requiredArray(record.pullRequests, scenario, "pullRequests").map((pullRequest, index) =>
    parsePullRequest(pullRequest, scenario, index, now),
  );
  const pipelines = requiredArray(record.pipelines, scenario, "pipelines").map((pipeline, index) =>
    parsePipeline(pipeline, scenario, index, now),
  );

  ensureUniqueIds(repos, scenario, "repos");
  ensureUniqueIds(pullRequests, scenario, "pullRequests");
  ensureUniqueIds(pipelines, scenario, "pipelines");
  for (const pipeline of pipelines) {
    ensureUniqueIds(pipeline.runs, scenario, `runs for pipeline "${pipeline.id}"`);
  }

  const repoIds: Record<string, true> = Object.create(null);
  for (const repo of repos) repoIds[repo.id] = true;
  for (const pullRequest of pullRequests) {
    if (!Object.hasOwn(repoIds, pullRequest.repoId)) {
      invalidScenario(scenario, `pull request \"${pullRequest.id}\" references an unknown repo`);
    }
  }
  for (const pipeline of pipelines) {
    if (pipeline.homeRepoId !== null && !Object.hasOwn(repoIds, pipeline.homeRepoId)) {
      invalidScenario(scenario, `pipeline \"${pipeline.id}\" references an unknown home repo`);
    }
    for (const repoId of pipeline.coversRepoIds) {
      if (!Object.hasOwn(repoIds, repoId)) {
        invalidScenario(scenario, `pipeline \"${pipeline.id}\" covers an unknown repo`);
      }
    }
  }

  return { repos, pullRequests, pipelines };
}

function coveredRepoIds(
  pipeline: PipelineInfo,
  coverage: Record<string, string[]>,
  visibleRepos: RepoInfo[],
): string[] {
  const visibleById: Record<string, true> = Object.create(null);
  const covered: Record<string, true> = Object.create(null);
  for (const repo of visibleRepos) visibleById[repo.id] = true;

  for (const repoId of pipeline.coversRepoIds) {
    if (Object.hasOwn(visibleById, repoId)) covered[repoId] = true;
  }
  if (pipeline.homeRepoId !== null && Object.hasOwn(visibleById, pipeline.homeRepoId)) {
    covered[pipeline.homeRepoId] = true;
  }

  const matchingCoverage = Object.entries(coverage).find(([name]) => name.toLowerCase() === pipeline.name.toLowerCase());
  if (matchingCoverage !== undefined) {
    for (const target of matchingCoverage[1]) {
      const normalized = target.toLowerCase();
      for (const repo of visibleRepos) {
        if (repo.name.toLowerCase() === normalized || `${repo.project}/${repo.name}`.toLowerCase() === normalized) {
          covered[repo.id] = true;
        }
      }
    }
  }

  return visibleRepos.filter((repo) => Object.hasOwn(covered, repo.id)).map((repo) => repo.id);
}

function validNow(clock: () => Date): Date {
  const now = clock();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new ProviderError("config", "Mock provider clock returned an invalid date");
  }
  return now;
}

class ScenarioMockProvider implements MockProvider {
  readonly kind = "mock" as const;

  private data: ScenarioData = { repos: [], pullRequests: [], pipelines: [] };
  private currentScenario = "";
  private operationNumber = 0;

  constructor(
    private readonly clock: () => Date,
    private readonly scenarioDir: string,
  ) {
    this.load("demo");
  }

  get label(): string {
    return this.currentScenario;
  }

  scenarios(): string[] {
    let entries: string[];
    try {
      entries = readdirSync(this.scenarioDir);
    } catch {
      throw new ProviderError("config", "Mock scenario directory could not be read");
    }
    return entries
      .filter((entry) => entry.endsWith(".json"))
      .map((entry) => entry.slice(0, -".json".length))
      .sort();
  }

  load(scenario: string): void {
    if (!this.scenarios().includes(scenario)) {
      throw new ProviderError("notFound", `Mock scenario not found: ${scenario}`);
    }

    let text: string;
    try {
      text = readFileSync(resolve(this.scenarioDir, `${scenario}.json`), "utf8");
    } catch {
      throw new ProviderError("config", `Mock scenario \"${scenario}\" could not be read`);
    }

    const data = parseScenario(text, scenario, validNow(this.clock));
    this.data = data;
    this.currentScenario = scenario;
    this.operationNumber = 0;
  }

  async listRepos(): Promise<RepoInfo[]> {
    return this.data.repos.map((repo) => ({ ...repo }));
  }

  async fetchSnapshot(limits: FetchLimits): Promise<Snapshot> {
    const requestedIds: Record<string, true> = Object.create(null);
    for (const repoId of limits.repoIds) requestedIds[repoId] = true;

    const repos = this.data.repos.filter((repo) => Object.hasOwn(requestedIds, repo.id)).map((repo) => ({ ...repo }));
    const selectedIds: Record<string, true> = Object.create(null);
    for (const repo of repos) selectedIds[repo.id] = true;

    const maximumPullRequests = Number.isFinite(limits.maxPrsPerRepo)
      ? Math.max(0, Math.floor(limits.maxPrsPerRepo))
      : 0;
    const pullRequestCounts: Record<string, number> = Object.create(null);
    const pullRequests: PullRequestInfo[] = [];
    for (const pullRequest of this.data.pullRequests) {
      if (!Object.hasOwn(selectedIds, pullRequest.repoId)) continue;
      const count = pullRequestCounts[pullRequest.repoId] ?? 0;
      if (count >= maximumPullRequests) continue;
      pullRequestCounts[pullRequest.repoId] = count + 1;
      pullRequests.push({ ...pullRequest });
    }

    const pipelines: PipelineInfo[] = [];
    for (const source of this.data.pipelines) {
      const pipeline: PipelineInfo = {
        ...source,
        coversRepoIds: [...source.coversRepoIds],
        runs: source.runs.map((run) => ({ ...run })),
      };
      pipeline.coversRepoIds = coveredRepoIds(pipeline, limits.coverage, repos);
      const homeIsSelected = pipeline.homeRepoId !== null && Object.hasOwn(selectedIds, pipeline.homeRepoId);
      if (!homeIsSelected && pipeline.homeRepoId !== null && pipeline.coversRepoIds.length === 0) continue;
      pipelines.push(pipeline);
    }

    return {
      provider: "mock",
      fetchedAt: validNow(this.clock).toISOString(),
      repos,
      pullRequests,
      pipelines,
    };
  }

  apply(op: MockOp): void {
    switch (op.kind) {
      case "setPipelineResult":
        this.setPipelineResult(op.pipelineId, op.result);
        return;
      case "addPullRequest":
        this.addPullRequest(op.repoId, op.draft);
        return;
      case "addPipeline":
        this.addPipeline(op.repoId, op.release);
        return;
      case "agePullRequests":
        this.agePullRequests(op.days);
        return;
      case "reset":
        this.load(this.currentScenario);
        return;
      default:
        throw new ProviderError("config", "Mock operation is not supported");
    }
  }

  private setPipelineResult(pipelineId: string, result: RunResult): void {
    const pipeline = this.data.pipelines.find((candidate) => candidate.id === pipelineId);
    if (pipeline === undefined) throw new ProviderError("notFound", `Mock pipeline not found: ${pipelineId}`);
    if (!Object.hasOwn(RUN_RESULTS, result)) throw new ProviderError("config", "Mock pipeline result is not supported");

    const runIds: Record<string, true> = Object.create(null);
    for (const candidate of this.data.pipelines) {
      for (const run of candidate.runs) runIds[run.id] = true;
    }
    this.operationNumber += 1;
    while (Object.hasOwn(runIds, `mock:run:${this.operationNumber}`)) this.operationNumber += 1;
    const timestamp = validNow(this.clock).toISOString();
    const run: PipelineRun = {
      id: `mock:run:${this.operationNumber}`,
      result,
      startedAt: timestamp,
    };
    if (COMPLETED_RUN_RESULTS[result]) run.finishedAt = timestamp;
    pipeline.runs.unshift(run);
    pipeline.runs.splice(10);
  }

  private addPullRequest(repoId: string, draft: boolean): void {
    const repo = this.data.repos.find((candidate) => candidate.id === repoId);
    if (repo === undefined) throw new ProviderError("notFound", `Mock repository not found: ${repoId}`);
    if (typeof draft !== "boolean") throw new ProviderError("config", "Mock pull request draft flag must be a boolean");

    let number = 0;
    const pullRequestIds: Record<string, true> = Object.create(null);
    for (const pullRequest of this.data.pullRequests) {
      pullRequestIds[pullRequest.id] = true;
      if (pullRequest.repoId === repoId) number = Math.max(number, pullRequest.number);
    }
    this.operationNumber += 1;
    while (Object.hasOwn(pullRequestIds, `mock:pr:${this.operationNumber}`)) this.operationNumber += 1;
    const generatedIndex = (this.operationNumber - 1) % GENERATED_TITLES.length;
    const title = GENERATED_TITLES[generatedIndex] ?? "Update project notes";
    const author = GENERATED_AUTHORS[generatedIndex] ?? "Avery Chen";
    const timestamp = validNow(this.clock).toISOString();
    this.data.pullRequests.unshift({
      id: `mock:pr:${this.operationNumber}`,
      repoId,
      number: number + 1,
      title: `${title} for ${repo.name}`,
      author,
      draft,
      createdAt: timestamp,
      updatedAt: timestamp,
      reviewers: 0,
      verdict: "none",
      hasConflicts: false,
      checks: "none",
    });
  }

  /** A new pipeline appears with one passing run, the way a freshly added workflow would. */
  private addPipeline(repoId: string, release: boolean): void {
    const repo = this.data.repos.find((candidate) => candidate.id === repoId);
    if (repo === undefined) throw new ProviderError("notFound", `Mock repository not found: ${repoId}`);
    if (typeof release !== "boolean") throw new ProviderError("config", "Mock pipeline release flag must be a boolean");

    const names = release ? GENERATED_RELEASE_NAMES : GENERATED_PIPELINE_NAMES;
    const taken: Record<string, true> = Object.create(null);
    for (const pipeline of this.data.pipelines) taken[pipeline.name] = true;
    // First unused name: "Lint", "Unit tests", …, then "Lint 2", "Unit tests 2", …
    let name = "";
    for (let index = 0; name === "" || Object.hasOwn(taken, name); index += 1) {
      const lap = Math.floor(index / names.length);
      name = `${repo.name} ${names[index % names.length] ?? "Checks"}${lap > 0 ? ` ${lap + 1}` : ""}`;
    }
    const pipelineIds: Record<string, true> = Object.create(null);
    for (const pipeline of this.data.pipelines) pipelineIds[pipeline.id] = true;
    this.operationNumber += 1;
    while (Object.hasOwn(pipelineIds, `mock:pipeline:${this.operationNumber}`)) this.operationNumber += 1;
    const timestamp = validNow(this.clock).toISOString();
    this.data.pipelines.push({
      id: `mock:pipeline:${this.operationNumber}`,
      name,
      homeRepoId: repoId,
      coversRepoIds: [repoId],
      kind: release ? "release" : "ci",
      runs: [{ id: `mock:run:${this.operationNumber}`, result: "success", startedAt: timestamp, finishedAt: timestamp }],
    });
  }

  private agePullRequests(days: number): void {
    if (typeof days !== "number" || !Number.isFinite(days) || days < 0) {
      throw new ProviderError("config", "Mock pull request age must be a non-negative number of days");
    }
    const offset = days * 24 * HOUR_MS;
    for (const pullRequest of this.data.pullRequests) {
      pullRequest.createdAt = new Date(Date.parse(pullRequest.createdAt) - offset).toISOString();
      if (pullRequest.updatedAt !== undefined) {
        pullRequest.updatedAt = new Date(Date.parse(pullRequest.updatedAt) - offset).toISOString();
      }
    }
  }
}

/** Creates the mutable, local-only data source used by the interactive mock lab. */
export function createMockProvider(options: MockProviderOptions = {}): MockProvider {
  return new ScenarioMockProvider(options.now ?? (() => new Date()), resolve(options.scenarioDir ?? DEFAULT_SCENARIO_DIR));
}
