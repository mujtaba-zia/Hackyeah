import * as THREE from 'three';

import {
  bridgeMaterial,
  buildingMaterialForTone,
  emissiveMaterials,
  glassMaterial,
  groundMaterial,
  landmarkMaterials,
  parkMaterial,
  roadLineMaterial,
  roadMaterial,
  vehicleMaterials,
  waterMaterial,
} from '../core/materials';
import {
  BLOCKS,
  LANDMARKS,
  ROADS,
  WATER,
  type BlockDef,
  type BuildingId,
  type LandmarkDef,
} from './cityPlan';

export interface CityBuildResult {
  landmarkMeshes: Map<BuildingId, THREE.Object3D>;
  dispose(): void;
}

interface CityResources {
  geometries: Set<THREE.BufferGeometry>;
}

interface GeometryAssets {
  box: THREE.BoxGeometry;
  cylinder: THREE.CylinderGeometry;
  cone: THREE.ConeGeometry;
  sphere: THREE.SphereGeometry;
  arch: THREE.TorusGeometry;
}

interface ParkDef {
  x: number;
  z: number;
  w: number;
  d: number;
}

interface TreeDef {
  x: number;
  z: number;
  scale: number;
}

const PARKS: readonly ParkDef[] = [
  { x: -24, z: 8, w: 11.4, d: 11.4 },
  { x: -24, z: 24, w: 11.4, d: 11.4 },
  { x: -8, z: 8, w: 11.4, d: 11.4 },
  { x: 8, z: 24, w: 11.4, d: 11.4 },
];

const TREES: readonly TreeDef[] = [
  { x: -27.5, z: 4.8, scale: 0.9 },
  { x: -21.2, z: 5.4, scale: 1.05 },
  { x: -27.1, z: 11.3, scale: 1.1 },
  { x: -21.3, z: 10.7, scale: 0.82 },
  { x: -27.4, z: 20.8, scale: 1.05 },
  { x: -21.2, z: 20.3, scale: 0.88 },
  { x: -27.3, z: 27.4, scale: 0.82 },
  { x: -20.9, z: 27.8, scale: 1.12 },
  { x: -11.4, z: 4.8, scale: 0.95 },
  { x: -5.2, z: 5.2, scale: 1.08 },
  { x: -11.3, z: 11.2, scale: 0.85 },
  { x: -4.8, z: 10.9, scale: 1.05 },
  { x: 4.5, z: 20.5, scale: 0.9 },
  { x: 11.2, z: 20.9, scale: 1.12 },
  { x: 4.6, z: 27.6, scale: 1.05 },
  { x: 11.3, z: 27.2, scale: 0.86 },
];

function trackGeometry<T extends THREE.BufferGeometry>(resources: CityResources, geometry: T): T {
  resources.geometries.add(geometry);
  return geometry;
}

function createGeometryAssets(resources: CityResources): GeometryAssets {
  return {
    box: trackGeometry(resources, new THREE.BoxGeometry(1, 1, 1)),
    cylinder: trackGeometry(resources, new THREE.CylinderGeometry(0.5, 0.5, 1, 10)),
    cone: trackGeometry(resources, new THREE.ConeGeometry(0.5, 1, 10)),
    sphere: trackGeometry(resources, new THREE.SphereGeometry(0.5, 12, 8)),
    arch: trackGeometry(resources, new THREE.TorusGeometry(0.5, 0.09, 8, 18, Math.PI)),
  };
}

