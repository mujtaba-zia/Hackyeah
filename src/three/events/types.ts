import type * as THREE from 'three';
import type { BuildingId, Vec3 } from '../../domain/ids';
import type { WorldContext } from '../core/context';
import type { Effects3D, FxHandle } from '../fx/Effects3D';

/** Everything a city event may use, deliberately excluding simulation state. */
export interface EventStageContext extends WorldContext {
  fx: Effects3D;
  focus: Vec3;
  landmarks: Map<BuildingId, THREE.Object3D>;
  /** Events lower ambient activity by key, then release their own request. */
  damp(key: string, level: number | null): void;
}

/** A presentation-only event that can always return the scene to normal. */
export interface EventController {
  start(ctx: EventStageContext): void;
  stop(): void;
}

export type ControllerFactory = () => EventController;

type ObjectCleanup = () => void;

interface TrackedObject {
  object: THREE.Object3D;
  cleanup: ObjectCleanup | null;
}

/**
 * Owns every transient resource created by one event.
 *
 * Timers check the stopped flag after cancellation, which prevents a late timer
 * callback from creating an effect handle after the controller has cleaned up.
 */
export class TrackedController {
  protected ctx!: EventStageContext;

  private objects: TrackedObject[] = [];
  private timers = new Set<() => void>();
  private frames = new Set<() => void>();
  private handles: FxHandle[] = [];
  private stopped = false;

  /** Track a scene object and optional resources owned exclusively by it. */
  protected track<T extends THREE.Object3D>(object: T, cleanup: ObjectCleanup | null = null): T {
    if (this.stopped) {
      cleanup?.();
      object.removeFromParent();
      return object;
    }
    this.objects.push({ object, cleanup });
    return object;
  }

  /** Release an object early so recurring events do not retain old shells. */
  protected releaseObject(object: THREE.Object3D): void {
    const index = this.objects.findIndex((entry) => entry.object === object);
    if (index >= 0) {
      const [entry] = this.objects.splice(index, 1);
      entry.cleanup?.();
    }
    object.removeFromParent();
  }

  /** Register a renderer callback that is removed on stop. Return false to end it. */
  protected frame(run: (dtSeconds: number, elapsed: number) => boolean | void): void {
    let unsubscribe: (() => void) | null = null;
    const release = this.ctx.renderer.onFrame((dtSeconds, elapsed) => {
      if (this.stopped) return;
      if (run(dtSeconds, elapsed) === false && unsubscribe) {
        unsubscribe();
        this.frames.delete(unsubscribe);
      }
    });
    unsubscribe = release;
    if (this.stopped) {
      release();
      return;
    }
    this.frames.add(release);
  }

  /** Schedule visual work that cannot outlive this controller. */
  protected later(ms: number, run: () => void): void {
    let cancel: (() => void) | null = null;
    const timer = globalThis.setTimeout(() => {
      if (cancel) this.timers.delete(cancel);
      if (!this.stopped) run();
    }, ms);
    cancel = () => globalThis.clearTimeout(timer);
    if (this.stopped) {
      cancel();
      return;
    }
    this.timers.add(cancel);
  }

  /** Hold an effect until it is explicitly released or the event stops. */
  protected hold(handle: FxHandle): FxHandle {
    if (this.stopped) {
      handle.destroy();
      return handle;
    }
    this.handles.push(handle);
    return handle;
  }

  /** Dispose a short-lived effect before the event itself ends. */
  protected releaseHandle(handle: FxHandle): void {
    const index = this.handles.indexOf(handle);
    if (index >= 0) this.handles.splice(index, 1);
    handle.destroy();
  }

  protected get running(): boolean {
    return !this.stopped;
  }

  /** Remove every timer, frame callback, effect and presentation object once. */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;

    for (const cancel of this.timers) cancel();
    for (const unsubscribe of this.frames) unsubscribe();
    for (const handle of this.handles) handle.destroy();
    for (const entry of this.objects) {
      entry.cleanup?.();
      entry.object.removeFromParent();
    }

    this.timers.clear();
    this.frames.clear();
    this.handles = [];
    this.objects = [];
  }
}
