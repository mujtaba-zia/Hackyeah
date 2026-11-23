import * as THREE from "three";
import { GROUND_FORESHORTENING } from "../../shared/geometry";
import type { CityModel, District, Health, Island, Tower, Vec2 } from "../../shared/types";
import { RenderAssets } from "./assets";
import { BatchSet, ModelBatch } from "./batch";
import { BridgeLayer } from "./bridges";
import { CameraRig, type CameraPose, type WorldDisc } from "./camera";
import type { PickTarget, ViewInsets, WorldView, WorldViewOptions } from "./contracts";
import { CreatureLayer } from "./creatures";
import { reconcileById } from "./diff";
import { DistrictLayer } from "./districts";
import { createEffectSlot, hasEffect, type EffectSlot } from "./effects";
import { createIslandVisual, type IslandVisual } from "./islands";
import { WorldOverlay, type LabelHeights } from "./overlay";
import { placeScenery, type SceneryModel, type SceneryPlacement } from "./scenery";
import { SkySystem } from "./sky";
import { GROUND_LIFT, TowerLayer } from "./towers";
import { createWaterfallVisual, type WaterfallVisual } from "./water";
import { selectWaterfallEdges } from "./waterfalls";

interface PointerState {
  x: number;
  y: number;
  /** Where this pointer went down, to tell a click from a drag. */
  downX: number;
  downY: number;
}

/** A press that moves less than this (in CSS pixels) is a click, not a drag. */
const DRAG_THRESHOLD_PX = 6;
/** Arrow keys pan by this many screen pixels. */
const KEY_PAN_PX = 90;
const KEY_ZOOM = 1.2;
/** How close the camera goes when asked to show the whole world, an island, a tower or a pull request. */
const FIT_ZOOM = { world: 1.5, district: 1.7, tower: 2.1, creature: 2.5 } as const;
/** Room, in world units, kept above an island for its buildings, and below it for its cliff. */
const ISLAND_HEADROOM = 8;
const ISLAND_CLIFF = 2.5;
/** Pixels kept clear round whatever is framed; the top has to hold a nameplate and a project title. */
const FRAME_PADDING: ViewInsets = { top: 96, right: 28, bottom: 28, left: 28 };
/** Where the sun stands relative to what it lights: front-left, so shadows fall to the right. */
const SUN_DIRECTION = new THREE.Vector3(-0.35, 1, 0.55).normalize();
/** The shadow map never covers more ground than this radius; beyond it the view is too far out to tell. */
const MAX_SHADOW_RADIUS = 420;
const SELECTION_RING = { district: 0.97, tower: 1.7, creature: 0.62 } as const;

function sameTarget(first: PickTarget | null, second: PickTarget | null): boolean {
  return first?.kind === second?.kind && first?.id === second?.id;
}

