import * as THREE from 'three';
import type { Vec3 } from '../../domain/ids';
import { CITIES } from '../world/cityPlan';

const MIN_DISTANCE = 18;
// Both cities together span roughly 200 metres, so pulling back much further
// than this just frames empty ground.
const MAX_DISTANCE = 300;
const MIN_POLAR = 0.42;
// Roughly 58 degrees from vertical. Any lower and the camera looks along the
// ground, so the sky swallows the view when zoomed out.
const MAX_POLAR = 1.02;
const MIN_CAMERA_HEIGHT = 1.5;
const DRAG_THRESHOLD_SQUARED = 36;
const ORBIT_RADIANS_PER_PIXEL = 0.008;
const KEY_PAN_SPEED = 30;
const SCRIPTED_MOVE_SECONDS = 0.65;
const FOLLOW_SMOOTHNESS = 7;
const WORLD_PADDING = 22;

const PAN_KEYS: Record<string, true> = {
  KeyW: true,
  KeyA: true,
  KeyS: true,
  KeyD: true,
  ArrowUp: true,
  ArrowDown: true,
  ArrowLeft: true,
  ArrowRight: true,
};

let worldMinX = Infinity;
let worldMaxX = -Infinity;
let worldMinZ = Infinity;
let worldMaxZ = -Infinity;
for (const city of CITIES) {
  worldMinX = Math.min(worldMinX, city.center.x - city.radius);
  worldMaxX = Math.max(worldMaxX, city.center.x + city.radius);
  worldMinZ = Math.min(worldMinZ, city.center.z - city.radius);
  worldMaxZ = Math.max(worldMaxZ, city.center.z + city.radius);
}
const MIN_TARGET_X = worldMinX - WORLD_PADDING;
const MAX_TARGET_X = worldMaxX + WORLD_PADDING;
const MIN_TARGET_Z = worldMinZ - WORLD_PADDING;
const MAX_TARGET_Z = worldMaxZ + WORLD_PADDING;

type DragMode = 'orbit' | 'pan' | null;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return value === Infinity ? max : min;
  return Math.min(max, Math.max(min, value));
}

function wrapAngle(angle: number): number {
  const fullTurn = Math.PI * 2;
  return ((angle + Math.PI) % fullTurn + fullTurn) % fullTurn - Math.PI;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.matches('input, textarea, select');
}

/** Desktop orbit controls that keep the camera above the authored two-city world. */
export class CameraRig {
  /** True once the user drags, wheels or uses the keys, so scripted moves yield. */
  get userMoved(): boolean {
    return this.userMovedValue;
  }

