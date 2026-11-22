import * as THREE from "three";
import type { KitPart } from "./kit";

const FIRST_CAPACITY = 16;

export interface BatchOptions {
  castShadow?: boolean;
  receiveShadow?: boolean;
  /** Instances move every frame: skip the bounding-sphere pass and never cull. */
  animated?: boolean;
  /** Each instance carries its own colour, multiplied into the material's. */
  coloured?: boolean;
  renderOrder?: number;
}

export interface BatchHit {
  id: string;
  distance: number;
}

/**
 * Every copy of one model in as many draw calls as the model has materials,
 * however many copies there are. Refilled as a whole: `begin`, `add` each
 * instance, `end`.
 */
export class ModelBatch {
  readonly group = new THREE.Group();
  /** Entity id per instance, in draw order. */
  readonly ids: string[] = [];
  private meshes: THREE.InstancedMesh[] = [];
  private matrices = new THREE.InstancedBufferAttribute(new Float32Array(0), 16);
  private colours = new THREE.InstancedBufferAttribute(new Float32Array(0), 3);
  private capacity = 0;
  private count = 0;

  constructor(
    private readonly parts: readonly KitPart[],
    private readonly options: BatchOptions = {},
  ) {}

  begin(): void {
    this.count = 0;
    this.ids.length = 0;
  }

  add(id: string, matrix: THREE.Matrix4, colour?: THREE.Color): void {
    if (this.count === this.capacity) this.grow();
    matrix.toArray(this.matrices.array, this.count * 16);
    if (colour && this.options.coloured) colour.toArray(this.colours.array, this.count * 3);
    this.ids.push(id);
    this.count += 1;
  }

  end(): void {
    this.matrices.needsUpdate = true;
    if (this.options.coloured) this.colours.needsUpdate = true;
    for (const mesh of this.meshes) {
      mesh.count = this.count;
      if (!this.options.animated) mesh.computeBoundingSphere();
    }
    this.group.visible = this.count > 0;
  }

  /** The nearest instance the ray hits. */
  pick(raycaster: THREE.Raycaster, hits: THREE.Intersection[]): BatchHit | null {
    if (this.count === 0) return null;
    hits.length = 0;
    raycaster.intersectObjects(this.meshes, false, hits);
    const hit = hits[0];
    const id = hit?.instanceId === undefined ? undefined : this.ids[hit.instanceId];
    return hit && id !== undefined ? { id, distance: hit.distance } : null;
  }

  dispose(): void {
    for (const mesh of this.meshes) mesh.dispose();
    this.meshes = [];
    this.group.clear();
    this.group.removeFromParent();
  }

  /** Doubles the room. Every part shares one matrix buffer, so an instance is written once. */
  private grow(): void {
    const capacity = Math.max(FIRST_CAPACITY, this.capacity * 2);
    const usage = this.options.animated ? THREE.DynamicDrawUsage : THREE.StaticDrawUsage;
    const matrices = new Float32Array(capacity * 16);
    matrices.set(this.matrices.array);
    this.matrices = new THREE.InstancedBufferAttribute(matrices, 16).setUsage(usage);
    if (this.options.coloured) {
      const colours = new Float32Array(capacity * 3).fill(1);
      colours.set(this.colours.array);
      this.colours = new THREE.InstancedBufferAttribute(colours, 3).setUsage(usage);
    }
    for (const mesh of this.meshes) mesh.dispose();
    this.group.clear();
    this.meshes = this.parts.map((part) => {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, capacity);
      mesh.instanceMatrix = this.matrices;
      if (this.options.coloured) mesh.instanceColor = this.colours;
      mesh.count = this.count;
      mesh.castShadow = this.options.castShadow ?? false;
      mesh.receiveShadow = this.options.receiveShadow ?? false;
      mesh.frustumCulled = !this.options.animated;
      mesh.renderOrder = this.options.renderOrder ?? 0;
      return mesh;
    });
    this.group.add(...this.meshes);
    this.capacity = capacity;
  }
}

/** Batches of related models, created the first time a variant is needed. */
export class BatchSet<Key extends string> {
  readonly group = new THREE.Group();
  private readonly batches = new Map<Key, ModelBatch>();

  constructor(private readonly create: (key: Key) => ModelBatch) {}

  begin(): void {
    for (const batch of this.batches.values()) batch.begin();
  }

  add(key: Key, id: string, matrix: THREE.Matrix4): void {
    let batch = this.batches.get(key);
    if (!batch) {
      batch = this.create(key);
      batch.begin();
      this.batches.set(key, batch);
      this.group.add(batch.group);
    }
    batch.add(id, matrix);
  }

  end(): void {
    for (const batch of this.batches.values()) batch.end();
  }

  pick(raycaster: THREE.Raycaster, hits: THREE.Intersection[]): BatchHit | null {
    let nearest: BatchHit | null = null;
    for (const batch of this.batches.values()) {
      const hit = batch.pick(raycaster, hits);
      if (hit && (!nearest || hit.distance < nearest.distance)) nearest = hit;
    }
    return nearest;
  }

  dispose(): void {
    for (const batch of this.batches.values()) batch.dispose();
    this.batches.clear();
    this.group.removeFromParent();
  }
}
