import * as THREE from "three";
import { CAMERA_HEIGHT, CAMERA_OFFSET, GROUND_FORESHORTENING } from "../../shared/geometry";
import type { Vec2 } from "../../shared/types";
import type { ViewInsets } from "./contracts";

/** World units the view shows from top to bottom at zoom 1. */
const VIEW_HEIGHT = 28;
export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 3.2;
const FLIGHT_MS = 650;
/**
 * The camera stands this many times further back than its offset. An
 * orthographic image does not change with distance, but everything in front of
 * the near plane is cut, and a wide world reaches far towards the viewer.
 */
const PULL_BACK = 14;

// The camera never turns, so a world point's place on screen is two dot
// products. Right is (1, 0, -1) / sqrt 2; up is the vector below.
const CAMERA_DISTANCE = Math.hypot(CAMERA_OFFSET, CAMERA_HEIGHT, CAMERA_OFFSET);
const RIGHT = Math.SQRT1_2;
/** How far down the screen one unit towards the viewer (+x or +z) moves a point. */
const UP_GROUND = GROUND_FORESHORTENING * Math.SQRT1_2;
/** How far up the screen one unit of height moves a point. */
export const UP_HEIGHT = (CAMERA_OFFSET * Math.SQRT2) / CAMERA_DISTANCE;

/** Turns a quad in the XY plane to face the camera. */
export const BILLBOARD_BASIS = new THREE.Matrix4().makeBasis(
  new THREE.Vector3(RIGHT, 0, -RIGHT),
  new THREE.Vector3(-UP_GROUND, UP_HEIGHT, -UP_GROUND),
  new THREE.Vector3(CAMERA_OFFSET, CAMERA_HEIGHT, CAMERA_OFFSET).normalize(),
);

export interface CameraPose {
  x: number;
  z: number;
  zoom: number;
}

/** A round patch of the world to bring into view. */
export interface WorldDisc {
  x: number;
  z: number;
  radius: number;
  /** The tallest thing standing on it, so that is not cut off at the top of the view. */
  height: number;
  /** How far it hangs below the ground, so that is not cut off at the bottom. */
  depth: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

/**
 * The fixed isometric camera: where it looks, how far it is zoomed, and the
 * arithmetic between the ground and the screen.
 */
export class CameraRig {
  readonly camera = new THREE.OrthographicCamera(-16, 16, 16, -16, 0.1, 4000);
  x = 0;
  z = 0;
  zoom = 1;
  width = 1;
  height = 1;
  reducedMotion = false;
  /** Changes whenever the view does, so dependants know to catch up. */
  version = 0;
  private insets: ViewInsets = { top: 0, right: 0, bottom: 0, left: 0 };
  private world = { width: 1, depth: 1 };
  private flight: { from: CameraPose; to: CameraPose; startedAt: number } | null = null;
  private dirty = true;

  constructor() {
    this.apply();
  }

  /** CSS pixels per world unit across the screen. */
  get pixelsPerUnit(): number {
    return (this.height / VIEW_HEIGHT) * this.zoom;
  }

  /** World units the view spans, left to right and top to bottom. */
  get span(): { width: number; height: number } {
    return { width: this.width / this.pixelsPerUnit, height: this.height / this.pixelsPerUnit };
  }

  get flying(): boolean {
    return this.flight !== null;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    const horizontal = VIEW_HEIGHT * (width / height);
    this.camera.left = -horizontal / 2;
    this.camera.right = horizontal / 2;
    this.camera.top = VIEW_HEIGHT / 2;
    this.camera.bottom = -VIEW_HEIGHT / 2;
    this.touch();
  }

  setInsets(insets: ViewInsets): void {
    this.insets = insets;
  }

  setWorldSize(width: number, depth: number): void {
    this.world = { width, depth };
    this.touch();
  }

  /** Where a world point lands on the canvas, in CSS pixels from its top left. */
  project(x: number, y: number, z: number, out: ScreenPoint): ScreenPoint {
    const scale = this.pixelsPerUnit;
    out.x = this.width / 2 + (x - this.x - (z - this.z)) * RIGHT * scale;
    out.y = this.height / 2 + ((x - this.x + (z - this.z)) * UP_GROUND - y * UP_HEIGHT) * scale;
    return out;
  }

  /** The ground point (y = 0) under a canvas pixel. */
  groundAt(pixelX: number, pixelY: number, out: Vec2): Vec2 {
    const scale = this.pixelsPerUnit;
    const across = (pixelX - this.width / 2) / scale / RIGHT;
    const depth = (pixelY - this.height / 2) / scale / UP_GROUND;
    out.x = this.x + (across + depth) / 2;
    out.z = this.z + (depth - across) / 2;
    return out;
  }

  /** Slides the world so the ground under one pixel ends up under another. */
  pan(fromX: number, fromY: number, toX: number, toY: number): void {
    const scale = this.pixelsPerUnit;
    const across = (fromX - toX) / scale / RIGHT;
    const depth = (fromY - toY) / scale / UP_GROUND;
    this.flight = null;
    this.x += (across + depth) / 2;
    this.z += (depth - across) / 2;
    this.touch();
  }

