// Where everything stands. Pure geometry: the same input always gives the same
// world, and nothing here knows about pull requests, runs or incidents.

import { GROUND_FORESHORTENING, ISLAND_USABLE, VIEW_CORRIDOR, fromScreenAxes, screenAxes } from "../shared/geometry";
import type { Bridge, District, Island, IslandGroup, IslandKind, Vec2 } from "../shared/types";
import { hashString } from "./hash";

/** Sky between two islands of one project; a bridge spans it. */
export const ISLAND_GAP = 5;
/** Open sky between the archipelagos of two projects. */
export const GROUP_GAP = 12;
/** Island edge lengths, smallest first. An island is the smallest one its towers fit on. */
export const ISLAND_SIZES: readonly number[] = [18, 22, 26, 30, 34, 38, 42];

// District furniture, relative to the island centre, in screen axes (see
// shared/geometry.ts). The town hall stands at the back, the plaza in the
// middle and the low nursery in front of it, so nothing tall ever hides pull
// requests. Towers take the flanks and the back.
export const PLAZA_RADIUS = 3;
export const NURSERY_RADIUS = 1.8;
/** Half-width of the town hall as drawn. */
export const HQ_FOOTPRINT = 1.7;
/** A tower's own footprint radius; cranes and pipes reach a little further. */
export const TOWER_FOOTPRINT = 0.85;
/** Room the nursery's fence and hay bales take beyond its radius. */
export const NURSERY_MARGIN = 0.6;
const HQ_OFFSET = fromScreenAxes(0, -5.66);
const NURSERY_OFFSET = fromScreenAxes(2.2, 5.1);

// Tower spots sit in rows that face the camera, so they spread across the screen
// instead of hiding behind each other. Every other row is shifted half a spot:
// a tower behind shows between the two in front of it.
const ROW_SPACING_ACROSS = 3.2;
const ROW_SPACING_DEPTH = 2.4;
/** Closest any two tower centres get (diagonal neighbours on adjacent rows). */
export const TOWER_SPACING = Math.hypot(ROW_SPACING_ACROSS / 2, ROW_SPACING_DEPTH);

function roundedCoordinate(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  return rounded === 0 ? 0 : rounded;
}

export function point(x: number, z: number): Vec2 {
  return { x: roundedCoordinate(x), z: roundedCoordinate(z) };
}

export function islandCentre(island: Island): Vec2 {
  return { x: island.origin.x + island.size.x / 2, z: island.origin.z + island.size.z / 2 };
}

const slotCache = new Map<number, readonly Vec2[]>();

/**
 * Every tower spot on an island of the given size, in fill order, relative to
 * its centre. Spots fill outwards from the plaza, front before back and left
 * before right, and a larger island's list starts with a smaller island's: a
 * repository that outgrows its island keeps its towers where they were.
 */
export function towerSlots(size: number): readonly Vec2[] {
  const cached = slotCache.get(size);
  if (cached) return cached;

  // How far from the centre a tower may stand and still be on the island.
  const reach = (size / 2) * ISLAND_USABLE - TOWER_FOOTPRINT - 0.15;
  const rows = Math.ceil(reach / ROW_SPACING_DEPTH);
  const columns = Math.ceil(reach / ROW_SPACING_ACROSS) + 1;
  const candidates: { spot: Vec2; ring: number; depth: number; across: number }[] = [];
  for (let row = -rows; row <= rows; row += 1) {
    const depth = row * ROW_SPACING_DEPTH;
    const shift = row % 2 === 0 ? 0 : ROW_SPACING_ACROSS / 2;
    for (let column = -columns; column <= columns; column += 1) {
      const across = column * ROW_SPACING_ACROSS + shift;
      const spot = fromScreenAxes(across, depth);
      const ring = Math.hypot(spot.x, spot.z);
      if (ring > reach - 0.001) continue;
      if (ring < PLAZA_RADIUS + 0.4 + TOWER_FOOTPRINT) continue;
      if (depth > 0 && Math.abs(across) < VIEW_CORRIDOR) continue;
      if (Math.hypot(spot.x - HQ_OFFSET.x, spot.z - HQ_OFFSET.z) < HQ_FOOTPRINT + TOWER_FOOTPRINT + 0.3) continue;
      if (Math.hypot(spot.x - NURSERY_OFFSET.x, spot.z - NURSERY_OFFSET.z) < NURSERY_RADIUS + NURSERY_MARGIN + TOWER_FOOTPRINT) {
        continue;
      }
      candidates.push({ spot, ring: Math.round(ring * 100), depth, across });
    }
  }
  candidates.sort((left, right) => left.ring - right.ring || right.depth - left.depth || left.across - right.across);
  const slots = candidates.map((candidate) => candidate.spot);
  slotCache.set(size, slots);
  return slots;
}

