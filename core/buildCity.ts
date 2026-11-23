import { RULE_IDS } from "../shared/types";
import type {
  AppConfig,
  CityModel,
  Creature,
  District,
  Health,
  Incident,
  Island,
  IslandGroup,
  Mood,
  PipelineInfo,
  PipelineRun,
  PullRequestInfo,
  Severity,
  Snapshot,
  Tower,
  Vec2,
  Zone,
} from "../shared/types";
import { hashToUnit } from "./hash";
import { districtFurniture, layoutWorld, point, towerPosition, type GroupSpec } from "./layout";
import { RULE_CATALOG } from "./rules/catalog";
import { selectRepos } from "./selectRepos";

const MILLIS_PER_HOUR = 60 * 60 * 1000;
const OUTSKIRTS_ID = "outskirts";

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  error: 1,
  warning: 2,
};

const HEALTH_RANK: Record<Health, number> = { good: 0, warn: 1, bad: 2 };

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function prActivityMillis(pullRequest: PullRequestInfo): number {
  const activityMillis = Date.parse(pullRequest.updatedAt ?? pullRequest.createdAt);
  return Number.isFinite(activityMillis) ? activityMillis : Number.NEGATIVE_INFINITY;
}

function moodFor(pullRequest: PullRequestInfo, ageHours: number, staleHours: number, waitingHours: number): Mood {
  if (pullRequest.draft) return ageHours >= staleHours ? "stale" : "egg";
  if (pullRequest.verdict === "rejected") return "rejected";
  if (pullRequest.hasConflicts) return "blocked";
  if (pullRequest.verdict === "changesRequested" || pullRequest.verdict === "waitingOnAuthor") return "changes";
  if (pullRequest.verdict === "approved") return "approved";
  if (ageHours >= staleHours) return "stale";
  if (ageHours >= waitingHours) return "waiting";
  return "fresh";
}

function creatureHome(creatureId: string, zone: Zone, district: District): Vec2 {
  const area = zone === "plaza" ? district.plaza : district.nursery;
  const angle = hashToUnit(`${creatureId}\u0000angle`) * Math.PI * 2;
  const distance = Math.sqrt(hashToUnit(`${creatureId}\u0000distance`)) * area.radius;

  return point(
    area.center.x + Math.cos(angle) * distance,
    area.center.z + Math.sin(angle) * distance,
  );
}

function historyFor(runs: PipelineRun[]): Tower["history"] {
  const history: Tower["history"] = [];

  for (const run of runs.slice(0, 10)) {
    const entry: Tower["history"][number] = { result: run.result };
    if (run.startedAt !== undefined) entry.startedAt = run.startedAt;
    if (run.finishedAt !== undefined) entry.finishedAt = run.finishedAt;
    if (run.branch !== undefined) entry.branch = run.branch;
    if (run.url !== undefined) entry.url = run.url;
    history.push(entry);
  }

  return history;
}

function failStreakFor(runs: PipelineRun[]): number {
  let failStreak = 0;

  for (const run of runs) {
    if (run.result !== "failure") break;
    failStreak += 1;
  }

  return failStreak;
}

/**
 * Builds the renderer-ready city without reading clocks, randomness, or external state.
 */