  /** Zooms while the ground under the given pixel stays where it is. */
  zoomAt(factor: number, pixelX: number, pixelY: number): void {
    const before = this.groundAt(pixelX, pixelY, { x: 0, z: 0 });
    this.flight = null;
    this.zoom = THREE.MathUtils.clamp(this.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    const after = this.groundAt(pixelX, pixelY, { x: 0, z: 0 });
    this.x += before.x - after.x;
    this.z += before.z - after.z;
    this.touch();
  }

  /** The middle of the part of the view that panels leave free. */
  freeCentre(): ScreenPoint {
    return {
      x: (this.insets.left + this.width - this.insets.right) / 2,
      y: (this.insets.top + this.height - this.insets.bottom) / 2,
    };
  }

  /**
   * The pose that shows some discs of the world in the free part of the view,
   * never closer than `maxZoom`. `padding` is how many pixels to keep clear
   * inside the free area: labels above the discs need room that does not shrink
   * with the zoom. With nothing to show, the view stays where it is.
   */
  poseFor(discs: readonly WorldDisc[], maxZoom: number, padding: ViewInsets): CameraPose {
    if (discs.length === 0) return { x: this.x, z: this.z, zoom: this.zoom };
    // A disc is as wide on screen as it is on the ground, and foreshortened in depth.
    let left = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    let top = Number.POSITIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;
    for (const disc of discs) {
      const across = (disc.x - disc.z) * RIGHT;
      const down = (disc.x + disc.z) * UP_GROUND;
      left = Math.min(left, across - disc.radius);
      right = Math.max(right, across + disc.radius);
      top = Math.min(top, down - disc.radius * GROUND_FORESHORTENING - disc.height * UP_HEIGHT);
      bottom = Math.max(bottom, down + disc.radius * GROUND_FORESHORTENING + disc.depth * UP_HEIGHT);
    }
    const frame = {
      left: this.insets.left + padding.left,
      right: this.width - this.insets.right - padding.right,
      top: this.insets.top + padding.top,
      bottom: this.height - this.insets.bottom - padding.bottom,
    };
    const scale = Math.min(
      Math.max(80, frame.right - frame.left) / Math.max(1, right - left),
      Math.max(80, frame.bottom - frame.top) / Math.max(1, bottom - top),
    );
    const zoom = THREE.MathUtils.clamp(scale / (this.height / VIEW_HEIGHT), MIN_ZOOM, maxZoom);
    const fitted = (this.height / VIEW_HEIGHT) * zoom;
    // Put the middle of the outline on the middle of the frame.
    const across = ((left + right) / 2 - ((frame.left + frame.right) / 2 - this.width / 2) / fitted) / RIGHT;
    const depth = ((top + bottom) / 2 - ((frame.top + frame.bottom) / 2 - this.height / 2) / fitted) / UP_GROUND;
    return { x: (across + depth) / 2, z: (depth - across) / 2, zoom };
  }

  /** The pose that puts a ground point in the middle of the free view at the given zoom. */
  poseAt(point: Vec2, zoom: number): CameraPose {
    return this.poseFor([{ x: point.x, z: point.z, radius: 0, height: 0, depth: 0 }], zoom, { top: 0, right: 0, bottom: 0, left: 0 });
  }

  flyTo(pose: CameraPose, now: number): void {
    if (this.reducedMotion) {
      this.jumpTo(pose);
      return;
    }
    this.flight = { from: { x: this.x, z: this.z, zoom: this.zoom }, to: pose, startedAt: now };
  }

  jumpTo(pose: CameraPose): void {
    this.flight = null;
    this.x = pose.x;
    this.z = pose.z;
    this.zoom = THREE.MathUtils.clamp(pose.zoom, MIN_ZOOM, MAX_ZOOM);
    this.touch();
  }

  /** Advances a flight and writes the pose to the camera. Returns whether the view changed. */
  update(now: number): boolean {
    if (this.flight) {
      const { from, to, startedAt } = this.flight;
      const progress = Math.min(1, (now - startedAt) / FLIGHT_MS);
      const eased = progress * progress * (3 - progress * 2);
      this.x = from.x + (to.x - from.x) * eased;
      this.z = from.z + (to.z - from.z) * eased;
      // Zoom is a ratio, so travel through it geometrically.
      this.zoom = from.zoom * (to.zoom / from.zoom) ** eased;
      if (progress === 1) this.flight = null;
      this.touch();
    }
    if (!this.dirty) return false;
    this.apply();
    return true;
  }

  /**
   * The camera may look anywhere over the world plus a margin of a little under
   * half a screen, so any island can be dragged to any part of the view while
   * some of the world always stays in sight.
   */
  private touch(): void {
    if (!this.flight) {
      const margin = (this.span.width / 2) * 0.8;
      this.x = THREE.MathUtils.clamp(this.x, -margin, this.world.width + margin);
      this.z = THREE.MathUtils.clamp(this.z, -margin, this.world.depth + margin);
    }
    this.dirty = true;
  }

  private apply(): void {
    this.camera.zoom = this.zoom;
    this.camera.position.set(this.x + CAMERA_OFFSET * PULL_BACK, CAMERA_HEIGHT * PULL_BACK, this.z + CAMERA_OFFSET * PULL_BACK);
    this.camera.lookAt(this.x, 0, this.z);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.version += 1;
    this.dirty = false;
  }
}
