import * as THREE from "three";
import type { District, Island, RunResult, Tower } from "../../shared/types";
import type { RenderAssets } from "./assets";
import type { KitModel } from "./kit";
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

/** The kit models are authored at these sizes; districts use slightly smaller footprints. */
const HQ_SCALE = 1;
const PLAZA_MODEL_RADIUS = 3;
const NURSERY_MODEL_RADIUS = 2;
/** Grass tops sit a hair above y = 0; lift ground pieces so they never z-fight. */
const GROUND_LIFT = 0.045;

/** Swaps the material on every mesh of a kit model that was authored with `name`. */
function swapMaterial(model: THREE.Object3D, name: string, material: THREE.Material): void {
  for (const child of model.children) {
    if (child instanceof THREE.Mesh && child.name === name) child.material = material;
  }
}

function placeGroundPieces(district: District, plaza: THREE.Object3D, nursery: THREE.Object3D): void {
  plaza.position.set(district.plaza.center.x, GROUND_LIFT, district.plaza.center.z);
  plaza.scale.setScalar(district.plaza.radius / PLAZA_MODEL_RADIUS);
  nursery.position.set(district.nursery.center.x, GROUND_LIFT, district.nursery.center.z);
  nursery.scale.setScalar(district.nursery.radius / NURSERY_MODEL_RADIUS);
}

export function createDistrictVisual(initial: District, island: Island, assets: RenderAssets): DistrictVisual {
  const root = new THREE.Group();
  root.name = `district:${initial.id}`;
  const hq = assets.kit.create("hq", { Accent: assets.accentMaterials[initial.health] });
  hq.scale.setScalar(HQ_SCALE);
  hq.position.set(initial.hq.x, GROUND_LIFT, initial.hq.z);
  const plaza = assets.kit.create("plaza");
  const nursery = assets.kit.create("nursery");
  placeGroundPieces(initial, plaza, nursery);
  const label = createTextLabel(initial.name, "#effcff", "rgba(18, 35, 51, 0.78)");
  const pickSurface = new THREE.Mesh(assets.pickSurfaceGeometry, assets.pickMaterial);
  pickSurface.rotation.x = -Math.PI / 2;
  pickSurface.position.set(island.origin.x + island.size.x / 2, 0.08, island.origin.z + island.size.z / 2);
  pickSurface.scale.set(island.size.x * 0.96, island.size.z * 0.96, 1);
  // The repo name floats just above the town hall.
  const labelHeight = assets.kit.top("hq") * HQ_SCALE + 0.55;
  label.sprite.position.set(initial.hq.x, labelHeight, initial.hq.z);
  root.add(pickSurface, hq, plaza, nursery, label.sprite);
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
      if (next.health !== data.health) swapMaterial(hq, "Accent", assets.accentMaterials[next.health]);
      hq.position.set(next.hq.x, GROUND_LIFT, next.hq.z);
      placeGroundPieces(next, plaza, nursery);
      label.sprite.position.set(next.hq.x, labelHeight, next.hq.z);
      pickSurface.position.set(nextIsland.origin.x + nextIsland.size.x / 2, 0.08, nextIsland.origin.z + nextIsland.size.z / 2);
      pickSurface.scale.set(nextIsland.size.x * 0.96, nextIsland.size.z * 0.96, 1);
      data = next;
    },
    dispose(): void {
      label.dispose();
      root.removeFromParent();
    },
  };
}

export type TowerStage = "foundation" | "building" | "built" | "broken";

/**
 * A pipeline's tower is built by its runs: waiting or never run shows the
 * foundations, a running pipeline is under construction, a passing one is
 * finished, and a failing one lies broken.
 */
export const TOWER_STAGE: Record<RunResult, TowerStage> = {
  none: "foundation",
  queued: "foundation",
  cancelled: "foundation",
  running: "building",
  success: "built",
  partial: "built",
  failure: "broken",
};

export const TOWER_MODELS: Record<Tower["kind"], Record<TowerStage, KitModel>> = {
  ci: { foundation: "tower_ci_foundation", building: "tower_ci_building", built: "tower_ci", broken: "tower_ci_broken" },
  release: {
    foundation: "tower_release_foundation",
    building: "tower_release_building",
    built: "tower_release",
    broken: "tower_release_broken",
  },
};

export function createTowerVisual(initial: Tower, assets: RenderAssets): TowerVisual {
  const root = new THREE.Group();
  root.name = `tower:${initial.id}`;
  const beaconLight = new THREE.PointLight(assets.statusColour(initial.status), 1.35, 8, 2);
  const label = createTextLabel(initial.name, "#fff5d5", "rgba(41, 30, 51, 0.82)");
  label.sprite.visible = false;
  root.add(beaconLight, label.sprite);
  let modelName = TOWER_MODELS[initial.kind][TOWER_STAGE[initial.status]];
  let model = assets.kit.create(modelName, { Beacon: assets.beaconMaterials[initial.status] });
  root.add(model);

  /** Light and name follow the model: the lantern on a finished tower, embers in a broken one. */
  function placeLightAndLabel(): void {
    beaconLight.position.copy(assets.kit.beaconCentre(modelName));
    label.sprite.position.set(0, assets.kit.top(modelName) + 0.45, 0);
  }

  placeLightAndLabel();
  root.position.set(initial.position.x, 0.045, initial.position.z);
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
      const nextModel = TOWER_MODELS[next.kind][TOWER_STAGE[next.status]];
      if (nextModel !== modelName) {
        root.remove(model);
        modelName = nextModel;
        model = assets.kit.create(modelName, { Beacon: assets.beaconMaterials[next.status] });
        root.add(model);
        placeLightAndLabel();
      } else if (next.status !== data.status) {
        swapMaterial(model, "Beacon", assets.beaconMaterials[next.status]);
      }
      if (next.status !== data.status) beaconLight.color.setHex(assets.statusColour(next.status));
      root.position.set(next.position.x, 0.045, next.position.z);
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