  private readonly camera: THREE.PerspectiveCamera;
  private readonly dom: HTMLElement;
  private readonly homeTargetX: number;
  private readonly homeTargetY: number;
  private readonly homeTargetZ: number;
  private readonly homeDistance: number;
  private readonly homeAzimuth = -0.68;
  private readonly homePolar = 0.82;
  private readonly lookTarget = new THREE.Vector3();
  private readonly keysDown = new Set<string>();
  private readonly onPointerDown = (event: PointerEvent): void => {
    if (this.destroyed || this.activePointerId !== null) return;

    const isLeftButton = event.button === 0;
    const isPanGesture = event.button === 2 || (isLeftButton && event.shiftKey);
    if (!isLeftButton && !isPanGesture) return;

    this.activePointerId = event.pointerId;
    this.dragMode = isPanGesture ? 'pan' : 'orbit';
    this.dragOriginX = event.clientX;
    this.dragOriginY = event.clientY;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
    this.dragDistanceSquared = 0;
    try {
      this.dom.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointer events cannot always be captured.
    }
    event.preventDefault();
  };
  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId || this.dragMode === null) return;

    const totalX = event.clientX - this.dragOriginX;
    const totalY = event.clientY - this.dragOriginY;
    this.dragDistanceSquared = Math.max(this.dragDistanceSquared, totalX * totalX + totalY * totalY);
    if (this.dragDistanceSquared <= DRAG_THRESHOLD_SQUARED) return;

    this.takeUserControl();
    const deltaX = event.clientX - this.lastPointerX;
    const deltaY = event.clientY - this.lastPointerY;
    if (this.dragMode === 'orbit') {
      this.azimuth = wrapAngle(this.azimuth - deltaX * ORBIT_RADIANS_PER_PIXEL);
      this.polar = clamp(this.polar - deltaY * ORBIT_RADIANS_PER_PIXEL, MIN_POLAR, MAX_POLAR);
    } else {
      this.panByDrag(deltaX, deltaY);
    }
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
    this.applyCamera();
    event.preventDefault();
  };
  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) return;
    this.releasePointer(event.pointerId);
  };
  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) return;
    this.releasePointer(event.pointerId);
  };
  private readonly onWheel = (event: WheelEvent): void => {
    if (this.destroyed) return;
    this.takeUserControl();
    const wheelFactor = Math.exp(clamp(event.deltaY * 0.0015, -1, 1));
    this.distance = clamp(this.distance * wheelFactor, MIN_DISTANCE, MAX_DISTANCE);
    this.applyCamera();
    event.preventDefault();
  };
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!PAN_KEYS[event.code] || isEditableTarget(event.target)) return;
    this.keysDown.add(event.code);
    this.takeUserControl();
    event.preventDefault();
  };
  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (!PAN_KEYS[event.code]) return;
    this.keysDown.delete(event.code);
  };
  private readonly onWindowBlur = (): void => {
    this.keysDown.clear();
    if (this.activePointerId !== null) this.releasePointer(this.activePointerId);
  };
  private readonly onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  private targetX: number;
  private targetY: number;
  private targetZ: number;
  private distance: number;
  private azimuth = this.homeAzimuth;
  private polar = this.homePolar;
  private dragMode: DragMode = null;
  private activePointerId: number | null = null;
  private dragOriginX = 0;
  private dragOriginY = 0;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private dragDistanceSquared = 0;
  private followPoint: (() => Vec3 | null) | null = null;
  private scriptedMove = false;
  private scriptedElapsed = 0;
  private scriptedFromX = 0;
  private scriptedFromY = 0;
  private scriptedFromZ = 0;
  private scriptedFromDistance = 0;
  private scriptedFromAzimuth = 0;
  private scriptedFromPolar = 0;
  private scriptedToX = 0;
  private scriptedToY = 0;
  private scriptedToZ = 0;
  private scriptedToDistance = 0;
  private scriptedAzimuthDelta = 0;
  private scriptedToPolar = 0;
  private destroyed = false;
  private userMovedValue = false;

  constructor(
    camera: THREE.PerspectiveCamera,
    dom: HTMLElement,
    home: { target: Vec3; distance: number },
  ) {
    this.camera = camera;
    this.dom = dom;
    this.homeTargetX = this.clampTargetX(home.target.x);
    this.homeTargetY = this.clampTargetY(home.target.y);
    this.homeTargetZ = this.clampTargetZ(home.target.z);
    this.homeDistance = clamp(home.distance, MIN_DISTANCE, MAX_DISTANCE);
    this.targetX = this.homeTargetX;
    this.targetY = this.homeTargetY;
    this.targetZ = this.homeTargetZ;
    this.distance = this.homeDistance;

    this.dom.addEventListener('pointerdown', this.onPointerDown);
    this.dom.addEventListener('pointermove', this.onPointerMove);
    this.dom.addEventListener('pointerup', this.onPointerUp);
    this.dom.addEventListener('pointercancel', this.onPointerCancel);
    this.dom.addEventListener('wheel', this.onWheel, { passive: false });
    this.dom.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onWindowBlur);

    this.applyCamera();
  }

  update(dt: number): void {
    if (this.destroyed) return;
    const safeDt = Number.isFinite(dt) ? clamp(dt, 0, 0.1) : 0;

    if (this.keysDown.size > 0) {
      this.panByKeys(safeDt);
    } else if (this.followPoint) {
      this.updateFollow(safeDt);
    } else if (this.scriptedMove && !this.userMoved) {
      this.updateScriptedMove(safeDt);
    }

    this.applyCamera();
  }

  /** Smoothly reframes a city event or pipeline stage unless the user takes control. */
  focusOn(point: Vec3, distance?: number): void {
    if (this.destroyed) return;
    this.stopFollow();
    this.startScriptedMove(
      this.clampTargetX(point.x),
      this.clampTargetY(point.y),
      this.clampTargetZ(point.z),
      distance === undefined ? this.distance : clamp(distance, MIN_DISTANCE, MAX_DISTANCE),
      this.azimuth,
      this.polar,
    );
  }

  /** Smoothly follows a moving point such as a pipeline delivery. */
  follow(getPoint: () => Vec3 | null): void {
    if (this.destroyed) return;
    this.scriptedMove = false;
    this.followPoint = getPoint;
  }

  stopFollow(): void {
    this.followPoint = null;
  }

  reset(animated = true): void {
    if (this.destroyed) return;
    this.userMovedValue = false;
    this.dragDistanceSquared = 0;
    this.stopFollow();
    if (animated) {
      this.startScriptedMove(
        this.homeTargetX,
        this.homeTargetY,
        this.homeTargetZ,
        this.homeDistance,
        this.homeAzimuth,
        this.homePolar,
      );
      return;
    }

    this.scriptedMove = false;
    this.targetX = this.homeTargetX;
    this.targetY = this.homeTargetY;
    this.targetZ = this.homeTargetZ;
    this.distance = this.homeDistance;
    this.azimuth = this.homeAzimuth;
    this.polar = this.homePolar;
    this.applyCamera();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.releasePointer(this.activePointerId);
    this.dom.removeEventListener('pointerdown', this.onPointerDown);
    this.dom.removeEventListener('pointermove', this.onPointerMove);
    this.dom.removeEventListener('pointerup', this.onPointerUp);
    this.dom.removeEventListener('pointercancel', this.onPointerCancel);
    this.dom.removeEventListener('wheel', this.onWheel);
    this.dom.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onWindowBlur);
    this.keysDown.clear();
    this.followPoint = null;
    this.scriptedMove = false;
  }

  private takeUserControl(): void {
    this.userMovedValue = true;
    this.scriptedMove = false;
    this.stopFollow();
  }

  private releasePointer(pointerId: number | null): void {
    if (pointerId === null) return;
    try {
      if (this.dom.hasPointerCapture(pointerId)) this.dom.releasePointerCapture(pointerId);
    } catch {
      // Synthetic pointer events cannot always be released.
    }
    this.activePointerId = null;
    this.dragMode = null;
  }

  private startScriptedMove(
    targetX: number,
    targetY: number,
    targetZ: number,
    distance: number,
    azimuth: number,
    polar: number,
  ): void {
    this.scriptedMove = true;
    this.scriptedElapsed = 0;
    this.scriptedFromX = this.targetX;
    this.scriptedFromY = this.targetY;
    this.scriptedFromZ = this.targetZ;
    this.scriptedFromDistance = this.distance;
    this.scriptedFromAzimuth = this.azimuth;
    this.scriptedFromPolar = this.polar;
    this.scriptedToX = targetX;
    this.scriptedToY = targetY;
    this.scriptedToZ = targetZ;
    this.scriptedToDistance = distance;
    this.scriptedAzimuthDelta = wrapAngle(azimuth - this.azimuth);
    this.scriptedToPolar = polar;
  }

  private updateScriptedMove(dt: number): void {
    this.scriptedElapsed = Math.min(SCRIPTED_MOVE_SECONDS, this.scriptedElapsed + dt);
    const progress = this.scriptedElapsed / SCRIPTED_MOVE_SECONDS;
    const eased = 1 - (1 - progress) ** 3;
    this.targetX = this.scriptedFromX + (this.scriptedToX - this.scriptedFromX) * eased;
    this.targetY = this.scriptedFromY + (this.scriptedToY - this.scriptedFromY) * eased;
    this.targetZ = this.scriptedFromZ + (this.scriptedToZ - this.scriptedFromZ) * eased;
    this.distance = this.scriptedFromDistance + (this.scriptedToDistance - this.scriptedFromDistance) * eased;
    this.azimuth = wrapAngle(this.scriptedFromAzimuth + this.scriptedAzimuthDelta * eased);
    this.polar = this.scriptedFromPolar + (this.scriptedToPolar - this.scriptedFromPolar) * eased;
    if (progress === 1) this.scriptedMove = false;
  }

  private updateFollow(dt: number): void {
    const point = this.followPoint?.();
    if (!point) {
      this.stopFollow();
      return;
    }

    const smoothing = 1 - Math.exp(-FOLLOW_SMOOTHNESS * dt);
    this.targetX += (this.clampTargetX(point.x) - this.targetX) * smoothing;
    this.targetY += (this.clampTargetY(point.y) - this.targetY) * smoothing;
    this.targetZ += (this.clampTargetZ(point.z) - this.targetZ) * smoothing;
  }

  private panByDrag(deltaX: number, deltaY: number): void {
    const viewportHeight = Math.max(1, this.dom.clientHeight);
    const worldUnitsPerPixel = (
      2 * this.distance * Math.tan((this.camera.fov * Math.PI) / 360)
    ) / viewportHeight;
    const rightX = Math.cos(this.azimuth);
    const rightZ = -Math.sin(this.azimuth);
    const forwardX = -Math.sin(this.azimuth);
    const forwardZ = -Math.cos(this.azimuth);

    this.targetX = this.clampTargetX(
      this.targetX - rightX * deltaX * worldUnitsPerPixel + forwardX * deltaY * worldUnitsPerPixel,
    );
    this.targetZ = this.clampTargetZ(
      this.targetZ - rightZ * deltaX * worldUnitsPerPixel + forwardZ * deltaY * worldUnitsPerPixel,
    );
  }

  private panByKeys(dt: number): void {
    let lateral = 0;
    let forward = 0;
    if (this.keysDown.has('KeyA') || this.keysDown.has('ArrowLeft')) lateral -= 1;
    if (this.keysDown.has('KeyD') || this.keysDown.has('ArrowRight')) lateral += 1;
    if (this.keysDown.has('KeyW') || this.keysDown.has('ArrowUp')) forward += 1;
    if (this.keysDown.has('KeyS') || this.keysDown.has('ArrowDown')) forward -= 1;
    if (lateral === 0 && forward === 0) return;

    const diagonalScale = lateral !== 0 && forward !== 0 ? Math.SQRT1_2 : 1;
    const distanceScale = this.distance / 60;
    const step = KEY_PAN_SPEED * distanceScale * dt * diagonalScale;
    const rightX = Math.cos(this.azimuth);
    const rightZ = -Math.sin(this.azimuth);
    const forwardX = -Math.sin(this.azimuth);
    const forwardZ = -Math.cos(this.azimuth);
    this.targetX = this.clampTargetX(this.targetX + (rightX * lateral + forwardX * forward) * step);
    this.targetZ = this.clampTargetZ(this.targetZ + (rightZ * lateral + forwardZ * forward) * step);
  }

  private applyCamera(): void {
    const horizontalDistance = this.distance * Math.sin(this.polar);
    const cameraY = Math.max(MIN_CAMERA_HEIGHT, this.targetY + this.distance * Math.cos(this.polar));
    this.camera.position.set(
      this.targetX + horizontalDistance * Math.sin(this.azimuth),
      cameraY,
      this.targetZ + horizontalDistance * Math.cos(this.azimuth),
    );
    this.lookTarget.set(this.targetX, this.targetY, this.targetZ);
    this.camera.lookAt(this.lookTarget);
    this.camera.updateMatrixWorld();
  }

  private clampTargetX(x: number): number {
    return clamp(x, MIN_TARGET_X, MAX_TARGET_X);
  }

  private clampTargetY(y: number): number {
    return clamp(y, 0, 24);
  }

  private clampTargetZ(z: number): number {
    return clamp(z, MIN_TARGET_Z, MAX_TARGET_Z);
  }
}