/** The smallest island whose spots hold this many towers (the largest when none does). */
export function islandSizeFor(towerCount: number): number {
  for (const size of ISLAND_SIZES) {
    if (towerSlots(size).length >= towerCount) return size;
  }
  return ISLAND_SIZES[ISLAND_SIZES.length - 1] ?? 30;
}

/** Where the island's `index`-th tower stands. */
export function towerPosition(island: Island, index: number): Vec2 {
  const centre = islandCentre(island);
  const slots = towerSlots(island.size.x);
  // Past the last spot, towers go round again turned half a spacing along their
  // ring: they may crowd a neighbour, but they stay on the island.
  const slot = slots[index % slots.length] ?? { x: 0, z: 0 };
  const lap = Math.floor(index / slots.length);
  const turn = lap === 0 ? 0 : (lap * TOWER_SPACING) / 2 / Math.hypot(slot.x, slot.z);
  const x = slot.x * Math.cos(turn) - slot.z * Math.sin(turn);
  const z = slot.x * Math.sin(turn) + slot.z * Math.cos(turn);
  return point(centre.x + x, centre.z + z);
}

export function districtFurniture(island: Island): Pick<District, "hq" | "plaza" | "nursery"> {
  const centre = islandCentre(island);
  return {
    hq: point(centre.x + HQ_OFFSET.x, centre.z + HQ_OFFSET.z),
    plaza: { center: point(centre.x, centre.z), radius: PLAZA_RADIUS },
    nursery: { center: point(centre.x + NURSERY_OFFSET.x, centre.z + NURSERY_OFFSET.z), radius: NURSERY_RADIUS },
  };
}

export interface IslandSpec {
  id: string;
  kind: IslandKind;
  towerCount: number;
}

export interface GroupSpec {
  id: string;
  name: string;
  /** In layout order. */
  islands: IslandSpec[];
}

export interface WorldLayout {
  worldSize: Vec2;
  groups: Omit<IslandGroup, "health">[];
  islands: Island[];
  bridges: Bridge[];
}

interface Block {
  spec: GroupSpec;
  width: number;
  depth: number;
  /** Islands with origins relative to the block's own minimum corner. */
  islands: Island[];
  bridges: Bridge[];
}

interface Cell {
  column: number;
  row: number;
}

/** Screen order of two grid cells: back to front, then left to right (see shared/geometry.ts). */
function readingOrder(left: Cell, right: Cell): number {
  return left.column + left.row - (right.column + right.row) || left.column - left.row - (right.column - right.row);
}

/**
 * The grid cells a cluster of `count` islands stands on, in reading order.
 *
 * Cells fill outwards from the middle, so a cluster is round. The camera turns
 * a round cluster into an ellipse about as wide as a screen; a square one would
 * become a diamond and leave half the view empty.
 */
function clusterCells(count: number): Cell[] {
  const reach = Math.ceil(Math.sqrt(count)) + 1;
  let tightest: { cells: Cell[]; spread: number } | null = null;
  // A round cluster is centred either on a cell or on the corner between four. Take whichever is tighter.
  for (const middle of [0, 0.5]) {
    const ranked: (Cell & { distance: number })[] = [];
    for (let column = -reach; column <= reach; column += 1) {
      for (let row = -reach; row <= reach; row += 1) {
        ranked.push({ column, row, distance: (column - middle) ** 2 + (row - middle) ** 2 });
      }
    }
    ranked.sort((left, right) => left.distance - right.distance || readingOrder(left, right));
    const cells = ranked.slice(0, count);
    const spread = cells[cells.length - 1]?.distance ?? 0;
    if (tightest === null || spread < tightest.spread) tightest = { cells, spread };
  }
  return (tightest?.cells ?? []).sort(readingOrder);
}

/**
 * One project's islands as a round cluster on a grid. Columns and rows are as
 * wide as their largest island, and islands sit in the middle of their cell,
 * so neighbours share a centre line for the bridge between them.
 */
