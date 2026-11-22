import * as THREE from "three";
import type { Health, Island } from "../../shared/types";
import type { RenderAssets } from "./assets";
import { seededRange } from "./hash";

export interface IslandVisual {
  readonly group: THREE.Group;
  update(island: Island, health: Health): void;
  dispose(): void;
}

/** Vertices around the shore; a multiple of four puts one at each bridge port. */
const SEGMENTS = 28;
/** The grass surface sits a hair above y = 0. */
const TOP = 0.04;
const TAU = Math.PI * 2;

/**
 * How far the shore is from the island's centre at an angle, as a share of its
 * half-size: an uneven outline between 0.925 and 1 that reaches exactly 1 at
 * the four compass points, where bridges land.
 */
export function shoreShare(seed: number, angle: number): number {
  const wobble =
    0.5 * Math.sin(angle * 2 + seededRange(seed, 1, 0, TAU)) +
    0.3 * Math.sin(angle * 3 + seededRange(seed, 2, 0, TAU)) +
    0.2 * Math.sin(angle * 5 + seededRange(seed, 3, 0, TAU));
  const share = 0.96 + 0.035 * wobble;
  const port = Math.cos(angle * 2) ** 8;
  return share + (1 - share) * port;
}

interface Palette {
  grass: readonly [THREE.Color, THREE.Color];
  lip: THREE.Color;
  turf: THREE.Color;
}

const DISTRICT_PALETTE: Palette = {
  grass: [new THREE.Color("#5fae52"), new THREE.Color("#7cc763")],
  lip: new THREE.Color("#9bd47a"),
  turf: new THREE.Color("#4c9447"),
};
const OUTSKIRTS_PALETTE: Palette = {
  grass: [new THREE.Color("#78a36d"), new THREE.Color("#8fb37d")],
  lip: new THREE.Color("#a6c492"),
  turf: new THREE.Color("#628a5c"),
};
const EARTH = [new THREE.Color("#a27a52"), new THREE.Color("#7a573b")] as const;
const ROCK = [new THREE.Color("#7d778c"), new THREE.Color("#5b566e"), new THREE.Color("#423e55")] as const;

/**
 * One mesh per island: a flat grass top with a soft lip, a slab of turf and
 * earth under it, and jagged rock narrowing to a point far below.
 */
