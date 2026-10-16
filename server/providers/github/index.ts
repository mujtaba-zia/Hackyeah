import { isRecord } from "../../../shared/guards";
import type { PipelineInfo, PipelineRun, PullRequestInfo, RepoInfo, RunResult, Snapshot } from "../../../shared/types";
import { ProviderError, type FetchFn, type FetchLimits, type Provider } from "../types";
import type { GitHubSettings } from "./settings";

const API_VERSION = "2022-11-28";
const USER_AGENT = "repo-isles";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_PAGES = 10;
const REPO_CONCURRENCY = 4;

const VERDICT_BY_REVIEW_DECISION: Record<string, PullRequestInfo["verdict"]> = {
  APPROVED: "approved",
  CHANGES_REQUESTED: "changesRequested",
};

const CHECK_STATE_BY_ROLLUP: Record<string, PullRequestInfo["checks"]> = {
  SUCCESS: "success",
  FAILURE: "failure",
  ERROR: "failure",
  PENDING: "pending",
  EXPECTED: "pending",
};

const QUEUED_WORKFLOW_STATUSES: Record<string, true> = {
  queued: true,
  waiting: true,
  requested: true,
  pending: true,
};

const FAILED_WORKFLOW_CONCLUSIONS: Record<string, true> = {
  failure: true,
  timed_out: true,
  startup_failure: true,
};

const NONE_WORKFLOW_CONCLUSIONS: Record<string, true> = {
  skipped: true,
  neutral: true,
  action_required: true,
  stale: true,
};

interface RequestedRepo {
  owner: string;
  name: string;
  id: string;
}

interface RepositoryData {
  repo: RepoInfo;
  pullRequests: PullRequestInfo[];
  pipelines: PipelineInfo[];
}

function stringValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}

function arrayValue(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return value;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  return value;
}

function apiPath(settings: GitHubSettings, path: string): string {
  return `${settings.apiUrl}${path}`;
}

function repoId(owner: string, name: string): string {
  return `gh:${owner}/${name}`.toLowerCase();
}

function requestedRepo(id: string): RequestedRepo | null {
  if (!id.startsWith("gh:")) return null;
  const parts = id.slice(3).split("/");
  const [owner, name] = parts;
  if (parts.length !== 2 || !owner || !name) return null;
  return { owner, name, id: repoId(owner, name) };
}

function nextPage(link: string | null, currentUrl: string): string | null {
  if (!link) return null;
  for (const part of link.split(",")) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="?next"?/i);
    if (!match?.[1]) continue;
    try {
      return new URL(match[1], currentUrl).toString();
    } catch {
      return null;
    }
  }
  return null;
}

function retryAfterSeconds(response: Response): number | undefined {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
    const date = Date.parse(retryAfter);
    if (!Number.isNaN(date)) return Math.max(0, Math.ceil((date - Date.now()) / 1000));
  }

  const reset = Number(response.headers.get("x-ratelimit-reset"));
  if (Number.isFinite(reset) && reset > 0) return Math.max(0, Math.ceil(reset - Date.now() / 1000));
  return undefined;
}

function responseError(response: Response, namedRepo: boolean): ProviderError {
  if (response.status === 401) return new ProviderError("auth", "GitHub authentication failed");

  const isRateLimited = response.headers.get("x-ratelimit-remaining") === "0" || response.headers.has("retry-after");
  if ((response.status === 403 && isRateLimited) || response.status === 429) {
    return new ProviderError("throttled", "GitHub rate limit reached", retryAfterSeconds(response));
  }
  if (response.status === 403) return new ProviderError("auth", "GitHub authorization failed");
  if (response.status === 404) {
    return new ProviderError("notFound", namedRepo ? "GitHub repository was not found" : "GitHub resource was not found");
  }
  return new ProviderError("network", `GitHub request failed with status ${response.status}`);
}

function isArchivedOrDisabled(repository: Record<string, unknown>): boolean {
  return repository.archived === true || repository.disabled === true;
}

