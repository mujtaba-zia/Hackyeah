import * as THREE from 'three';
import type { Effects3D, FxHandle } from '../fx/Effects3D';
import { emissiveMaterials } from '../core/materials';
import type { LandmarkDef } from './cityPlan';

/** Worker figures shown at full load. Two per concurrent job. */
const MAX_WORKERS = 6;

/** Shared across every landmark, disposed once by the world teardown. */
export const WORKER_GEOMETRY = new THREE.CapsuleGeometry(0.35, 0.9, 4, 8);

/**
 * The reactive skin over a landmark mesh.
 *
 * Mirrors the old WorkBuilding split so the port keeps its most important
 * property: continuous state (`setBusy`, `setWorkload`) is re-applied on every
 * simulation tick, while one-shot spectacle (`flashSuccess`, `flashFailure`) is
 * driven by events. Separating them means the four times a second state sync can
 * never cancel an explosion mid animation.
 */
export class LandmarkView {
  readonly def: LandmarkDef;
  readonly root: THREE.Object3D;

  private readonly fx: Effects3D;
  private readonly workers: THREE.Mesh[] = [];
  private readonly glow: THREE.PointLight;
  private smoke?: FxHandle;
  private busy = false;
  private workload = 0;
  private failing = false;
  private pulse = 0;

  constructor(def: LandmarkDef, root: THREE.Object3D, fx: Effects3D, scene: THREE.Scene) {
    this.def = def;
    this.root = root;
    this.fx = fx;

    this.glow = new THREE.PointLight(0xffc766, 0, 26, 2);
    this.glow.position.set(def.position.x, def.position.y + def.footprint.h * 0.6, def.position.z);
    scene.add(this.glow);

    // A fixed pool of workers, revealed as the building gets busier.
    for (let i = 0; i < MAX_WORKERS; i++) {
      const worker = new THREE.Mesh(WORKER_GEOMETRY, emissiveMaterials.worker);
      const angle = (i / MAX_WORKERS) * Math.PI * 2;
      const radius = Math.max(def.footprint.w, def.footprint.d) * 0.62;
      worker.position.set(
        def.position.x + Math.cos(angle) * radius,
        def.position.y + 0.65,
        def.position.z + Math.sin(angle) * radius,
      );
      worker.visible = false;
      worker.castShadow = true;
      scene.add(worker);
      this.workers.push(worker);
    }
  }

  /** Shared pipeline stage sites: is any run being processed here right now. */
  setBusy(busy: boolean): void {
    if (busy === this.busy) return;
    this.busy = busy;
    this.refresh();
  }

  /** Repository factories: how many jobs this building is hosting. */
  setWorkload(runningJobs: number, failing: boolean): void {
    if (runningJobs === this.workload && failing === this.failing) return;
    this.workload = runningJobs;
    this.failing = failing;

    const wanted = Math.min(MAX_WORKERS, runningJobs * 2);
    this.workers.forEach((worker, i) => {
      worker.visible = i < wanted;
    });
    this.refresh();
  }

  private get working(): boolean {
    return this.busy || this.workload > 0;
  }

  private refresh() {
    if (this.working && !this.smoke && this.def.kind === 'build') {
      this.smoke = this.fx.smoke({
        x: this.def.position.x + this.def.footprint.w * 0.3,
        y: this.def.position.y + this.def.footprint.h,
        z: this.def.position.z,
      });
    }
    if (!this.working && this.smoke) {
      this.smoke.destroy();
      this.smoke = undefined;
    }
  }

  /** Called every frame: bobbing workers and a breathing glow, no allocation. */
  update(dt: number, elapsed: number): void {
    this.pulse = this.working ? Math.min(1, this.pulse + dt * 2) : Math.max(0, this.pulse - dt * 2);
    this.glow.intensity = this.pulse * (1.6 + Math.sin(elapsed * 3) * 0.4);

    if (!this.working) return;
    for (let i = 0; i < this.workers.length; i++) {
      const worker = this.workers[i];
      if (!worker.visible) continue;
      worker.position.y = this.def.position.y + 0.65 + Math.abs(Math.sin(elapsed * 4 + i)) * 0.25;
    }
  }

  flashSuccess(): void {
    const top = { x: this.def.position.x, y: this.def.position.y + this.def.footprint.h + 2, z: this.def.position.z };
    this.fx.sparks(top, 0x4ade80, 24);
  }

  flashFailure(): void {
    const top = { x: this.def.position.x, y: this.def.position.y + this.def.footprint.h + 1, z: this.def.position.z };
    this.fx.sparks(top, 0xff9d5c, 22);
    this.fx.dust({ x: this.def.position.x, y: this.def.position.y + 0.5, z: this.def.position.z });
  }

  celebrate(): void {
    this.fx.confetti(
      { x: this.def.position.x, y: this.def.position.y + this.def.footprint.h + 3, z: this.def.position.z },
      60,
    );
  }

  destroy(scene: THREE.Scene): void {
    this.smoke?.destroy();
    this.smoke = undefined;
    scene.remove(this.glow);
    this.glow.dispose();
    for (const worker of this.workers) scene.remove(worker);
    this.workers.length = 0;
  }
}