function buildTerrain(island: Island): THREE.BufferGeometry {
  const half = island.size.x / 2;
  const seed = island.seed;
  const palette = island.kind === "outskirts" ? OUTSKIRTS_PALETTE : DISTRICT_PALETTE;
  // Deep enough to read as a floating rock from the camera's angle, whatever the island's size.
  const depth = Math.min(15, island.size.x * seededRange(seed, 63, 0.44, 0.56));
  const shore: number[] = [];
  for (let index = 0; index < SEGMENTS; index += 1) shore.push(half * shoreShare(seed, (index / SEGMENTS) * TAU));

  const positions: number[] = [];
  const colours: number[] = [];
  const indices: number[] = [];
  const colour = new THREE.Color();
  let salt = 100;

  /** Adds a ring of vertices at a share of the shore distance and returns its first index. */
  function ring(share: number, y: number, tint: (index: number) => THREE.Color, jitter = 0, sag = 0): number {
    const first = positions.length / 3;
    for (let index = 0; index < SEGMENTS; index += 1) {
      const angle = (index / SEGMENTS) * TAU;
      const reach = (shore[index] ?? half) * share * (jitter === 0 ? 1 : seededRange(seed, salt + index, 1 - jitter, 1 + jitter * 0.6));
      positions.push(Math.cos(angle) * reach, y - (sag === 0 ? 0 : seededRange(seed, salt + 50 + index, 0, sag)), Math.sin(angle) * reach);
      colour.copy(tint(index));
      colours.push(colour.r, colour.g, colour.b);
    }
    salt += 100;
    return first;
  }

  function join(upper: number, lower: number): void {
    for (let index = 0; index < SEGMENTS; index += 1) {
      const next = (index + 1) % SEGMENTS;
      indices.push(upper + index, upper + next, lower + next, upper + index, lower + next, lower + index);
    }
  }

  const mixed = new THREE.Color();
  const grass = (index: number): THREE.Color =>
    mixed.copy(palette.grass[0]).lerp(palette.grass[1], seededRange(seed, salt + 7 * index, 0, 1));

  // Top: a fan from the centre, then flat rings out to a slightly lower, lighter lip.
  positions.push(0, TOP, 0);
  colour.copy(palette.grass[1]);
  colours.push(colour.r, colour.g, colour.b);
  let previous = ring(0.3, TOP, grass);
  for (let index = 0; index < SEGMENTS; index += 1) indices.push(0, previous + ((index + 1) % SEGMENTS), previous + index);
  for (const share of [0.58, 0.8, 0.93]) {
    const next = ring(share, TOP, grass);
    join(previous, next);
    previous = next;
  }
  const lip = ring(1, TOP - 0.07, () => palette.lip);
  join(previous, lip);

  // Sides: turf, earth, then three bands of rock. Each band starts on its own
  // vertices so colours meet in a hard line instead of blending.
  const turfTop = ring(1, TOP - 0.07, () => palette.turf);
  const turfBottom = ring(1.005, -0.55, () => palette.turf, 0, 0.12);
  join(turfTop, turfBottom);
  const earthTop = ring(0.985, -0.5, () => EARTH[0], 0, 0.12);
  const earthBottom = ring(0.9, -1.9, () => EARTH[1], 0.03, 0.5);
  join(earthTop, earthBottom);
  const rockTop = ring(0.93, -1.7, () => ROCK[0], 0.03, 0.4);
  const rockUpper = ring(0.8, -depth * 0.3, () => ROCK[0], 0.12, depth * 0.06);
  const rockMiddle = ring(0.56, -depth * 0.58, () => ROCK[1], 0.2, depth * 0.08);
  const rockLower = ring(0.3, -depth * 0.82, () => ROCK[2], 0.24, depth * 0.08);
  join(rockTop, rockUpper);
  join(rockUpper, rockMiddle);
  join(rockMiddle, rockLower);
  const tip = positions.length / 3;
  positions.push(seededRange(seed, 70, -0.6, 0.6), -depth, seededRange(seed, 71, -0.6, 0.6));
  colours.push(ROCK[2].r, ROCK[2].g, ROCK[2].b);
  for (let index = 0; index < SEGMENTS; index += 1) indices.push(rockLower + index, rockLower + ((index + 1) % SEGMENTS), tip);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createIslandVisual(initial: Island, initialHealth: Health, assets: RenderAssets): IslandVisual {
  const group = new THREE.Group();
  group.name = `island:${initial.id}`;
  const terrain = new THREE.Mesh(buildTerrain(initial), assets.terrainMaterial);
  terrain.receiveShadow = true;
  // A band of colour just under the grass: it shows all the way round the shore of an island that needs attention.
  const halo = new THREE.Mesh(assets.discGeometry, assets.haloMaterials.bad);
  halo.position.y = -0.3;
  halo.renderOrder = 2;
  group.add(terrain, halo);
  let signature = "";

  function apply(island: Island, health: Health): void {
    const next = `${island.kind}:${island.size.x}:${island.seed}`;
    if (signature !== "" && next !== signature) {
      terrain.geometry.dispose();
      terrain.geometry = buildTerrain(island);
    }
    signature = next;
    group.position.set(island.origin.x + island.size.x / 2, 0, island.origin.z + island.size.z / 2);
    halo.visible = health !== "good";
    if (health !== "good") halo.material = assets.haloMaterials[health];
    // The band's bright edge sits at 0.735 of the disc's radius: put that on the shore.
    halo.scale.setScalar(island.size.x / 0.735);
  }

  apply(initial, initialHealth);
  return {
    group,
    update: apply,
    dispose(): void {
      terrain.geometry.dispose();
      group.removeFromParent();
    },
  };
}
