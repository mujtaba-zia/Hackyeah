import Phaser from 'phaser';
import { WorkBuilding, type WorkVisuals } from '../entities/WorkBuilding';
import { gameStore } from '../state/gameStore';
import { REPOSITORIES, STAGES, type GameState, type PipelineStage } from '../state/gameState';
import type { HoverPayload } from '../state/hover';
import { CameraController } from '../systems/CameraController';
import { createAmbientLife } from '../systems/AmbientLife';
import { DeliveryFleet } from '../systems/DeliveryFleet';
import { PedestrianSystem } from '../systems/PedestrianSystem';
import { PRCrowd } from '../systems/PRCrowd';
import { CityEventStage } from '../systems/cityEvents/CityEventStage';
import { TrafficSystem } from '../systems/TrafficSystem';
import {
  CITY_CENTER,
  DISTRICTS,
  KEY_BUILDINGS,
  PROPS,
  TERRAIN,
  TERRAIN_H,
  TERRAIN_W,
  type BuildingId,
} from '../world/cityLayout';
import { tileToWorld } from '../world/iso';
import { createTextures } from '../world/textures';

export interface CitySceneData {
  onSelectionChange: (id: BuildingId | null) => void;
  onHover: (payload: HoverPayload | null) => void;
  /** Called once the scene is live, so React can issue camera commands. */
  onReady: (scene: CityScene) => void;
}

const TERRAIN_TEXTURE: Record<string, string> = {
  G: 't-grass',
  R: 't-road',
  S: 't-sidewalk',
  P: 't-plaza',
  W: 't-water',
  K: 't-dock',
  A: 't-asphalt',
};

/** Ground never overlaps, so a single low depth is enough and saves sorting. */
const GROUND_DEPTH = -1_000_000;

/** Which landmark hosts each shared pipeline stage. */
const STAGE_SITE: Record<PipelineStage, BuildingId> = {
  build: 'build-factory',
  test: 'test-lab',
  security: 'security-hub',
  package: 'packaging-station',
  deploy: 'deployment-port',
};

const DEFAULT_VISUALS: WorkVisuals = { activity: 'gear', successIcon: 'fx-check', smoke: false };

const BUILDING_VISUALS: Partial<Record<BuildingId, WorkVisuals>> = {
  'build-factory': { activity: 'gear', successIcon: 'fx-check', smoke: true },
  'packaging-station': { activity: 'gear', successIcon: 'fx-check', smoke: true },
  'frontend-factory': { activity: 'gear', successIcon: 'fx-check', smoke: true },
  'data-factory': { activity: 'scan', successIcon: 'fx-check', smoke: true },
  'infra-factory': { activity: 'gear', successIcon: 'fx-check', smoke: true },
  'test-lab': { activity: 'scan', successIcon: 'fx-check', smoke: false },
  'security-hub': { activity: 'scan', successIcon: 'fx-shield', smoke: false },
};

export class CityScene extends Phaser.Scene {
  static readonly KEY = 'CityScene';

  private camControl!: CameraController;
  private traffic!: TrafficSystem;
  private pedestrians!: PedestrianSystem;
  private fleet!: DeliveryFleet;
  private crowd!: PRCrowd;
  private eventStage!: CityEventStage;
  private readonly buildings = new Map<BuildingId, WorkBuilding>();
  private selectedId: BuildingId | null = null;
  private onSelectionChange!: (id: BuildingId | null) => void;
  private onHover!: (payload: HoverPayload | null) => void;
  private onReady!: (scene: CityScene) => void;
  /** Last applied ambient level, so health changes do not restart tweens. */
  private ambientLevel = 1;

  constructor() {
    super(CityScene.KEY);
  }

  init(data: CitySceneData) {
    this.onSelectionChange = data.onSelectionChange;
    this.onHover = data.onHover;
    this.onReady = data.onReady;
  }

