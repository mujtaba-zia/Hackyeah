import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildCity } from "../../../core/buildCity";
import { DEFAULT_CONFIG } from "../../../shared/config";
import { createMockProvider } from "../../../server/providers/mock";
import { ProviderError, type MockProvider } from "../../../server/providers/types";

const NOW = new Date("2026-10-16T12:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;

async function completeSnapshot(provider: MockProvider) {
  const repos = await provider.listRepos();
  return provider.fetchSnapshot({
    repoIds: repos.map((repo) => repo.id),
    maxPrsPerRepo: 200,
    coverage: {},
  });
}

async function cityFor(provider: MockProvider, scenario: string) {
  provider.load(scenario);
  const snapshot = await completeSnapshot(provider);
  return buildCity(snapshot, { ...DEFAULT_CONFIG, scenario, maxRepos: 64 }, NOW);
}

describe("mock provider", () => {
  it("resolves relative PR and run timestamps against its injected clock", async () => {
    const provider = createMockProvider({ now: () => NOW });
    provider.load("demo");

    const snapshot = await completeSnapshot(provider);
    const pullRequest = snapshot.pullRequests.find((candidate) => candidate.id === "mock:pr:payments:104");
    const pipeline = snapshot.pipelines.find((candidate) => candidate.id === "mock:pipeline:platform-integration");

    expect(pullRequest?.updatedAt).toBe(new Date(NOW.getTime() - 220 * HOUR_MS).toISOString());
    expect(pipeline?.runs[0]?.finishedAt).toBe(new Date(NOW.getTime() - HOUR_MS).toISOString());
  });

  it("ships every required scenario with the intended incident coverage", async () => {
    const provider = createMockProvider({ now: () => NOW });
    expect(provider.scenarios()).toEqual([
      "big-org",
      "calm",
      "demo",
      "meltdown",
      "nursery",
      "release-drift",
      "review-crowd",
      "shared-outage",
    ]);

    const demo = await cityFor(provider, "demo");
    expect(demo.incidents.map((incident) => incident.ruleId)).toEqual(expect.arrayContaining([
      "pipelineFailing",
      "sharedOutage",
      "reviewCrowd",
      "draftPileup",
      "stalePrs",
      "staleRelease",
    ]));
    expect(demo.incidents.some((incident) => incident.ruleId === "meltdown")).toBe(false);

    const calm = await cityFor(provider, "calm");
    expect(calm.incidents).toHaveLength(0);

    const meltdown = await cityFor(provider, "meltdown");
    expect(meltdown.incidents.some((incident) => incident.ruleId === "meltdown")).toBe(true);

    provider.load("big-org");
    expect(await provider.listRepos()).toHaveLength(24);
  });

  it("applies every mock lab operation and resets to scenario data", async () => {
    const provider = createMockProvider({ now: () => NOW });
    provider.load("calm");
    const baseline = await completeSnapshot(provider);

    provider.apply({ kind: "setPipelineResult", pipelineId: "mock:pipeline:meadow-ci", result: "failure" });
    provider.apply({ kind: "addPullRequest", repoId: "mock:meadow", draft: false });
    provider.apply({ kind: "addPullRequest", repoId: "mock:meadow", draft: true });
    provider.apply({ kind: "agePullRequests", days: 2 });

    const changed = await completeSnapshot(provider);
    const pipeline = changed.pipelines.find((candidate) => candidate.id === "mock:pipeline:meadow-ci");
    const added = changed.pullRequests.filter((candidate) => candidate.id.startsWith("mock:pr:") && candidate.id !== "mock:pr:meadow:12");
    expect(pipeline?.runs[0]?.result).toBe("failure");
    expect(added).toHaveLength(2);
    expect(added.map((pullRequest) => pullRequest.draft)).toEqual([true, false]);
    expect(added[0]?.updatedAt).toBe(new Date(NOW.getTime() - 48 * HOUR_MS).toISOString());

    provider.apply({ kind: "reset" });
    expect(await completeSnapshot(provider)).toEqual(baseline);
  });

  it("reports unknown operation ids as notFound", () => {
    const provider = createMockProvider({ now: () => NOW });

    for (const op of [
      { kind: "setPipelineResult", pipelineId: "mock:pipeline:missing", result: "success" as const },
      { kind: "addPullRequest", repoId: "mock:missing", draft: false },
      { kind: "addPipeline", repoId: "mock:missing", release: false },
    ] as const) {
      try {
        provider.apply(op);
        throw new Error("Expected mock operation to fail");
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderError);
        if (error instanceof ProviderError) expect(error.code).toBe("notFound");
      }
    }
  });

  it("adds pipelines that appear as new towers on their repo's island, each in its own spot", async () => {
    const provider = createMockProvider({ now: () => NOW });
    const before = await cityFor(provider, "calm");
    const district = before.districts[0]!;
    const towersBefore = before.towers.filter((tower) => tower.islandId === district.id);

    provider.apply({ kind: "addPipeline", repoId: district.id, release: false });
    provider.apply({ kind: "addPipeline", repoId: district.id, release: true });
    const snapshot = await completeSnapshot(provider);
    const after = buildCity(snapshot, { ...DEFAULT_CONFIG, scenario: "calm", maxRepos: 64 }, NOW);
    const towersAfter = after.towers.filter((tower) => tower.islandId === district.id);

    expect(towersAfter).toHaveLength(towersBefore.length + 2);
    const added = towersAfter.filter((tower) => !towersBefore.some((old) => old.id === tower.id));
    expect(added.map((tower) => `${tower.kind}:${tower.status}`).sort()).toEqual(["ci:success", "release:success"]);
    const spots = new Set(towersAfter.map((tower) => `${tower.position.x},${tower.position.z}`));
    expect(spots.size).toBe(towersAfter.length);
  });

  it("rejects malformed scenario JSON with a clear configuration error", () => {
    const scenarioDir = mkdtempSync(join(tmpdir(), "repo-isles-mock-"));
    writeFileSync(join(scenarioDir, "demo.json"), "{ not JSON", "utf8");
    try {
      expect(() => createMockProvider({ now: () => NOW, scenarioDir })).toThrow(/Mock scenario "demo" is invalid/);
    } finally {
      rmSync(scenarioDir, { recursive: true, force: true });
    }
  });
});
