import * as THREE from "three";
import type { CityModel, Creature, District, Island, Tower, Vec2 } from "../../shared/types";
import type { RenderAssets } from "./assets";
import { RenderAssets as AssetStore } from "./assets";
import { createBridgeVisual, type BridgeVisual } from "./bridges";
import { createCreatureVisual, type CreatureVisual } from "./creatures";
import { reconcileById } from "./diff";
import { createEffectSlot, type EffectLocator, type EffectSlot } from "./effects";
import { createDistrictVisual, createTowerVisual, type DistrictVisual, type TowerVisual } from "./buildings";
import { createIslandVisual, createSceneryVisual, type IslandVisual, type SceneryVisual } from "./islands";
import { createLinkVisual, type LinkVisual } from "./links";
import { placeScenery, type SceneryReservations } from "./scenery";
import { SkySystem } from "./sky";
import { createWaterfallVisual, type WaterfallVisual } from "./water";
import { selectWaterfallEdges } from "./waterfalls";
import type { PickTarget, WorldView, WorldViewOptions } from "./contracts";

interface PickEntry {
  target: PickTarget;
  object: THREE.Object3D;
}

interface PointerState {
  x: number;
  y: number;
}

interface SceneryInput {
  signature: string;
  reservations: SceneryReservations;
}

const EMPTY_POSITIONS: readonly Vec2[] = [];
const CAMERA_HEIGHT = 34;
const CAMERA_OFFSET = 30;
const FOCUS_DURATION_MS = 600;

