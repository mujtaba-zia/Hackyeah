// Roll-ups of a CityModel, shared by the world's nameplates and the HUD lists so
// both always agree on what "3 failing" means. Pure: no DOM, no Node, no three.js.

import type { CityModel, Health, Mood, RunResult, Severity, Tower } from "./types";

/** Pipeline statuses from most to least urgent. Lists, pips and bars use this order. */
export const STATUS_ORDER: readonly RunResult[] = ["failure", "partial", "running", "queued", "cancelled", "none", "success"];

export type StatusCounts = Record<RunResult, number>;

/** Pull requests that are waiting on a person rather than moving on their own. */
const NEEDS_ATTENTION: Record<Mood, boolean> = {
  egg: false,
  fresh: false,
  approved: false,
  waiting: true,
  changes: true,
  stale: true,
  blocked: true,
  rejected: true,
};

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, error: 1, warning: 2 };
const STATUS_RANK = Object.fromEntries(STATUS_ORDER.map((status, index) => [status, index])) as Record<RunResult, number>;

export interface IslandSummary {
  /** Towers standing on the island, most urgent first, then by name. */
  towers: Tower[];
  statuses: StatusCounts;
  openPrs: number;
  draftPrs: number;
  /** Open PRs waiting on a review, an author, a rebase or a decision. */
  attentionPrs: number;
  /** Problems that involve the island, one of its towers or one of its PRs. */
  incidents: number;
  worst: Severity | null;
}

export interface EstateSummary {
  repoTotal: number;
  repos: Record<Health, number>;
  pipelineTotal: number;
  statuses: StatusCounts;
  openPrs: number;
  draftPrs: number;
  attentionPrs: number;
  incidents: Record<Severity, number>;
}

export function emptyStatusCounts(): StatusCounts {
  return { failure: 0, partial: 0, running: 0, queued: 0, cancelled: 0, none: 0, success: 0 };
}

/** Most urgent status first, then by name, then by id so the order never flickers. */
export function compareTowers(left: Tower, right: Tower): number {
  return (
    STATUS_RANK[left.status] - STATUS_RANK[right.status] ||
    left.name.localeCompare(right.name) ||
    (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
  );
}

function emptyIslandSummary(): IslandSummary {
  return { towers: [], statuses: emptyStatusCounts(), openPrs: 0, draftPrs: 0, attentionPrs: 0, incidents: 0, worst: null };
}

/** One summary per island that has a district or a tower, keyed by island id. */
export function summarizeIslands(city: CityModel): Map<string, IslandSummary> {
  const summaries = new Map<string, IslandSummary>();
  const summaryFor = (islandId: string): IslandSummary => {
    let summary = summaries.get(islandId);
    if (!summary) {
      summary = emptyIslandSummary();
      summaries.set(islandId, summary);
    }
    return summary;
  };

  for (const district of city.districts) summaryFor(district.id);

  const towerIsland = new Map<string, string>();
  for (const tower of city.towers) {
    const summary = summaryFor(tower.islandId);
    summary.towers.push(tower);
    summary.statuses[tower.status] += 1;
    towerIsland.set(tower.id, tower.islandId);
  }
  for (const summary of summaries.values()) summary.towers.sort(compareTowers);

  const creatureIsland = new Map<string, string>();
  for (const creature of city.creatures) {
    const summary = summaryFor(creature.districtId);
    creatureIsland.set(creature.id, creature.districtId);
    if (creature.zone === "nursery") {
      summary.draftPrs += 1;
      continue;
    }
    summary.openPrs += 1;
    if (NEEDS_ATTENTION[creature.mood]) summary.attentionPrs += 1;
  }

  for (const incident of city.incidents) {
    const involved = new Set<string>(incident.targets.districts);
    for (const towerId of incident.targets.towers) {
      const islandId = towerIsland.get(towerId);
      if (islandId !== undefined) involved.add(islandId);
    }
    for (const creatureId of incident.targets.creatures) {
      const islandId = creatureIsland.get(creatureId);
      if (islandId !== undefined) involved.add(islandId);
    }
    for (const islandId of involved) {
      const summary = summaries.get(islandId);
      if (!summary) continue;
      summary.incidents += 1;
      if (summary.worst === null || SEVERITY_RANK[incident.severity] < SEVERITY_RANK[summary.worst]) {
        summary.worst = incident.severity;
      }
    }
  }

  return summaries;
}

export function summarizeEstate(city: CityModel): EstateSummary {
  const estate: EstateSummary = {
    repoTotal: city.districts.length,
    repos: { good: 0, warn: 0, bad: 0 },
    pipelineTotal: city.towers.length,
    statuses: emptyStatusCounts(),
    openPrs: 0,
    draftPrs: 0,
    attentionPrs: 0,
    incidents: { critical: 0, error: 0, warning: 0 },
  };
  for (const district of city.districts) estate.repos[district.health] += 1;
  for (const tower of city.towers) estate.statuses[tower.status] += 1;
  for (const creature of city.creatures) {
    if (creature.zone === "nursery") {
      estate.draftPrs += 1;
      continue;
    }
    estate.openPrs += 1;
    if (NEEDS_ATTENTION[creature.mood]) estate.attentionPrs += 1;
  }
  for (const incident of city.incidents) estate.incidents[incident.severity] += 1;
  return estate;
}
