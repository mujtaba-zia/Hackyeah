import * as THREE from "three";
import type { RunResult, Tower } from "../../shared/types";
import type { RenderAssets } from "./assets";
import { BatchSet, ModelBatch, type BatchHit } from "./batch";
import { hashString, seededRange } from "./hash";
import type { KitModel } from "./kit";

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

/** Grass tops sit a hair above y = 0; lift buildings so they never z-fight. */
export const GROUND_LIFT = 0.045;
/** How far a failing tower's beam rises above it. */
const BEAM_HEIGHT = 13;
const BEAM_WIDTH = 0.5;
/** A beam never gets thinner on screen than this many pixels, so it shows from any distance. */
const BEAM_MIN_PIXELS = 5;
/** Lights too dim to be worth a glow. */
const NO_GLOW: Partial<Record<RunResult, true>> = { none: true, cancelled: true };

type Variant = `${KitModel}|${RunResult}`;

interface Light {
  x: number;
  y: number;
  z: number;
  status: RunResult;
  phase: number;
}

/** Every pipeline tower, with the glow of its status light and a beam over each failing one. */
export class TowerLayer {
  readonly group = new THREE.Group();
  private readonly models: BatchSet<Variant>;
  private readonly glows: ModelBatch;
  private readonly beams: ModelBatch;
  private readonly lights: Light[] = [];
  private readonly failing: { x: number; y: number; z: number }[] = [];
  private readonly matrix = new THREE.Matrix4();
  private readonly colour = new THREE.Color();
  private anyRunning = false;
  private beamScale = -1;

  constructor(private readonly assets: RenderAssets) {
    this.models = new BatchSet<Variant>((variant) => {
      const [model, status] = variant.split("|") as [KitModel, RunResult];
      return new ModelBatch(
        assets.kit.parts(model, { Beacon: assets.beaconMaterials[status], Status: assets.statusMaterials[status] }),
        { castShadow: true, receiveShadow: true },
      );
    });
    this.glows = new ModelBatch([{ geometry: assets.billboardGeometry, material: assets.glowMaterial }], {
      animated: true,
      coloured: true,
      renderOrder: 6,
    });
    this.beams = new ModelBatch([{ geometry: assets.beamGeometry, material: assets.beamMaterial }], { animated: true, renderOrder: 7 });
    this.group.add(this.models.group, this.glows.group, this.beams.group);
  }

  /** The kit model that draws a tower in its current state. */
  static modelFor(tower: Tower): KitModel {
    return TOWER_MODELS[tower.kind][TOWER_STAGE[tower.status]];
  }

  update(towers: readonly Tower[]): void {
    this.models.begin();
    this.lights.length = 0;
    this.failing.length = 0;
    this.anyRunning = false;
    for (const tower of towers) {
      const model = TowerLayer.modelFor(tower);
      this.matrix.makeTranslation(tower.position.x, GROUND_LIFT, tower.position.z);
      this.models.add(`${model}|${tower.status}`, tower.id, this.matrix);
      if (!NO_GLOW[tower.status]) {
        const beacon = this.assets.kit.beaconCentre(model);
        this.lights.push({
          x: tower.position.x + beacon.x,
          y: GROUND_LIFT + beacon.y,
          z: tower.position.z + beacon.z,
          status: tower.status,
          phase: seededRange(hashString(tower.id), 1, 0, Math.PI * 2),
        });
      }
      if (tower.status === "running") this.anyRunning = true;
      if (tower.status === "failure") {
        this.failing.push({ x: tower.position.x, y: this.assets.kit.top(model) * 0.6, z: tower.position.z });
      }
    }
    this.models.end();
    this.beamScale = -1;
    this.fillGlows(0);
  }

  /** Pulses the lights of running pipelines and keeps beams visible at the current zoom. */
  animate(time: number, pixelsPerUnit: number, moving: boolean): void {
    if (moving && this.anyRunning) this.fillGlows(time);
    // From far away the beam is the signal; up close the broken tower is, and the beam steps back.
    const presence = THREE.MathUtils.clamp(1.15 - pixelsPerUnit / 60, 0.3, 0.9);
    this.assets.beamMaterial.opacity = presence * (moving ? 0.86 + Math.sin(time * 2.6) * 0.14 : 1);
    const scale = Math.max(1, BEAM_MIN_PIXELS / (BEAM_WIDTH * pixelsPerUnit));
    if (scale === this.beamScale) return;
    this.beamScale = scale;
    this.beams.begin();
    for (const base of this.failing) {
      this.matrix.makeScale(BEAM_WIDTH * scale, BEAM_HEIGHT, BEAM_WIDTH * scale).setPosition(base.x, base.y, base.z);
      this.beams.add("", this.matrix);
    }
    this.beams.end();
  }

  pick(raycaster: THREE.Raycaster, hits: THREE.Intersection[]): BatchHit | null {
    return this.models.pick(raycaster, hits);
  }

  dispose(): void {
    this.models.dispose();
    this.glows.dispose();
    this.beams.dispose();
    this.group.removeFromParent();
  }

  private fillGlows(time: number): void {
    this.glows.begin();
    for (const light of this.lights) {
      // A running pipeline's work lights breathe; every other light is steady.
      const pulse = light.status === "running" ? 0.5 + 0.5 * Math.sin(time * 3.2 + light.phase) : 0.4;
      const size = light.status === "failure" ? 2.6 : 1.5 + pulse * 1.1;
      this.matrix.makeScale(size, size, size).setPosition(light.x, light.y, light.z);
      this.colour.copy(this.assets.statusColours[light.status]).multiplyScalar(0.55 + pulse * 0.45);
      this.glows.add("", this.matrix, this.colour);
    }
    this.glows.end();
  }
}
