import Phaser from 'phaser';
import { PipelineArtifact } from '../entities/PipelineArtifact';
import { PipelineTruck } from '../entities/PipelineTruck';
import { StageBuilding, type StageVisuals } from '../entities/StageBuilding';
import { gameStore } from '../state/gameStore';
import { STAGES, STAGE_BUILDING, type PipelineStage } from '../state/gameState';
import { CameraController } from '../systems/CameraController';
import { createAmbientLife } from '../systems/AmbientLife';
import { PedestrianSystem } from '../systems/PedestrianSystem';
import { PipelineChoreographer } from '../systems/PipelineChoreographer';
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

const STAGE_VISUALS: Record<PipelineStage, StageVisuals> = {
  build: { activity: 'gear', successIcon: 'fx-check', smoke: true },
  test: { activity: 'scan', successIcon: 'fx-check', smoke: false },
  security: { activity: 'scan', successIcon: 'fx-shield', smoke: false },
  package: { activity: 'gear', successIcon: 'fx-check', smoke: true },
  deploy: { activity: 'gear', successIcon: 'fx-check', smoke: false },
};

export class CityScene extends Phaser.Scene {
  static readonly KEY = 'CityScene';

  private camControl!: CameraController;
  private traffic!: TrafficSystem;
  private pedestrians!: PedestrianSystem;
  private choreographer!: PipelineChoreographer;
  private readonly buildings = new Map<BuildingId, StageBuilding>();
  private selectedId: BuildingId | null = null;
  private onSelectionChange!: (id: BuildingId | null) => void;
  private onReady!: (scene: CityScene) => void;

  constructor() {
    super(CityScene.KEY);
  }

  init(data: CitySceneData) {
    this.onSelectionChange = data.onSelectionChange;
    this.onReady = data.onReady;
  }

  create() {
    createTextures(this);
    this.cameras.main.setBackgroundColor('#8ecae6');

    this.createTerrain();
    this.createProps();
    this.createDistrictLabels();
    this.createBuildings();

    const chimneys = PROPS.filter((p) => p.texture === 'p-factory').map((p) => p.tile).slice(0, 3);
    createAmbientLife(this, chimneys);

    this.traffic = new TrafficSystem(this);
    this.pedestrians = new PedestrianSystem(this);

    const truck = new PipelineTruck(this);
    const emergency = new PipelineTruck(this, 'a-firetruck');
    const artifact = new PipelineArtifact(this);

    const center = tileToWorld(CITY_CENTER);
    this.camControl = new CameraController(this, { x: center.x, y: center.y, zoom: 0.62 });
    this.camControl.setWorldBounds(this.worldBounds());
    // The canvas reaches its final size after boot; re-centre once it settles,
    // but never fight a user who already moved the camera.
    const reframe = () => {
      if (!this.camControl.userMoved) this.camControl.reset(false);
    };
    this.scale.once(Phaser.Scale.Events.RESIZE, reframe);
    this.time.delayedCall(60, reframe);

    this.choreographer = new PipelineChoreographer(this, {
      buildings: this.buildings,
      truck,
      emergency,
      artifact,
      traffic: this.traffic,
      pedestrians: this.pedestrians,
      camera: this.camControl,
    });
    this.choreographer.attach();

    // Clicking empty ground clears the selection.
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (this.camControl.wasDragged) return;
      if (this.input.hitTestPointer(pointer).length === 0) this.select(null);
    });

    this.applyState();
    const unsubscribe = gameStore.subscribe(() => this.applyState());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      unsubscribe();
      this.choreographer.destroy();
      this.traffic.destroy();
      this.pedestrians.destroy();
      this.camControl.destroy();
    });

    this.onReady(this);
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
    const stageOf = new Map<BuildingId, PipelineStage>(
      STAGES.map((stage) => [STAGE_BUILDING[stage], stage]),
    );

    for (const def of KEY_BUILDINGS) {
      const stage = stageOf.get(def.id);
      if (!stage) continue;
      const building = new StageBuilding(this, { ...def, interactive: true }, STAGE_VISUALS[stage]);
      building.sprite.on('pointerup', () => {
        if (this.camControl.wasDragged) return;
        this.select(def.id);
      });
      this.buildings.set(def.id, building);
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
  private applyState() {
    const { pipeline } = gameStore.getState();
    for (const stage of STAGES) {
      this.buildings.get(STAGE_BUILDING[stage])?.setStageStatus(pipeline.stages[stage]);
    }
  }

  resetCamera() {
    this.camControl.reset();
  }

  update(time: number, delta: number) {
    this.camControl.update(time, delta);
  }
}
