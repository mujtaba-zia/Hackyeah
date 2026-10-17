import type { PipelineInfo, PipelineRun, PullRequestInfo, RepoInfo, ReviewVerdict, RunResult, Snapshot } from "../../../shared/types";
import { isRecord } from "../../../shared/guards";
import { ProviderError, type FetchFn, type FetchLimits, type Provider } from "../types";
import type { AzureSettings } from "./settings";

const API_VERSION = "7.1";
const REQUEST_TIMEOUT_MS = 15_000;

interface AzureProvider extends Provider {
  readonly kind: "azure";
}

/** A read-only Azure DevOps REST provider. */
export function createAzureProvider(settings: AzureSettings, fetchFn: FetchFn = fetch): AzureProvider {
  const authHeader = `Basic ${Buffer.from(`:${settings.pat}`).toString("base64")}`;

  async function request(path: string, project: string): Promise<unknown> {
    let response: Response;
    try {
      response = await fetchFn(`${settings.baseUrl}/${encodeURIComponent(settings.org)}/${encodeURIComponent(project)}${path}`, {
        headers: { Authorization: authHeader },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new ProviderError("network", "Azure DevOps could not be reached");
    }

    if (response.status === 401 || response.status === 403 || response.status === 203) {
      throw new ProviderError("auth", "Azure DevOps authentication failed");
    }
    if (response.status === 404) {
      throw new ProviderError("notFound", `Azure DevOps project not found: ${project}`);
    }
    if (response.status === 429 || response.status === 503) {
      throw new ProviderError("throttled", "Azure DevOps is temporarily throttling requests", retryAfterSeconds(response));
    }
    if (!response.ok) {
      throw new ProviderError("network", "Azure DevOps returned an unexpected response");
    }

    let text: string;
    try {
      text = await response.text();
    } catch {
      throw new ProviderError("network", "Azure DevOps returned an unreadable response");
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new ProviderError("network", "Azure DevOps returned a non-JSON response");
    }
  }

  async function listRepos(): Promise<RepoInfo[]> {
    const groups = await Promise.all(settings.projects.map(async (project) => {
      const payload = await request(`/_apis/git/repositories?api-version=${API_VERSION}`, project);
      return readRepositories(payload, project);
    }));
    return groups.flat();
  }

  async function fetchSnapshot(limits: FetchLimits): Promise<Snapshot> {
    const requestedIds = new Set(limits.repoIds);
    const repos = (await listRepos()).filter((repo) => requestedIds.has(repo.id));
    const reposByProject = groupReposByProject(repos);
    const repoByAzureId = new Map(repos.map((repo) => [repo.id.slice(3), repo]));

    const projects = settings.projects.map(async (project) => {
      const projectRepos = reposByProject[project] ?? [];
      const pullRequests = await fetchPullRequests(project, projectRepos, limits.maxPrsPerRepo, repoByAzureId);
      const pipelines = await fetchPipelines(project, projectRepos, repoByAzureId, limits.coverage);
      return { pullRequests, pipelines };
    });
    const projectSnapshots = await Promise.all(projects);

    return {
      provider: "azure",
      fetchedAt: new Date().toISOString(),
      repos,
      pullRequests: projectSnapshots.flatMap((snapshot) => snapshot.pullRequests),
      pipelines: projectSnapshots.flatMap((snapshot) => snapshot.pipelines),
    };
  }

  async function fetchPullRequests(
    project: string,
    repos: RepoInfo[],
    maxPrsPerRepo: number,
    repoByAzureId: Map<string, RepoInfo>,
  ): Promise<PullRequestInfo[]> {
    if (repos.length === 0) return [];
    // Azure applies $top across the whole project, so a busy repo can still crowd out peers.
    const top = Math.max(1, repos.length * maxPrsPerRepo);
    const payload = await request(`/_apis/git/pullrequests?searchCriteria.status=active&$top=${top}&api-version=${API_VERSION}`, project);
    const counts: Record<string, number> = {};
    const pullRequests: PullRequestInfo[] = [];

    for (const value of responseValues(payload)) {
      const pullRequest = readPullRequest(value, settings, project, repoByAzureId);
      if (!pullRequest || counts[pullRequest.repoId] === maxPrsPerRepo) continue;
      counts[pullRequest.repoId] = (counts[pullRequest.repoId] ?? 0) + 1;
      pullRequests.push(pullRequest);
    }
    return pullRequests;
  }

  async function fetchPipelines(
    project: string,
    repos: RepoInfo[],
    repoByAzureId: Map<string, RepoInfo>,
    coverage: Record<string, string[]>,
  ): Promise<PipelineInfo[]> {
    if (repos.length === 0) return [];

    // The definitions list includes both repository id and folder path, so this is
    // one definitions request and at most one batched builds request per project.
    const definitionPayload = await request(`/_apis/build/definitions?includeLatestBuilds=false&includeAllProperties=true&api-version=${API_VERSION}`, project);
    const definitions = responseValues(definitionPayload)
      .map((value) => readDefinition(value, repoByAzureId))
      .filter((definition): definition is AzureDefinition => definition !== null);
    if (definitions.length === 0) return [];

    const definitionIds = definitions.map((definition) => definition.id).join(",");
    const buildsPayload = await request(
      `/_apis/build/builds?definitions=${definitionIds}&maxBuildsPerDefinition=10&queryOrder=queueTimeDescending&api-version=${API_VERSION}`,
      project,
    );
    const buildsByDefinition: Record<string, PipelineRun[]> = {};
    for (const value of responseValues(buildsPayload)) {
      const build = readBuild(value);
      if (!build) continue;
      const definition = isRecord(value) && isRecord(value.definition) ? value.definition : null;
      const definitionId = definition ? identifierValue(definition.id) : undefined;
      if (!definitionId) continue;
      (buildsByDefinition[definitionId] ??= []).push(build);
    }

    return definitions.map((definition) => ({
      id: `az:build:${project}:${definition.id}`,
      name: definition.name,
      homeRepoId: definition.homeRepo.id,
      coversRepoIds: coveredRepoIds(definition, repos, coverage),
      kind: /release|deploy/i.test(`${definition.path} ${definition.name}`) ? "release" : "ci",
      url: `${settings.baseUrl}/${encodeURIComponent(settings.org)}/${encodeURIComponent(project)}/_build?definitionId=${definition.id}`,
      runs: (buildsByDefinition[definition.id] ?? [])
        .sort((left, right) => runTime(right) - runTime(left))
        .slice(0, 10),
    }));
  }

  return { kind: "azure", label: settings.org, listRepos, fetchSnapshot };
}

interface AzureDefinition {
  id: string;
  name: string;
  path: string;
  homeRepo: RepoInfo;
}

function readRepositories(payload: unknown, project: string): RepoInfo[] {
  const repos: RepoInfo[] = [];
  for (const value of responseValues(payload)) {
    if (!isRecord(value) || value.isDisabled === true) continue;
    const id = stringValue(value.id);
    const name = stringValue(value.name);
    if (!id || !name) continue;
    const repo: RepoInfo = { id: `az:${id}`, name, project };
    const url = stringValue(value.webUrl);
    const defaultBranch = stringValue(value.defaultBranch)?.replace(/^refs\/heads\//, "");
    if (url) repo.url = url;
    if (defaultBranch) repo.defaultBranch = defaultBranch;
    repos.push(repo);
  }
  return repos;
}

function readPullRequest(
  value: unknown,
  settings: AzureSettings,
  project: string,
  repoByAzureId: Map<string, RepoInfo>,
): PullRequestInfo | null {
  if (!isRecord(value)) return null;
  const repository = isRecord(value.repository) ? value.repository : null;
  const azureRepoId = repository ? stringValue(repository.id) : undefined;
  const repo = azureRepoId ? repoByAzureId.get(azureRepoId) : undefined;
  const number = numberValue(value.pullRequestId);
  const title = stringValue(value.title);
  const creationDate = stringValue(value.creationDate);
  if (!repo || !number || !title || !creationDate) return null;

  const author = isRecord(value.createdBy) ? stringValue(value.createdBy.displayName) : undefined;
  const repoName = repository ? stringValue(repository.name) : undefined;
  if (!author || !repoName) return null;
  const reviewers = Array.isArray(value.reviewers) ? value.reviewers : [];
  return {
    id: `az:pr:${number}`,
    repoId: repo.id,
    number,
    title,
    author,
    url: `${settings.baseUrl}/${encodeURIComponent(settings.org)}/${encodeURIComponent(project)}/_git/${encodeURIComponent(repoName)}/pullrequest/${number}`,
    draft: value.isDraft === true,
    createdAt: creationDate,
    reviewers: reviewers.length,
    verdict: reviewerVerdict(reviewers),
    hasConflicts: value.mergeStatus === "conflicts",
    checks: "none",
  };
}

function readDefinition(value: unknown, repoByAzureId: Map<string, RepoInfo>): AzureDefinition | null {
  if (!isRecord(value)) return null;
  const id = identifierValue(value.id);
  const name = stringValue(value.name);
  const repository = isRecord(value.repository) ? value.repository : null;
  const repoId = repository ? stringValue(repository.id) : undefined;
  const homeRepo = repoId ? repoByAzureId.get(repoId) : undefined;
  if (!id || !name || !homeRepo) return null;
  return { id, name, path: stringValue(value.path) ?? "", homeRepo };
}

function readBuild(value: unknown): PipelineRun | null {
  if (!isRecord(value)) return null;
  const id = identifierValue(value.id);
  if (!id) return null;
  const run: PipelineRun = { id: `az:build-run:${id}`, result: buildResult(value) };
  const startedAt = stringValue(value.startTime) ?? stringValue(value.queueTime);
  const finishedAt = stringValue(value.finishTime);
  const branch = stringValue(value.sourceBranch);
  const url = stringValue(value.webUrl);
  if (startedAt) run.startedAt = startedAt;
  if (finishedAt) run.finishedAt = finishedAt;
  if (branch) run.branch = branch;
  if (url) run.url = url;
  return run;
}

function reviewerVerdict(reviewers: unknown[]): ReviewVerdict {
  const votes = reviewers.map((reviewer) => isRecord(reviewer) ? numberValue(reviewer.vote) : undefined);
  if (votes.includes(-10)) return "rejected";
  if (votes.includes(-5)) return "waitingOnAuthor";
  if (votes.some((vote) => vote === 10 || vote === 5)) return "approved";
  return "none";
}

function buildResult(build: Record<string, unknown>): RunResult {
  const status = stringValue(build.status);
  if (status === "inProgress") return "running";
  if (status === "notStarted" || status === "postponed") return "queued";
  switch (stringValue(build.result)) {
    case "succeeded": return "success";
    case "partiallySucceeded": return "partial";
    case "failed": return "failure";
    case "canceled": return "cancelled";
    default: return "none";
  }
}

function coveredRepoIds(definition: AzureDefinition, repos: RepoInfo[], coverage: Record<string, string[]>): string[] {
  const names = coverage[definition.name] ?? [];
  const additionalNames = new Set(names.map((name) => name.trim().toLocaleLowerCase()));
  const ids = [definition.homeRepo.id];
  for (const repo of repos) {
    if (repo.id !== definition.homeRepo.id && additionalNames.has(repo.name.trim().toLocaleLowerCase())) ids.push(repo.id);
  }
  return ids;
}

function groupReposByProject(repos: RepoInfo[]): Record<string, RepoInfo[]> {
  const groups: Record<string, RepoInfo[]> = {};
  for (const repo of repos) (groups[repo.project] ??= []).push(repo);
  return groups;
}

function responseValues(payload: unknown): unknown[] {
  return isRecord(payload) && Array.isArray(payload.value) ? payload.value : [];
}

function identifierValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  return typeof value === "number" && Number.isFinite(value) ? String(value) : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function runTime(run: PipelineRun): number {
  return Date.parse(run.startedAt ?? run.finishedAt ?? "") || 0;
}

function retryAfterSeconds(response: Response): number | undefined {
  const value = response.headers.get("Retry-After");
  if (!value) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}
