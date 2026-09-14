import * as THREE from 'three';
import type { BuildingId } from '../../domain/ids';
import type { RepoId } from '../../game/state/gameState';
import type { HoverPayload } from '../../game/state/hover';
import type { ThreeRenderer } from './ThreeRenderer';

const PICK_INTERVAL_MS = 120;
const DRAG_THRESHOLD_SQUARED = 36;

type HoverCallback = (payload: HoverPayload | null) => void;
type ClickCallback = (payload: PickPayload | null) => void;

export type PickPayload =
  | { kind: 'factory'; buildingId: BuildingId }
  | { kind: 'pr'; prId: string }
  | { kind: 'pr-group'; repoId: RepoId; prIds: string[] };

/** Raycasts only on pointer activity, keeping the city frame loop allocation-free. */
export class Picker {
  private readonly renderer: ThreeRenderer;
  private readonly dom: HTMLElement;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly objects: THREE.Object3D[] = [];
  private readonly payloadByObject = new Map<THREE.Object3D, PickPayload>();
  private readonly hoverCallbacks = new Map<number, HoverCallback>();
  private readonly clickCallbacks = new Map<number, ClickCallback>();
  private readonly invokeHover = (callback: HoverCallback): void => {
    callback(this.pendingHover);
  };
  private readonly invokeClick = (callback: ClickCallback): void => {
    callback(this.pendingClick);
  };
  private readonly onPointerMove = (event: PointerEvent): void => {
    this.updatePointer(event);
    if (!this.pointerInside) {
      this.cancelScheduledPick();
      this.emitHover(null);
      return;
    }

    if (event.pointerId === this.pressedPointerId) {
      const deltaX = event.clientX - this.pressX;
      const deltaY = event.clientY - this.pressY;
      this.dragDistanceSquared = Math.max(this.dragDistanceSquared, deltaX * deltaX + deltaY * deltaY);
      if (this.dragDistanceSquared > DRAG_THRESHOLD_SQUARED) {
        this.cancelScheduledPick();
        return;
      }
    }
    this.schedulePick();
  };
  private readonly onPointerLeave = (): void => {
    this.pointerInside = false;
    this.pointerValid = false;
    this.cancelScheduledPick();
    this.emitHover(null);
  };
  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    this.updatePointer(event);
    this.pressedPointerId = event.pointerId;
    this.pressX = event.clientX;
    this.pressY = event.clientY;
    this.dragDistanceSquared = 0;
  };
  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.pressedPointerId) return;
    const wasDragged = this.dragDistanceSquared > DRAG_THRESHOLD_SQUARED;
    this.pressedPointerId = null;
    this.dragDistanceSquared = 0;
    this.updatePointer(event);
    if (wasDragged || !this.pointerInside) return;

    this.pendingClick = this.pickAtPointer();
    this.clickCallbacks.forEach(this.invokeClick);
  };
  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (event.pointerId !== this.pressedPointerId) return;
    this.pressedPointerId = null;
    this.dragDistanceSquared = 0;
  };
  private readonly runScheduledPick = (): void => {
    this.hoverTimer = null;
    if (this.destroyed || !this.pointerInside) return;
    if (this.pressedPointerId !== null && this.dragDistanceSquared > DRAG_THRESHOLD_SQUARED) return;
    this.pickAtPointer();
  };

  private nextCallbackId = 1;
  private pointerX = 0;
  private pointerY = 0;
  private pointerInside = false;
  private pointerValid = false;
  private pressedPointerId: number | null = null;
  private pressX = 0;
  private pressY = 0;
  private dragDistanceSquared = 0;
  private lastRaycastAt = -Infinity;
  private hoverTimer: number | null = null;
  private hoveredPayload: PickPayload | null = null;
  private pendingHover: HoverPayload | null = null;
  private pendingClick: PickPayload | null = null;
  private destroyed = false;

  constructor(renderer: ThreeRenderer, dom: HTMLElement) {
    this.renderer = renderer;
    this.dom = dom;
    this.dom.addEventListener('pointermove', this.onPointerMove);
    this.dom.addEventListener('pointerleave', this.onPointerLeave);
    this.dom.addEventListener('pointerdown', this.onPointerDown);
    this.dom.addEventListener('pointerup', this.onPointerUp);
    this.dom.addEventListener('pointercancel', this.onPointerCancel);
  }

  /** Objects registered here become hoverable and clickable. */
  register(object: THREE.Object3D, payload: PickPayload): void {
    if (this.destroyed) return;
    if (!this.payloadByObject.has(object)) this.objects.push(object);
    this.payloadByObject.set(object, payload);
  }

  unregister(object: THREE.Object3D): void {
    const payload = this.payloadByObject.get(object);
    if (!this.payloadByObject.delete(object)) return;

    const index = this.objects.indexOf(object);
    const lastIndex = this.objects.length - 1;
    if (index !== -1) {
      if (index !== lastIndex) this.objects[index] = this.objects[lastIndex];
      this.objects.pop();
    }
    if (payload === this.hoveredPayload) this.emitHover(null);
  }

  onHover(fn: HoverCallback): () => void {
    if (this.destroyed) return () => undefined;
    const id = this.nextCallbackId;
    this.nextCallbackId += 1;
    this.hoverCallbacks.set(id, fn);
    return () => {
      this.hoverCallbacks.delete(id);
    };
  }

  onClick(fn: ClickCallback): () => void {
    if (this.destroyed) return () => undefined;
    const id = this.nextCallbackId;
    this.nextCallbackId += 1;
    this.clickCallbacks.set(id, fn);
    return () => {
      this.clickCallbacks.delete(id);
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.cancelScheduledPick();
    this.dom.removeEventListener('pointermove', this.onPointerMove);
    this.dom.removeEventListener('pointerleave', this.onPointerLeave);
    this.dom.removeEventListener('pointerdown', this.onPointerDown);
    this.dom.removeEventListener('pointerup', this.onPointerUp);
    this.dom.removeEventListener('pointercancel', this.onPointerCancel);
    this.objects.length = 0;
    this.payloadByObject.clear();
    this.hoverCallbacks.clear();
    this.clickCallbacks.clear();
    this.hoveredPayload = null;
    this.pendingHover = null;
    this.pendingClick = null;
  }

  private updatePointer(event: PointerEvent): void {
    const rect = this.dom.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    if (width <= 0 || height <= 0) {
      this.pointerInside = false;
      this.pointerValid = false;
      return;
    }

    this.pointerX = event.clientX - rect.left;
    this.pointerY = event.clientY - rect.top;
    this.pointerInside = this.pointerX >= 0
      && this.pointerX <= width
      && this.pointerY >= 0
      && this.pointerY <= height;
    this.pointerValid = this.pointerInside;
    if (!this.pointerValid) return;
    this.pointer.set(
      (this.pointerX / width) * 2 - 1,
      -(this.pointerY / height) * 2 + 1,
    );
  }

  private schedulePick(): void {
    const now = performance.now();
    const remaining = PICK_INTERVAL_MS - (now - this.lastRaycastAt);
    if (remaining <= 0) {
      this.cancelScheduledPick();
      this.pickAtPointer();
      return;
    }
    if (this.hoverTimer === null) this.hoverTimer = window.setTimeout(this.runScheduledPick, remaining);
  }

  private cancelScheduledPick(): void {
    if (this.hoverTimer === null) return;
    window.clearTimeout(this.hoverTimer);
    this.hoverTimer = null;
  }

  private pickAtPointer(): PickPayload | null {
    if (!this.pointerValid || this.objects.length === 0) {
      this.emitHover(null);
      return null;
    }

    this.lastRaycastAt = performance.now();
    this.renderer.scene.updateMatrixWorld();
    this.renderer.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(this.pointer, this.renderer.camera);
    const intersections = this.raycaster.intersectObjects(this.objects, true);
    let payload: PickPayload | null = null;
    for (let index = 0; index < intersections.length; index += 1) {
      let object: THREE.Object3D | null = intersections[index].object;
      while (object) {
        const registered = this.payloadByObject.get(object);
        if (registered) {
          payload = registered;
          break;
        }
        object = object.parent;
      }
      if (payload) break;
    }
    this.emitHover(payload);
    return payload;
  }

  private emitHover(payload: PickPayload | null): void {
    if (payload === this.hoveredPayload) return;
    this.hoveredPayload = payload;
    this.pendingHover = payload === null ? null : this.toHoverPayload(payload);
    this.hoverCallbacks.forEach(this.invokeHover);
  }

  private toHoverPayload(payload: PickPayload): HoverPayload {
    switch (payload.kind) {
      case 'factory':
        return {
          kind: 'factory',
          buildingId: payload.buildingId,
          x: this.pointerX,
          y: this.pointerY,
        };
      case 'pr':
        return {
          kind: 'pr',
          prId: payload.prId,
          x: this.pointerX,
          y: this.pointerY,
        };
      case 'pr-group':
        return {
          kind: 'pr-group',
          repoId: payload.repoId,
          prIds: payload.prIds,
          x: this.pointerX,
          y: this.pointerY,
        };
    }
  }
}