/** Browser-side Three.js implementation behind the small HUD-facing contract. */
export class WorldRenderer implements WorldView {
  private readonly scene = new THREE.Scene();
  private readonly rig = new CameraRig();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly assets: RenderAssets;
  private readonly sky: SkySystem;
  private readonly overlay: WorldOverlay;
  private readonly sun = new THREE.DirectionalLight(0xfff1d6, 2.7);
  private readonly islandLayer = new THREE.Group();
  private readonly waterfallLayer = new THREE.Group();
  private readonly effectLayer = new THREE.Group();
  private readonly scenery: BatchSet<SceneryModel>;
  private readonly bridges: BridgeLayer;
  private readonly districts: DistrictLayer;
  private readonly towers: TowerLayer;
  private readonly creatures: CreatureLayer;
  private readonly selectionRing: THREE.Mesh;
  private readonly islandVisuals = new Map<string, IslandVisual>();
  private readonly waterfallVisuals = new Map<string, WaterfallVisual>();
  private readonly effectVisuals = new Map<string, EffectSlot>();
  private readonly sceneryCache = new Map<string, { signature: string; placements: SceneryPlacement[] }>();
  private readonly islandModels = new Map<string, Island>();
  private readonly districtModels = new Map<string, District>();
  private readonly towerModels = new Map<string, Tower>();
  private readonly labelHeights: LabelHeights;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2();
  private readonly hits: THREE.Intersection[] = [];
  private readonly pointers = new Map<number, PointerState>();
  private readonly ground: Vec2 = { x: 0, z: 0 };
  private readonly matrix = new THREE.Matrix4();
  private readonly mediaQuery: MediaQueryList | null;
  private readonly listeners: [EventTarget, string, EventListener, AddEventListenerOptions?][] = [];
  private worldWidth = 1;
  private worldDepth = 1;
  private hasCity = false;
  /** Still showing the whole world as it was last fitted: a world that changes size is fitted again. */
  private pristine = true;
  private selected: PickTarget | null = null;
  private hovered: PickTarget | null = null;
  private reducedMotion = false;
  private disposed = false;
  private animationFrame = 0;
  private lastFrameAt = 0;
  private ambientTime = 0;
  private dragging = false;
  private pinchDistance = 0;
  private labelsStale = true;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly options: WorldViewOptions,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.setClearColor(0x3c6c9c, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Nothing that casts a shadow moves between data updates, so the map is redrawn only when the view or the data changes.
    this.renderer.shadowMap.autoUpdate = false;

    this.assets = new RenderAssets(options.kit);
    this.sky = new SkySystem(this.rig.camera, this.assets);
    this.overlay = new WorldOverlay(options.overlay);
    this.scenery = new BatchSet<SceneryModel>((model) => new ModelBatch(this.assets.kit.parts(model), { castShadow: true, receiveShadow: true }));
    this.bridges = new BridgeLayer(this.assets);
    this.districts = new DistrictLayer(this.assets);
    this.towers = new TowerLayer(this.assets);
    this.creatures = new CreatureLayer(this.assets);
    this.selectionRing = new THREE.Mesh(this.assets.selectionGeometry, this.assets.selectionMaterial);
    this.selectionRing.visible = false;
    this.selectionRing.renderOrder = 5;
    this.labelHeights = {
      hall: GROUND_LIFT + options.kit.top("hq") + 0.6,
      waystation: GROUND_LIFT + options.kit.top("waystation") + 0.6,
      tower: (tower) => GROUND_LIFT + options.kit.top(TowerLayer.modelFor(tower)) + 0.35,
    };

    this.scene.add(
      this.rig.camera,
      this.islandLayer,
      this.scenery.group,
      this.bridges.group,
      this.districts.group,
      this.towers.group,
      this.waterfallLayer,
      this.creatures.group,
      this.effectLayer,
      this.sky.clouds,
      this.selectionRing,
    );
    this.scene.add(new THREE.HemisphereLight(0xe2f1ff, 0x5d6f4c, 1.45));
    // A weak light from the right keeps the sides the sun misses from going flat.
    const fill = new THREE.DirectionalLight(0xcfe4ff, 0.55);
    fill.position.set(1, 0.6, 0.15);
    this.sun.castShadow = true;
    const shadowSize = Math.min(4096, this.renderer.capabilities.maxTextureSize);
    this.sun.shadow.mapSize.set(shadowSize, shadowSize);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.05;
    this.scene.add(this.sun, this.sun.target, fill);

    canvas.tabIndex = 0;
    canvas.setAttribute("aria-label", "Repository world");
    canvas.style.touchAction = "none";
    canvas.style.cursor = "grab";
    this.listen(canvas, "pointerdown", (event) => this.onPointerDown(event as PointerEvent));
    this.listen(canvas, "pointermove", (event) => this.onPointerMove(event as PointerEvent));
    this.listen(canvas, "pointerup", (event) => this.onPointerUp(event as PointerEvent));
    this.listen(canvas, "pointercancel", (event) => this.onPointerCancel(event as PointerEvent));
    this.listen(canvas, "pointerleave", () => this.setHover(null));
    this.listen(canvas, "dblclick", (event) => this.onDoubleClick(event as MouseEvent));
    this.listen(canvas, "wheel", (event) => this.onWheel(event as WheelEvent), { passive: false });
    this.listen(canvas, "keydown", (event) => this.onKeyDown(event as KeyboardEvent));
    this.listen(window, "resize", () => this.resize());
    this.mediaQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)") ?? null;
    if (this.mediaQuery) this.listen(this.mediaQuery, "change", (event) => this.setReducedMotion((event as MediaQueryListEvent).matches));
    this.setReducedMotion(this.mediaQuery?.matches ?? false);
    this.resize();
    this.animationFrame = window.requestAnimationFrame((time) => this.frame(time));
  }

  update(city: CityModel): void {
    if (this.disposed) return;
    const resized = city.worldSize.x !== this.worldWidth || city.worldSize.z !== this.worldDepth;
    this.worldWidth = Math.max(1, city.worldSize.x);
    this.worldDepth = Math.max(1, city.worldSize.z);
    this.rig.setWorldSize(this.worldWidth, this.worldDepth);
    this.sky.setWorldSize(this.worldWidth, this.worldDepth);

    this.islandModels.clear();
    this.districtModels.clear();
    this.towerModels.clear();
    for (const island of city.islands) this.islandModels.set(island.id, island);
    for (const district of city.districts) this.districtModels.set(district.id, district);
    for (const tower of city.towers) this.towerModels.set(tower.id, tower);
    const healthOf = (island: Island): Health => this.districtModels.get(island.id)?.health ?? "good";

    reconcileById(this.islandVisuals, city.islands, {
      id: (island) => island.id,
      create: (island) => {
        const visual = createIslandVisual(island, healthOf(island), this.assets);
        this.islandLayer.add(visual.group);
        return visual;
      },
      update: (visual, island) => visual.update(island, healthOf(island)),
      dispose: (visual) => visual.dispose(),
    });
    this.updateScenery(city);
    this.bridges.update(city.bridges);
    this.districts.update(city.districts, city.islands, city.towers);
    this.towers.update(city.towers);
    this.creatures.update(city.creatures);
    if (this.reducedMotion) this.creatures.animate(this.ambientTime);

    reconcileById(this.waterfallVisuals, selectWaterfallEdges(city.islands, city.bridges, Math.max(3, Math.round(city.islands.length / 4))), {
      id: (waterfall) => waterfall.id,
      create: (waterfall) => {
        const visual = createWaterfallVisual(waterfall, this.assets);
        this.waterfallLayer.add(visual.group);
        return visual;
      },
      update: (visual, waterfall) => visual.update(waterfall),
      dispose: (visual) => visual.dispose(),
    });
    const districtPosition = (id: string): Vec2 | null => this.districtModels.get(id)?.plaza.center ?? null;
    reconcileById(this.effectVisuals, city.incidents.filter(hasEffect), {
      id: (incident) => incident.id,
      create: (incident) => {
        const visual = createEffectSlot(incident, districtPosition, this.assets);
        this.effectLayer.add(visual.group);
        return visual;
      },
      update: (visual, incident) => visual.update(incident, districtPosition),
      dispose: (visual) => visual.dispose(),
    });

    this.overlay.update(city, this.labelHeights);
    this.labelsStale = true;
    this.updateSelectionRing();
    this.renderer.shadowMap.needsUpdate = true;
    if (!this.hasCity || (resized && this.pristine)) {
      this.hasCity = true;
      this.rig.jumpTo(this.worldPose());
      this.pristine = true;
    }
  }

  select(target: PickTarget | null): void {
    if (this.disposed || sameTarget(this.selected, target)) return;
    this.selected = target;
    this.overlay.setSelected(target);
    this.labelsStale = true;
    this.updateSelectionRing();
  }

  focusOn(target: PickTarget): void {
    if (this.disposed) return;
    let disc: WorldDisc | null = null;
    if (target.kind === "district") {
      const island = this.islandModels.get(target.id);
      if (island) disc = this.islandDisc(island);
    } else {
      const spot = target.kind === "tower" ? this.towerModels.get(target.id)?.position : this.creatures.positionOf(target.id);
      if (spot) disc = target.kind === "tower" ? { ...spot, radius: 6, height: 7, depth: 0 } : { ...spot, radius: 3.5, height: 2, depth: 0 };
    }
    if (!disc) return;
    this.pristine = false;
    this.rig.flyTo(this.rig.poseFor([disc], FIT_ZOOM[target.kind], FRAME_PADDING), performance.now());
  }

  focus(point: Vec2): void {
    if (this.disposed) return;
    this.pristine = false;
    this.rig.flyTo(this.rig.poseAt(point, Math.max(this.rig.zoom, 1.15)), performance.now());
  }

  fit(): void {
    if (this.disposed) return;
    this.rig.flyTo(this.worldPose(), performance.now());
    this.pristine = true;
  }

  zoomBy(factor: number): void {
    if (this.disposed) return;
    const centre = this.rig.freeCentre();
    this.pristine = false;
    this.rig.zoomAt(factor, centre.x, centre.y);
  }

  setInsets(insets: ViewInsets): void {
    this.rig.setInsets(insets);
    // Until someone moves the view, keep the whole world in the part of it that is free.
    if (this.hasCity && this.pristine && !this.rig.flying) this.rig.jumpTo(this.worldPose());
  }

  setReducedMotion(on: boolean): void {
    this.reducedMotion = on;
    this.rig.reducedMotion = on;
    this.lastFrameAt = 0;
  }

  resize(): void {
    if (this.disposed) return;
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width || this.canvas.clientWidth || window.innerWidth || 1));
    const height = Math.max(1, Math.floor(rect.height || this.canvas.clientHeight || window.innerHeight || 1));
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);
    this.rig.resize(width, height);
    if (this.hasCity && this.pristine) this.rig.jumpTo(this.worldPose());
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.cancelAnimationFrame(this.animationFrame);
    for (const [target, type, listener, options] of this.listeners) target.removeEventListener(type, listener, options);
    for (const visual of this.effectVisuals.values()) visual.dispose();
    for (const visual of this.waterfallVisuals.values()) visual.dispose();
    for (const visual of this.islandVisuals.values()) visual.dispose();
    this.effectVisuals.clear();
    this.waterfallVisuals.clear();
    this.islandVisuals.clear();
    this.sceneryCache.clear();
    this.scenery.dispose();
    this.bridges.dispose();
    this.districts.dispose();
    this.towers.dispose();
    this.creatures.dispose();
    this.overlay.dispose();
    this.sky.dispose();
    this.sun.shadow.dispose();
    this.assets.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.scene.clear();
  }

  private listen(target: EventTarget, type: string, listener: EventListener, options?: AddEventListenerOptions): void {
    target.addEventListener(type, listener, options);
    this.listeners.push([target, type, listener, options]);
  }

  private islandDisc(island: Island): WorldDisc {
    const radius = island.size.x / 2;
    return { x: island.origin.x + radius, z: island.origin.z + radius, radius, height: ISLAND_HEADROOM, depth: ISLAND_CLIFF };
  }

  /** The pose that shows every island in the free part of the view. */
  private worldPose(): CameraPose {
    const discs = [...this.islandModels.values()].map((island) => this.islandDisc(island));
    return this.rig.poseFor(discs, FIT_ZOOM.world, FRAME_PADDING);
  }

  /** Trees, boulders, shrubs and flowers for every island, recomputed only for islands whose buildings moved. */
  private updateScenery(city: CityModel): void {
    const towersByIsland = new Map<string, Vec2[]>();
    for (const tower of city.towers) {
      const list = towersByIsland.get(tower.islandId);
      if (list) list.push(tower.position);
      else towersByIsland.set(tower.islandId, [tower.position]);
    }
    const quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    this.scenery.begin();
    for (const island of city.islands) {
      const district = this.districtModels.get(island.id);
      const towerPositions = towersByIsland.get(island.id) ?? [];
      const signature = `${island.origin.x},${island.origin.z},${island.size.x},${island.seed}|${towerPositions.map((spot) => `${spot.x},${spot.z}`).join(";")}`;
      let cached = this.sceneryCache.get(island.id);
      if (!cached || cached.signature !== signature) {
        const centre = { x: island.origin.x + island.size.x / 2, z: island.origin.z + island.size.z / 2 };
        cached = {
          signature,
          placements: placeScenery(
            island,
            district
              ? { hq: district.hq, plaza: district.plaza, nursery: district.nursery, towerPositions }
              : { hq: centre, towerPositions },
          ),
        };
        this.sceneryCache.set(island.id, cached);
      }
      for (const placement of cached.placements) {
        quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, placement.rotation);
        this.matrix.compose(position.set(placement.position.x, GROUND_LIFT, placement.position.z), quaternion, scale.setScalar(placement.scale));
        this.scenery.add(placement.model, island.id, this.matrix);
      }
    }
    this.scenery.end();
    for (const id of this.sceneryCache.keys()) {
      if (!this.islandModels.has(id)) this.sceneryCache.delete(id);
    }
  }

  private updateSelectionRing(): void {
    const selected = this.selected;
    let spot: Vec2 | null = null;
    let radius = 1;
    if (selected?.kind === "district") {
      const island = this.islandModels.get(selected.id);
      if (island) {
        spot = { x: island.origin.x + island.size.x / 2, z: island.origin.z + island.size.z / 2 };
        radius = (island.size.x / 2) * SELECTION_RING.district;
      }
    } else if (selected?.kind === "tower") {
      spot = this.towerModels.get(selected.id)?.position ?? null;
      radius = SELECTION_RING.tower;
    } else if (selected?.kind === "creature") {
      spot = this.creatures.positionOf(selected.id);
      radius = SELECTION_RING.creature;
    }
    this.selectionRing.visible = spot !== null;
    if (!spot || !selected) return;
    this.selectionRing.geometry = selected.kind === "district" ? this.assets.shoreRingGeometry : this.assets.selectionGeometry;
    this.selectionRing.position.set(spot.x, 0.2, spot.z);
    this.selectionRing.scale.setScalar(radius);
  }

  /** Keeps the sun's shadow map over the ground the camera can see, as tight as the zoom allows. */
  private aimSun(): void {
    const span = this.rig.span;
    const radius = Math.min(MAX_SHADOW_RADIUS, Math.hypot(span.width, span.height / GROUND_FORESHORTENING) / 2 + 14);
    const shadow = this.sun.shadow.camera;
    this.sun.target.position.set(this.rig.x, 0, this.rig.z);
    this.sun.position.copy(this.sun.target.position).addScaledVector(SUN_DIRECTION, radius + 60);
    this.sun.target.updateMatrixWorld();
    shadow.left = -radius;
    shadow.right = radius;
    shadow.top = radius;
    shadow.bottom = -radius;
    shadow.near = 1;
    shadow.far = radius * 2 + 120;
    shadow.updateProjectionMatrix();
    this.renderer.shadowMap.needsUpdate = true;
  }

  private frame(time: number): void {
    if (this.disposed) return;
    if (this.lastFrameAt === 0) this.lastFrameAt = time;
    const delta = Math.min(0.05, Math.max(0, (time - this.lastFrameAt) / 1000));
    this.lastFrameAt = time;
    const moving = !this.reducedMotion;
    if (moving) {
      this.ambientTime += delta;
      this.assets.waterfallUniforms.time.value = this.ambientTime;
      this.sky.update(delta);
      this.creatures.animate(this.ambientTime);
      for (const effect of this.effectVisuals.values()) effect.animate(this.ambientTime);
      if (this.selected?.kind === "creature") this.updateSelectionRing();
    }
    // A glowing shore is for finding an island from afar; zoomed in on it, it fades so it does not drown the island.
    const glow = THREE.MathUtils.clamp(14 / this.rig.pixelsPerUnit, 0.35, 1);
    this.assets.haloMaterials.warn.opacity = 0.7 * glow;
    this.assets.haloMaterials.bad.opacity = (moving ? 0.74 + Math.sin(this.ambientTime * 2.6) * 0.2 : 0.9) * glow;
    if (this.rig.update(time)) {
      const span = this.rig.span;
      this.sky.resize(span.width, span.height);
      this.aimSun();
      this.labelsStale = true;
    }
    this.towers.animate(this.ambientTime, this.rig.pixelsPerUnit, moving);
    if (this.labelsStale) {
      this.overlay.layout(this.rig);
      this.labelsStale = false;
    }
    this.renderer.render(this.scene, this.rig.camera);
    this.animationFrame = window.requestAnimationFrame((next) => this.frame(next));
  }

  /** Canvas pixels from client coordinates. */
  private local(event: { clientX: number; clientY: number }): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private onPointerDown(event: PointerEvent): void {
    if (this.disposed || event.button > 0) return;
    this.canvas.focus();
    const { x, y } = this.local(event);
    this.pointers.set(event.pointerId, { x, y, downX: x, downY: y });
    if (this.pointers.size === 1) this.dragging = false;
    if (this.pointers.size === 2) {
      this.dragging = true;
      this.pinchDistance = this.currentPinchDistance();
    }
    this.canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  private onPointerMove(event: PointerEvent): void {
    const { x, y } = this.local(event);
    const pointer = this.pointers.get(event.pointerId);
    if (!pointer) {
      if (event.pointerType === "mouse") this.setHover(this.pickAt(x, y));
      return;
    }
    const fromX = pointer.x;
    const fromY = pointer.y;
    pointer.x = x;
    pointer.y = y;
    if (!this.dragging && Math.hypot(x - pointer.downX, y - pointer.downY) > DRAG_THRESHOLD_PX) {
      this.dragging = true;
      this.setHover(null);
      // Catch up the movement that happened inside the threshold, so the grab point stays put.
      if (this.pointers.size === 1) this.pan(pointer.downX, pointer.downY, x, y);
    } else if (this.dragging && this.pointers.size === 1) {
      this.pan(fromX, fromY, x, y);
    }
    if (this.dragging) this.canvas.style.cursor = "grabbing";
    if (this.pointers.size >= 2) {
      const distance = this.currentPinchDistance();
      const mid = this.pinchMidpoint();
      if (this.pinchDistance > 0 && distance > 0 && mid) this.zoomAt(distance / this.pinchDistance, mid.x, mid.y);
      this.pinchDistance = distance;
    }
    event.preventDefault();
  }

  private onPointerUp(event: PointerEvent): void {
    if (!this.pointers.has(event.pointerId)) return;
    const wasClick = !this.dragging && this.pointers.size === 1;
    this.releasePointer(event.pointerId);
    if (wasClick) {
      const { x, y } = this.local(event);
      const target = this.pickAt(x, y);
      this.select(target);
      this.options.onPick(target);
    }
    this.canvas.style.cursor = this.hovered ? "pointer" : "grab";
    event.preventDefault();
  }

  private onPointerCancel(event: PointerEvent): void {
    this.releasePointer(event.pointerId);
    this.canvas.style.cursor = "grab";
  }

  private releasePointer(pointerId: number): void {
    this.pointers.delete(pointerId);
    if (this.pointers.size < 2) this.pinchDistance = 0;
    if (this.canvas.hasPointerCapture(pointerId)) this.canvas.releasePointerCapture(pointerId);
    // Lifting one finger of a pinch must not turn the remaining finger's release into a click.
    if (this.pointers.size === 0) this.dragging = false;
  }

  /** A double click flies to whatever was clicked. The first click has already selected it. */
  private onDoubleClick(event: MouseEvent): void {
    const { x, y } = this.local(event);
    const target = this.pickAt(x, y);
    if (target) this.focusOn(target);
    event.preventDefault();
  }

  private onWheel(event: WheelEvent): void {
    // Trackpad pinch arrives as ctrl+wheel with small deltas; scale it up to feel the same.
    const delta = event.ctrlKey ? event.deltaY * 4 : event.deltaY;
    const { x, y } = this.local(event);
    this.zoomAt(Math.exp(-delta * 0.0015), x, y);
    event.preventDefault();
  }

  private onKeyDown(event: KeyboardEvent): void {
    const cx = this.rig.width / 2;
    const cy = this.rig.height / 2;
    // Arrow keys move the view in that direction, i.e. the world the opposite way.
    if (event.key === "ArrowLeft") this.pan(cx, cy, cx + KEY_PAN_PX, cy);
    else if (event.key === "ArrowRight") this.pan(cx, cy, cx - KEY_PAN_PX, cy);
    else if (event.key === "ArrowUp") this.pan(cx, cy, cx, cy + KEY_PAN_PX);
    else if (event.key === "ArrowDown") this.pan(cx, cy, cx, cy - KEY_PAN_PX);
    else if (event.key === "+" || event.key === "=") this.zoomBy(KEY_ZOOM);
    else if (event.key === "-" || event.key === "_") this.zoomBy(1 / KEY_ZOOM);
    else if (event.key === "0" || event.key === "Home") this.fit();
    else return;
    event.preventDefault();
  }

  private pan(fromX: number, fromY: number, toX: number, toY: number): void {
    this.pristine = false;
    this.rig.pan(fromX, fromY, toX, toY);
  }

  private zoomAt(factor: number, x: number, y: number): void {
    this.pristine = false;
    this.rig.zoomAt(factor, x, y);
  }

  private pinchMidpoint(): { x: number; y: number } | null {
    const [first, second] = [...this.pointers.values()];
    return first && second ? { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 } : null;
  }

  private currentPinchDistance(): number {
    const [first, second] = [...this.pointers.values()];
    return first && second ? Math.hypot(second.x - first.x, second.y - first.y) : 0;
  }

  /**
   * What is under a canvas pixel: a label first, then a pull request, a tower
   * or a town hall, and failing those the island whose ground is there.
   */
  private pickAt(x: number, y: number): PickTarget | null {
    const labelled = this.overlay.hitTest(x, y);
    if (labelled) return labelled;
    this.pointerNdc.set((x / this.rig.width) * 2 - 1, -(y / this.rig.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointerNdc, this.rig.camera);
    const creature = this.creatures.pick(this.raycaster, this.hits);
    if (creature) return { kind: "creature", id: creature.id };
    const tower = this.towers.pick(this.raycaster, this.hits);
    if (tower) return { kind: "tower", id: tower.id };
    const hall = this.districts.pick(this.raycaster, this.hits);
    if (hall) return { kind: "district", id: hall.id };
    this.rig.groundAt(x, y, this.ground);
    for (const district of this.districtModels.values()) {
      const island = this.islandModels.get(district.id);
      if (!island) continue;
      const half = island.size.x / 2;
      if (Math.hypot(this.ground.x - island.origin.x - half, this.ground.z - island.origin.z - half) <= half) {
        return { kind: "district", id: district.id };
      }
    }
    return null;
  }

  private setHover(target: PickTarget | null): void {
    if (sameTarget(this.hovered, target)) return;
    this.hovered = target;
    this.overlay.setHovered(target);
    this.labelsStale = true;
    this.canvas.style.cursor = target ? "pointer" : "grab";
    this.options.onHover?.(target);
  }
}
