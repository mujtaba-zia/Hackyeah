import { describe, expect, it } from "vitest";

import { DEFAULT_CONFIG } from "../../shared/config";
import type { MockOp, RepoInfo, Snapshot } from "../../shared/types";
import { ProviderError, type FetchLimits, type MockProvider, type Provider } from "../../server/providers/types";
import { createGameState } from "../../server/state";

const NOW = new Date("2026-10-16T12:00:00.000Z");

function snapshot(kind: "mock" | "azure", repo: RepoInfo): Snapshot {
  return {
    provider: kind,
    fetchedAt: NOW.toISOString(),
    repos: [repo],
    pullRequests: [],
    pipelines: [],
  };
}

function createMockSource(
  listRepos: () => Promise<RepoInfo[]>,
  fetchSnapshot: (limits: FetchLimits) => Promise<Snapshot>,
): MockProvider {
  return {
    kind: "mock",
    label: "fixture",
    scenarios(): string[] {
      return ["demo"];
    },
    load(scenario: string): void {
      if (scenario !== "demo") throw new ProviderError("notFound", "scenario missing");
    },
    apply(op: MockOp): void {
      if (op.kind === "reset") return;
    },
    listRepos,
    fetchSnapshot,
  };
}

describe("game state", () => {
  it("keeps the last good city when a poll fails and reports a secret-free error", async () => {
    const repo = { id: "mock:fixture", name: "Fixture", project: "Test" };
    let fail = false;
    const mock = createMockSource(
      async () => [repo],
      async () => {
        if (fail) throw new ProviderError("network", "token: should not leave server");
        return snapshot("mock", repo);
      },
    );
    const state = createGameState({ config: DEFAULT_CONFIG, providers: { mock }, now: () => NOW, logger: { log(): void {} } });

    await state.poll();
    const city = state.getClientState().city;
    fail = true;
    await state.refresh();

    const current = state.getClientState();
    expect(current.city).toBe(city);
    expect(current.status.phase).toBe("error");
    expect(current.status.message).not.toContain("token");
  });

  it("uses the larger throttle retry delay", async () => {
    const repo = { id: "mock:fixture", name: "Fixture", project: "Test" };
    const mock = createMockSource(
      async () => [repo],
      async () => {
        throw new ProviderError("throttled", "hidden detail", 100);
      },
    );
    const scheduledDelays: number[] = [];
    const state = createGameState({
      config: DEFAULT_CONFIG,
      providers: { mock },
      now: () => NOW,
      timers: {
        setTimeout(_callback: () => void, delayMs: number): number {
          scheduledDelays.push(delayMs);
          return scheduledDelays.length;
        },
        clearTimeout(): void {},
      },
      logger: { log(): void {} },
    });

    state.start();
    await state.poll();
    state.stop();
    const nextPollAt = state.getClientState().status.nextPollAt;
    expect(nextPollAt).toBe(new Date(NOW.getTime() + 100_000).toISOString());
    expect(scheduledDelays).toEqual([100_000]);
  });

  it("clears and reloads when switching providers", async () => {
    const mockRepo = { id: "mock:fixture", name: "Fixture", project: "Test" };
    const azureRepo = { id: "az:fixture", name: "Azure Fixture", project: "Cloud" };
    const mock = createMockSource(
      async () => [mockRepo],
      async () => snapshot("mock", mockRepo),
    );
    const azure: Provider = {
      kind: "azure",
      label: "cloud",
      async listRepos(): Promise<RepoInfo[]> {
        return [azureRepo];
      },
      async fetchSnapshot(): Promise<Snapshot> {
        return snapshot("azure", azureRepo);
      },
    };
    const state = createGameState({
      config: DEFAULT_CONFIG,
      providers: { mock, azure },
      now: () => NOW,
      logger: { log(): void {} },
    });

    await state.poll();
    const switching = state.setConfig({ provider: "azure" });
    const loading = state.getClientState();
    expect(loading.city).toBeNull();
    expect(loading.repoCatalog).toEqual([]);
    expect(loading.status.phase).toBe("loading");
    await switching;

    expect(state.getClientState().city?.districts[0]?.id).toBe("az:fixture");
    expect(state.getClientState().sourceLabel).toBe("cloud");
  });

  it("rebuilds cached data for threshold changes without refetching", async () => {
    const repo = { id: "mock:fixture", name: "Fixture", project: "Test" };
    let fetches = 0;
    const mock = createMockSource(
      async () => [repo],
      async () => {
        fetches += 1;
        return snapshot("mock", repo);
      },
    );
    const state = createGameState({ config: DEFAULT_CONFIG, providers: { mock }, now: () => NOW, logger: { log(): void {} } });

    await state.poll();
    await state.setConfig({ thresholds: { waitingHours: 72 } });

    expect(fetches).toBe(1);
    expect(state.getClientState().config.thresholds.waitingHours).toBe(72);
  });

  it("refetches when repository selection, coverage, or fetch limits change", async () => {
    const repos = [
      { id: "mock:alpha", name: "Alpha", project: "Test" },
      { id: "mock:beta", name: "Beta", project: "Test" },
    ];
    let fetches = 0;
    const mock = createMockSource(
      async () => repos,
      async (limits) => {
        fetches += 1;
        const selected = repos.filter((repo) => limits.repoIds.includes(repo.id));
        return {
          provider: "mock",
          fetchedAt: NOW.toISOString(),
          repos: selected,
          pullRequests: [],
          pipelines: [],
        };
      },
    );
    const state = createGameState({ config: DEFAULT_CONFIG, providers: { mock }, now: () => NOW, logger: { log(): void {} } });

    await state.poll();
    await state.setConfig({ watchedRepoIds: ["mock:alpha"] });
    await state.setConfig({ coverage: { "Shared Build": ["Alpha"] } });
    await state.setConfig({ maxRepos: 4 });
    await state.setConfig({ maxPrsPerRepo: 12 });

    expect(fetches).toBe(5);
  });

  it("coalesces concurrent polls into a single provider request", async () => {
    const repo = { id: "mock:fixture", name: "Fixture", project: "Test" };
    let listCalls = 0;
    const waitingRepos = Promise.withResolvers<RepoInfo[]>();
    const mock = createMockSource(
      async () => {
        listCalls += 1;
        return waitingRepos.promise;
      },
      async () => snapshot("mock", repo),
    );
    const state = createGameState({ config: DEFAULT_CONFIG, providers: { mock }, now: () => NOW, logger: { log(): void {} } });

    const first = state.poll();
    const second = state.poll();
    expect(second).toBe(first);
    expect(listCalls).toBe(1);
    waitingRepos.resolve([repo]);
    await first;
  });

  it("rejects unavailable providers without changing state", async () => {
    const repo = { id: "mock:fixture", name: "Fixture", project: "Test" };
    const mock = createMockSource(
      async () => [repo],
      async () => snapshot("mock", repo),
    );
    const state = createGameState({ config: DEFAULT_CONFIG, providers: { mock }, now: () => NOW, logger: { log(): void {} } });

    await state.poll();
    const before = state.getClientState();
    const result = await state.setConfig({ provider: "github" });
    const after = state.getClientState();

    expect(result.error).toContain("not configured");
    expect(after.config).toEqual(before.config);
    expect(after.city).toBe(before.city);
  });
});
