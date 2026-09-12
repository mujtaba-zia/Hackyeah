import Phaser from 'phaser';
import type { Effects } from '../../fx/Effects';
import type { WorkBuilding } from '../../entities/WorkBuilding';
import type { BuildingId } from '../../world/cityLayout';
import type { PedestrianSystem } from '../PedestrianSystem';
import type { TrafficSystem } from '../TrafficSystem';

/**
 * Everything a city event is allowed to touch.
 *
 * Deliberately narrow: the scene, the effect library, the ambient systems and
 * the landmark sprites. No store, no simulation. A tornado can shake a building
 * and spawn debris, but it cannot reach a repository, a run or a pull request.
 */
export interface EventStageContext {
  scene: Phaser.Scene;
  fx: Effects;
  /** Where the event happens, already resolved to world pixels. */
  focus: { x: number; y: number };
  traffic: TrafficSystem;
  pedestrians: PedestrianSystem;
  buildings: Map<BuildingId, WorkBuilding>;
}

/**
 * One visual event. `stop` must return the world to normal even if it is called
 * early, twice, or while animations are mid flight.
 */
export interface EventController {
  start(ctx: EventStageContext): void;
  stop(): void;
}

export type ControllerFactory = () => EventController;

/**
 * Small helper base: tracks the sprites, tweens, timers and effect handles a
 * controller creates so cleanup cannot be forgotten. Every controller extends
 * this, which is what keeps a ten minute soak free of orphaned entities.
 */
export class TrackedController {
  protected ctx!: EventStageContext;
  private objects: Phaser.GameObjects.GameObject[] = [];
  private tweens: Phaser.Tweens.Tween[] = [];
  private timers: Phaser.Time.TimerEvent[] = [];
  private handles: { destroy(): void }[] = [];
  private stopped = false;

  protected track<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.objects.push(object);
    return object;
  }

  protected tween(config: Phaser.Types.Tweens.TweenBuilderConfig): Phaser.Tweens.Tween {
    const tween = this.ctx.scene.tweens.add(config);
    this.tweens.push(tween);
    return tween;
  }

  protected later(ms: number, run: () => void): void {
    this.timers.push(
      this.ctx.scene.time.delayedCall(ms, () => {
        if (!this.stopped) run();
      }),
    );
  }

  protected hold(handle: { destroy(): void }): void {
    this.handles.push(handle);
  }

  protected get running(): boolean {
    return !this.stopped;
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    for (const timer of this.timers) timer.remove(false);
    for (const tween of this.tweens) tween.stop();
    for (const handle of this.handles) handle.destroy();
    for (const object of this.objects) object.destroy();
    this.timers = [];
    this.tweens = [];
    this.handles = [];
    this.objects = [];
  }
}
