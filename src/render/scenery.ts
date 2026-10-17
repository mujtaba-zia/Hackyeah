import type { Island, Vec2 } from "../../shared/types";
import { seededRange, seededUnit } from "./hash";

export type SceneryKind = "tree" | "rock";

export interface SceneryPlacement {
  kind: SceneryKind;
  position: Vec2;
  scale: number;
  rotation: number;
}

export interface SceneryReservations {
  hq?: Vec2;
  plaza?: { center: Vec2; radius: number };
  nursery?: { center: Vec2; radius: number };
  towerPositions: readonly Vec2[];
}

function isInsideCircle(point: Vec2, center: Vec2, radius: number): boolean {
  const x = point.x - center.x;
  const z = point.z - center.z;
  return x * x + z * z < radius * radius;
}

function hasClearance(point: Vec2, other: Vec2, distance: number): boolean {
  const x = point.x - other.x;
  const z = point.z - other.z;
  return x * x + z * z >= distance * distance;
}

/** Returns whether one scenery item stays off every district working area. */
export function isSceneryPlacementFree(
  island: Island,
  placement: Vec2,
  reservations: SceneryReservations,
): boolean {
  const edge = 0.85;
  if (
    placement.x < island.origin.x + edge ||
    placement.x > island.origin.x + island.size.x - edge ||
    placement.z < island.origin.z + edge ||
    placement.z > island.origin.z + island.size.z - edge
  ) {
    return false;
  }

  // The tower row is always the island's positive-x edge, whether or not a
  // pipeline currently occupies every pad on it.
  if (placement.x > island.origin.x + island.size.x - 2.45) return false;
  if (reservations.hq && !hasClearance(placement, reservations.hq, 2.3)) return false;
  if (reservations.plaza && isInsideCircle(placement, reservations.plaza.center, reservations.plaza.radius + 0.9)) {
    return false;
  }
  if (
    reservations.nursery &&
    isInsideCircle(placement, reservations.nursery.center, reservations.nursery.radius + 0.85)
  ) {
    return false;
  }

  for (let index = 0; index < reservations.towerPositions.length; index += 1) {
    const tower = reservations.towerPositions[index];
    if (tower && !hasClearance(placement, tower, 1.65)) return false;
  }
  return true;
}

/**
 * Produces a deterministic mix of trees and rocks. The returned positions are
 * intentionally independent from incoming PR/pipeline status changes.
 */
export function placeScenery(island: Island, reservations: SceneryReservations): SceneryPlacement[] {
  const placements: SceneryPlacement[] = [];
  const target = island.kind === "filler" ? 7 : 11;
  const attempts = target * 8;

  for (let index = 0; index < attempts && placements.length < target; index += 1) {
    const position = {
      x: seededRange(island.seed, index * 5, island.origin.x + 0.9, island.origin.x + island.size.x - 0.9),
      z: seededRange(island.seed, index * 5 + 1, island.origin.z + 0.9, island.origin.z + island.size.z - 0.9),
    };
    if (!isSceneryPlacementFree(island, position, reservations)) continue;

    let clear = true;
    for (let placedIndex = 0; placedIndex < placements.length; placedIndex += 1) {
      const placed = placements[placedIndex];
      if (placed && !hasClearance(position, placed.position, 1.25)) {
        clear = false;
        break;
      }
    }
    if (!clear) continue;

    placements.push({
      kind: seededUnit(island.seed, index * 5 + 2) > 0.42 ? "tree" : "rock",
      position,
      scale: seededRange(island.seed, index * 5 + 3, 0.72, 1.28),
      rotation: seededRange(island.seed, index * 5 + 4, 0, Math.PI * 2),
    });
  }
  return placements;
}
