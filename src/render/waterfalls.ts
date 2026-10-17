import type { Bridge, Island, Vec2 } from "../../shared/types";
import { hashString } from "./hash";

export type IslandEdge = "north" | "east" | "south" | "west";

export interface WaterfallEdge {
  id: string;
  islandId: string;
  side: IslandEdge;
  position: Vec2;
  width: number;
  depth: number;
}

/** The fixed isometric camera looks from the positive x/z quadrant. */
export const CAMERA_FACING_EDGES: readonly IslandEdge[] = ["east", "south"];

function intervalsOverlap(firstStart: number, firstEnd: number, secondStart: number, secondEnd: number): boolean {
  return firstStart < secondEnd && secondStart < firstEnd;
}

function sideFromDirection(x: number, z: number): IslandEdge {
  if (Math.abs(x) > Math.abs(z)) return x >= 0 ? "east" : "west";
  return z >= 0 ? "south" : "north";
}

function islandContainsWithMargin(island: Island, point: Vec2, margin: number): boolean {
  return (
    point.x >= island.origin.x - margin &&
    point.x <= island.origin.x + island.size.x + margin &&
    point.z >= island.origin.z - margin &&
    point.z <= island.origin.z + island.size.z + margin
  );
}

function bridgeOccupiesEdge(island: Island, side: IslandEdge, bridge: Bridge): boolean {
  const centerX = island.origin.x + island.size.x / 2;
  const centerZ = island.origin.z + island.size.z / 2;
  const fromTouches = islandContainsWithMargin(island, bridge.from, 1);
  const toTouches = islandContainsWithMargin(island, bridge.to, 1);

  if (fromTouches || toTouches) {
    const farEnd = fromTouches ? bridge.to : bridge.from;
    return sideFromDirection(farEnd.x - centerX, farEnd.z - centerZ) === side;
  }

  const endpoint = bridge.from;
  const otherEndpoint = bridge.to;
  if (side === "east") {
    return (
      Math.abs(endpoint.x - (island.origin.x + island.size.x)) <= 1 ||
      Math.abs(otherEndpoint.x - (island.origin.x + island.size.x)) <= 1
    );
  }
  if (side === "west") {
    return Math.abs(endpoint.x - island.origin.x) <= 1 || Math.abs(otherEndpoint.x - island.origin.x) <= 1;
  }
  if (side === "south") {
    return (
      Math.abs(endpoint.z - (island.origin.z + island.size.z)) <= 1 ||
      Math.abs(otherEndpoint.z - (island.origin.z + island.size.z)) <= 1
    );
  }
  return Math.abs(endpoint.z - island.origin.z) <= 1 || Math.abs(otherEndpoint.z - island.origin.z) <= 1;
}

function hasNeighbourOnEdge(island: Island, side: IslandEdge, islands: readonly Island[]): boolean {
  const maxGap = Math.max(2, Math.min(12, Math.max(island.size.x, island.size.z)));
  const right = island.origin.x + island.size.x;
  const bottom = island.origin.z + island.size.z;

  for (let index = 0; index < islands.length; index += 1) {
    const candidate = islands[index];
    if (!candidate || candidate.id === island.id) continue;
    const candidateRight = candidate.origin.x + candidate.size.x;
    const candidateBottom = candidate.origin.z + candidate.size.z;

    if (
      side === "east" &&
      candidate.origin.x >= right &&
      candidate.origin.x - right <= maxGap &&
      intervalsOverlap(island.origin.z, bottom, candidate.origin.z, candidateBottom)
    ) {
      return true;
    }
    if (
      side === "west" &&
      candidateRight <= island.origin.x &&
      island.origin.x - candidateRight <= maxGap &&
      intervalsOverlap(island.origin.z, bottom, candidate.origin.z, candidateBottom)
    ) {
      return true;
    }
    if (
      side === "south" &&
      candidate.origin.z >= bottom &&
      candidate.origin.z - bottom <= maxGap &&
      intervalsOverlap(island.origin.x, right, candidate.origin.x, candidateRight)
    ) {
      return true;
    }
    if (
      side === "north" &&
      candidateBottom <= island.origin.z &&
      island.origin.z - candidateBottom <= maxGap &&
      intervalsOverlap(island.origin.x, right, candidate.origin.x, candidateRight)
    ) {
      return true;
    }
  }
  return false;
}

function makeWaterfallEdge(island: Island, side: IslandEdge): WaterfallEdge {
  const centerX = island.origin.x + island.size.x / 2;
  const centerZ = island.origin.z + island.size.z / 2;
  const alongX = side === "north" || side === "south";
  let x = centerX;
  let z = centerZ;
  if (side === "east") x = island.origin.x + island.size.x;
  if (side === "west") x = island.origin.x;
  if (side === "south") z = island.origin.z + island.size.z;
  if (side === "north") z = island.origin.z;

  return {
    id: `${island.id}:${side}`,
    islandId: island.id,
    side,
    position: { x, z },
    width: Math.max(1.4, (alongX ? island.size.x : island.size.z) * 0.28),
    // Falls past the deepest rock tip (islands hang up to 0.85 × size).
    depth: Math.max(island.size.x, island.size.z) * 1.05 + ((island.seed >>> 0) % 7) * 0.3,
  };
}

/**
 * Picks a reproducible, deliberately small set of visible exterior waterfalls.
 * Edges facing another nearby island or carrying a bridge are excluded first.
 */
export function selectWaterfallEdges(
  islands: readonly Island[],
  bridges: readonly Bridge[],
  maximum = 3,
): WaterfallEdge[] {
  const candidates: WaterfallEdge[] = [];
  const limit = Math.max(0, Math.floor(maximum));
  if (limit === 0) return candidates;

  for (let islandIndex = 0; islandIndex < islands.length; islandIndex += 1) {
    const island = islands[islandIndex];
    if (!island) continue;
    for (let edgeIndex = 0; edgeIndex < CAMERA_FACING_EDGES.length; edgeIndex += 1) {
      const side = CAMERA_FACING_EDGES[edgeIndex];
      if (!side || hasNeighbourOnEdge(island, side, islands)) continue;
      let blocked = false;
      for (let bridgeIndex = 0; bridgeIndex < bridges.length; bridgeIndex += 1) {
        const bridge = bridges[bridgeIndex];
        if (bridge && bridgeOccupiesEdge(island, side, bridge)) {
          blocked = true;
          break;
        }
      }
      if (!blocked) candidates.push(makeWaterfallEdge(island, side));
    }
  }

  candidates.sort((first, second) => {
    const firstRank = hashString(first.id);
    const secondRank = hashString(second.id);
    if (firstRank !== secondRank) return firstRank - secondRank;
    if (first.id < second.id) return -1;
    if (first.id > second.id) return 1;
    return 0;
  });
  return candidates.slice(0, limit);
}
