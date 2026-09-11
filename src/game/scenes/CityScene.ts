import Phaser from 'phaser';
import { Building } from '../entities/Building';
import { BuildFactory } from '../entities/BuildFactory';
import { gameStore } from '../state/gameStore';
import { getPipeline, PRIMARY_PIPELINE_ID } from '../state/gameState';
import { CameraController } from '../systems/CameraController';
import { createAmbientLife } from '../systems/AmbientLife';
import { CITY_CENTER, KEY_BUILDINGS, PROPS, TERRAIN, type BuildingId } from '../world/cityLayout';
import { TILE_H, tileToWorld } from '../world/iso';
import { createTextures } from '../world/textures';

export interface CitySceneData {
  onSelectionChange: (id: BuildingId | null) => void;
  /** Called once the scene is live, so React can issue camera commands. */
  onReady: (scene: CityScene) => void;
}

const TERRAIN_TEXTURE: Record<string, string> = {
  G: 't-grass',
  R: 't-road',
  P: 't-plaza',
  W: 't-water',
};

export class CityScene extends Phaser.Scene {
  static readonly KEY = 'CityScene';

  private camControl!: CameraController;
  private buildings = new Map<BuildingId, Building>();
  private factory!: BuildFactory;
  private selectedId: BuildingId | null = null;
  private onSelectionChange!: (id: BuildingId | null) => void;
  private onReady!: (scene: CityScene) => void;
  private unsubscribe?: () => void;

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
    for (const prop of PROPS) {
      const { x, y } = tileToWorld(prop.tile);
      this.add.image(x, y, prop.texture).setOrigin(0.5, 0.86).setDepth(y);
    }
    const center = tileToWorld(CITY_CENTER);
    this.add.image(center.x, center.y, 'b-citycenter').setOrigin(0.5, 0.82).setDepth(center.y);

    this.createBuildings();
    createAmbientLife(this);

    this.camControl = new CameraController(this, { x: center.x, y: center.y, zoom: 1.3 });
    // The canvas reaches its final size after boot; re-centre once it settles,
    // but never fight a user who already moved the camera.
    const reframe = () => {
      if (!this.camControl.userMoved) this.camControl.reset(false);
    };
    this.scale.once(Phaser.Scale.Events.RESIZE, reframe);
    this.time.delayedCall(60, reframe);

    // Clicking empty ground clears the selection.
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (this.camControl.wasDragged) return;
      const hits = this.input.hitTestPointer(pointer);
      if (hits.length === 0) this.select(null);
    });

    this.applyState();
    this.unsubscribe = gameStore.subscribe(() => this.applyState());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribe?.();
      this.camControl.destroy();
    });
    this.onReady(this);
  }

  private createTerrain() {
    TERRAIN.forEach((row, ty) => {
      [...row].forEach((code, tx) => {
        const { x, y } = tileToWorld({ tx, ty });
        const key = TERRAIN_TEXTURE[code] ?? 't-grass';
        const texture = key === 't-grass' && (tx + ty) % 3 === 0 ? 't-grass2' : key;
        this.add.image(x, y, texture).setDepth(y - TILE_H * 4);
      });
    });
  }

  private createBuildings() {
    for (const def of KEY_BUILDINGS) {
      const options = { ...def, interactive: true };
      const building =
        def.id === 'build-factory' ? new BuildFactory(this, options) : new Building(this, options);
      building.sprite.on('pointerup', () => {
        if (this.camControl.wasDragged) return;
        this.select(def.id);
      });
      this.buildings.set(def.id, building);
      if (building instanceof BuildFactory) this.factory = building;
    }
  }

  private select(id: BuildingId | null) {
    if (id === this.selectedId) return;
    if (this.selectedId) this.buildings.get(this.selectedId)?.setSelected(false);
    this.selectedId = id;
    if (id) this.buildings.get(id)?.setSelected(true);
    this.onSelectionChange(id);
  }

  /** Push normalized game state into the world. The only state->world path. */
  private applyState() {
    this.factory.setStatus(getPipeline(gameStore.getState(), PRIMARY_PIPELINE_ID).status);
  }

  resetCamera() {
    this.camControl.reset();
  }

  update(time: number, delta: number) {
    this.camControl.update(time, delta);
  }
}