function layoutBlock(spec: GroupSpec): Block {
  const cells = clusterCells(spec.islands.length);
  const sizes = spec.islands.map((island) => islandSizeFor(island.towerCount));
  const columnWidths = new Map<number, number>();
  const rowDepths = new Map<number, number>();
  cells.forEach((cell, index) => {
    const size = sizes[index] ?? 0;
    columnWidths.set(cell.column, Math.max(columnWidths.get(cell.column) ?? 0, size));
    rowDepths.set(cell.row, Math.max(rowDepths.get(cell.row) ?? 0, size));
  });
  /** Where each column (or row) starts, and where the last one ends. */
  const starts = (extents: Map<number, number>): { at: Map<number, number>; end: number } => {
    const at = new Map<number, number>();
    let cursor = 0;
    for (const key of [...extents.keys()].sort((left, right) => left - right)) {
      at.set(key, cursor);
      cursor += (extents.get(key) ?? 0) + ISLAND_GAP;
    }
    return { at, end: cursor - ISLAND_GAP };
  };
  const columns = starts(columnWidths);
  const rows = starts(rowDepths);

  const byCell = new Map<string, Island>();
  const islands = spec.islands.map((island, index): Island => {
    const cell = cells[index] ?? { column: 0, row: 0 };
    const size = sizes[index] ?? ISLAND_SIZES[0] ?? 18;
    const placed: Island = {
      id: island.id,
      kind: island.kind,
      origin: {
        x: (columns.at.get(cell.column) ?? 0) + ((columnWidths.get(cell.column) ?? size) - size) / 2,
        z: (rows.at.get(cell.row) ?? 0) + ((rowDepths.get(cell.row) ?? size) - size) / 2,
      },
      size: { x: size, z: size },
      seed: hashString(island.id),
    };
    byCell.set(`${cell.column}:${cell.row}`, placed);
    return placed;
  });

  const bridges: Bridge[] = [];
  islands.forEach((island, index) => {
    const cell = cells[index] ?? { column: 0, row: 0 };
    const centre = islandCentre(island);
    const right = byCell.get(`${cell.column + 1}:${cell.row}`);
    if (right) {
      bridges.push({
        id: `${island.id}->${right.id}`,
        from: { x: island.origin.x + island.size.x, z: centre.z },
        to: { x: right.origin.x, z: centre.z },
      });
    }
    const below = byCell.get(`${cell.column}:${cell.row + 1}`);
    if (below) {
      bridges.push({
        id: `${island.id}->${below.id}`,
        from: { x: centre.x, z: island.origin.z + island.size.z },
        to: { x: centre.x, z: below.origin.z },
      });
    }
  });

  return { spec, width: columns.end, depth: rows.end, islands, bridges };
}

/** Open sky between two islands: the larger of their separations along x and along z. */
function skyBetween(left: Island, right: Island): number {
  return Math.max(
    left.origin.x - (right.origin.x + right.size.x),
    right.origin.x - (left.origin.x + left.size.x),
    left.origin.z - (right.origin.z + right.size.z),
    right.origin.z - (left.origin.z + left.size.z),
  );
}

/** Archipelagos are placed on a lattice this fine. */
const PLACEMENT_STEP = 3;
/** The shape the world is packed to fill: wider than tall, like the part of a screen the HUD leaves free. */
const VIEW_ASPECT = 1.6;

