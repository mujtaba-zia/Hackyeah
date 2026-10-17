import { RULE_IDS } from "../shared/types";
import type {
  AppConfig,
  Bridge,
  CityModel,
  Creature,
  District,
  Health,
  Incident,
  Island,
  Mood,
  PipelineKind,
  PipelineRun,
  PullRequestInfo,
  RepoInfo,
  RunResult,
  Severity,
  Snapshot,
  Tower,
  Vec2,
  Zone,
} from "../shared/types";
import { hashToUnit } from "./hash";
import { RULE_CATALOG } from "./rules/catalog";
import { selectRepos } from "./selectRepos";

const ISLAND_SIZE = 30;
const ISLAND_GAP = 6;
const ISLAND_SPACING = ISLAND_SIZE + ISLAND_GAP;
const MILLIS_PER_HOUR = 60 * 60 * 1000;

// District layout, relative to the island centre. The game camera looks from
// +x/+z, so angles (atan2 of z over x) of 45° face the viewer and 225° face away.
// The plaza sits in the middle, the HQ stands at the back where it never hides
// creatures, the nursery is to the right, and towers fill rings around them.
const PLAZA_RADIUS = 3;
const NURSERY_RADIUS = 1.8;
const HQ_OFFSET = { x: -4.6, z: -4.6 };
const NURSERY_OFFSET = { x: 4.8, z: -4.8 };

/** Half-width of the HQ model as drawn (the renderer's HQ scale times its footprint). */
export const HQ_FOOTPRINT = 1.7;
/** A tower's own footprint radius (the keep's plinth; its crane reaches a little further). */
export const TOWER_FOOTPRINT = 0.85;
/** Room the nursery's fence and hay bales take beyond its radius. */
const NURSERY_MARGIN = 0.6;

// Tower spots sit in rows that face the camera, so they spread across the screen
// instead of hiding behind each other. `across` runs left-right on screen,
// `depth` towards the camera; each row is shifted half a spot so a tower behind
// shows between the two in front of it.
const ROW_SPACING_ACROSS = 3.2;
const ROW_SPACING_DEPTH = 2.4;
/** Closest any two tower centres get (diagonal neighbours on adjacent rows). */
export const TOWER_SPACING = Math.hypot(ROW_SPACING_ACROSS / 2, ROW_SPACING_DEPTH);
/** Keep the strip between the camera and the plaza clear, up to this depth in front of it. */
const VIEW_CORRIDOR = { halfWidth: 3.6, clearBeyond: 8.5 } as const;
/** Towers fill outwards from here (back-left of the plaza). */
const FIRST_TOWER = { x: -4.4, z: 2.6 };
/** How far from the island centre a tower may stand (inside the rounded outline). */
const TOWER_REACH = (ISLAND_SIZE / 2) * 0.88 - TOWER_FOOTPRINT - 0.15;

/**
 * Every tower spot on a district island, in fill order, relative to its centre:
 * a staggered grid of camera-facing rows, kept off the plaza, the HQ, the
 * nursery and the camera's view of the plaza.
 */