export function buildCity(snapshot: Snapshot, config: AppConfig, now: Date): CityModel {
  const shownRepos = selectRepos(snapshot.repos, config);
  const shownRepoIds: Record<string, true> = Object.create(null);
  for (const repo of shownRepos) shownRepoIds[repo.id] = true;

  // Every pipeline stands on its home repository's island, or on the outskirts
  // when that repository is not shown. `spot` is its place among that island's towers.
  const pipelines = [...snapshot.pipelines].sort(
    (left, right) => compareText(left.name, right.name) || compareText(left.id, right.id),
  );
  const placements: { pipeline: PipelineInfo; islandId: string; spot: number }[] = [];
  const towerCounts: Record<string, number> = Object.create(null);
  for (const pipeline of pipelines) {
    const islandId =
      pipeline.homeRepoId !== null && Object.hasOwn(shownRepoIds, pipeline.homeRepoId) ? pipeline.homeRepoId : OUTSKIRTS_ID;
    const spot = towerCounts[islandId] ?? 0;
    towerCounts[islandId] = spot + 1;
    placements.push({ pipeline, islandId, spot });
  }

  // One archipelago per project, in name order; repositories keep their name order inside it.
  const specsByProject: Record<string, GroupSpec> = Object.create(null);
  for (const repo of shownRepos) {
    let spec = specsByProject[repo.project];
    if (spec === undefined) {
      spec = { id: `project:${repo.project}`, name: repo.project, islands: [] };
      specsByProject[repo.project] = spec;
    }
    spec.islands.push({ id: repo.id, kind: "district", towerCount: towerCounts[repo.id] ?? 0 });
  }
  const specs = Object.values(specsByProject).sort((left, right) => compareText(left.name, right.name));
  const homeless = towerCounts[OUTSKIRTS_ID];
  if (homeless !== undefined) {
    specs.push({
      id: OUTSKIRTS_ID,
      name: "Outskirts",
      islands: [{ id: OUTSKIRTS_ID, kind: "outskirts", towerCount: homeless }],
    });
  }

  const layout = layoutWorld(specs);
  const islandsById: Record<string, Island> = Object.create(null);
  for (const island of layout.islands) islandsById[island.id] = island;

  const districts: District[] = [];
  const creatures: Creature[] = [];
  const staleHours = config.thresholds.staleDays * 24;
  const waitingHours = config.thresholds.waitingHours;
  const nowMillis = now.getTime();
  const pullRequestLimit = Number.isFinite(config.maxPrsPerRepo)
    ? Math.max(0, Math.floor(config.maxPrsPerRepo))
    : 0;

  for (const repo of shownRepos) {
    const island = islandsById[repo.id];
    if (island === undefined) continue;

    const pullRequests = snapshot.pullRequests
      .filter((pullRequest) => pullRequest.repoId === repo.id)
      .sort((left, right) => {
        const leftActivity = prActivityMillis(left);
        const rightActivity = prActivityMillis(right);
        if (rightActivity > leftActivity) return 1;
        if (rightActivity < leftActivity) return -1;
        return compareText(left.id, right.id);
      })
      .slice(0, pullRequestLimit);
    const openPrs = pullRequests.filter((pullRequest) => !pullRequest.draft).length;
    const district: District = {
      id: repo.id,
      name: repo.name,
      project: repo.project,
      health: "good",
      ...districtFurniture(island),
      openPrs,
      draftPrs: pullRequests.length - openPrs,
    };
    if (repo.url !== undefined) district.url = repo.url;
    districts.push(district);

    for (const pullRequest of pullRequests) {
      const activityMillis = prActivityMillis(pullRequest);
      const ageHours = Number.isFinite(activityMillis) ? (nowMillis - activityMillis) / MILLIS_PER_HOUR : 0;
      const zone: Zone = pullRequest.draft ? "nursery" : "plaza";
      const creature: Creature = {
        id: pullRequest.id,
        districtId: district.id,
        zone,
        home: creatureHome(pullRequest.id, zone, district),
        mood: moodFor(pullRequest, ageHours, staleHours, waitingHours),
        checks: pullRequest.checks,
        number: pullRequest.number,
        title: pullRequest.title,
        author: pullRequest.author,
        ageHours,
      };
      if (pullRequest.url !== undefined) creature.url = pullRequest.url;
      creatures.push(creature);
    }
  }

  const towers: Tower[] = [];
  for (const { pipeline, islandId, spot } of placements) {
    const island = islandsById[islandId];
    if (island === undefined) continue;

    const coverageIds: Record<string, true> = Object.create(null);
    for (const repoId of pipeline.coversRepoIds) coverageIds[repoId] = true;
    const tower: Tower = {
      id: pipeline.id,
      name: pipeline.name,
      islandId,
      position: towerPosition(island, spot),
      kind: pipeline.kind,
      status: pipeline.runs[0]?.result ?? "none",
      failStreak: failStreakFor(pipeline.runs),
      history: historyFor(pipeline.runs),
      coversDistrictIds: districts.filter((district) => Object.hasOwn(coverageIds, district.id)).map((district) => district.id),
    };
    if (pipeline.url !== undefined) tower.url = pipeline.url;
    towers.push(tower);
  }

  const emittedIncidents: Incident[] = [];
  for (const ruleId of RULE_IDS) {
    if (ruleId === "meltdown" || config.rules[ruleId] === false) continue;
    emittedIncidents.push(
      ...RULE_CATALOG[ruleId]({ config, now, districts, creatures, towers, incidents: emittedIncidents }),
    );
  }
  if (config.rules.meltdown !== false) {
    emittedIncidents.push(
      ...RULE_CATALOG.meltdown({ config, now, districts, creatures, towers, incidents: emittedIncidents }),
    );
  }

  const incidents = [...emittedIncidents].sort((left, right) => {
    const severityDifference = SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity];
    if (severityDifference !== 0) return severityDifference;
    return compareText(left.title, right.title) || compareText(left.id, right.id);
  });

  const healthByDistrictId: Record<string, Health> = Object.create(null);
  for (const district of districts) healthByDistrictId[district.id] = "good";

  for (const incident of incidents) {
    for (const districtId of incident.targets.districts) {
      const currentHealth = healthByDistrictId[districtId];
      if (currentHealth === undefined) continue;
      if (incident.severity === "critical" || incident.severity === "error") {
        healthByDistrictId[districtId] = "bad";
      } else if (currentHealth === "good") {
        healthByDistrictId[districtId] = "warn";
      }
    }
  }

  const groups = layout.groups.map((group): IslandGroup => {
    let health: Health = "good";
    for (const islandId of group.islandIds) {
      const islandHealth = healthByDistrictId[islandId] ?? "good";
      if (HEALTH_RANK[islandHealth] > HEALTH_RANK[health]) health = islandHealth;
    }
    return { ...group, health };
  });

  return {
    generatedAt: now.toISOString(),
    worldSize: layout.worldSize,
    groups,
    islands: layout.islands,
    districts: districts.map((district) => ({ ...district, health: healthByDistrictId[district.id] ?? "good" })),
    creatures,
    towers,
    bridges: layout.bridges,
    incidents,
  };
}
