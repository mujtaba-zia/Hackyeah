import { ISLAND_USABLE, VIEW_CORRIDOR, screenAxes } from "../../shared/geometry";
import type { Island, Vec2 } from "../../shared/types";
import { seededRange, seededUnit } from "./hash";

export type SceneryKind = "tree" | "rock" | "bush" | "flowers";
export type SceneryModel =
  | "tree_pine"
  | "tree_round"
  | "tree_birch"
  | "rock_1"
  | "rock_2"
  | "rock_3"
  | "bush_1"
  | "bush_2"
  | "flowers_1"
  | "flowers_2";

export interface SceneryPlacement {
  kind: SceneryKind;
  model: SceneryModel;
  position: Vec2;
  scale: number;
  rotation: number;
}

/** What already stands on the island; scenery keeps off all of it. */
export interface SceneryReservations {
  /** The town hall, or the waystation on the outskirts island. */
  hq?: Vec2;
  plaza?: { center: Vec2; radius: number };
  nursery?: { center: Vec2; radius: number };
  towerPositions: readonly Vec2[];
}

interface KindRules {
  models: readonly SceneryModel[];
  /** Upper end of this kind's slice of the 0..1 draw that picks a kind. */
  share: number;
  /** Room it needs from the shore, buildings and other scenery. */
  radius: number;
  scale: readonly [number, number];
}

const KINDS: Record<SceneryKind, KindRules> = {
  tree: { models: ["tree_pine", "tree_round", "tree_birch"], share: 0.34, radius: 0.75, scale: [0.8, 1.3] },
  rock: { models: ["rock_1", "rock_2", "rock_3"], share: 0.48, radius: 0.55, scale: [0.7, 1.25] },
  bush: { models: ["bush_1", "bush_2"], share: 0.7, radius: 0.5, scale: [0.8, 1.3] },
  flowers: { models: ["flowers_1", "flowers_2"], share: 1, radius: 0.3, scale: [0.85, 1.4] },
};
const KIND_ORDER: readonly SceneryKind[] = ["tree", "rock", "bush", "flowers"];

/** Scenery items per square unit of island. */
const DENSITY = 0.115;
const HQ_CLEARANCE = 2.1;
const TOWER_CLEARANCE = 1.75;
const PLAZA_MARGIN = 0.55;
const NURSERY_MARGIN = 0.7;
/** Open ground kept where a bridge lands. */
const PORT_CLEARANCE = 1.7;

function within(point: Vec2, centre: Vec2, distance: number): boolean {
  const x = point.x - centre.x;
  const z = point.z - centre.z;
  return x * x + z * z < distance * distance;
}

/** Whether something of the given kind may stand at `position`. */
export function isSceneryPlacementFree(
  island: Island,
  kind: SceneryKind,
  position: Vec2,
  reservations: SceneryReservations,
): boolean {
  const { radius } = KINDS[kind];
  const half = island.size.x / 2;
  const centre = { x: island.origin.x + half, z: island.origin.z + island.size.z / 2 };
  if (!within(position, centre, half * ISLAND_USABLE - radius)) return false;
  for (const [x, z] of [[half, 0], [-half, 0], [0, half], [0, -half]] as const) {
    if (within(position, { x: centre.x + x, z: centre.z + z }, PORT_CLEARANCE + radius)) return false;
  }
  if (reservations.hq && within(position, reservations.hq, HQ_CLEARANCE + radius)) return false;
  if (reservations.plaza) {
    if (within(position, reservations.plaza.center, reservations.plaza.radius + PLAZA_MARGIN + radius)) return false;
    // Trees are tall: none between the camera and the plaza.
    const { across, depth } = screenAxes(position.x - reservations.plaza.center.x, position.z - reservations.plaza.center.z);
    if (kind === "tree" && depth > 0 && Math.abs(across) < VIEW_CORRIDOR) return false;
  }
  if (reservations.nursery && within(position, reservations.nursery.center, reservations.nursery.radius + NURSERY_MARGIN + radius)) {
    return false;
  }
  for (const tower of reservations.towerPositions) {
    if (within(position, tower, TOWER_CLEARANCE + radius)) return false;
  }
  return true;
}

/**
 * A deterministic scatter of trees, boulders, shrubs and flowers. It depends
 * only on the island and on what is built there, never on PR or pipeline status.
 */
export function placeScenery(island: Island, reservations: SceneryReservations): SceneryPlacement[] {
  const placements: SceneryPlacement[] = [];
  const target = Math.round(island.size.x * island.size.z * DENSITY);

  for (let index = 0; index < target * 5 && placements.length < target; index += 1) {
    const draw = seededUnit(island.seed, index * 6);
    const kind = KIND_ORDER.find((candidate) => draw < KINDS[candidate].share) ?? "flowers";
    const rules = KINDS[kind];
    const position = {
      x: seededRange(island.seed, index * 6 + 1, island.origin.x, island.origin.x + island.size.x),
      z: seededRange(island.seed, index * 6 + 2, island.origin.z, island.origin.z + island.size.z),
    };
    if (!isSceneryPlacementFree(island, kind, position, reservations)) continue;
    if (placements.some((placed) => within(position, placed.position, rules.radius + KINDS[placed.kind].radius))) continue;

    placements.push({
      kind,
      model: rules.models[Math.floor(seededUnit(island.seed, index * 6 + 3) * rules.models.length)] ?? rules.models[0]!,
      position,
      scale: seededRange(island.seed, index * 6 + 4, rules.scale[0], rules.scale[1]),
      rotation: seededRange(island.seed, index * 6 + 5, 0, Math.PI * 2),
    });
  }
  return placements;
}
