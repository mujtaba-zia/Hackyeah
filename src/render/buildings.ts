import * as THREE from "three";
import type { District, Island, Tower } from "../../shared/types";
import type { RenderAssets } from "./assets";
import { createTextLabel } from "./labels";

export interface DistrictVisual {
  readonly root: THREE.Group;
  readonly pickSurface: THREE.Mesh;
  data: District;
  update(district: District, island: Island): void;
  dispose(): void;
}

export interface TowerVisual {
  readonly root: THREE.Group;
  data: Tower;
  update(tower: Tower): void;
  showName(show: boolean): void;
  dispose(): void;
}

function createDistrictBuilding(district: District, assets: RenderAssets): {
  group: THREE.Group;
  base: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
} {
  const group = new THREE.Group();
  const base = new THREE.Mesh(assets.hqBaseGeometry, assets.hqMaterials[district.health]);
  const roof = new THREE.Mesh(assets.hqRoofGeometry, assets.roofMaterial);
  const window = new THREE.Mesh(assets.hqWindowGeometry, assets.windowMaterial);
  const secondWindow = new THREE.Mesh(assets.hqWindowGeometry, assets.windowMaterial);
  base.position.y = 0.65;
  roof.position.y = 1.8;
  roof.rotation.y = Math.PI * 0.25;
  window.position.set(-0.46, 0.72, 0.74);
  secondWindow.position.set(0.46, 0.72, 0.74);
  group.add(base, roof, window, secondWindow);
  group.position.set(district.hq.x, 0, district.hq.z);
  return { group, base };
}

export function createDistrictVisual(initial: District, island: Island, assets: RenderAssets): DistrictVisual {
  const root = new THREE.Group();
  root.name = `district:${initial.id}`;
  const building = createDistrictBuilding(initial, assets);
  const label = createTextLabel(initial.name, "#effcff", "rgba(18, 35, 51, 0.78)");
  const pickSurface = new THREE.Mesh(assets.pickSurfaceGeometry, assets.pickMaterial);
  pickSurface.rotation.x = -Math.PI / 2;
  pickSurface.position.set(island.origin.x + island.size.x / 2, 0.08, island.origin.z + island.size.z / 2);
  pickSurface.scale.set(island.size.x * 0.96, island.size.z * 0.96, 1);
  label.sprite.position.set(initial.plaza.center.x, 1.75, island.origin.z + island.size.z - 1.15);
  root.add(pickSurface, building.group, label.sprite);
  let data = initial;

  return {
    root,
    pickSurface,
    get data(): District {
      return data;
    },
    set data(next: District) {
      data = next;
    },
    update(next: District, nextIsland: Island): void {
      if (next.name !== data.name) label.setText(next.name);
      if (next.health !== data.health) building.base.material = assets.hqMaterials[next.health];
      building.group.position.set(next.hq.x, 0, next.hq.z);
      label.sprite.position.set(next.plaza.center.x, 1.75, nextIsland.origin.z + nextIsland.size.z - 1.15);
      pickSurface.position.set(
        nextIsland.origin.x + nextIsland.size.x / 2,
        0.08,
        nextIsland.origin.z + nextIsland.size.z / 2,
      );
      pickSurface.scale.set(nextIsland.size.x * 0.96, nextIsland.size.z * 0.96, 1);
      data = next;
    },
    dispose(): void {
      label.dispose();
      root.removeFromParent();
    },
  };
}

function createCiTower(assets: RenderAssets): THREE.Group {
  const group = new THREE.Group();
  const base = new THREE.Mesh(assets.towerBaseGeometry, assets.towerBodyMaterial);
  const shaft = new THREE.Mesh(assets.ciTowerGeometry, assets.towerBodyMaterial);
  base.position.y = 0.16;
  shaft.position.y = 1.87;
  group.add(base, shaft);
  return group;
}

function createReleaseTower(assets: RenderAssets): THREE.Group {
  const group = new THREE.Group();
  const base = new THREE.Mesh(assets.towerBaseGeometry, assets.towerReleaseMaterial);
  const shaft = new THREE.Mesh(assets.releaseTowerGeometry, assets.towerReleaseMaterial);
  const flag = new THREE.Mesh(assets.flagGeometry, assets.flagMaterial);
  base.position.y = 0.16;
  shaft.position.y = 1.35;
  flag.position.set(0.68, 2.45, 0);
  group.add(base, shaft, flag);
  return group;
}

export function createTowerVisual(initial: Tower, assets: RenderAssets): TowerVisual {
  const root = new THREE.Group();
  root.name = `tower:${initial.id}`;
  const ciTower = createCiTower(assets);
  const releaseTower = createReleaseTower(assets);
  const beacon = new THREE.Mesh(assets.beaconGeometry, assets.statusMaterials[initial.status]);
  const beaconLight = new THREE.PointLight(assets.statusColour(initial.status), 1.35, 8, 2);
  const label = createTextLabel(initial.name, "#fff5d5", "rgba(41, 30, 51, 0.82)");
  ciTower.visible = initial.kind === "ci";
  releaseTower.visible = initial.kind === "release";
  beacon.position.y = initial.kind === "ci" ? 3.67 : 2.62;
  beaconLight.position.copy(beacon.position);
  label.sprite.position.set(0, initial.kind === "ci" ? 4.55 : 3.5, 0);
  label.sprite.visible = false;
  root.position.set(initial.position.x, 0, initial.position.z);
  root.add(ciTower, releaseTower, beacon, beaconLight, label.sprite);
  let data = initial;

  return {
    root,
    get data(): Tower {
      return data;
    },
    set data(next: Tower) {
      data = next;
    },
    update(next: Tower): void {
      if (next.name !== data.name) label.setText(next.name);
      if (next.kind !== data.kind) {
        ciTower.visible = next.kind === "ci";
        releaseTower.visible = next.kind === "release";
        beacon.position.y = next.kind === "ci" ? 3.67 : 2.62;
        beaconLight.position.copy(beacon.position);
        label.sprite.position.y = next.kind === "ci" ? 4.55 : 3.5;
      }
      if (next.status !== data.status) {
        beacon.material = assets.statusMaterials[next.status];
        beaconLight.color.setHex(assets.statusColour(next.status));
      }
      root.position.set(next.position.x, 0, next.position.z);
      data = next;
    },
    showName(show: boolean): void {
      label.sprite.visible = show;
    },
    dispose(): void {
      label.dispose();
      root.removeFromParent();
    },
  };
}