function restRepo(repository: Record<string, unknown>): RepoInfo | null {
  if (isArchivedOrDisabled(repository)) return null;
  const name = stringValue(repository.name);
  const owner = recordValue(repository.owner);
  const ownerLogin = owner ? stringValue(owner.login) : undefined;
  if (!name || !ownerLogin) return null;
  return {
    id: repoId(ownerLogin, name),
    name,
    project: ownerLogin,
    url: stringValue(repository.html_url),
    defaultBranch: stringValue(repository.default_branch),
  };
}

function graphQlError(body: Record<string, unknown>): ProviderError | null {
  const errors = arrayValue(body.errors);
  if (errors.length === 0) return null;

  for (const error of errors) {
    const details = recordValue(error);
    const extensions = details ? recordValue(details.extensions) : undefined;
    const code = stringValue(details?.type) ?? stringValue(extensions?.type) ?? stringValue(extensions?.code);
    if (code === "UNAUTHENTICATED" || code === "FORBIDDEN" || code === "AUTHENTICATION_ERROR") {
      return new ProviderError("auth", "GitHub authentication failed");
    }
    if (code === "NOT_FOUND") return new ProviderError("notFound", "GitHub repository was not found");
  }
  return new ProviderError("network", "GitHub GraphQL request failed");
}

function workflowResult(run: Record<string, unknown>): RunResult {
  const status = stringValue(run.status)?.toLowerCase();
  if (status === "in_progress") return "running";
  if (status && Object.hasOwn(QUEUED_WORKFLOW_STATUSES, status)) return "queued";
  if (status !== "completed") return "none";

  const conclusion = stringValue(run.conclusion)?.toLowerCase();
  if (conclusion === "success") return "success";
  if (conclusion === "cancelled") return "cancelled";
  if (conclusion && Object.hasOwn(FAILED_WORKFLOW_CONCLUSIONS, conclusion)) return "failure";
  if (conclusion && Object.hasOwn(NONE_WORKFLOW_CONCLUSIONS, conclusion)) return "none";
  return "none";
}

function workflowRun(run: Record<string, unknown>, workflowId: string): PipelineRun | null {
  const id = numberValue(run.id) ?? stringValue(run.id);
  if (id === undefined) return null;
  return {
    id: `gh:wf:${workflowId}:run:${id}`,
    result: workflowResult(run),
    startedAt: stringValue(run.run_started_at) ?? stringValue(run.created_at),
    finishedAt: stringValue(run.updated_at),
    branch: stringValue(run.head_branch),
    url: stringValue(run.html_url),
  };
}

function workflowTime(run: Record<string, unknown>): number {
  const raw = stringValue(run.created_at) ?? stringValue(run.run_started_at) ?? stringValue(run.updated_at);
  const parsed = raw ? Date.parse(raw) : Number.NaN;
  if (Number.isNaN(parsed)) return 0;
  return parsed;
}

function requestedReviewers(pullRequest: Record<string, unknown>): number {
  const requests = recordValue(pullRequest.reviewRequests);
  const requestedCount = numberValue(requests?.totalCount) ?? 0;
  const requestedNodes = arrayValue(requests?.nodes);
  const requestedNames: Record<string, true> = {};
  const latestReviewerNames: Record<string, true> = {};

  for (const node of requestedNodes) {
    const requested = recordValue(recordValue(node)?.requestedReviewer);
    const login = stringValue(requested?.login) ?? stringValue(requested?.slug);
    if (login) requestedNames[login.toLowerCase()] = true;
  }

  for (const node of arrayValue(recordValue(pullRequest.latestReviews)?.nodes)) {
    const author = recordValue(recordValue(node)?.author);
    const login = stringValue(author?.login);
    if (login) latestReviewerNames[login.toLowerCase()] = true;
  }

  let completedReviews = 0;
  for (const name of Object.keys(latestReviewerNames)) {
    if (!requestedNames[name]) completedReviews += 1;
  }
  return requestedCount + completedReviews;
}