export const TOWER_SLOTS: readonly Vec2[] = (() => {
  const spots: Vec2[] = [];
  const rows = Math.ceil(TOWER_REACH / ROW_SPACING_DEPTH);
  const columns = Math.ceil(TOWER_REACH / ROW_SPACING_ACROSS) + 1;
  for (let row = -rows; row <= rows; row += 1) {
    const depth = row * ROW_SPACING_DEPTH;
    const shift = row % 2 === 0 ? 0 : ROW_SPACING_ACROSS / 2;
    for (let column = -columns; column <= columns; column += 1) {
      const across = column * ROW_SPACING_ACROSS + shift;
      // across = (x - z) / sqrt 2, depth = (x + z) / sqrt 2
      const spot = { x: (across + depth) / Math.SQRT2, z: (depth - across) / Math.SQRT2 };
      if (Math.hypot(spot.x, spot.z) > TOWER_REACH) continue;
      if (Math.hypot(spot.x, spot.z) < PLAZA_RADIUS + 0.4 + TOWER_FOOTPRINT) continue;
      if (depth > 0 && depth < VIEW_CORRIDOR.clearBeyond && Math.abs(across) < VIEW_CORRIDOR.halfWidth) continue;
      if (Math.hypot(spot.x - HQ_OFFSET.x, spot.z - HQ_OFFSET.z) < HQ_FOOTPRINT + TOWER_FOOTPRINT + 0.3) continue;
      if (Math.hypot(spot.x - NURSERY_OFFSET.x, spot.z - NURSERY_OFFSET.z) < NURSERY_RADIUS + NURSERY_MARGIN + TOWER_FOOTPRINT) {
        continue;
      }
      spots.push(spot);
    }
  }
  const distance = (spot: Vec2) => Math.hypot(spot.x - FIRST_TOWER.x, spot.z - FIRST_TOWER.z);
  return spots.sort((left, right) => distance(left) - distance(right) || left.x - right.x || left.z - right.z);
})();

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  error: 1,
  warning: 2,
};

interface GridCell {
  row: number;
  column: number;
  island: Island;
}

interface DistrictLayout {
  repo: RepoInfo;
  island: Island;
  hq: Vec2;
  plaza: District["plaza"];
  nursery: District["nursery"];
}

