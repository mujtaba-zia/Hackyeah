import { CameraRig } from './core/CameraRig';
import { Picker } from './core/Picker';
import { ThreeRenderer } from './core/ThreeRenderer';
import { disposeMaterials } from './core/materials';
import type { WorldContext } from './core/context';
import { Effects3D } from './fx/Effects3D';
import { CityEventStage } from './events/CityEventStage';
import { Ambient } from './systems/Ambient';
import { DeliveryFleet } from './systems/DeliveryFleet';
import { PedestrianSystem } from './systems/PedestrianSystem';
import { PRCrowd } from './systems/PRCrowd';
import { TrafficSystem } from './systems/TrafficSystem';
import { buildCity, type CityBuildResult } from './world/CityBuilder';
import { LandmarkView, WORKER_GEOMETRY } from './world/LandmarkView';
import { CITIES, LANDMARKS, type BuildingId, type Vec3 } from './world/cityPlan';
import { gameStore } from '../game/state/gameStore';
import { REPOSITORIES, STAGES, type GameState, type PipelineStage } from '../game/state/gameState';
import type { HoverPayload } from '../game/state/hover';

/** Which Geo landmark hosts each shared pipeline stage. */
const STAGE_SITE: Record<PipelineStage, BuildingId> = {
  build: 'geo-build',
  test: 'geo-test',
  security: 'geo-security',
  package: 'geo-package',
  deploy: 'geo-port',
};

export interface CityWorldCallbacks {
  onSelectionChange: (id: BuildingId | null) => void;
  onHover: (payload: HoverPayload | null) => void;
}

/**
 * Owns the three.js world and is the single path from game state to pixels.
 *
 * Replaces the Phaser CityScene with the same division of labour: the store
 * drives continuous state, the event bus drives one-shot spectacle, and nothing
 * here ever writes back into the simulation.
 */
export class CityWorld {
  private readonly renderer: ThreeRenderer;
  private readonly rig: CameraRig;
  private readonly picker: Picker;
  private readonly fx: Effects3D;
  private readonly city: CityBuildResult;
  private readonly views = new Map<BuildingId, LandmarkView>();
  private readonly traffic: TrafficSystem;
  private readonly pedestrians: PedestrianSystem;
  private readonly crowd: PRCrowd;
  private readonly fleet: DeliveryFleet;
  private readonly ambient: Ambient;
  private readonly stage: CityEventStage;
  private readonly offs: (() => void)[] = [];

  private selected: BuildingId | null = null;
  /** Health driven ambient level, kept apart from temporary event requests. */
  private healthLevel = 1;
  private readonly eventDamping = new Map<string, number>();
  private appliedLevel = 1;

