import * as THREE from "three";
import type { District, Health, Island, Tower, Vec2 } from "../../shared/types";
import type { RenderAssets } from "./assets";
import { BatchSet, ModelBatch, type BatchHit } from "./batch";
import { GROUND_LIFT } from "./towers";

/** The kit's plaza and nursery are modelled at these radii and scaled to the district's. */
const PLAZA_MODEL_RADIUS = 3;
const NURSERY_MODEL_RADIUS = 2;
/** The town hall's door, relative to its centre: on the side that faces the viewer. */
const HALL_DOOR = { x: 0.15, z: 1.75 };
/** Footpaths run from the plaza to the hall, to the nursery, and to towers within this distance of it. */
const PATH_REACH = 8.2;
const PATH_WIDTH = { hall: 0.95, nursery: 0.8, tower: 0.55 } as const;
const UP = new THREE.Vector3(0, 1, 0);

/** Town halls, plazas, nurseries and the footpaths between them, and the waystation on the outskirts. */
export class DistrictLayer {
  readonly group = new THREE.Group();
  private readonly halls: BatchSet<Health>;
  private readonly plazas: ModelBatch;
  private readonly nurseries: ModelBatch;
  private readonly waystations: ModelBatch;
  private readonly paths: ModelBatch;
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly turn = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();

  constructor(assets: RenderAssets) {
    const solid = { castShadow: true, receiveShadow: true };
    this.halls = new BatchSet<Health>(
      (health) => new ModelBatch(assets.kit.parts("hq", { Accent: assets.accentMaterials[health] }), solid),
    );
    this.plazas = new ModelBatch(assets.kit.parts("plaza"), solid);
    this.nurseries = new ModelBatch(assets.kit.parts("nursery"), solid);
    this.waystations = new ModelBatch(assets.kit.parts("waystation"), solid);
    this.paths = new ModelBatch([{ geometry: assets.pathGeometry, material: assets.pathMaterial }], { receiveShadow: true });
    this.group.add(this.paths.group, this.halls.group, this.plazas.group, this.nurseries.group, this.waystations.group);
  }

  update(districts: readonly District[], islands: readonly Island[], towers: readonly Tower[]): void {
    const towersByIsland = new Map<string, Tower[]>();
    for (const tower of towers) {
      const list = towersByIsland.get(tower.islandId);
      if (list) list.push(tower);
      else towersByIsland.set(tower.islandId, [tower]);
    }
    this.halls.begin();
    this.plazas.begin();
    this.nurseries.begin();
    this.waystations.begin();
    this.paths.begin();
    for (const district of districts) {
      const plaza = district.plaza.center;
      const nursery = district.nursery.center;
      this.matrix.makeTranslation(district.hq.x, GROUND_LIFT, district.hq.z);
      this.halls.add(district.health, district.id, this.matrix);
      const plazaScale = district.plaza.radius / PLAZA_MODEL_RADIUS;
      this.matrix.makeScale(plazaScale, plazaScale, plazaScale).setPosition(plaza.x, GROUND_LIFT, plaza.z);
      this.plazas.add(district.id, this.matrix);
      // The nursery's gate is modelled facing +z; turn it to face the plaza it opens onto.
      this.turn.setFromAxisAngle(UP, Math.atan2(plaza.x - nursery.x, plaza.z - nursery.z));
      this.matrix.compose(
        this.position.set(nursery.x, GROUND_LIFT, nursery.z),
        this.turn,
        this.scale.setScalar(district.nursery.radius / NURSERY_MODEL_RADIUS),
      );
      this.nurseries.add(district.id, this.matrix);

      this.path(district.id, plaza, { x: district.hq.x + HALL_DOOR.x, z: district.hq.z + HALL_DOOR.z }, district.plaza.radius, 0, PATH_WIDTH.hall);
      this.path(district.id, plaza, nursery, district.plaza.radius, district.nursery.radius, PATH_WIDTH.nursery);
      for (const tower of towersByIsland.get(district.id) ?? []) {
        if (Math.hypot(tower.position.x - plaza.x, tower.position.z - plaza.z) > PATH_REACH) continue;
        this.path(district.id, plaza, tower.position, district.plaza.radius, 0.7, PATH_WIDTH.tower);
      }
    }
    for (const island of islands) {
      if (island.kind !== "outskirts") continue;
      const centre = { x: island.origin.x + island.size.x / 2, z: island.origin.z + island.size.z / 2 };
      this.matrix.makeTranslation(centre.x, GROUND_LIFT, centre.z);
      this.waystations.add(island.id, this.matrix);
      for (const tower of towersByIsland.get(island.id) ?? []) {
        if (Math.hypot(tower.position.x - centre.x, tower.position.z - centre.z) <= PATH_REACH) this.path(island.id, centre, tower.position, 1.9, 0.7, PATH_WIDTH.tower);
      }
    }
    this.halls.end();
    this.plazas.end();
    this.nurseries.end();
    this.waystations.end();
    this.paths.end();
  }

  /** The district whose town hall the ray hits. Its ground is picked separately, by position. */
  pick(raycaster: THREE.Raycaster, hits: THREE.Intersection[]): BatchHit | null {
    return this.halls.pick(raycaster, hits);
  }

  dispose(): void {
    this.halls.dispose();
    this.plazas.dispose();
    this.nurseries.dispose();
    this.waystations.dispose();
    this.paths.dispose();
    this.group.removeFromParent();
  }

  /** A strip of trodden ground between two places, stopping `fromGap` and `toGap` short of their centres. */
  private path(id: string, from: Vec2, to: Vec2, fromGap: number, toGap: number, width: number): void {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const length = Math.hypot(dx, dz) - fromGap - toGap;
    if (length <= 0.2) return;
    const middle = (fromGap + length / 2) / Math.hypot(dx, dz);
    this.matrix.compose(
      this.position.set(from.x + dx * middle, GROUND_LIFT + 0.012, from.z + dz * middle),
      this.turn.setFromAxisAngle(UP, Math.atan2(-dz, dx)),
      this.scale.set(length, 1, width),
    );
    this.paths.add(id, this.matrix);
  }
}
