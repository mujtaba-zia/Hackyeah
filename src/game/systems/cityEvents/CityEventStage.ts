import Phaser from 'phaser';
import { Effects } from '../../fx/Effects';
import type { WorkBuilding } from '../../entities/WorkBuilding';
import { gameStore } from '../../state/gameStore';
import type { ActiveCityEvent, CityEventId } from '../../state/gameState';
import type { BuildingId } from '../../world/cityLayout';
import { CITY_CENTER } from '../../world/cityLayout';
import { tileToWorld } from '../../world/iso';
import type { PedestrianSystem } from '../PedestrianSystem';
import type { TrafficSystem } from '../TrafficSystem';
import {
  BlackoutController,
  FactoryFireController,
  MeteorController,
  TornadoController,
  TrafficJamController,
  UfoController,
} from './disasters';
import {
  BugInvasionController,
  ConstructionController,
  FireworksController,
  ParadeController,
  PrProtestController,
  RainbowController,
  RepairCrewController,
} from './cityLife';
import type { ControllerFactory, EventController, EventStageContext } from './types';

const CONTROLLERS: Record<CityEventId, ControllerFactory> = {
  tornado: () => new TornadoController(),
  ufo: () => new UfoController(),
  meteor: () => new MeteorController(),
  'factory-fire': () => new FactoryFireController(),
  blackout: () => new BlackoutController(),
  'traffic-jam': () => new TrafficJamController(),
  'bug-invasion': () => new BugInvasionController(),
  'pr-protest': () => new PrProtestController(),
  'deployment-parade': () => new ParadeController(),
  fireworks: () => new FireworksController(),
  rainbow: () => new RainbowController(),
  'repair-crew': () => new RepairCrewController(),
  'construction-boom': () => new ConstructionController(),
};

export interface CityEventStageDeps {
  traffic: TrafficSystem;
  pedestrians: PedestrianSystem;
  buildings: Map<BuildingId, WorkBuilding>;
}

/**
 * Runs the visible half of a city event.
 *
 * The director decides what happens and the store records it; this class owns
 * the sprites and particles, and guarantees they disappear when the event ends,
 * when the simulation resets, or when the scene shuts down.
 */
export class CityEventStage {
  private readonly scene: Phaser.Scene;
  private readonly fx: Effects;
  private readonly deps: CityEventStageDeps;
  private readonly running = new Map<CityEventId, EventController>();
  private marker?: Phaser.GameObjects.Container;
  private markerTarget: { x: number; y: number } | null = null;
  private unsubscribes: (() => void)[] = [];
  private arrow?: Phaser.GameObjects.Triangle;

  constructor(scene: Phaser.Scene, deps: CityEventStageDeps) {
    this.scene = scene;
    this.fx = new Effects(scene);
    this.deps = deps;
  }

  attach(): void {
    this.unsubscribes.push(
      gameStore.bus.on('CITY_EVENT_STARTED', (event) => this.begin(event.event)),
      gameStore.bus.on('CITY_EVENT_ENDED', (event) => this.finish(event.eventId)),
      gameStore.bus.on('SIM_RESET', () => this.stopAll()),
    );
    this.createMarker();
  }

  /** Number of live controllers, used by the soak checks. */
  get activeCount(): number {
    return this.running.size;
  }

  private begin(event: ActiveCityEvent) {
    this.finish(event.id);
    const factory = CONTROLLERS[event.id];
    if (!factory) return;

    const focus = event.focus ?? tileToWorld(CITY_CENTER);
    const ctx: EventStageContext = {
      scene: this.scene,
      fx: this.fx,
      focus,
      traffic: this.deps.traffic,
      pedestrians: this.deps.pedestrians,
      buildings: this.deps.buildings,
    };
    const controller = factory();
    controller.start(ctx);
    this.running.set(event.id, controller);
    this.markerTarget = event.focus;
  }

  private finish(id: CityEventId) {
    const controller = this.running.get(id);
    if (!controller) return;
    controller.stop();
    this.running.delete(id);
    if (this.running.size === 0) this.markerTarget = null;
  }

  private stopAll() {
    for (const controller of this.running.values()) controller.stop();
    this.running.clear();
    this.fx.destroy();
    this.markerTarget = null;
  }

  /** An arrow pinned to the screen edge pointing at the current event. */
  private createMarker() {
    this.arrow = this.scene.add.triangle(0, 0, 0, -12, 14, 10, -14, 10, 0xe4573d).setOrigin(0.5);
    const halo = this.scene.add.circle(0, 0, 18, 0xffffff, 0.85);
    this.marker = this.scene.add
      .container(0, 0, [halo, this.arrow])
      .setDepth(3_000_000)
      .setScrollFactor(0)
      .setVisible(false);
  }

  /** Called from the scene update loop, one object, negligible cost. */
  update(): void {
    if (!this.marker) return;
    const target = this.markerTarget;
    if (!target) {
      this.marker.setVisible(false);
      return;
    }

    const camera = this.scene.cameras.main;
    const view = camera.worldView;
    if (view.contains(target.x, target.y)) {
      this.marker.setVisible(false);
      return;
    }

    const screenX = (target.x - view.x) * camera.zoom;
    const screenY = (target.y - view.y) * camera.zoom;
    const margin = 42;
    const clampedX = Phaser.Math.Clamp(screenX, margin, camera.width - margin);
    const clampedY = Phaser.Math.Clamp(screenY, margin, camera.height - margin);
    const angle = Math.atan2(screenY - camera.height / 2, screenX - camera.width / 2);
    this.marker.setVisible(true).setPosition(clampedX, clampedY);
    this.arrow?.setAngle(Phaser.Math.RadToDeg(angle) + 90);
  }

  destroy(): void {
    for (const unsubscribe of this.unsubscribes) unsubscribe();
    this.unsubscribes = [];
    this.stopAll();
    this.marker?.destroy();
    this.marker = undefined;
  }
}