interface TowerDraft {
  id: string;
  name: string;
  islandId: string;
  kind: PipelineKind;
  status: RunResult;
  failStreak: number;
  history: Tower["history"];
  coversDistrictIds: string[];
  url?: string;
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function roundedCoordinate(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  return rounded === 0 ? 0 : rounded;
}

function point(x: number, z: number): Vec2 {
  return { x: roundedCoordinate(x), z: roundedCoordinate(z) };
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

function towerPosition(island: Island, index: number): Vec2 {
  const centreX = island.origin.x + island.size.x / 2;
  const centreZ = island.origin.z + island.size.z / 2;
  // Past the last slot, towers go round again turned half a spacing along their
  // ring: they may crowd a neighbour, but they stay on the island.
  const slot = TOWER_SLOTS[index % TOWER_SLOTS.length] ?? { x: 0, z: 0 };
  const lap = Math.floor(index / TOWER_SLOTS.length);
  const turn = lap === 0 ? 0 : (lap * TOWER_SPACING) / 2 / Math.hypot(slot.x, slot.z);
  const x = slot.x * Math.cos(turn) - slot.z * Math.sin(turn);
  const z = slot.x * Math.sin(turn) + slot.z * Math.cos(turn);
  return point(centreX + x, centreZ + z);
}

function historyFor(runs: PipelineRun[]): Tower["history"] {
  const history: Tower["history"] = [];

  for (const run of runs.slice(0, 10)) {
    const entry: Tower["history"][number] = { result: run.result };
    if (run.finishedAt !== undefined) entry.finishedAt = run.finishedAt;
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

function bridgesFor(cells: GridCell[], outskirtsCell: GridCell): Bridge[] {
  const cellsByPosition: Record<string, GridCell> = Object.create(null);
  const bridges: Bridge[] = [];

  for (const cell of cells) cellsByPosition[`${cell.row}:${cell.column}`] = cell;
  cellsByPosition[`${outskirtsCell.row}:${outskirtsCell.column}`] = outskirtsCell;

  for (const cell of [...cells, outskirtsCell]) {
    const right = cellsByPosition[`${cell.row}:${cell.column + 1}`];
    if (right !== undefined) {
      bridges.push({
        id: `${cell.island.id}->${right.island.id}`,
        from: point(cell.island.origin.x + ISLAND_SIZE, cell.island.origin.z + ISLAND_SIZE / 2),
        to: point(right.island.origin.x, right.island.origin.z + ISLAND_SIZE / 2),
      });
    }

    const below = cellsByPosition[`${cell.row + 1}:${cell.column}`];
    if (below !== undefined) {
      bridges.push({
        id: `${cell.island.id}->${below.island.id}`,
        from: point(cell.island.origin.x + ISLAND_SIZE / 2, cell.island.origin.z + ISLAND_SIZE),
        to: point(below.island.origin.x + ISLAND_SIZE / 2, below.island.origin.z),
      });
    }
  }

  return bridges;
}

/**
 * Builds the renderer-ready city without reading clocks, randomness, or external state.
 */
export function buildCity(snapshot: Snapshot, config: AppConfig, now: Date): CityModel {
  const shownRepos = selectRepos(snapshot.repos, config);
  const columns = shownRepos.length === 0 ? 0 : Math.ceil(Math.sqrt(shownRepos.length));
  const rows = columns === 0 ? 0 : Math.ceil(shownRepos.length / columns);
  const cellCount = columns * rows;
  const islands: Island[] = [];
  const districtLayouts: DistrictLayout[] = [];
  const cells: GridCell[] = [];

  for (let slot = 0; slot < cellCount; slot += 1) {
    const row = Math.floor(slot / columns);
    const column = slot % columns;
    const origin = point(column * ISLAND_SPACING, row * ISLAND_SPACING);
    const repo = shownRepos[slot];
    const island: Island =
      repo === undefined
        ? {
            id: `filler:${slot}`,
            kind: "filler",
            origin,
            size: point(ISLAND_SIZE, ISLAND_SIZE),
            seed: hashToUnit(`filler:${slot}`),
          }
        : {
            id: repo.id,
            kind: "district",
            origin,
            size: point(ISLAND_SIZE, ISLAND_SIZE),
            seed: hashToUnit(repo.id),
          };

    islands.push(island);
    cells.push({ row, column, island });

    if (repo !== undefined) {
      const centreX = origin.x + ISLAND_SIZE / 2;
      const centreZ = origin.z + ISLAND_SIZE / 2;
      districtLayouts.push({
        repo,
        island,
        hq: point(centreX + HQ_OFFSET.x, centreZ + HQ_OFFSET.z),
        plaza: { center: point(centreX, centreZ), radius: PLAZA_RADIUS },
        nursery: { center: point(centreX + NURSERY_OFFSET.x, centreZ + NURSERY_OFFSET.z), radius: NURSERY_RADIUS },
      });
    }
  }

  const outskirts: Island = {
    id: "outskirts",
    kind: "outskirts",
    origin: point(0, rows * ISLAND_SPACING),
    size: point(ISLAND_SIZE, ISLAND_SIZE),
    seed: hashToUnit("outskirts"),
  };
  const outskirtsCell: GridCell = { row: rows, column: 0, island: outskirts };
  islands.push(outskirts);

  const districts: District[] = [];
  const creatures: Creature[] = [];
  const staleHours = config.thresholds.staleDays * 24;
  const waitingHours = config.thresholds.waitingHours;
  const nowMillis = now.getTime();
  const pullRequestLimit = Number.isFinite(config.maxPrsPerRepo)
    ? Math.max(0, Math.floor(config.maxPrsPerRepo))
    : 0;

  for (const layout of districtLayouts) {
    const pullRequests = snapshot.pullRequests
      .filter((pullRequest) => pullRequest.repoId === layout.repo.id)
      .sort((left, right) => {
        const leftActivity = prActivityMillis(left);
        const rightActivity = prActivityMillis(right);
        if (rightActivity > leftActivity) return 1;
        if (rightActivity < leftActivity) return -1;
        return compareText(left.id, right.id);
      })
      .slice(0, pullRequestLimit);
    const openPrs = pullRequests.filter((pullRequest) => !pullRequest.draft).length;
    const draftPrs = pullRequests.length - openPrs;
    const district: District = {
      id: layout.repo.id,
      name: layout.repo.name,
      project: layout.repo.project,
      health: "good",
      hq: layout.hq,
      plaza: layout.plaza,
      nursery: layout.nursery,
      openPrs,
      draftPrs,
    };
    if (layout.repo.url !== undefined) district.url = layout.repo.url;
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

  const shownDistrictIds: Record<string, true> = Object.create(null);
  const islandsById: Record<string, Island> = Object.create(null);
  for (const district of districts) shownDistrictIds[district.id] = true;
  for (const island of islands) islandsById[island.id] = island;

  const towerDrafts: TowerDraft[] = [];
  const pipelines = [...snapshot.pipelines].sort(
    (left, right) => compareText(left.name, right.name) || compareText(left.id, right.id),
  );

  for (const pipeline of pipelines) {
    const coverageIds: Record<string, true> = Object.create(null);
    for (const repoId of pipeline.coversRepoIds) coverageIds[repoId] = true;

    const coversDistrictIds = districts
      .filter((district) => Object.hasOwn(coverageIds, district.id))
      .map((district) => district.id);
    const homeIsShown = pipeline.homeRepoId !== null && Object.hasOwn(shownDistrictIds, pipeline.homeRepoId);
    const draft: TowerDraft = {
      id: pipeline.id,
      name: pipeline.name,
      islandId: homeIsShown && pipeline.homeRepoId !== null ? pipeline.homeRepoId : "outskirts",
      kind: pipeline.kind,
      status: pipeline.runs[0]?.result ?? "none",
      failStreak: failStreakFor(pipeline.runs),
      history: historyFor(pipeline.runs),
      coversDistrictIds,
    };
    if (pipeline.url !== undefined) draft.url = pipeline.url;
    towerDrafts.push(draft);
  }

  const towerRows: Record<string, TowerDraft[]> = Object.create(null);
  for (const draft of towerDrafts) {
    const row = towerRows[draft.islandId];
    if (row === undefined) towerRows[draft.islandId] = [draft];
    else row.push(draft);
  }

  const towers: Tower[] = [];
  for (const draft of towerDrafts) {
    const island = islandsById[draft.islandId];
    const row = towerRows[draft.islandId];
    if (island === undefined || row === undefined) continue;

    const tower: Tower = {
      id: draft.id,
      name: draft.name,
      islandId: draft.islandId,
      position: towerPosition(island, row.indexOf(draft)),
      kind: draft.kind,
      status: draft.status,
      failStreak: draft.failStreak,
      history: draft.history,
      coversDistrictIds: draft.coversDistrictIds,
    };
    if (draft.url !== undefined) tower.url = draft.url;
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

  const districtsWithHealth = districts.map((district) => ({
    ...district,
    health: healthByDistrictId[district.id] ?? "good",
  }));
  const districtsById: Record<string, District> = Object.create(null);
  for (const district of districtsWithHealth) districtsById[district.id] = district;

  const outageTowerIds: Record<string, true> = Object.create(null);
  for (const incident of incidents) {
    if (incident.ruleId !== "sharedOutage") continue;
    for (const towerId of incident.targets.towers) outageTowerIds[towerId] = true;
  }

  const links: CityModel["links"] = [];
  for (const tower of towers) {
    for (const districtId of tower.coversDistrictIds) {
      // A tower standing in its own district needs no cable to it; cables show reach beyond home.
      const district = districtId === tower.islandId ? undefined : districtsById[districtId];
      if (district === undefined) continue;
      links.push({
        id: `${tower.id}->${district.id}`,
        towerId: tower.id,
        districtId: district.id,
        from: tower.position,
        to: district.hq,
        broken: Object.hasOwn(outageTowerIds, tower.id),
      });
    }
  }

  let worldX = 0;
  let worldZ = 0;
  for (const island of islands) {
    worldX = Math.max(worldX, island.origin.x + island.size.x);
    worldZ = Math.max(worldZ, island.origin.z + island.size.z);
  }

  return {
    generatedAt: now.toISOString(),
    worldSize: point(worldX, worldZ),
    islands,
    districts: districtsWithHealth,
    creatures,
    towers,
    links,
    bridges: bridgesFor(cells, outskirtsCell),
    incidents,
  };
}
