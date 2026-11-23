import { buildCity } from "../../core/buildCity";
import { DEFAULT_CONFIG } from "../../shared/config";
import type { CityModel, PipelineInfo, PullRequestInfo, RepoInfo, RunResult, Snapshot } from "../../shared/types";

export const SAMPLE_NOW = new Date("2026-10-16T12:00:00.000Z");

function hoursAgo(hours: number): string {
  return new Date(SAMPLE_NOW.getTime() - hours * 60 * 60 * 1000).toISOString();
}

const repos: RepoInfo[] = [
  { id: "mock:atlas", name: "Atlas", project: "Platform", url: "https://example.test/atlas" },
  { id: "mock:edge", name: "Edge", project: "Platform", url: "https://example.test/edge" },
  { id: "mock:infra", name: "Infra", project: "Platform", url: "https://example.test/infra" },
  { id: "mock:billing", name: "Billing", project: "Revenue", url: "https://example.test/billing" },
  { id: "mock:checkout", name: "Checkout", project: "Revenue", url: "https://example.test/checkout" },
  { id: "mock:docs", name: "Docs", project: "Experience", url: "https://example.test/docs" },
  { id: "mock:frontend", name: "Frontend", project: "Experience", url: "https://example.test/frontend" },
];

function pullRequest(repo: string, number: number, title: string, ageHours: number, changes: Partial<PullRequestInfo> = {}): PullRequestInfo {
  return {
    id: `mock:pr:${repo}:${number}`,
    repoId: `mock:${repo}`,
    number,
    title,
    author: "Aria",
    url: `https://example.test/${repo}/pull/${number}`,
    draft: false,
    createdAt: hoursAgo(ageHours),
    updatedAt: hoursAgo(ageHours),
    reviewers: 1,
    verdict: "none",
    hasConflicts: false,
    checks: "success",
    ...changes,
  };
}

/** A pipeline whose runs, newest first, ended `every` hours apart starting `first` hours ago. */
function pipeline(
  id: string,
  name: string,
  home: string | null,
  results: readonly RunResult[],
  changes: Partial<PipelineInfo> & { first?: number; every?: number } = {},
): PipelineInfo {
  const { first = 2, every = 12, ...rest } = changes;
  return {
    id: `mock:pipeline:${id}`,
    name,
    homeRepoId: home,
    coversRepoIds: home === null ? [] : [home],
    kind: "ci",
    url: `https://example.test/pipelines/${id}`,
    runs: results.map((result, index) => {
      const ended = hoursAgo(first + index * every);
      const finished = result !== "running" && result !== "queued";
      return finished
        ? { id: `${id}:${results.length - index}`, result, startedAt: hoursAgo(first + index * every + 0.1), finishedAt: ended, branch: "main" }
        : { id: `${id}:${results.length - index}`, result, startedAt: ended, branch: "main" };
    }),
    ...rest,
  };
}

/**
 * A small estate with one of everything: three projects, a pipeline on the
 * outskirts, a shared outage, a review queue, drafts, stale work and enough
 * trouble for a meltdown.
 */
export const sampleSnapshot: Snapshot = {
  provider: "mock",
  fetchedAt: SAMPLE_NOW.toISOString(),
  repos,
  pullRequests: [
    pullRequest("atlas", 141, "Prepare telemetry migration", 12, { draft: true, checks: "none" }),
    pullRequest("atlas", 142, "Land regional cache", 3),
    pullRequest("billing", 77, "Reconcile delayed invoices", 200, { checks: "failure" }),
    pullRequest("checkout", 18, "Remember the last address", 5, { verdict: "approved" }),
    pullRequest("docs", 301, "Rewrite the quick start", 30),
    pullRequest("docs", 302, "Add a glossary", 31),
    pullRequest("docs", 303, "Fix broken anchors", 40, { verdict: "changesRequested" }),
    pullRequest("docs", 304, "Document the watch list", 28),
    pullRequest("docs", 305, "Split the API reference", 50, { checks: "pending" }),
    pullRequest("edge", 9, "Tune cache headers", 6, { hasConflicts: true }),
    pullRequest("infra", 55, "Pin base images", 8, { verdict: "approved" }),
  ],
  pipelines: [
    pipeline("atlas-ci", "Atlas CI", "mock:atlas", ["success", "success", "failure", "success"]),
    pipeline("billing-release", "Billing Release", "mock:billing", ["failure", "failure", "failure", "success"], {
      kind: "release",
      coversRepoIds: ["mock:billing", "mock:checkout"],
    }),
    pipeline("checkout-ci", "Checkout CI", "mock:checkout", ["running", "success", "success"], { first: 0.2 }),
    pipeline("docs-ci", "Docs CI", "mock:docs", ["success", "success"]),
    pipeline("edge-release", "Edge Release", "mock:edge", ["partial", "success"], { kind: "release", first: 72, every: 430 }),
    pipeline("frontend-ci", "Frontend CI", "mock:frontend", ["failure", "success", "success"], { first: 1 }),
    pipeline("infra-ci", "Infra CI", "mock:infra", ["queued", "success"], { first: 0.1 }),
    pipeline("partner-sync", "Partner Sync", "mock:elsewhere", ["success", "cancelled"], { coversRepoIds: ["mock:atlas"] }),
  ],
};

/** The world that estate builds, for HUD tests. */
export const sampleCity: CityModel = buildCity(sampleSnapshot, DEFAULT_CONFIG, SAMPLE_NOW);