  create() {
    createTextures(this);
    this.cameras.main.setBackgroundColor('#8ecae6');

    this.createTerrain();
    this.createProps();
    this.createDistrictLabels();
    this.createBuildings();

    const chimneys = PROPS.filter((p) => p.texture === 'p-factory')
      .map((p) => p.tile)
      .slice(0, 3);
    createAmbientLife(this, chimneys);

    this.traffic = new TrafficSystem(this);
    this.pedestrians = new PedestrianSystem(this);
    this.fleet = new DeliveryFleet(this);
    this.fleet.attach();
    this.crowd = new PRCrowd(this, this.onHover);
    this.eventStage = new CityEventStage(this, {
      traffic: this.traffic,
      pedestrians: this.pedestrians,
      buildings: this.buildings,
    });
    this.eventStage.attach();

    const center = tileToWorld(CITY_CENTER);
    this.camControl = new CameraController(this, { x: center.x, y: center.y, zoom: 0.62 });
    this.camControl.setWorldBounds(this.worldBounds());
    const reframe = () => {
      if (!this.camControl.userMoved) this.camControl.reset(false);
    };
    this.scale.once(Phaser.Scale.Events.RESIZE, reframe);
    this.time.delayedCall(60, reframe);

    // Clicking empty ground clears the selection.
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (this.camControl.wasDragged) return;
      if (this.input.hitTestPointer(pointer).length === 0) this.select(null);
    });

    this.attachSpectacle();
    this.applyState(gameStore.getState());
    const unsubscribe = gameStore.subscribe((state) => this.applyState(state));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      unsubscribe();
      this.eventStage.destroy();
      this.fleet.destroy();
      this.crowd.destroy();
      this.traffic.destroy();
      this.pedestrians.destroy();
      this.camControl.destroy();
    });

    this.onReady(this);
  }

  /** One-shot reactions to domain events, kept apart from the state sync. */
  private attachSpectacle() {
    gameStore.bus.on('RUN_SUCCEEDED', (event) => {
      const run = gameStore.getState().runs.find((candidate) => candidate.id === event.runId);
      if (!run) return;
      this.buildings.get(STAGE_SITE.deploy)?.burstConfetti();
      this.factoryFor(run.repoId)?.flashSuccess();
    });

    gameStore.bus.on('RUN_FAILED', (event) => {
      const run = gameStore.getState().runs.find((candidate) => candidate.id === event.runId);
      this.buildings.get(STAGE_SITE[event.stage])?.flashFailure();
      if (run) this.factoryFor(run.repoId)?.flashFailure();
    });

    gameStore.bus.on('SIM_RESET', () => this.fleet.reset());
  }

  private factoryFor(repoId: string): WorkBuilding | undefined {
    const repo = REPOSITORIES.find((candidate) => candidate.id === repoId);
    return repo ? this.buildings.get(repo.factory) : undefined;
  }

  /** World rectangle covering the whole grid plus sky margin for the clouds. */
  private worldBounds(): Phaser.Geom.Rectangle {
    const west = tileToWorld({ tx: 0, ty: TERRAIN_H });
    const east = tileToWorld({ tx: TERRAIN_W, ty: 0 });
    const north = tileToWorld({ tx: 0, ty: 0 });
    const south = tileToWorld({ tx: TERRAIN_W, ty: TERRAIN_H });
    const margin = 400;
    return new Phaser.Geom.Rectangle(
      west.x - margin,
      north.y - margin,
      east.x - west.x + margin * 2,
      south.y - north.y + margin * 2,
    );
  }

  private createTerrain() {
    TERRAIN.forEach((row, ty) => {
      [...row].forEach((code, tx) => {
        const { x, y } = tileToWorld({ tx, ty });
        const key = TERRAIN_TEXTURE[code] ?? 't-grass';
        const texture = key === 't-grass' && (tx * 7 + ty * 3) % 5 === 0 ? 't-grass2' : key;
        this.add.image(x, y, texture).setDepth(GROUND_DEPTH);
      });
    });
  }

  private createProps() {
    for (const prop of PROPS) {
      const { x, y } = tileToWorld(prop.tile);
      const image = this.add.image(x, y, prop.texture).setDepth(y);
      if (prop.scale) image.setScale(prop.scale);
      if (prop.flipX) image.setFlipX(true);
    }
  }

  private createDistrictLabels() {
    for (const district of DISTRICTS) {
      const { x, y } = tileToWorld(district.tile);
      this.add
        .text(x, y, district.name.toUpperCase(), {
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: '22px',
          color: '#123047',
        })
        .setOrigin(0.5)
        .setAlpha(0.38)
        .setDepth(GROUND_DEPTH + 1);
    }
  }

  private createBuildings() {
    for (const def of KEY_BUILDINGS) {
      const visuals = BUILDING_VISUALS[def.id] ?? DEFAULT_VISUALS;
      const building = new WorkBuilding(this, { ...def, interactive: true }, visuals);
      this.buildings.set(def.id, building);

      building.sprite.on('pointerup', () => {
        if (this.camControl.wasDragged) return;
        this.select(def.id);
      });
      // Hover first, click second: the tooltip carries the live detail.
      building.sprite.on('pointerover', (pointer: Phaser.Input.Pointer) => {
        this.onHover({ kind: 'factory', buildingId: def.id, x: pointer.x, y: pointer.y });
      });
      building.sprite.on('pointerout', () => this.onHover(null));
    }
  }

  private select(id: BuildingId | null) {
    if (id === this.selectedId) return;
    if (this.selectedId) this.buildings.get(this.selectedId)?.setSelected(false);
    this.selectedId = id;
    if (id) this.buildings.get(id)?.setSelected(true);
    this.onSelectionChange(id);
  }

  /** Push normalized game state into the world. The only state to world path. */
  private applyState(state: GameState) {
    for (const stage of STAGES) {
      const active = state.runs.some((run) => run.status === 'running' && run.stage === stage);
      this.buildings.get(STAGE_SITE[stage])?.setBusy(active);
    }

    for (const repo of state.repositories) {
      const runs = state.runs.filter((run) => run.repoId === repo.id);
      const running = runs.filter((run) => run.status === 'running').length;
      const failing = runs.some((run) => run.status === 'failed' && isRecent(run.endedAtSim, state));
      this.buildings.get(repo.factory)?.setWorkload(running, failing);
    }

    this.crowd.sync(state);

    // City health quietly damps the streets rather than staging a disaster.
    const level = state.cityHealth >= 80 ? 1 : state.cityHealth >= 50 ? 0.75 : 0.5;
    if (level !== this.ambientLevel) {
      this.ambientLevel = level;
      this.traffic.setActivity(level);
      this.pedestrians.setActivity(level);
    }
  }

  resetCamera() {
    this.camControl.reset();
  }

  /** Smoothly look at a city event without stealing control: a drag interrupts. */
  focusOnPoint(x: number, y: number) {
    this.camControl.focusOn(x, y, 0.95);
  }

  update(time: number, delta: number) {
    this.camControl.update(time, delta);
    this.eventStage.update();
  }
}

/** A failure keeps the factory smoking for 30 simulated minutes. */
function isRecent(endedAtSim: number | null, state: GameState): boolean {
  return endedAtSim !== null && state.sim.time - endedAtSim < 30;
}