/** The rectangle of screen some islands cover, in world units across and down. */
interface ScreenExtent {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Grows an extent to take in a round island standing `shift` away from where it says it is. */
function extend(extent: ScreenExtent, island: Island, shift: Vec2): void {
  const half = island.size.x / 2;
  const { across, depth } = screenAxes(island.origin.x + shift.x + half, island.origin.z + shift.z + half);
  extent.left = Math.min(extent.left, across - half);
  extent.right = Math.max(extent.right, across + half);
  extent.top = Math.min(extent.top, (depth - half) * GROUND_FORESHORTENING);
  extent.bottom = Math.max(extent.bottom, (depth + half) * GROUND_FORESHORTENING);
}

/**
 * Lays every project out as its own archipelago and packs the archipelagos,
 * largest first, so that together they fill a screen-shaped view as fully as
 * they can while keeping open sky between them. `groups` come back in the
 * order given.
 */
export function layoutWorld(specs: readonly GroupSpec[]): WorldLayout {
  const blocks = specs.filter((spec) => spec.islands.length > 0).map(layoutBlock);
  const order = blocks
    .map((block, index) => ({ block, index }))
    .sort((left, right) => right.block.width * right.block.depth - left.block.width * left.block.depth || left.index - right.index);

  /** Islands already standing, at their place in the world; the screen and the ground they cover; each block's offset. */
  const standing: Island[] = [];
  const covered: ScreenExtent = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
  const ground = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  const offsets = new Map<Block, Vec2>();
  for (const { block } of order) {
    let offset: Vec2 = { x: 0, z: 0 };
    if (standing.length > 0) {
      // Every lattice spot from where the block would just clear the standing islands on one side to where it would on the other.
      const spots: { offset: Vec2; view: number; distance: number }[] = [];
      const middle = { x: (ground.minX + ground.maxX) / 2, z: (ground.minZ + ground.maxZ) / 2 };
      const firstColumn = Math.floor((ground.minX - block.width - GROUP_GAP) / PLACEMENT_STEP);
      const lastColumn = Math.ceil((ground.maxX + GROUP_GAP) / PLACEMENT_STEP);
      const firstRow = Math.floor((ground.minZ - block.depth - GROUP_GAP) / PLACEMENT_STEP);
      const lastRow = Math.ceil((ground.maxZ + GROUP_GAP) / PLACEMENT_STEP);
      for (let column = firstColumn; column <= lastColumn; column += 1) {
        for (let row = firstRow; row <= lastRow; row += 1) {
          const spot = { x: column * PLACEMENT_STEP, z: row * PLACEMENT_STEP };
          const extent = { ...covered };
          for (const island of block.islands) extend(extent, island, spot);
          spots.push({
            offset: spot,
            // The side of the smallest view of the wanted shape that shows everything.
            view: Math.max((extent.right - extent.left) / VIEW_ASPECT, extent.bottom - extent.top),
            distance: Math.hypot(spot.x + block.width / 2 - middle.x, spot.z + block.depth / 2 - middle.z),
          });
        }
      }
      // The best spot keeps the view smallest; among equals, the one nearest the middle.
      spots.sort((left, right) => left.view - right.view || left.distance - right.distance || left.offset.x - right.offset.x || left.offset.z - right.offset.z);
      const free = spots.find((spot) =>
        block.islands.every((island) => {
          const moved = { ...island, origin: { x: island.origin.x + spot.offset.x, z: island.origin.z + spot.offset.z } };
          return standing.every((other) => skyBetween(moved, other) >= GROUP_GAP);
        }),
      );
      // The lattice reaches past the standing islands on every side, so some spot is always free.
      if (free) offset = free.offset;
    }
    offsets.set(block, offset);
    for (const island of block.islands) {
      const moved = { ...island, origin: { x: island.origin.x + offset.x, z: island.origin.z + offset.z } };
      standing.push(moved);
      extend(covered, moved, { x: 0, z: 0 });
      ground.minX = Math.min(ground.minX, moved.origin.x);
      ground.maxX = Math.max(ground.maxX, moved.origin.x + moved.size.x);
      ground.minZ = Math.min(ground.minZ, moved.origin.z);
      ground.maxZ = Math.max(ground.maxZ, moved.origin.z + moved.size.z);
    }
  }

  // Slide everything so the world starts at (0, 0).
  let minX = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  for (const island of standing) {
    minX = Math.min(minX, island.origin.x);
    minZ = Math.min(minZ, island.origin.z);
  }

  const layout: WorldLayout = { worldSize: { x: 0, z: 0 }, groups: [], islands: [], bridges: [] };
  for (const block of blocks) {
    const offset = offsets.get(block) ?? { x: 0, z: 0 };
    const shift = (position: Vec2): Vec2 => point(position.x + offset.x - minX, position.z + offset.z - minZ);
    for (const island of block.islands) layout.islands.push({ ...island, origin: shift(island.origin) });
    for (const bridge of block.bridges) layout.bridges.push({ id: bridge.id, from: shift(bridge.from), to: shift(bridge.to) });
    const origin = shift({ x: 0, z: 0 });
    layout.groups.push({
      id: block.spec.id,
      name: block.spec.name,
      islandIds: block.islands.map((island) => island.id),
      origin,
      size: point(block.width, block.depth),
    });
    layout.worldSize.x = Math.max(layout.worldSize.x, origin.x + block.width);
    layout.worldSize.z = Math.max(layout.worldSize.z, origin.z + block.depth);
  }
  layout.worldSize = point(layout.worldSize.x, layout.worldSize.z);
  return layout;
}
