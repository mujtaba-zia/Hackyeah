import type * as THREE from 'three';
import type { BuildingId, Vec3 } from '../../domain/ids';
import { gameStore } from '../../game/state/gameStore';
import type { ActiveCityEvent, CityEventId } from '../../game/state/gameState';
import type { WorldContext } from '../core/context';
import type { Effects3D } from '../fx/Effects3D';
import { CITIES } from '../world/cityPlan';
import { disposeEventVisuals, EVENT_CONTROLLERS } from './controllers';
import type { EventController, EventStageContext } from './types';

export interface CityEventStageDeps {
  fx: Effects3D;
  landmarks: Map<BuildingId, THREE.Object3D>;
  /** Scene owned ambient damping, combined with the health driven level. */
  damp(key: string, level: number | null): void;
}

/**
 * Runs the visible half of a city event.
 *
 * The director decides what happens and the store records it; this class owns
 * the meshes and effects, and guarantees they disappear when the event ends,
 * when the simulation resets, or when the world is torn down.
 */
export class CityEventStage {
  private readonly ctx: WorldContext;
  private readonly deps: CityEventStageDeps;
  private readonly running = new Map<CityEventId, EventController>();
  /** Focus points of live events, newest last, so a marker can retarget. */
  private readonly focusOf = new Map<CityEventId, Vec3 | null>();
  private offs: (() => void)[] = [];
  private destroyed = false;

  constructor(ctx: WorldContext, deps: CityEventStageDeps) {
    this.ctx = ctx;
    this.deps = deps;
  }

  attach(): void {
    this.offs.push(
      gameStore.bus.on('CITY_EVENT_STARTED', (event) => this.begin(event.event)),
      gameStore.bus.on('CITY_EVENT_ENDED', (event) => this.finish(event.eventId)),
      gameStore.bus.on('SIM_RESET', () => this.stopAll()),
    );
  }

  get activeCount(): number {
    return this.running.size;
  }

  /** Newest live event location, for the View Event affordance. */
  get markerTarget(): Vec3 | null {
    let target: Vec3 | null = null;
    for (const focus of this.focusOf.values()) {
      if (focus) target = focus;
    }
    return target;
  }

  private begin(event: ActiveCityEvent) {
    this.finish(event.id);
    const factory = EVENT_CONTROLLERS[event.id];
    if (!factory) return;

    const geo = CITIES.find((city) => city.id === 'geo');
    const focus = event.focus ?? geo?.center ?? { x: 0, y: 0, z: 0 };
    const stageContext: EventStageContext = {
      scene: this.ctx.scene,
      renderer: this.ctx.renderer,
      picker: this.ctx.picker,
      fx: this.deps.fx,
      focus,
      landmarks: this.deps.landmarks,
      damp: this.deps.damp,
    };

    const controller = factory();
    controller.start(stageContext);
    this.running.set(event.id, controller);
    this.focusOf.set(event.id, event.focus);
  }

  private finish(id: CityEventId) {
    const controller = this.running.get(id);
    if (!controller) return;
    controller.stop();
    this.running.delete(id);
    this.focusOf.delete(id);
  }

  private stopAll() {
    for (const controller of this.running.values()) controller.stop();
    this.running.clear();
    this.focusOf.clear();
  }

  /** Safe to call twice: React cleanup can double fire. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const off of this.offs) off();
    this.offs = [];
    this.stopAll();
    disposeEventVisuals();
  }
}