  constructor(parent: HTMLElement, callbacks: CityWorldCallbacks) {
    this.renderer = new ThreeRenderer(parent);
    this.picker = new Picker(this.renderer, parent);
    const ctx: WorldContext = { scene: this.renderer.scene, renderer: this.renderer, picker: this.picker };

    this.city = buildCity(this.renderer.scene);
    this.fx = new Effects3D(ctx);

    for (const def of LANDMARKS) {
      const mesh = this.city.landmarkMeshes.get(def.id);
      if (!mesh) continue;
      this.views.set(def.id, new LandmarkView(def, mesh, this.fx, this.renderer.scene));
      this.picker.register(mesh, { kind: 'factory', buildingId: def.id });
    }

    this.traffic = new TrafficSystem(ctx);
    this.pedestrians = new PedestrianSystem(ctx);
    this.crowd = new PRCrowd(ctx);
    this.fleet = new DeliveryFleet(ctx);
    this.fleet.attach();
    this.ambient = new Ambient(ctx);

    this.stage = new CityEventStage(ctx, {
      fx: this.fx,
      landmarks: this.city.landmarkMeshes,
      damp: (key, level) => this.requestDamping(key, level),
    });
    this.stage.attach();

    const geo = CITIES.find((candidate) => candidate.id === 'geo');
    // Framed on Geo, pulled back far enough that b3d reads across the water.
    const home = geo?.center ?? { x: 0, y: 0, z: 0 };
    this.rig = new CameraRig(this.renderer.camera, parent, {
      target: { x: home.x + 34, y: home.y, z: home.z },
      distance: 235,
    });

    this.offs.push(
      this.picker.onHover(callbacks.onHover),
      this.picker.onClick((payload) => {
        const id = payload && payload.kind === 'factory' ? payload.buildingId : null;
        this.selected = id;
        callbacks.onSelectionChange(id);
      }),
      this.renderer.onFrame((dt, elapsed) => this.frame(dt, elapsed)),
      gameStore.subscribe((state) => this.applyState(state)),
      gameStore.bus.on('RUN_SUCCEEDED', (event) => {
        const run = gameStore.getState().runs.find((candidate) => candidate.id === event.runId);
        if (!run) return;
        this.views.get(STAGE_SITE.deploy)?.celebrate();
        this.factoryFor(run.repoId)?.flashSuccess();
      }),
      gameStore.bus.on('RUN_FAILED', (event) => {
        const run = gameStore.getState().runs.find((candidate) => candidate.id === event.runId);
        this.views.get(STAGE_SITE[event.stage])?.flashFailure();
        if (run) this.factoryFor(run.repoId)?.flashFailure();
      }),
      gameStore.bus.on('SIM_RESET', () => {
        this.fleet.reset();
        this.eventDamping.clear();
        this.applyAmbient();
      }),
    );

    this.applyState(gameStore.getState());
    this.renderer.start();
  }

  private factoryFor(repoId: string): LandmarkView | undefined {
    const repo = REPOSITORIES.find((candidate) => candidate.id === repoId);
    return repo ? this.views.get(repo.factory) : undefined;
  }

  private frame(dt: number, elapsed: number) {
    this.rig.update(dt);
    for (const view of this.views.values()) view.update(dt, elapsed);
  }

  /** Push normalized game state into the world. The only state to world path. */
  private applyState(state: GameState) {
    for (const stage of STAGES) {
      const active = state.runs.some((run) => run.status === 'running' && run.stage === stage);
      this.views.get(STAGE_SITE[stage])?.setBusy(active);
    }

    for (const repo of state.repositories) {
      const runs = state.runs.filter((run) => run.repoId === repo.id);
      const running = runs.filter((run) => run.status === 'running').length;
      const failing = runs.some(
        (run) => run.status === 'failed' && run.endedAtSim !== null && state.sim.time - run.endedAtSim < 30,
      );
      this.views.get(repo.factory)?.setWorkload(running, failing);
    }

    this.crowd.sync(state);

    this.healthLevel = state.cityHealth >= 80 ? 1 : state.cityHealth >= 50 ? 0.75 : 0.5;
    this.applyAmbient();
  }

  /** Ambient level is the quietest of the health level and any live event. */
  private requestDamping(key: string, level: number | null) {
    if (level === null) this.eventDamping.delete(key);
    else this.eventDamping.set(key, level);
    this.applyAmbient();
  }

  private applyAmbient() {
    const level = Math.min(this.healthLevel, ...this.eventDamping.values());
    if (level === this.appliedLevel) return;
    this.appliedLevel = level;
    this.traffic.setActivity(level);
    this.pedestrians.setActivity(level);
  }

  focusOnPoint(point: Vec3): void {
    this.rig.focusOn(point, 70);
  }

  resetCamera(): void {
    this.rig.reset(true);
  }

  get selectedId(): BuildingId | null {
    return this.selected;
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.offs.length = 0;
    this.stage.destroy();
    this.fleet.destroy();
    this.crowd.destroy();
    this.traffic.destroy();
    this.pedestrians.destroy();
    this.ambient.destroy();
    this.fx.destroy();
    for (const view of this.views.values()) view.destroy(this.renderer.scene);
    this.views.clear();
    this.city.dispose();
    WORKER_GEOMETRY.dispose();
    this.rig.destroy();
    this.picker.destroy();
    this.renderer.destroy();
    disposeMaterials();
  }
}