function box(
  assets: GeometryAssets,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  depth: number,
): THREE.Mesh<THREE.BoxGeometry, THREE.Material> {
  const mesh = new THREE.Mesh(assets.box, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(width, height, depth);
  mesh.receiveShadow = true;
  return mesh;
}

function cylinder(
  assets: GeometryAssets,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
  radius: number,
  height: number,
): THREE.Mesh<THREE.CylinderGeometry, THREE.Material> {
  const mesh = new THREE.Mesh(assets.cylinder, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(radius * 2, height, radius * 2);
  mesh.receiveShadow = true;
  return mesh;
}

function cone(
  assets: GeometryAssets,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
  radius: number,
  height: number,
): THREE.Mesh<THREE.ConeGeometry, THREE.Material> {
  const mesh = new THREE.Mesh(assets.cone, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(radius * 2, height, radius * 2);
  mesh.receiveShadow = true;
  return mesh;
}

function sphere(
  assets: GeometryAssets,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
  radiusX: number,
  radiusY: number,
  radiusZ: number,
): THREE.Mesh<THREE.SphereGeometry, THREE.Material> {
  const mesh = new THREE.Mesh(assets.sphere, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(radiusX * 2, radiusY * 2, radiusZ * 2);
  mesh.receiveShadow = true;
  return mesh;
}

function createGround(root: THREE.Group, assets: GeometryAssets): void {
  // Generous so the terrain runs past the fog instead of ending in a visible
  // edge against the sky.
  const ground = box(assets, groundMaterial, 41, -0.38, 0, 900, 0.7, 760);
  ground.name = 'ground';
  root.add(ground);

  const water = box(
    assets,
    waterMaterial,
    WATER.center.x,
    WATER.center.y + 0.05,
    WATER.center.z,
    WATER.w,
    0.12,
    WATER.d,
  );
  water.name = 'water';
  root.add(water);
}

function createRoads(root: THREE.Group, assets: GeometryAssets): void {
  for (let index = 0; index < ROADS.length; index += 1) {
    const definition = ROADS[index];
    const dx = definition.to.x - definition.from.x;
    const dz = definition.to.z - definition.from.z;
    const length = Math.hypot(dx, dz);
    const rotation = Math.atan2(dz, dx);
    const centerX = (definition.from.x + definition.to.x) / 2;
    const centerZ = (definition.from.z + definition.to.z) / 2;
    const surface = box(assets, roadMaterial, centerX, 0.07, centerZ, length, 0.14, definition.width);

    surface.name = `road-${index}`;
    surface.rotation.y = rotation;
    root.add(surface);

    if (length >= 18 && definition.width >= 4) {
      const line = box(assets, roadLineMaterial, centerX, 0.148, centerZ, Math.max(1, length - 2), 0.02, 0.12);
      line.name = `road-line-${index}`;
      line.rotation.y = rotation;
      root.add(line);
    }
  }

  const bridge = new THREE.Group();
  bridge.name = 'water-channel-bridge';
  const railLength = 40;

  for (const z of [-2.7, 2.7]) {
    bridge.add(box(assets, bridgeMaterial, WATER.center.x, 0.64, z, railLength, 0.12, 0.16));
  }
  for (const x of [59, 70, 81]) {
    bridge.add(box(assets, bridgeMaterial, x, 0.42, -2.7, 0.22, 0.86, 0.22));
    bridge.add(box(assets, bridgeMaterial, x, 0.42, 2.7, 0.22, 0.86, 0.22));
  }

  root.add(bridge);
}

function createBlocks(root: THREE.Group, assets: GeometryAssets): void {
  const byTone = new Map<number, BlockDef[]>();

  for (const blockDefinition of BLOCKS) {
    const group = byTone.get(blockDefinition.tone);
    if (group) group.push(blockDefinition);
    else byTone.set(blockDefinition.tone, [blockDefinition]);
  }

  for (const [tone, definitions] of byTone) {
    const mesh = new THREE.InstancedMesh(assets.box, buildingMaterialForTone(tone), definitions.length);
    const matrix = new THREE.Matrix4();

    mesh.name = `ordinary-blocks-tone-${tone}`;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);

    for (let index = 0; index < definitions.length; index += 1) {
      const definition = definitions[index];
      matrix.makeScale(definition.w, definition.h, definition.d);
      matrix.setPosition(
        definition.position.x,
        definition.position.y + definition.h / 2,
        definition.position.z,
      );
      mesh.setMatrixAt(index, matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    root.add(mesh);
  }
}

function addBase(group: THREE.Group, definition: LandmarkDef, assets: GeometryAssets): void {
  const { w, d } = definition.footprint;
  const base = box(assets, roadMaterial, 0, 0.16, 0, w + 0.6, 0.32, d + 0.6);
  base.name = `${definition.id}-plinth`;
  group.add(base);
}

function createBuildLandmark(group: THREE.Group, definition: LandmarkDef, assets: GeometryAssets): void {
  const { w, d, h } = definition.footprint;
  const material = landmarkMaterials.build;
  group.add(box(assets, material, 0, h * 0.42, 0, w, h * 0.84, d));

  for (let index = 0; index < 3; index += 1) {
    const roof = box(assets, material, -w * 0.26 + index * w * 0.26, h * 0.88, 0, w * 0.28, 0.55, d * 0.94);
    roof.rotation.z = index % 2 === 0 ? Math.PI / 10 : -Math.PI / 10;
    group.add(roof);
  }

  for (const x of [-w * 0.28, w * 0.28]) {
    group.add(cylinder(assets, roadMaterial, x, h + 1.35, d * 0.22, 0.42, 2.7));
    group.add(cone(assets, emissiveMaterials.fire, x, h + 2.95, d * 0.22, 0.48, 0.7));
  }
}

function createTestLandmark(group: THREE.Group, definition: LandmarkDef, assets: GeometryAssets): void {
  const { w, d, h } = definition.footprint;
  group.add(box(assets, landmarkMaterials.test, 0, h * 0.2, 0, w, h * 0.4, d));
  group.add(box(assets, glassMaterial, 0, h * 0.7, 0, w * 0.56, h, d * 0.56));
  group.add(cylinder(assets, roadMaterial, 0, h + 0.7, 0, 0.16, 1.4));
  group.add(sphere(assets, landmarkMaterials.test, 0, h + 1.55, 0, w * 0.18, 0.28, d * 0.18));
  group.add(sphere(assets, glassMaterial, 0, h + 1.8, 0, w * 0.07, 0.18, d * 0.07));
}

function createSecurityLandmark(group: THREE.Group, definition: LandmarkDef, assets: GeometryAssets): void {
  const { w, d, h } = definition.footprint;
  const material = landmarkMaterials.security;
  group.add(box(assets, material, 0, h * 0.36, d * 0.08, w, h * 0.72, d * 0.76));

  for (const x of [-w * 0.32, w * 0.32]) {
    group.add(box(assets, material, x, 2.1, -d * 0.36, 0.68, 4.2, 0.68));
  }
  group.add(box(assets, material, 0, 4.0, -d * 0.36, w * 0.74, 0.7, 0.68));
  group.add(cylinder(assets, roadMaterial, 0, h + 1.0, d * 0.12, 0.23, 2));
  group.add(sphere(assets, material, 0, h + 2.8, d * 0.12, 1.25, 1.6, 0.22));
}

function createPackageLandmark(group: THREE.Group, definition: LandmarkDef, assets: GeometryAssets): void {
  const { w, d, h } = definition.footprint;
  const material = landmarkMaterials.package;

  for (let index = -1; index <= 1; index += 1) {
    const x = index * w * 0.27;
    group.add(box(assets, material, x, h * 0.28, 0, w * 0.23, h * 0.56, d * 0.82));
    group.add(box(assets, roadMaterial, x, h * 0.11, -d * 0.45, w * 0.17, h * 0.22, 0.22));
  }
}

function createPortLandmark(group: THREE.Group, definition: LandmarkDef, assets: GeometryAssets): void {
  const { w, d, h } = definition.footprint;
  const material = landmarkMaterials.port;
  group.add(box(assets, material, -w * 0.18, h * 0.28, d * 0.14, w * 0.54, h * 0.56, d * 0.6));

  for (const x of [-w * 0.32, w * 0.28]) {
    group.add(box(assets, roadMaterial, x, h * 0.55, -d * 0.12, 0.28, h * 1.1, 0.28));
    group.add(box(assets, roadMaterial, x + w * 0.17, h * 0.98, -d * 0.12, w * 0.38, 0.24, 0.24));
    group.add(cylinder(assets, roadMaterial, x + w * 0.32, h * 0.6, -d * 0.12, 0.08, h * 0.62));
  }

  for (let index = 0; index < 3; index += 1) {
    const x = w * 0.08 + index * w * 0.18;
    group.add(box(assets, vehicleMaterials.crate, x, 0.72, -d * 0.32, w * 0.16, 1.15, d * 0.18));
  }
}

function createReviewLandmark(group: THREE.Group, definition: LandmarkDef, assets: GeometryAssets): void {
  const { w, d, h } = definition.footprint;
  const material = landmarkMaterials.review;
  group.add(box(assets, material, 0, h * 0.34, d * 0.1, w * 0.86, h * 0.68, d * 0.64));

  for (let step = 0; step < 3; step += 1) {
    group.add(box(assets, material, 0, 0.22 + step * 0.2, -d * (0.3 + step * 0.07), w * (0.78 - step * 0.08), 0.2, 0.65));
  }
  for (const x of [-w * 0.28, -w * 0.09, w * 0.09, w * 0.28]) {
    group.add(cylinder(assets, material, x, h * 0.55, -d * 0.29, 0.2, h * 0.62));
  }
  group.add(sphere(assets, glassMaterial, 0, h * 0.77, d * 0.08, w * 0.2, h * 0.15, d * 0.16));
}

function createMergeLandmark(group: THREE.Group, definition: LandmarkDef, assets: GeometryAssets): void {
  const { w, d, h } = definition.footprint;
  const material = landmarkMaterials.merge;
  group.add(box(assets, material, -w * 0.28, h * 0.26, 0, w * 0.16, h * 0.52, d * 0.26));
  group.add(box(assets, material, w * 0.28, h * 0.26, 0, w * 0.16, h * 0.52, d * 0.26));

  const arch = new THREE.Mesh(assets.arch, material);
  arch.name = `${definition.id}-arch`;
  arch.position.set(0, h * 0.52, 0);
  arch.scale.set(w * 0.56, h * 0.56, 1);
  arch.castShadow = true;
  arch.receiveShadow = true;
  group.add(arch);

  const glow = box(assets, emissiveMaterials.merge, 0, h * 0.6, 0, w * 0.54, 0.12, 0.14);
  group.add(glow);
}

function createLandmark(definition: LandmarkDef, assets: GeometryAssets): THREE.Group {
  const group = new THREE.Group();
  group.name = definition.id;
  group.position.set(definition.position.x, definition.position.y, definition.position.z);
  addBase(group, definition, assets);

  switch (definition.kind) {
    case 'build':
      createBuildLandmark(group, definition, assets);
      break;
    case 'test':
      createTestLandmark(group, definition, assets);
      break;
    case 'security':
      createSecurityLandmark(group, definition, assets);
      break;
    case 'package':
      createPackageLandmark(group, definition, assets);
      break;
    case 'port':
      createPortLandmark(group, definition, assets);
      break;
    case 'review':
      createReviewLandmark(group, definition, assets);
      break;
    case 'merge':
      createMergeLandmark(group, definition, assets);
      break;
  }
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) object.castShadow = true;
  });


  return group;
}

function createParks(root: THREE.Group, assets: GeometryAssets): void {
  for (const park of PARKS) {
    const lawn = box(assets, parkMaterial, park.x, 0.045, park.z, park.w, 0.09, park.d);
    lawn.name = `park-${park.x}-${park.z}`;
    root.add(lawn);
  }

  const trunks = new THREE.InstancedMesh(assets.cylinder, vehicleMaterials.crate, TREES.length);
  const crowns = new THREE.InstancedMesh(assets.cone, parkMaterial, TREES.length);
  const matrix = new THREE.Matrix4();

  trunks.name = 'park-tree-trunks';
  crowns.name = 'park-tree-crowns';
  trunks.receiveShadow = true;
  crowns.receiveShadow = true;
  trunks.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  crowns.instanceMatrix.setUsage(THREE.StaticDrawUsage);

  for (let index = 0; index < TREES.length; index += 1) {
    const tree = TREES[index];
    const trunkHeight = 1.25 * tree.scale;
    const canopyHeight = 2.25 * tree.scale;
    const trunkRadius = 0.13 * tree.scale;
    const canopyRadius = 0.72 * tree.scale;

    matrix.makeScale(trunkRadius * 2, trunkHeight, trunkRadius * 2);
    matrix.setPosition(tree.x, trunkHeight / 2, tree.z);
    trunks.setMatrixAt(index, matrix);

    matrix.makeScale(canopyRadius * 2, canopyHeight, canopyRadius * 2);
    matrix.setPosition(tree.x, trunkHeight + canopyHeight / 2, tree.z);
    crowns.setMatrixAt(index, matrix);
  }

  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  trunks.computeBoundingSphere();
  crowns.computeBoundingSphere();
  root.add(trunks, crowns);
}

/** Builds static geometry only, so renderer-owned materials remain shared and disposable at renderer teardown. */
export function buildCity(scene: THREE.Scene): CityBuildResult {
  const resources: CityResources = { geometries: new Set<THREE.BufferGeometry>() };
  const assets = createGeometryAssets(resources);
  const root = new THREE.Group();
  const landmarkMeshes = new Map<BuildingId, THREE.Object3D>();
  let disposed = false;

  root.name = 'two-city-world';
  scene.add(root);
  createGround(root, assets);
  createRoads(root, assets);
  createBlocks(root, assets);

  for (const definition of LANDMARKS) {
    const building = createLandmark(definition, assets);
    landmarkMeshes.set(definition.id, building);
    root.add(building);
  }

  createParks(root, assets);

  return {
    landmarkMeshes,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      root.clear();
      for (const geometry of resources.geometries) geometry.dispose();
      resources.geometries.clear();
      landmarkMeshes.clear();
    },
  };
}
