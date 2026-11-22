import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/** Every model the Blender kit (art/blender/build_kit.py) exports, by node name. */
export const KIT_MODELS = [
  "hq",
  "tower_ci",
  "tower_ci_foundation",
  "tower_ci_building",
  "tower_ci_broken",
  "tower_release",
  "tower_release_foundation",
  "tower_release_building",
  "tower_release_broken",
  "plaza",
  "nursery",
  "creature",
  "egg",
  "tree_pine",
  "tree_round",
  "tree_birch",
  "rock_1",
  "rock_2",
  "rock_3",
  "bush_1",
  "bush_2",
  "flowers_1",
  "flowers_2",
  "waystation",
  "giant",
] as const;

export type KitModel = (typeof KIT_MODELS)[number];

/** One draw call's worth of a model: geometry already in model space, with its kit material. */
export interface KitPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

/**
 * Material names the renderer swaps per entity: `Accent` is a district's
 * health, `Status` and `Beacon` a pipeline's latest run (as paint and as
 * light), `Body` a pull request's mood.
 */
export type RecolouredMaterial = "Accent" | "Status" | "Beacon" | "Body";

export class ModelKit {
  private readonly models: Record<KitModel, readonly KitPart[]>;

  constructor(models: Record<KitModel, readonly KitPart[]>) {
    this.models = models;
  }

  /** A model's parts, with the materials named in `swap` replaced. */
  parts(model: KitModel, swap: Partial<Record<RecolouredMaterial, THREE.Material>> = {}): readonly KitPart[] {
    return this.models[model].map((part) => {
      const override = swap[part.material.name as RecolouredMaterial];
      return override ? { geometry: part.geometry, material: override } : part;
    });
  }

  /** Highest point of a model, in model units. */
  top(model: KitModel): number {
    return this.bounds(model, () => true).max.y;
  }

  /** Centre of a model's glowing `Beacon` parts (lantern, brazier, work lamps, embers). */
  beaconCentre(model: KitModel): THREE.Vector3 {
    return this.bounds(model, (part) => part.material.name === "Beacon").getCenter(new THREE.Vector3());
  }

  template(model: KitModel, name: RecolouredMaterial): THREE.Material {
    const part = this.models[model].find((candidate) => candidate.material.name === name);
    if (!part) throw new Error(`model-kit: ${model} has no ${name} material`);
    return part.material;
  }

  dispose(): void {
    const materials = new Set<THREE.Material>();
    for (const model of KIT_MODELS) {
      for (const part of this.models[model]) {
        part.geometry.dispose();
        materials.add(part.material);
      }
    }
    for (const material of materials) material.dispose();
  }

  private bounds(model: KitModel, include: (part: KitPart) => boolean): THREE.Box3 {
    const box = new THREE.Box3();
    for (const part of this.models[model]) {
      if (!include(part)) continue;
      part.geometry.computeBoundingBox();
      if (part.geometry.boundingBox) box.union(part.geometry.boundingBox);
    }
    if (box.isEmpty()) throw new Error(`model-kit: ${model} has no matching parts`);
    return box;
  }
}

/** Bakes each named model in a loaded glTF scene into model-space parts. */
export function kitFromScene(scene: THREE.Object3D): ModelKit {
  scene.updateMatrixWorld(true);
  const models = {} as Record<KitModel, readonly KitPart[]>;
  const inverse = new THREE.Matrix4();
  const relative = new THREE.Matrix4();
  for (const model of KIT_MODELS) {
    const root = scene.getObjectByName(model);
    if (!root) throw new Error(`model-kit: missing ${model}`);
    inverse.copy(root.matrixWorld).invert();
    const parts: KitPart[] = [];
    root.traverse((node) => {
      if (!(node instanceof THREE.Mesh) || Array.isArray(node.material)) return;
      relative.multiplyMatrices(inverse, node.matrixWorld);
      const geometry = node.geometry.clone().applyMatrix4(relative);
      geometry.computeBoundingSphere();
      parts.push({ geometry, material: node.material });
    });
    if (parts.length === 0) throw new Error(`model-kit: ${model} has no meshes`);
    models[model] = parts;
  }
  return new ModelKit(models);
}

/** Loads the kit exported by `npm run models` (served from public/models/). */
export async function loadModelKit(url: string): Promise<ModelKit> {
  const gltf = await new GLTFLoader().loadAsync(url);
  return kitFromScene(gltf.scene);
}