function graphQlPullRequest(value: unknown, repo: RequestedRepo): PullRequestInfo | null {
  const pullRequest = recordValue(value);
  if (!pullRequest) return null;
  const number = numberValue(pullRequest.number);
  const title = stringValue(pullRequest.title);
  const createdAt = stringValue(pullRequest.createdAt);
  if (number === undefined || !title || !createdAt) return null;

  const author = recordValue(pullRequest.author);
  const commits = recordValue(pullRequest.commits);
  const lastCommit = recordValue(arrayValue(commits?.nodes).at(-1));
  const rollup = recordValue(lastCommit?.commit);
  const statusCheckRollup = recordValue(rollup?.statusCheckRollup);
  const reviewDecision = stringValue(pullRequest.reviewDecision);
  const rollupState = stringValue(statusCheckRollup?.state);

  return {
    id: `${repo.id}:pr:${number}`,
    repoId: repo.id,
    number,
    title,
    author: stringValue(author?.login) ?? "ghost",
    url: stringValue(pullRequest.url),
    draft: pullRequest.isDraft === true,
    createdAt,
    updatedAt: stringValue(pullRequest.updatedAt),
    reviewers: requestedReviewers(pullRequest),
    verdict: reviewDecision && Object.hasOwn(VERDICT_BY_REVIEW_DECISION, reviewDecision)
      ? VERDICT_BY_REVIEW_DECISION[reviewDecision] ?? "none"
      : "none",
    hasConflicts: stringValue(pullRequest.mergeable) === "CONFLICTING",
    checks: rollupState && Object.hasOwn(CHECK_STATE_BY_ROLLUP, rollupState)
      ? CHECK_STATE_BY_ROLLUP[rollupState] ?? "none"
      : "none",
  };
}

function repoFromGraphQl(value: unknown, requested: RequestedRepo): RepoInfo | null {
  const repository = recordValue(value);
  if (!repository || repository.isArchived === true || repository.isDisabled === true) return null;
  const name = stringValue(repository.name) ?? requested.name;
  const owner = recordValue(repository.owner);
  const project = stringValue(owner?.login) ?? requested.owner;
  return {
    id: repoId(project, name),
    name,
    project,
    url: stringValue(repository.url),
    defaultBranch: stringValue(recordValue(repository.defaultBranchRef)?.name),
  };
}

function coverageRepoIds(
  coverage: Record<string, string[]>,
  pipelineName: string,
  homeRepoId: string,
  repos: RepoInfo[],
): string[] {
  const entry = Object.entries(coverage).find(([name]) => name.toLowerCase() === pipelineName.toLowerCase());
  const covered: Record<string, true> = { [homeRepoId]: true };
  if (!entry) return Object.keys(covered);

  for (const target of entry[1]) {
    const normalized = target.toLowerCase();
    for (const repo of repos) {
      if (repo.name.toLowerCase() === normalized || `${repo.project}/${repo.name}`.toLowerCase() === normalized) {
        covered[repo.id] = true;
      }
    }
  }
  return Object.keys(covered);
}

const PULL_REQUEST_QUERY = `
  query RepoIslesPullRequests($owner: String!, $name: String!, $first: Int!) {
    repository(owner: $owner, name: $name) {
      name
      url
      isArchived
      isDisabled
      owner { login }
      defaultBranchRef { name }
      pullRequests(states: OPEN, first: $first, orderBy: { field: UPDATED_AT, direction: DESC }) {
        nodes {
          number
          title
          url
          isDraft
          createdAt
          updatedAt
          author { login }
          reviewDecision
          mergeable
          reviewRequests(first: 100) { totalCount nodes { requestedReviewer { ... on User { login } ... on Team { slug } } } }
          latestReviews(first: 100) { nodes { author { login } } }
          commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
        }
      }
    }
  }
`;

class GitHubProvider implements Provider {
  readonly kind = "github" as const;
  readonly label: string;
  private authenticatedLoginRequest: Promise<string | null> | undefined;


  constructor(
    private readonly settings: GitHubSettings,
    private readonly fetchFn: FetchFn,
  ) {
    this.label = settings.owner ?? `${settings.repos.length} repos`;
  }