function sameTarget(first: PickTarget | null, second: PickTarget | null): boolean {
  return first?.kind === second?.kind && first?.id === second?.id;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/** Browser-side Three.js implementation behind the small HUD-facing contract. */
export class WorldRenderer implements WorldView {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-16, 16, 16, -16, 0.1, 2000);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly assets: RenderAssets;
  private readonly sky: SkySystem;
  private readonly islandLayer = new THREE.Group();
  private readonly sceneryLayer = new THREE.Group();
  private readonly bridgeLayer = new THREE.Group();
  private readonly districtLayer = new THREE.Group();
  private readonly towerLayer = new THREE.Group();
  private readonly waterfallLayer = new THREE.Group();
  private readonly linkLayer = new THREE.Group();
  private readonly creatureLayer = new THREE.Group();
  private readonly effectLayer = new THREE.Group();
  private readonly selectionRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private readonly islandVisuals = new Map<string, IslandVisual>();
  private readonly sceneryVisuals = new Map<string, SceneryVisual>();
  private readonly scenerySignatures = new Map<string, string>();
  private readonly bridgeVisuals = new Map<string, BridgeVisual>();
  private readonly districtVisuals = new Map<string, DistrictVisual>();
  private readonly towerVisuals = new Map<string, TowerVisual>();
  private readonly waterfallVisuals = new Map<string, WaterfallVisual>();
  private readonly linkVisuals = new Map<string, LinkVisual>();
  private readonly creatureVisuals = new Map<string, CreatureVisual>();
  private readonly effectVisuals = new Map<string, EffectSlot>();
  private readonly islandModels = new Map<string, Island>();
  private readonly districtModels = new Map<string, District>();
  private readonly towerModels = new Map<string, Tower>();
  private readonly creatureModels = new Map<string, Creature>();
  private readonly creatureFrames: CreatureVisual[] = [];
  private readonly linkFrames: LinkVisual[] = [];
  private readonly effectFrames: EffectSlot[] = [];
  private readonly creaturePickEntries: PickEntry[] = [];
  private readonly towerPickEntries: PickEntry[] = [];
  private readonly districtPickEntries: PickEntry[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly intersections: THREE.Intersection<THREE.Object3D>[] = [];
  private readonly pointers = new Map<number, PointerState>();
  private readonly effectLocator: EffectLocator;
  private readonly mediaQuery: MediaQueryList | null;
  private readonly onMotionPreferenceChange: (event: MediaQueryListEvent) => void;
  private readonly onPointerDownBound: (event: PointerEvent) => void;
  private readonly onPointerMoveBound: (event: PointerEvent) => void;
  private readonly onPointerUpBound: (event: PointerEvent) => void;
  private readonly onPointerCancelBound: (event: PointerEvent) => void;
  private readonly onPointerLeaveBound: () => void;
  private readonly onWheelBound: (event: WheelEvent) => void;
  private readonly onKeyDownBound: (event: KeyboardEvent) => void;
  private readonly onResizeBound: () => void;
  private readonly frameBound: (time: number) => void;
  private worldWidth = 20;
  private worldDepth = 20;
  private viewportWidth = 1;
  private viewportHeight = 1;
  private cameraTargetX = 10;
  private cameraTargetZ = 10;
  private focusStartX = 10;
  private focusStartZ = 10;
  private focusEndX = 10;
  private focusEndZ = 10;
  private focusStartedAt = 0;
  private focusing = false;
  private cameraDirty = true;
  private selected: PickTarget | null = null;
  private hovered: PickTarget | null = null;
  private reducedMotion = false;
  private disposed = false;
  private animationFrame = 0;
  private lastFrameAt = 0;
  private ambientTime = 0;
  private dragDistance = 0;
  private pinchDistance = 0;
  private hasCity = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly options: WorldViewOptions,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x5a7ea1, 1);
    this.assets = new AssetStore();
    this.camera.position.set(this.cameraTargetX + CAMERA_OFFSET, CAMERA_HEIGHT, this.cameraTargetZ + CAMERA_OFFSET);
    this.camera.lookAt(this.cameraTargetX, 0, this.cameraTargetZ);
    this.scene.add(this.camera);
    this.sky = new SkySystem(this.camera, this.assets);
    this.selectionRing = new THREE.Mesh(this.assets.selectionGeometry, this.assets.selectionMaterial);
    this.selectionRing.rotation.x = -Math.PI / 2;
    this.selectionRing.position.y = 0.12;
    this.selectionRing.visible = false;

    this.scene.add(
      this.islandLayer,
      this.sceneryLayer,
      this.bridgeLayer,
      this.districtLayer,
      this.towerLayer,
      this.waterfallLayer,
      this.linkLayer,
      this.creatureLayer,
      this.effectLayer,
      this.sky.clouds,
      this.selectionRing,
    );
    this.scene.add(new THREE.HemisphereLight(0xdcefff, 0x2a3140, 2.2));
    const sun = new THREE.DirectionalLight(0xfff2d2, 2.8);
    sun.position.set(26, 38, 18);
    this.scene.add(sun);

    canvas.tabIndex = 0;
    canvas.setAttribute("aria-label", "Repository world");
    canvas.style.touchAction = "none";
    this.effectLocator = {
      district: (id: string): Vec2 | null => this.districtPosition(id),
      tower: (id: string): Vec2 | null => this.towerPosition(id),
      creature: (id: string): Vec2 | null => this.creaturePosition(id),
    };
    this.onPointerDownBound = (event: PointerEvent): void => this.onPointerDown(event);
    this.onPointerMoveBound = (event: PointerEvent): void => this.onPointerMove(event);
    this.onPointerUpBound = (event: PointerEvent): void => this.onPointerUp(event);
    this.onPointerCancelBound = (event: PointerEvent): void => this.onPointerCancel(event);
    this.onPointerLeaveBound = (): void => this.setHover(null);
    this.onWheelBound = (event: WheelEvent): void => this.onWheel(event);
    this.onKeyDownBound = (event: KeyboardEvent): void => this.onKeyDown(event);
    this.onResizeBound = (): void => this.resize();
    this.frameBound = (time: number): void => this.frame(time);
    canvas.addEventListener("pointerdown", this.onPointerDownBound);
    canvas.addEventListener("pointermove", this.onPointerMoveBound);
    canvas.addEventListener("pointerup", this.onPointerUpBound);
    canvas.addEventListener("pointercancel", this.onPointerCancelBound);
    canvas.addEventListener("pointerleave", this.onPointerLeaveBound);
    canvas.addEventListener("wheel", this.onWheelBound, { passive: false });
    canvas.addEventListener("keydown", this.onKeyDownBound);
    window.addEventListener("resize", this.onResizeBound);
    this.mediaQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)") ?? null;
    this.reducedMotion = this.mediaQuery?.matches ?? false;
    this.onMotionPreferenceChange = (event: MediaQueryListEvent): void => this.setReducedMotion(event.matches);
    this.mediaQuery?.addEventListener("change", this.onMotionPreferenceChange);
    this.resize();
    this.animationFrame = window.requestAnimationFrame(this.frameBound);
  }

  update(city: CityModel): void {
    if (this.disposed) return;
    this.worldWidth = Math.max(1, city.worldSize.x);
    this.worldDepth = Math.max(1, city.worldSize.z);
    if (!this.hasCity) {
      this.cameraTargetX = this.worldWidth / 2;
      this.cameraTargetZ = this.worldDepth / 2;
      this.hasCity = true;
      this.fitInitialCamera();
      this.clampCameraTarget();
      this.cameraDirty = true;
    }
    this.sky.setWorldSize(this.worldWidth, this.worldDepth);
    this.updateModelMaps(city);

    reconcileById(this.islandVisuals, city.islands, {
      id: (island) => island.id,
      create: (island) => {
        const visual = createIslandVisual(island, this.assets);
        this.islandLayer.add(visual.group);
        return visual;
      },
      update: (visual, island) => visual.update(island),
      dispose: (visual) => visual.dispose(),
    });

    reconcileById(this.districtVisuals, city.districts, {
      id: (district) => district.id,
      create: (district) => {
        const island = this.islandModels.get(district.id);
        if (!island) throw new Error(`district island missing: ${district.id}`);
        const visual = createDistrictVisual(district, island, this.assets);
        this.districtLayer.add(visual.root);
        return visual;
      },
      update: (visual, district) => {
        const island = this.islandModels.get(district.id);
        if (!island) throw new Error(`district island missing: ${district.id}`);
        visual.update(district, island);
      },
      dispose: (visual) => visual.dispose(),
    });

    reconcileById(this.towerVisuals, city.towers, {
      id: (tower) => tower.id,
      create: (tower) => {
        const visual = createTowerVisual(tower, this.assets);
        this.towerLayer.add(visual.root);
        return visual;
      },
      update: (visual, tower) => visual.update(tower),
      dispose: (visual) => visual.dispose(),
    });

    this.syncScenery(city.islands);

    reconcileById(this.bridgeVisuals, city.bridges, {
      id: (bridge) => bridge.id,
      create: (bridge) => {
        const visual = createBridgeVisual(bridge, this.assets);
        this.bridgeLayer.add(visual.group);
        return visual;
      },
      update: (visual, bridge) => visual.update(bridge),
      dispose: (visual) => visual.dispose(),
    });

    const waterfalls = selectWaterfallEdges(city.islands, city.bridges);
    reconcileById(this.waterfallVisuals, waterfalls, {
      id: (waterfall) => waterfall.id,
      create: (waterfall) => {
        const visual = createWaterfallVisual(waterfall, this.assets);
        this.waterfallLayer.add(visual.group);
        return visual;
      },
      update: (visual, waterfall) => visual.update(waterfall),
      dispose: (visual) => visual.dispose(),
    });

    reconcileById(this.linkVisuals, city.links, {
      id: (link) => link.id,
      create: (link) => {
        const visual = createLinkVisual(link);
        this.linkLayer.add(visual.mesh);
        return visual;
      },
      update: (visual, link) => visual.update(link),
      dispose: (visual) => visual.dispose(),
    });

    reconcileById(this.creatureVisuals, city.creatures, {
      id: (creature) => creature.id,
      create: (creature) => {
        const visual = createCreatureVisual(creature, this.assets);
        this.creatureLayer.add(visual.root);
        return visual;
      },
      update: (visual, creature) => visual.update(creature),
      dispose: (visual) => visual.dispose(),
    });

    reconcileById(this.effectVisuals, city.incidents, {
      id: (incident) => incident.id,
      create: (incident) => {
        const visual = createEffectSlot(incident, this.effectLocator, this.assets);
        this.effectLayer.add(visual.group);
        return visual;
      },
      update: (visual, incident) => visual.update(incident, this.effectLocator),
      dispose: (visual) => visual.dispose(),
    });

    this.refreshFrameLists();
    this.refreshPickEntries();
    this.refreshTowerLabels();
    this.updateSelectionRing();
    this.clampCameraTarget();
    this.cameraDirty = true;
  }

  select(target: PickTarget | null): void {
    if (this.disposed || sameTarget(this.selected, target)) return;
    this.selected = target;
    this.updateSelectionRing();
    this.refreshTowerLabels();
  }

  focus(point: Vec2): void {
    if (this.disposed) return;
    this.focusEndX = point.x;
    this.focusEndZ = point.z;
    this.clampFocusEnd();
    if (this.reducedMotion) {
      this.cameraTargetX = this.focusEndX;
      this.cameraTargetZ = this.focusEndZ;
      this.focusing = false;
      this.cameraDirty = true;
      return;
    }
    this.focusStartX = this.cameraTargetX;
    this.focusStartZ = this.cameraTargetZ;
    this.focusStartedAt = performance.now();
    this.focusing = true;
  }

  setReducedMotion(on: boolean): void {
    if (this.reducedMotion === on) return;
    this.reducedMotion = on;
    if (on && this.focusing) {
      this.cameraTargetX = this.focusEndX;
      this.cameraTargetZ = this.focusEndZ;
      this.focusing = false;
      this.cameraDirty = true;
    }
    this.lastFrameAt = performance.now();
  }

  resize(): void {
    if (this.disposed) return;
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width || this.canvas.clientWidth || window.innerWidth || 1));
    const height = Math.max(1, Math.floor(rect.height || this.canvas.clientHeight || window.innerHeight || 1));
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);
    const vertical = 28;
    const horizontal = vertical * (width / height);
    this.camera.left = -horizontal / 2;
    this.camera.right = horizontal / 2;
    this.camera.top = vertical / 2;
    this.camera.bottom = -vertical / 2;
    this.camera.updateProjectionMatrix();
    this.sky.resize(horizontal / this.camera.zoom, vertical / this.camera.zoom);
    this.clampCameraTarget();
    this.cameraDirty = true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.cancelAnimationFrame(this.animationFrame);
    this.canvas.removeEventListener("pointerdown", this.onPointerDownBound);
    this.canvas.removeEventListener("pointermove", this.onPointerMoveBound);
    this.canvas.removeEventListener("pointerup", this.onPointerUpBound);
    this.canvas.removeEventListener("pointercancel", this.onPointerCancelBound);
    this.canvas.removeEventListener("pointerleave", this.onPointerLeaveBound);
    this.canvas.removeEventListener("wheel", this.onWheelBound);
    this.canvas.removeEventListener("keydown", this.onKeyDownBound);
    window.removeEventListener("resize", this.onResizeBound);
    this.mediaQuery?.removeEventListener("change", this.onMotionPreferenceChange);

    for (const visual of this.effectVisuals.values()) visual.dispose();
    for (const visual of this.creatureVisuals.values()) visual.dispose();
    for (const visual of this.linkVisuals.values()) visual.dispose();
    for (const visual of this.waterfallVisuals.values()) visual.dispose();
    for (const visual of this.towerVisuals.values()) visual.dispose();
    for (const visual of this.districtVisuals.values()) visual.dispose();
    for (const visual of this.bridgeVisuals.values()) visual.dispose();
    for (const visual of this.islandVisuals.values()) visual.dispose();
    for (const visual of this.sceneryVisuals.values()) visual.group.removeFromParent();
    this.effectVisuals.clear();
    this.creatureVisuals.clear();
    this.linkVisuals.clear();
    this.waterfallVisuals.clear();
    this.towerVisuals.clear();
    this.districtVisuals.clear();
    this.bridgeVisuals.clear();
    this.islandVisuals.clear();
    this.sceneryVisuals.clear();
    this.scenerySignatures.clear();
    this.sky.dispose();
    this.assets.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.scene.clear();
  }

  private updateModelMaps(city: CityModel): void {
    this.islandModels.clear();
    this.districtModels.clear();
    this.towerModels.clear();
    this.creatureModels.clear();
    for (let index = 0; index < city.islands.length; index += 1) {
      const island = city.islands[index];
      if (island) this.islandModels.set(island.id, island);
    }
    for (let index = 0; index < city.districts.length; index += 1) {
      const district = city.districts[index];
      if (district) this.districtModels.set(district.id, district);
    }
    for (let index = 0; index < city.towers.length; index += 1) {
      const tower = city.towers[index];
      if (tower) this.towerModels.set(tower.id, tower);
    }
    for (let index = 0; index < city.creatures.length; index += 1) {
      const creature = city.creatures[index];
      if (creature) this.creatureModels.set(creature.id, creature);
    }
  }

  private syncScenery(islands: readonly Island[]): void {
    reconcileById(this.sceneryVisuals, islands, {
      id: (island) => island.id,
      create: (island) => {
        const input = this.sceneryInput(island);
        const visual = createSceneryVisual(input.signature, placeScenery(island, input.reservations), this.assets);
        this.scenerySignatures.set(island.id, input.signature);
        this.sceneryLayer.add(visual.group);
        return visual;
      },
      update: (visual, island) => {
        const input = this.sceneryInput(island);
        if (this.scenerySignatures.get(island.id) === input.signature) return;
        visual.update(input.signature, placeScenery(island, input.reservations));
        this.scenerySignatures.set(island.id, input.signature);
      },
      dispose: (visual) => visual.group.removeFromParent(),
    });
  }

  private sceneryInput(island: Island): SceneryInput {
    const district = this.districtModels.get(island.id);
    const islandSignature = `${island.id}:${island.kind}:${island.seed}:${island.origin.x}:${island.origin.z}:${island.size.x}:${island.size.z}`;
    const towerPositions: Vec2[] = [];
    let towerSignature = "";
    for (const tower of this.towerModels.values()) {
      if (tower.islandId !== island.id) continue;
      towerPositions.push(tower.position);
      towerSignature += `:${tower.position.x},${tower.position.z}`;
    }
    if (!district) {
      return {
        signature: `${islandSignature}${towerSignature}`,
        reservations: { towerPositions: towerPositions.length === 0 ? EMPTY_POSITIONS : towerPositions },
      };
    }
    return {
      signature: `${islandSignature}:${district.hq.x}:${district.hq.z}:${district.plaza.center.x}:${district.plaza.center.z}:${district.nursery.center.x}:${district.nursery.center.z}${towerSignature}`,
      reservations: {
        hq: district.hq,
        plaza: district.plaza,
        nursery: district.nursery,
        towerPositions: towerPositions.length === 0 ? EMPTY_POSITIONS : towerPositions,
      },
    };
  }

  private refreshFrameLists(): void {
    this.creatureFrames.length = 0;
    this.linkFrames.length = 0;
    this.effectFrames.length = 0;
    for (const visual of this.creatureVisuals.values()) this.creatureFrames.push(visual);
    for (const visual of this.linkVisuals.values()) this.linkFrames.push(visual);
    for (const visual of this.effectVisuals.values()) this.effectFrames.push(visual);
  }

  private refreshPickEntries(): void {
    this.creaturePickEntries.length = 0;
    this.towerPickEntries.length = 0;
    this.districtPickEntries.length = 0;
    for (const [id, visual] of this.creatureVisuals) {
      this.creaturePickEntries.push({ target: { kind: "creature", id }, object: visual.root });
    }
    for (const [id, visual] of this.towerVisuals) {
      this.towerPickEntries.push({ target: { kind: "tower", id }, object: visual.root });
    }
    for (const [id, visual] of this.districtVisuals) {
      this.districtPickEntries.push({ target: { kind: "district", id }, object: visual.root });
    }
  }

  private refreshTowerLabels(): void {
    for (const [id, visual] of this.towerVisuals) {
      const selected = this.selected?.kind === "tower" && this.selected.id === id;
      const hovered = this.hovered?.kind === "tower" && this.hovered.id === id;
      visual.showName(selected || hovered);
    }
  }

  private updateSelectionRing(): void {
    if (!this.selected) {
      this.selectionRing.visible = false;
      return;
    }
    if (this.selected.kind === "district") {
      const district = this.districtVisuals.get(this.selected.id);
      if (!district) {
        this.selectionRing.visible = false;
        return;
      }
      this.selectionRing.position.set(district.data.plaza.center.x, 0.12, district.data.plaza.center.z);
      this.selectionRing.scale.set(2.4, 2.4, 1);
      this.selectionRing.visible = true;
      return;
    }
    if (this.selected.kind === "creature") {
      const creature = this.creatureVisuals.get(this.selected.id);
      if (!creature) {
        this.selectionRing.visible = false;
        return;
      }
      this.selectionRing.position.set(creature.root.position.x, 0.12, creature.root.position.z);
      this.selectionRing.scale.set(0.92, 0.92, 1);
      this.selectionRing.visible = true;
      return;
    }
    const tower = this.towerVisuals.get(this.selected.id);
    if (!tower) {
      this.selectionRing.visible = false;
      return;
    }
    this.selectionRing.position.set(tower.root.position.x, 0.12, tower.root.position.z);
    this.selectionRing.scale.set(1.15, 1.15, 1);
    this.selectionRing.visible = true;
  }

  private districtPosition(id: string): Vec2 | null {
    return this.districtVisuals.get(id)?.data.plaza.center ?? null;
  }

  private towerPosition(id: string): Vec2 | null {
    return this.towerVisuals.get(id)?.data.position ?? null;
  }

  private creaturePosition(id: string): Vec2 | null {
    return this.creatureVisuals.get(id)?.data.home ?? null;
  }

  private frame(time: number): void {
    if (this.disposed) return;
    if (this.lastFrameAt === 0) this.lastFrameAt = time;
    const delta = Math.min(0.05, Math.max(0, (time - this.lastFrameAt) / 1000));
    this.lastFrameAt = time;
    if (!this.reducedMotion) {
      this.ambientTime += delta;
      this.assets.waterfallUniforms.time.value = this.ambientTime;
      this.sky.update(delta);
      for (let index = 0; index < this.creatureFrames.length; index += 1) this.creatureFrames[index]?.animate(this.ambientTime);
      for (let index = 0; index < this.linkFrames.length; index += 1) this.linkFrames[index]?.animate(this.ambientTime);
      for (let index = 0; index < this.effectFrames.length; index += 1) this.effectFrames[index]?.animate(this.ambientTime);
      if (this.selected?.kind === "creature") this.updateSelectionRing();
    }
    this.updateFocus(time);
    if (this.cameraDirty) this.applyCamera();
    this.renderer.render(this.scene, this.camera);
    this.animationFrame = window.requestAnimationFrame(this.frameBound);
  }

  private updateFocus(time: number): void {
    if (!this.focusing) return;
    const progress = Math.min(1, (time - this.focusStartedAt) / FOCUS_DURATION_MS);
    const eased = progress * progress * (3 - progress * 2);
    this.cameraTargetX = this.focusStartX + (this.focusEndX - this.focusStartX) * eased;
    this.cameraTargetZ = this.focusStartZ + (this.focusEndZ - this.focusStartZ) * eased;
    this.cameraDirty = true;
    if (progress === 1) this.focusing = false;
  }

  private applyCamera(): void {
    this.camera.position.set(this.cameraTargetX + CAMERA_OFFSET, CAMERA_HEIGHT, this.cameraTargetZ + CAMERA_OFFSET);
    this.camera.lookAt(this.cameraTargetX, 0, this.cameraTargetZ);
    this.camera.updateMatrixWorld();
    this.cameraDirty = false;
  }

  private clampCameraTarget(): void {
    const xSpan = Math.min(this.worldWidth / 2, ((this.camera.right - this.camera.left) / this.camera.zoom) * 0.38);
    const zSpan = Math.min(this.worldDepth / 2, ((this.camera.top - this.camera.bottom) / this.camera.zoom) * 0.72);
    const minimumX = xSpan;
    const maximumX = this.worldWidth - xSpan;
    const minimumZ = zSpan;
    const maximumZ = this.worldDepth - zSpan;
    this.cameraTargetX = minimumX > maximumX ? this.worldWidth / 2 : clamp(this.cameraTargetX, minimumX, maximumX);
    this.cameraTargetZ = minimumZ > maximumZ ? this.worldDepth / 2 : clamp(this.cameraTargetZ, minimumZ, maximumZ);
  }

  private clampFocusEnd(): void {
    const xSpan = Math.min(this.worldWidth / 2, ((this.camera.right - this.camera.left) / this.camera.zoom) * 0.38);
    const zSpan = Math.min(this.worldDepth / 2, ((this.camera.top - this.camera.bottom) / this.camera.zoom) * 0.72);
    const minimumX = xSpan;
    const maximumX = this.worldWidth - xSpan;
    const minimumZ = zSpan;
    const maximumZ = this.worldDepth - zSpan;
    this.focusEndX = minimumX > maximumX ? this.worldWidth / 2 : clamp(this.focusEndX, minimumX, maximumX);
    this.focusEndZ = minimumZ > maximumZ ? this.worldDepth / 2 : clamp(this.focusEndZ, minimumZ, maximumZ);
  }

  private fitInitialCamera(): void {
    const widthFit = (this.camera.right - this.camera.left) / (this.worldWidth * 1.12);
    const depthFit = (this.camera.top - this.camera.bottom) / (this.worldDepth * 1.22);
    this.setZoom(Math.min(1, widthFit, depthFit));
  }

  private setZoom(nextZoom: number): void {
    const clamped = clamp(nextZoom, 0.45, 3.2);
    if (clamped === this.camera.zoom) return;
    this.camera.zoom = clamped;
    this.camera.updateProjectionMatrix();
    this.sky.resize((this.camera.right - this.camera.left) / clamped, (this.camera.top - this.camera.bottom) / clamped);
    this.clampCameraTarget();
    this.cameraDirty = true;
  }

  private panFromScreen(deltaX: number, deltaY: number): void {
    const unitPerPixel = (this.camera.top - this.camera.bottom) / (this.viewportHeight * this.camera.zoom);
    this.cameraTargetX += (-deltaX + deltaY) * unitPerPixel * 0.6;
    this.cameraTargetZ += (deltaX + deltaY) * unitPerPixel * 0.6;
    this.clampCameraTarget();
    this.focusing = false;
    this.cameraDirty = true;
  }

  private onPointerDown(event: PointerEvent): void {
    if (this.disposed) return;
    this.canvas.focus();
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.pointers.size === 2) {
      this.dragDistance = 16;
      this.pinchDistance = this.currentPinchDistance();
    } else {
      this.dragDistance = 0;
    }
    this.canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  private onPointerMove(event: PointerEvent): void {
    const pointer = this.pointers.get(event.pointerId);
    if (!pointer) {
      if (event.pointerType === "mouse") this.setHover(this.pickAt(event.clientX, event.clientY));
      return;
    }
    const deltaX = event.clientX - pointer.x;
    const deltaY = event.clientY - pointer.y;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    this.dragDistance += deltaX * deltaX + deltaY * deltaY;
    if (this.pointers.size === 1) {
      this.panFromScreen(deltaX, deltaY);
    } else if (this.pointers.size >= 2) {
      const distance = this.currentPinchDistance();
      if (this.pinchDistance > 0 && distance > 0) this.setZoom(this.camera.zoom * (distance / this.pinchDistance));
      this.pinchDistance = distance;
    }
    event.preventDefault();
  }

  private onPointerUp(event: PointerEvent): void {
    const wasTap = this.dragDistance < 16;
    this.pointers.delete(event.pointerId);
    if (this.pointers.size < 2) this.pinchDistance = 0;
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    if (wasTap) {
      const target = this.pickAt(event.clientX, event.clientY);
      this.select(target);
      this.options.onPick(target);
    }
    event.preventDefault();
  }

  private onPointerCancel(event: PointerEvent): void {
    this.pointers.delete(event.pointerId);
    if (this.pointers.size < 2) this.pinchDistance = 0;
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
  }

  private onWheel(event: WheelEvent): void {
    this.setZoom(this.camera.zoom * Math.exp(-event.deltaY * 0.0012));
    event.preventDefault();
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.key === "ArrowLeft") this.panFromScreen(-55, 0);
    else if (event.key === "ArrowRight") this.panFromScreen(55, 0);
    else if (event.key === "ArrowUp") this.panFromScreen(0, -55);
    else if (event.key === "ArrowDown") this.panFromScreen(0, 55);
    else if (event.key === "+" || event.key === "=") this.setZoom(this.camera.zoom * 1.15);
    else if (event.key === "-" || event.key === "_") this.setZoom(this.camera.zoom / 1.15);
    else return;
    event.preventDefault();
  }

  private currentPinchDistance(): number {
    let first: PointerState | null = null;
    let second: PointerState | null = null;
    for (const pointer of this.pointers.values()) {
      if (!first) first = pointer;
      else {
        second = pointer;
        break;
      }
    }
    if (!first || !second) return 0;
    return Math.hypot(second.x - first.x, second.y - first.y);
  }

  private pickAt(clientX: number, clientY: number): PickTarget | null {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const creature = this.pickFromEntries(this.creaturePickEntries);
    if (creature) return creature;
    const tower = this.pickFromEntries(this.towerPickEntries);
    if (tower) return tower;
    return this.pickFromEntries(this.districtPickEntries);
  }

  private pickFromEntries(entries: readonly PickEntry[]): PickTarget | null {
    let closest: PickTarget | null = null;
    let distance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      if (!entry) continue;
      this.intersections.length = 0;
      this.raycaster.intersectObject(entry.object, true, this.intersections);
      const hit = this.intersections[0];
      if (hit && hit.distance < distance) {
        closest = entry.target;
        distance = hit.distance;
      }
    }
    return closest;
  }

  private setHover(target: PickTarget | null): void {
    if (sameTarget(this.hovered, target)) return;
    this.hovered = target;
    this.refreshTowerLabels();
    this.options.onHover?.(target);
  }
}
