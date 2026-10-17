import * as THREE from "three";
import type { Island } from "../../shared/types";
import type { RenderAssets } from "./assets";
import { seededRange, seededUnit } from "./hash";
import type { SceneryPlacement } from "./scenery";
import type { KitModel } from "./kit";

export interface IslandVisual {
  readonly group: THREE.Group;
  update(island: Island): void;
  dispose(): void;
}

export interface SceneryVisual {
  readonly group: THREE.Group;
  update(signature: string, placements: readonly SceneryPlacement[]): void;
}

function perimeterPoint(island: Island, index: number, segments: number, inset: number): [number, number] {
  const angle = (index / segments) * Math.PI * 2;
  const variation = seededRange(island.seed, index + 11, 0.88, 1.08);
  return [
    Math.cos(angle) * island.size.x * 0.5 * variation * inset,
    Math.sin(angle) * island.size.z * 0.5 * variation * inset,
  ];
}

function createIslandGeometry(island: Island): { grass: THREE.BufferGeometry; rock: THREE.BufferGeometry } {
  const segments = 12;
  const grassPositions: number[] = [0, 0.04, 0];
  const grassIndices: number[] = [];
  const topStart = 1;
  const bottomStart = topStart + segments;

  for (let index = 0; index < segments; index += 1) {
    const point = perimeterPoint(island, index, segments, 1);
    grassPositions.push(point[0], 0.04, point[1]);
  }
  for (let index = 0; index < segments; index += 1) {
    const point = perimeterPoint(island, index, segments, 1);
    grassPositions.push(point[0], -0.4, point[1]);
  }
  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments;
    grassIndices.push(0, topStart + next, topStart + index);
    grassIndices.push(topStart + index, topStart + next, bottomStart + next);
    grassIndices.push(topStart + index, bottomStart + next, bottomStart + index);
  }

  const grass = new THREE.BufferGeometry();
  grass.setAttribute("position", new THREE.Float32BufferAttribute(grassPositions, 3));
  grass.setIndex(grassIndices);
  grass.computeVertexNormals();

  // The underside must reach deeper than `radius × tan(camera elevation)` or the
  // grass top hides it entirely from the isometric camera, so depth scales with
  // island size. Jittered rings narrowing downwards give the broken rock look.
  const rockPositions: number[] = [];
  const rockIndices: number[] = [];
  const depth = Math.max(island.size.x, island.size.z) * seededRange(island.seed, 63, 0.6, 0.85);
  const rings: readonly (readonly [inset: number, drop: number])[] = [
    [0.96, 0],
    [0.84, 0.22],
    [0.6, 0.5],
    [0.32, 0.78],
  ];
  rings.forEach(([inset, drop], ring) => {
    for (let index = 0; index < segments; index += 1) {
      const jitter = ring === 0 ? 1 : seededRange(island.seed, 100 + ring * segments + index, 0.78, 1.14);
      const point = perimeterPoint(island, index, segments, inset * jitter);
      const y = ring === 0 ? -0.37 : -depth * drop * seededRange(island.seed, 200 + ring * segments + index, 0.9, 1.1);
      rockPositions.push(point[0], y, point[1]);
    }
  });
  for (let ring = 0; ring < rings.length - 1; ring += 1) {
    const upper = ring * segments;
    const lower = upper + segments;
    for (let index = 0; index < segments; index += 1) {
      const next = (index + 1) % segments;
      rockIndices.push(upper + index, upper + next, lower + next);
      rockIndices.push(upper + index, lower + next, lower + index);
    }
  }
  const lastRing = (rings.length - 1) * segments;
  const tipIndex = rings.length * segments;
  rockPositions.push(
    seededRange(island.seed, 70, -0.6, 0.6),
    -depth,
    seededRange(island.seed, 71, -0.6, 0.6),
  );
  for (let index = 0; index < segments; index += 1) {
    rockIndices.push(lastRing + index, lastRing + ((index + 1) % segments), tipIndex);
  }
  const rock = new THREE.BufferGeometry();
  rock.setAttribute("position", new THREE.Float32BufferAttribute(rockPositions, 3));
  rock.setIndex(rockIndices);
  rock.computeVertexNormals();
  return { grass, rock };
}

function islandSignature(island: Island): string {
  return `${island.kind}:${island.origin.x}:${island.origin.z}:${island.size.x}:${island.size.z}:${island.seed}`;
}

export function createIslandVisual(initial: Island, assets: RenderAssets): IslandVisual {
  const group = new THREE.Group();
  group.name = `island:${initial.id}`;
  let signature = "";
  let grassMesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | null = null;
  let rockMesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | null = null;

  function rebuild(island: Island): void {
    if (grassMesh) {
      grassMesh.geometry.dispose();
      group.remove(grassMesh);
    }
    if (rockMesh) {
      rockMesh.geometry.dispose();
      group.remove(rockMesh);
    }
    const geometry = createIslandGeometry(island);
    grassMesh = new THREE.Mesh(geometry.grass, assets.grassMaterials[island.kind]);
    rockMesh = new THREE.Mesh(geometry.rock, assets.rockMaterial);
    grassMesh.castShadow = true;
    grassMesh.receiveShadow = true;
    rockMesh.castShadow = true;
    group.add(rockMesh, grassMesh);
    group.position.set(island.origin.x + island.size.x / 2, 0, island.origin.z + island.size.z / 2);
    signature = islandSignature(island);
  }

  rebuild(initial);
  return {
    group,
    update(next: Island): void {
      if (islandSignature(next) !== signature) rebuild(next);
    },
    dispose(): void {
      if (grassMesh) grassMesh.geometry.dispose();
      if (rockMesh) rockMesh.geometry.dispose();
      group.removeFromParent();
    },
  };
}

const SCENERY_MODELS: Record<SceneryPlacement["kind"], readonly [KitModel, KitModel, KitModel]> = {
  tree: ["tree_pine", "tree_round", "tree_birch"],
  rock: ["rock_1", "rock_2", "rock_3"],
};

/** One instanced draw per kit part, so a forest of a hundred trees costs a handful of calls. */
function buildSceneryContent(placements: readonly SceneryPlacement[], assets: RenderAssets): THREE.Group {
  const group = new THREE.Group();
  const byModel = new Map<KitModel, SceneryPlacement[]>();
  for (const placement of placements) {
    const model = SCENERY_MODELS[placement.kind][placement.variant];
    const list = byModel.get(model);
    if (list) list.push(placement);
    else byModel.set(model, [placement]);
  }

  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const matrix = new THREE.Matrix4();
  for (const [model, list] of byModel) {
    for (const part of assets.kit.parts(model)) {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, list.length);
      list.forEach((placement, index) => {
        rotation.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, placement.rotation);
        scale.setScalar(placement.scale);
        position.set(placement.position.x, 0.04, placement.position.z);
        matrix.compose(position, rotation, scale);
        mesh.setMatrixAt(index, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
  }
  return group;
}

export function createSceneryVisual(initialSignature: string, placements: readonly SceneryPlacement[], assets: RenderAssets): SceneryVisual {
  const group = new THREE.Group();
  group.name = "instanced-scenery";
  let signature = initialSignature;
  let content = buildSceneryContent(placements, assets);
  group.add(content);

  return {
    group,
    update(nextSignature: string, nextPlacements: readonly SceneryPlacement[]): void {
      if (nextSignature === signature) return;
      group.remove(content);
      content = buildSceneryContent(nextPlacements, assets);
      group.add(content);
      signature = nextSignature;
    },
  };
}
