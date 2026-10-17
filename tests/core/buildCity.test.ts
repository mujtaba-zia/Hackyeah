import { describe, expect, it } from "vitest";
import { HQ_FOOTPRINT, TOWER_FOOTPRINT, TOWER_SLOTS, buildCity } from "../../core/buildCity";
import { selectRepos } from "../../core/selectRepos";
import { DEFAULT_CONFIG } from "../../shared/config";
import { RULE_IDS } from "../../shared/types";
import type {
  AppConfig,
  CityModel,
  PipelineInfo,
  PullRequestInfo,
  RepoInfo,
  RuleId,
  Snapshot,
  Thresholds,
} from "../../shared/types";

const NOW = new Date("2026-01-20T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;

type ConfigChanges = Omit<Partial<AppConfig>, "thresholds" | "rules" | "coverage"> & {
  thresholds?: Partial<Thresholds>;
  rules?: Partial<Record<RuleId, boolean>>;
  coverage?: Record<string, string[]>;
};

function makeConfig(changes: ConfigChanges = {}): AppConfig {
  const { thresholds, rules, coverage, ...topLevel } = changes;
  return {
    ...DEFAULT_CONFIG,
    ...topLevel,
    thresholds: { ...DEFAULT_CONFIG.thresholds, ...thresholds },
    rules: { ...DEFAULT_CONFIG.rules, ...rules },
    coverage: coverage ?? { ...DEFAULT_CONFIG.coverage },
  };
}

function onlyRules(...enabled: RuleId[]): Record<RuleId, boolean> {
  const rules = { ...DEFAULT_CONFIG.rules };
  for (const ruleId of RULE_IDS) rules[ruleId] = enabled.includes(ruleId);
  return rules;
}

function hoursAgo(hours: number): string {
  return new Date(NOW.getTime() - hours * HOUR).toISOString();
}

function makeRepo(id: string, name = id): RepoInfo {
  return { id, name, project: "mock" };
}

function makePullRequest(
  id: string,
  repoId: string,
  changes: Partial<PullRequestInfo> = {},
): PullRequestInfo {
  return {
    id,
    repoId,
    number: 1,
    title: `PR ${id}`,
    author: "Ada",
    draft: false,
    createdAt: hoursAgo(1),
    reviewers: 0,
    verdict: "none",
    hasConflicts: false,
    checks: "none",
    ...changes,
  };
}

function makePipeline(
  id: string,
  name: string,
  homeRepoId: string | null,
  changes: Partial<PipelineInfo> = {},
): PipelineInfo {
  return {
    id,
    name,
    homeRepoId,
    coversRepoIds: homeRepoId === null ? [] : [homeRepoId],
    kind: "ci",
    runs: [],
    ...changes,
  };
}

function makeSnapshot(
  repos: RepoInfo[],
  pullRequests: PullRequestInfo[] = [],
  pipelines: PipelineInfo[] = [],
): Snapshot {
  return {
    provider: "mock",
    fetchedAt: NOW.toISOString(),
    repos,
    pullRequests,
    pipelines,
  };
}

function overlaps(
  left: { origin: { x: number; z: number }; size: { x: number; z: number } },
  right: { origin: { x: number; z: number }; size: { x: number; z: number } },
): boolean {
  return (
    left.origin.x < right.origin.x + right.size.x &&
    left.origin.x + left.size.x > right.origin.x &&
    left.origin.z < right.origin.z + right.size.z &&
    left.origin.z + left.size.z > right.origin.z
  );
}

function incidentFor(city: CityModel, ruleId: RuleId) {
  const incident = city.incidents.find((candidate) => candidate.ruleId === ruleId);
  if (incident === undefined) throw new Error(`Expected ${ruleId} to fire`);
  return incident;
}

describe("selectRepos", () => {
  it("intersects watches with existing repos, then orders and caps them", () => {
    const repos = [
      makeRepo("mock:z", "zebra"),
      makeRepo("mock:a-2", "alpha"),
      makeRepo("mock:a-1", "alpha"),
      makeRepo("mock:missing", "middle"),
    ];
    const config = makeConfig({ watchedRepoIds: ["mock:z", "mock:a-2", "mock:a-1", "gone"], maxRepos: 2 });

    expect(selectRepos(repos, config).map((repo) => repo.id)).toEqual(["mock:a-1", "mock:a-2"]);
    expect(selectRepos(repos, makeConfig({ watchedRepoIds: null, maxRepos: 3 })).map((repo) => repo.id)).toEqual([
      "mock:a-1",
      "mock:a-2",
      "mock:missing",
    ]);
  });

  it("accepts repo names and project/name in a hand-written watch list", () => {
    const repos = [
      { ...makeRepo("az:1f0c", "payments"), project: "Contoso" },
      { ...makeRepo("az:9b2e", "payments"), project: "Fabrikam" },
      { ...makeRepo("az:77aa", "Catalog"), project: "Contoso" },
    ];
    const byName = makeConfig({ watchedRepoIds: ["CATALOG"], maxRepos: 12 });
    const qualified = makeConfig({ watchedRepoIds: ["fabrikam/payments"], maxRepos: 12 });
    const bare = makeConfig({ watchedRepoIds: ["payments"], maxRepos: 12 });

    expect(selectRepos(repos, byName).map((repo) => repo.id)).toEqual(["az:77aa"]);
    expect(selectRepos(repos, qualified).map((repo) => repo.id)).toEqual(["az:9b2e"]);
    expect(selectRepos(repos, bare).map((repo) => repo.id)).toEqual(["az:1f0c", "az:9b2e"]);
  });
});

describe("buildCity pull request mapping", () => {
  it("uses the documented mood precedence and exact age boundaries", () => {
    const repo = makeRepo("mock:app", "app");
    const city = buildCity(
      makeSnapshot([repo], [
        makePullRequest("rejected", repo.id, {
          updatedAt: hoursAgo(24 * 10),
          verdict: "rejected",
          hasConflicts: true,
        }),
        makePullRequest("blocked", repo.id, {
          updatedAt: hoursAgo(24 * 10),
          verdict: "changesRequested",
          hasConflicts: true,
        }),
        makePullRequest("changes", repo.id, { verdict: "waitingOnAuthor" }),
        makePullRequest("approved", repo.id, { updatedAt: hoursAgo(24 * 10), verdict: "approved" }),
        makePullRequest("stale", repo.id, { updatedAt: hoursAgo(7 * 24) }),
        makePullRequest("waiting", repo.id, { updatedAt: hoursAgo(24) }),
        makePullRequest("fresh", repo.id, { updatedAt: hoursAgo(23.99) }),
        makePullRequest("draft-stale", repo.id, { draft: true, updatedAt: hoursAgo(7 * 24) }),
        makePullRequest("draft-egg", repo.id, { draft: true, updatedAt: hoursAgo(7 * 24 - 0.01) }),
      ]),
      makeConfig({ rules: onlyRules() }),
      NOW,
    );

    expect(Object.fromEntries(city.creatures.map((creature) => [creature.id, creature.mood]))).toEqual({
      rejected: "rejected",
      blocked: "blocked",
      changes: "changes",
      approved: "approved",
      stale: "stale",
      waiting: "waiting",
      fresh: "fresh",
      "draft-stale": "stale",
      "draft-egg": "egg",
    });
    expect(city.creatures.find((creature) => creature.id === "draft-stale")?.zone).toBe("nursery");
    expect(city.creatures.find((creature) => creature.id === "waiting")?.zone).toBe("plaza");
  });

  it("caps each district to its most recently active pull requests", () => {
    const repo = makeRepo("mock:app", "app");
    const city = buildCity(
      makeSnapshot([repo], [
        makePullRequest("old", repo.id, { updatedAt: hoursAgo(10) }),
        makePullRequest("new", repo.id, { updatedAt: hoursAgo(1) }),
        makePullRequest("middle", repo.id, { updatedAt: hoursAgo(5) }),
      ]),
      makeConfig({ maxPrsPerRepo: 2, rules: onlyRules() }),
      NOW,
    );

    expect(city.creatures.map((creature) => creature.id)).toEqual(["new", "middle"]);
    expect(city.districts[0]?.openPrs).toBe(2);
  });
});

describe("buildCity pipelines", () => {
  it("uses the newest run, counts the consecutive failed streak, and keeps ten history entries", () => {
    const repo = makeRepo("mock:app", "app");
    const runs = [
      { id: "11", result: "failure" as const },
      { id: "10", result: "failure" as const },
      { id: "9", result: "success" as const },
      { id: "8", result: "failure" as const },
      { id: "7", result: "success" as const },
      { id: "6", result: "success" as const },
      { id: "5", result: "success" as const },
      { id: "4", result: "success" as const },
      { id: "3", result: "success" as const },
      { id: "2", result: "success" as const },
      { id: "1", result: "success" as const },
    ];
    const city = buildCity(
      makeSnapshot([repo], [], [makePipeline("pipe", "app-ci", repo.id, { runs })]),
      makeConfig({ rules: onlyRules() }),
      NOW,
    );

    expect(city.towers[0]).toMatchObject({ status: "failure", failStreak: 2 });
    expect(city.towers[0]?.history).toHaveLength(10);
    expect(city.towers[0]?.history.map((run) => run.result)).toEqual(runs.slice(0, 10).map((run) => run.result));
  });

  it("places a pipeline with an unknown home on the always-present outskirts island", () => {
    const repo = makeRepo("mock:app", "app");
    const city = buildCity(
      makeSnapshot([repo], [], [makePipeline("external", "external-ci", "mock:unknown", { coversRepoIds: [repo.id] })]),
      makeConfig({ rules: onlyRules() }),
      NOW,
    );
    const outskirts = city.islands.find((island) => island.id === "outskirts");
    const tower = city.towers[0];

    expect(outskirts).toBeDefined();
    expect(tower?.islandId).toBe("outskirts");
    expect(tower?.position.x).toBeGreaterThanOrEqual(outskirts?.origin.x ?? Number.POSITIVE_INFINITY);
    expect(tower?.position.z).toBeGreaterThanOrEqual(outskirts?.origin.z ?? Number.POSITIVE_INFINITY);
  });

  it("gives a busy district room for 70+ towers, all on the island and clear of each other", () => {
    expect(TOWER_SLOTS.length).toBeGreaterThanOrEqual(70);
    const repo = makeRepo("mock:busy", "busy");
    const pipelines = TOWER_SLOTS.map((_, index) => makePipeline(`p${index}`, `pipeline-${index}`, repo.id));
    const city = buildCity(makeSnapshot([repo], [], pipelines), makeConfig({ rules: onlyRules() }), NOW);
    const island = city.islands.find((candidate) => candidate.id === repo.id)!;
    const district = city.districts[0]!;
    const centre = { x: island.origin.x + island.size.x / 2, z: island.origin.z + island.size.z / 2 };
    // The island outline wobbles down to 0.88 of its half-size; keep everything inside that.
    const usable = (island.size.x / 2) * 0.88;
    const distance = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
    const TOWER = TOWER_FOOTPRINT;
    const HQ = HQ_FOOTPRINT;

    expect(distance(district.hq, centre) + HQ).toBeLessThanOrEqual(usable);
    expect(distance(district.nursery.center, centre) + district.nursery.radius + 0.6).toBeLessThanOrEqual(usable);
    expect(distance(district.hq, district.plaza.center)).toBeGreaterThan(district.plaza.radius + 0.4 + HQ);
    expect(city.towers).toHaveLength(TOWER_SLOTS.length);
    for (const tower of city.towers) {
      expect(distance(tower.position, centre) + TOWER).toBeLessThanOrEqual(usable);
      expect(distance(tower.position, district.plaza.center)).toBeGreaterThan(district.plaza.radius + 0.4 + TOWER);
      expect(distance(tower.position, district.hq)).toBeGreaterThan(HQ + TOWER);
      expect(distance(tower.position, district.nursery.center)).toBeGreaterThan(district.nursery.radius + 0.6 + TOWER);
      // Nothing stands between the camera (looking from +x/+z) and the plaza.
      const angle = (Math.atan2(tower.position.z - centre.z, tower.position.x - centre.x) * 180) / Math.PI;
      expect(angle > 10 && angle < 80).toBe(false);
      for (const other of city.towers) {
        if (other !== tower) expect(distance(tower.position, other.position)).toBeGreaterThanOrEqual(1.25);
      }
    }
  });
});

describe("buildCity incident rules", () => {
  it("fires pipeline failures only after a failure and upgrades at the hot streak", () => {
    const repo = makeRepo("mock:app", "app");
    const config = makeConfig({ thresholds: { failStreakHot: 3 }, rules: onlyRules("pipelineFailing") });
    const noFailure = buildCity(
      makeSnapshot([repo], [], [makePipeline("pipe", "app-ci", repo.id, { runs: [{ id: "1", result: "success" }] })]),
      config,
      NOW,
    );
    const warmFailure = buildCity(
      makeSnapshot([repo], [], [
        makePipeline("pipe", "app-ci", repo.id, {
          runs: [
            { id: "2", result: "failure" },
            { id: "1", result: "failure" },
            { id: "0", result: "success" },
          ],
        }),
      ]),
      config,
      NOW,
    );
    const hotFailure = buildCity(
      makeSnapshot([repo], [], [
        makePipeline("pipe", "app-ci", repo.id, {
          runs: [
            { id: "3", result: "failure" },
            { id: "2", result: "failure" },
            { id: "1", result: "failure" },
          ],
        }),
      ]),
      config,
      NOW,
    );

    const warmIncident = incidentFor(warmFailure, "pipelineFailing");
    const hotIncident = incidentFor(hotFailure, "pipelineFailing");

    expect(noFailure.incidents).toHaveLength(0);
    expect(warmIncident.severity).toBe("error");
    expect(warmIncident.title).toBe("app-ci is failing in app");
    expect(hotIncident.severity).toBe("critical");
    expect(hotIncident.title).toBe("app-ci failed 3 runs in a row in app");
  });

  it("names same-named failing pipelines by their home district", () => {
    const vite = makeRepo("mock:vite", "vite");
    const docs = makeRepo("mock:docs", "docs");
    const city = buildCity(
      makeSnapshot(
        [vite, docs],
        [],
        [
          makePipeline("vite-ci", "CI", vite.id, { runs: [{ id: "1", result: "failure" }] }),
          makePipeline("docs-ci", "CI", docs.id, { runs: [{ id: "1", result: "failure" }] }),
          makePipeline("outside-ci", "CI", "mock:outside", { runs: [{ id: "1", result: "failure" }] }),
        ],
      ),
      makeConfig({ rules: onlyRules("pipelineFailing") }),
      NOW,
    );

    expect(city.incidents.map((incident) => incident.title)).toEqual([
      "CI is failing in docs",
      "CI is failing in the outskirts",
      "CI is failing in vite",
    ]);
  });

  it("requires two watched districts for a shared outage", () => {
    const app = makeRepo("mock:app", "app");
    const api = makeRepo("mock:api", "api");
    const config = makeConfig({ rules: onlyRules("sharedOutage") });
    const oneDistrict = buildCity(
      makeSnapshot([app, api], [], [
        makePipeline("pipe", "deploy", app.id, { coversRepoIds: [app.id], runs: [{ id: "1", result: "failure" }] }),
      ]),
      config,
      NOW,
    );
    const twoDistricts = buildCity(
      makeSnapshot([app, api], [], [
        makePipeline("pipe", "deploy", app.id, {
          coversRepoIds: [app.id, api.id],
          runs: [{ id: "1", result: "failure" }],
        }),
      ]),
      config,
      NOW,
    );

    const outage = incidentFor(twoDistricts, "sharedOutage");

    expect(oneDistrict.incidents).toHaveLength(0);
    expect(outage.targets.districts).toEqual([api.id, app.id]);
    expect(outage.title).toBe("deploy (app) is failing in 2 repos");
  });

  it("fires review crowds at the configured size and upgrades at twice that size", () => {
    const repo = makeRepo("mock:app", "app");
    const waiting = (count: number): PullRequestInfo[] =>
      Array.from({ length: count }, (_, index) =>
        makePullRequest(`waiting-${index}`, repo.id, { updatedAt: hoursAgo(24) }),
      );
    const config = makeConfig({
      thresholds: { crowdSize: 3 },
      rules: onlyRules("reviewCrowd"),
    });

    const below = buildCity(makeSnapshot([repo], waiting(2)), config, NOW);
    const atThreshold = buildCity(makeSnapshot([repo], waiting(3)), config, NOW);
    const twiceThreshold = buildCity(makeSnapshot([repo], waiting(6)), config, NOW);

    expect(below.incidents).toHaveLength(0);
    expect(incidentFor(atThreshold, "reviewCrowd").severity).toBe("warning");
    expect(incidentFor(twiceThreshold, "reviewCrowd").severity).toBe("error");
  });

  it("fires draft pileups at the egg threshold", () => {
    const repo = makeRepo("mock:app", "app");
    const eggs = (count: number): PullRequestInfo[] =>
      Array.from({ length: count }, (_, index) => makePullRequest(`egg-${index}`, repo.id, { draft: true }));
    const config = makeConfig({ thresholds: { draftPileup: 3 }, rules: onlyRules("draftPileup") });

    expect(buildCity(makeSnapshot([repo], eggs(2)), config, NOW).incidents).toHaveLength(0);
    expect(incidentFor(buildCity(makeSnapshot([repo], eggs(3)), config, NOW), "draftPileup").severity).toBe("warning");
  });

  it("fires stale PRs when the first open or draft PR reaches the stale boundary", () => {
    const repo = makeRepo("mock:app", "app");
    const config = makeConfig({ thresholds: { staleDays: 7 }, rules: onlyRules("stalePrs") });
    const fresh = buildCity(makeSnapshot([repo], [makePullRequest("fresh", repo.id)]), config, NOW);
    const stale = buildCity(
      makeSnapshot([repo], [makePullRequest("stale", repo.id, { updatedAt: hoursAgo(7 * 24) })]),
      config,
      NOW,
    );

    expect(fresh.incidents).toHaveLength(0);
    expect(incidentFor(stale, "stalePrs").targets.creatures).toEqual(["stale"]);
  });

  it("fires stale releases only after the recent-success window has elapsed", () => {
    const repo = makeRepo("mock:app", "app");
    const config = makeConfig({ thresholds: { releaseStaleDays: 14 }, rules: onlyRules("staleRelease") });
    const exactBoundary = buildCity(
      makeSnapshot([repo], [], [
        makePipeline("release", "app-release", repo.id, {
          kind: "release",
          runs: [{ id: "1", result: "success", finishedAt: hoursAgo(14 * 24) }],
        }),
      ]),
      config,
      NOW,
    );
    const justPastBoundary = buildCity(
      makeSnapshot([repo], [], [
        makePipeline("release", "app-release", repo.id, {
          kind: "release",
          runs: [{ id: "1", result: "success", finishedAt: hoursAgo(14 * 24 + 0.01) }],
        }),
      ]),
      config,
      NOW,
    );

    const releaseIncident = incidentFor(justPastBoundary, "staleRelease");

    expect(exactBoundary.incidents).toHaveLength(0);
    expect(releaseIncident.severity).toBe("warning");
    expect(releaseIncident.title).toBe("app-release in app has no recent success");
  });

  it("starts a meltdown at three affected districts, not two", () => {
    const repos = [makeRepo("mock:a", "a"), makeRepo("mock:b", "b"), makeRepo("mock:c", "c")];
    const config = makeConfig({ rules: onlyRules("pipelineFailing", "meltdown") });
    const two = buildCity(
      makeSnapshot(
        repos.slice(0, 2),
        [],
        repos.slice(0, 2).map((repo) => makePipeline(`pipe-${repo.id}`, repo.name, repo.id, { runs: [{ id: "1", result: "failure" }] })),
      ),
      config,
      NOW,
    );
    const three = buildCity(
      makeSnapshot(
        repos,
        [],
        repos.map((repo) => makePipeline(`pipe-${repo.id}`, repo.name, repo.id, { runs: [{ id: "1", result: "failure" }] })),
      ),
      config,
      NOW,
    );

    expect(two.incidents.some((incident) => incident.ruleId === "meltdown")).toBe(false);
    expect(incidentFor(three, "meltdown").targets.districts).toEqual(["mock:a", "mock:b", "mock:c"]);
  });

  it("honors every rule toggle", () => {
    const app = makeRepo("mock:app", "app");
    const api = makeRepo("mock:api", "api");
    const web = makeRepo("mock:web", "web");
    const waiting = Array.from({ length: 3 }, (_, index) =>
      makePullRequest(`waiting-${index}`, app.id, { updatedAt: hoursAgo(24) }),
    );
    const eggs = Array.from({ length: 3 }, (_, index) => makePullRequest(`egg-${index}`, app.id, { draft: true }));
    const stale = makePullRequest("stale", app.id, { updatedAt: hoursAgo(7 * 24) });
    const snapshot = makeSnapshot(
      [app, api, web],
      [...waiting, ...eggs, stale],
      [
        makePipeline("shared", "shared-ci", app.id, {
          coversRepoIds: [app.id, api.id, web.id],
          runs: [{ id: "1", result: "failure" }],
        }),
        makePipeline("release", "app-release", app.id, {
          kind: "release",
          runs: [{ id: "2", result: "success", finishedAt: hoursAgo(15 * 24) }],
        }),
      ],
    );
    const enabledConfig = makeConfig({
      thresholds: { crowdSize: 3, draftPileup: 3, failStreakHot: 2, releaseStaleDays: 14 },
    });

    expect(buildCity(snapshot, enabledConfig, NOW).incidents.map((incident) => incident.ruleId)).toEqual(
      expect.arrayContaining([...RULE_IDS]),
    );
    for (const ruleId of RULE_IDS) {
      const disabled = buildCity(
        snapshot,
        makeConfig({ ...enabledConfig, rules: { ...enabledConfig.rules, [ruleId]: false } }),
        NOW,
      );
      expect(disabled.incidents.some((incident) => incident.ruleId === ruleId)).toBe(false);
    }
  });

  it("cables only reach beyond a tower's home, and only a shared outage breaks them", () => {
    const app = makeRepo("mock:app", "app");
    const api = makeRepo("mock:api", "api");
    const web = makeRepo("mock:web", "web");
    const city = buildCity(
      makeSnapshot(
        [app, api, web],
        [],
        [
          makePipeline("shared", "shared-ci", app.id, {
            coversRepoIds: [app.id, api.id],
            runs: [{ id: "1", result: "failure" }],
          }),
          makePipeline("solo", "solo-ci", web.id, {
            coversRepoIds: [web.id],
            runs: [{ id: "1", result: "failure" }],
          }),
          makePipeline("healthy", "healthy-ci", app.id, {
            coversRepoIds: [app.id, web.id],
            runs: [{ id: "1", result: "success" }],
          }),
        ],
      ),
      makeConfig({ rules: onlyRules("sharedOutage") }),
      NOW,
    );

    // Towers stand in their home district, so they draw no cable to it.
    expect(Object.fromEntries(city.links.map((link) => [link.id, link.broken]))).toEqual({
      "healthy->mock:web": false,
      "shared->mock:api": true,
    });
  });

  it("derives district health from warning, error, and critical incidents", () => {
    const warning = makeRepo("mock:warning", "warning");
    const bad = makeRepo("mock:bad", "bad");
    const good = makeRepo("mock:good", "good");
    const city = buildCity(
      makeSnapshot(
        [warning, bad, good],
        [
          makePullRequest("old-warning", warning.id, { updatedAt: hoursAgo(7 * 24) }),
          makePullRequest("old-bad", bad.id, { updatedAt: hoursAgo(7 * 24) }),
        ],
        [makePipeline("bad-ci", "bad-ci", bad.id, { runs: [{ id: "1", result: "failure" }] })],
      ),
      makeConfig({ rules: onlyRules("pipelineFailing", "stalePrs") }),
      NOW,
    );

    expect(Object.fromEntries(city.districts.map((district) => [district.id, district.health]))).toEqual({
      "mock:bad": "bad",
      "mock:good": "good",
      "mock:warning": "warn",
    });
  });
});

describe("buildCity layout", () => {
  it("is byte-stable across repeated calls and shuffled entity input without island overlap", () => {
    const repos = [
      makeRepo("mock:delta", "delta"),
      makeRepo("mock:alpha", "alpha"),
      makeRepo("mock:echo", "echo"),
      makeRepo("mock:bravo", "bravo"),
      makeRepo("mock:charlie", "charlie"),
    ];
    const pullRequests = [
      makePullRequest("delta-pr", "mock:delta", { updatedAt: hoursAgo(6) }),
      makePullRequest("alpha-pr", "mock:alpha", { updatedAt: hoursAgo(2) }),
    ];
    const pipelines = [
      makePipeline("z", "z-ci", "mock:delta", { runs: [{ id: "1", result: "success" }] }),
      makePipeline("unknown", "external-ci", "mock:outside", { coversRepoIds: ["mock:alpha"] }),
    ];
    const snapshot = makeSnapshot(repos, pullRequests, pipelines);
    const config = makeConfig({ rules: onlyRules() });
    const first = buildCity(snapshot, config, NOW);
    const second = buildCity(structuredClone(snapshot), config, new Date(NOW));
    const shuffled = makeSnapshot([...repos].reverse(), [...pullRequests].reverse(), [...pipelines].reverse());
    const shuffledCity = buildCity(shuffled, config, NOW);

    expect(second).toEqual(first);
    expect(shuffledCity).toEqual(first);
    for (let leftIndex = 0; leftIndex < first.islands.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < first.islands.length; rightIndex += 1) {
        const left = first.islands[leftIndex];
        const right = first.islands[rightIndex];
        if (left === undefined || right === undefined) continue;
        expect(overlaps(left, right)).toBe(false);
      }
    }
  });
});