  private async request(url: string, init: RequestInit, namedRepo = false): Promise<Response> {
    let response: Response;
    try {
      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${this.settings.token}`);
      headers.set("Accept", "application/vnd.github+json");
      headers.set("X-GitHub-Api-Version", API_VERSION);
      headers.set("User-Agent", USER_AGENT);
      response = await this.fetchFn(url, {
        ...init,
        headers,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new ProviderError("network", "GitHub request failed");
    }
    if (!response.ok) throw responseError(response, namedRepo);
    return response;
  }

  private async restJson(url: string, namedRepo = false): Promise<{ body: unknown; response: Response }> {
    const response = await this.request(url, { method: "GET" }, namedRepo);
    try {
      return { body: await response.json(), response };
    } catch {
      throw new ProviderError("network", "GitHub returned invalid JSON");
    }
  }

  private async listedRepos(url: string): Promise<RepoInfo[]> {
    const repos: RepoInfo[] = [];
    let next: string | null = url;
    let pages = 0;
    while (next && pages < MAX_PAGES) {
      const currentUrl: string = next;
      const { body, response } = await this.restJson(currentUrl);
      for (const candidate of arrayValue(body)) {
        const repository = recordValue(candidate);
        if (!repository) continue;
        const normalized = restRepo(repository);
        if (normalized) repos.push(normalized);
      }
      pages += 1;
      next = nextPage(response.headers.get("link"), currentUrl);
    }
    return repos;
  }
  private authenticatedLogin(): Promise<string | null> {
    if (!this.authenticatedLoginRequest) {
      this.authenticatedLoginRequest = this.restJson(apiPath(this.settings, "/user")).then(({ body }) => {
        const user = recordValue(body);
        return stringValue(user?.login) ?? null;
      });
    }
    return this.authenticatedLoginRequest;
  }


  async listRepos(): Promise<RepoInfo[]> {
    const found: Record<string, RepoInfo> = {};

    for (const configured of this.settings.repos) {
      const [owner, name] = configured.split("/");
      if (!owner || !name) continue;
      const { body } = await this.restJson(apiPath(this.settings, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`), true);
      const repository = recordValue(body);
      const normalized = repository ? restRepo(repository) : null;
      if (normalized) found[normalized.id] = normalized;
    }

    if (this.settings.owner) {
      const encodedOwner = encodeURIComponent(this.settings.owner);
      const authenticatedLogin = await this.authenticatedLogin();
      let listed: RepoInfo[];
      if (authenticatedLogin?.toLowerCase() === this.settings.owner.toLowerCase()) {
        listed = await this.listedRepos(apiPath(this.settings, "/user/repos?affiliation=owner&per_page=100"));
      } else {
        try {
          listed = await this.listedRepos(apiPath(this.settings, `/orgs/${encodedOwner}/repos?per_page=100&type=all`));
        } catch (error) {
          if (!(error instanceof ProviderError) || error.code !== "notFound") throw error;
          // A non-org owner is the only expected 404 on this endpoint.
          listed = await this.listedRepos(apiPath(this.settings, `/users/${encodedOwner}/repos?per_page=100&type=owner`));
        }
      }
      for (const repository of listed) found[repository.id] = repository;
    }

    return Object.values(found);
  }

  private async graphQlRepo(repo: RequestedRepo, maxPrs: number): Promise<{ repo: RepoInfo | null; pullRequests: PullRequestInfo[] }> {
    const response = await this.request(this.settings.graphqlUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: PULL_REQUEST_QUERY, variables: { owner: repo.owner, name: repo.name, first: maxPrs } }),
    }, true);

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ProviderError("network", "GitHub returned invalid JSON");
    }
    const payload = recordValue(body);
    if (!payload) throw new ProviderError("network", "GitHub returned invalid JSON");
    const error = graphQlError(payload);
    if (error) throw error;

    const data = recordValue(payload.data);
    const repository = data ? recordValue(data.repository) : undefined;
    const normalizedRepo = repoFromGraphQl(repository, repo);
    if (!normalizedRepo) return { repo: null, pullRequests: [] };

    const connection = recordValue(repository?.pullRequests);
    const pullRequests: PullRequestInfo[] = [];
    for (const node of arrayValue(connection?.nodes)) {
      const normalized = graphQlPullRequest(node, repo);
      if (normalized) pullRequests.push(normalized);
    }
    return { repo: normalizedRepo, pullRequests };
  }

  private async workflows(repo: RequestedRepo, homeRepo: RepoInfo, limits: FetchLimits, repos: RepoInfo[]): Promise<PipelineInfo[]> {
    const url = apiPath(this.settings, `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/actions/runs?per_page=50`);
    let body: unknown;
    try {
      ({ body } = await this.restJson(url, true));
    } catch (error) {
      if (error instanceof ProviderError && error.code === "notFound") return [];
      throw error;
    }

    const payload = recordValue(body);
    const groups = new Map<string, Record<string, unknown>[]>();
    for (const candidate of arrayValue(payload?.workflow_runs)) {
      const run = recordValue(candidate);
      if (!run) continue;
      const value = numberValue(run.workflow_id) ?? stringValue(run.workflow_id);
      if (value === undefined) continue;
      const workflowId = String(value);
      const current = groups.get(workflowId) ?? [];
      current.push(run);
      groups.set(workflowId, current);
    }

    const pipelines: PipelineInfo[] = [];
    for (const [workflowId, group] of groups) {
      group.sort((left, right) => workflowTime(right) - workflowTime(left));
      const newest = group[0];
      if (!newest) continue;
      const name = stringValue(newest.name) ?? `Workflow ${workflowId}`;
      const path = stringValue(newest.path) ?? "";
      const runs = group.slice(0, 10).map((run) => workflowRun(run, workflowId)).filter((run): run is PipelineRun => run !== null);
      pipelines.push({
        id: `${repo.id}:wf:${workflowId}`,
        name,
        homeRepoId: homeRepo.id,
        coversRepoIds: coverageRepoIds(limits.coverage, name, homeRepo.id, repos),
        kind: /release|deploy/i.test(name) || /release|deploy/i.test(path) ? "release" : "ci",
        url: stringValue(newest.html_url),
        runs,
      });
    }
    return pipelines;
  }

  async fetchSnapshot(limits: FetchLimits): Promise<Snapshot> {
    const requested = limits.repoIds.map(requestedRepo).filter((repo): repo is RequestedRepo => repo !== null);
    const unique: RequestedRepo[] = [];
    const seen: Record<string, true> = {};
    for (const repo of requested) {
      if (seen[repo.id]) continue;
      seen[repo.id] = true;
      unique.push(repo);
    }

    const results: Array<RepositoryData | undefined> = [];
    let cursor = 0;
    const workers: Promise<void>[] = [];
    const workerCount = Math.min(REPO_CONCURRENCY, unique.length);
    for (let index = 0; index < workerCount; index += 1) {
      workers.push((async () => {
        while (cursor < unique.length) {
          const resultIndex = cursor;
          const repo = unique[resultIndex];
          cursor += 1;
          if (!repo) continue;
          try {
            const graphql = await this.graphQlRepo(repo, limits.maxPrsPerRepo);
            if (!graphql.repo) continue;
            const knownRepos = [
              ...results.filter((result): result is RepositoryData => result !== undefined).map((result) => result.repo),
              graphql.repo,
            ];
            const pipelines = await this.workflows(repo, graphql.repo, limits, knownRepos);
            results[resultIndex] = { repo: graphql.repo, pullRequests: graphql.pullRequests, pipelines };
          } catch (error) {
            if (error instanceof ProviderError && error.code === "notFound") continue;
            throw error;
          }
        }
      })());
    }
    await Promise.all(workers);

    const completed = results.filter((result): result is RepositoryData => result !== undefined);
    const repos = completed.map((result) => result.repo);
    const pipelines = completed.flatMap((result) => result.pipelines);
    for (const pipeline of pipelines) {
      pipeline.coversRepoIds = coverageRepoIds(limits.coverage, pipeline.name, pipeline.homeRepoId ?? "", repos);
    }
    return {
      provider: "github",
      fetchedAt: new Date().toISOString(),
      repos,
      pullRequests: completed.flatMap((result) => result.pullRequests),
      pipelines,
    };
  }
}

/** Creates a read-only GitHub provider with fetch injectable for deterministic tests. */
export function createGitHubProvider(settings: GitHubSettings, fetchFn: FetchFn = fetch): Provider {
  return new GitHubProvider(settings, fetchFn);
}
