import { readFileSync } from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";
import type { RunResult } from "../../shared/types";
import { ModelBatch } from "../../src/render/batch";
import { KIT_MODELS, kitFromScene, type ModelKit } from "../../src/render/kit";
import { TOWER_MODELS, TOWER_STAGE } from "../../src/render/towers";

function namedMaterial(name: string): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial();
  material.name = name;
  return material;
}

function sceneWith(models: readonly string[]): THREE.Group {
  const scene = new THREE.Group();
  for (const name of models) {
    const root = new THREE.Group();
    root.name = name;
    root.position.set(10, 0, 0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), namedMaterial(name === "hq" ? "Accent" : "Stone"));
    mesh.position.set(0, 2, 0);
    root.add(mesh);
    scene.add(root);
  }
  return scene;
}

async function shippedKit(): Promise<ModelKit> {
  const file = readFileSync(new URL("../../public/models/kit.glb", import.meta.url));
  const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  return kitFromScene((await new GLTFLoader().parseAsync(buffer, "")).scene);
}

describe("model kit", () => {
  it("bakes each model into model space, ignoring where it sits in the file", () => {
    const kit = kitFromScene(sceneWith(KIT_MODELS));
    const [part] = kit.parts("tower_ci");
    part!.geometry.computeBoundingBox();
    const centre = part!.geometry.boundingBox!.getCenter(new THREE.Vector3());
    expect(centre.toArray()).toEqual([0, 2, 0]);
  });

  it("refuses a file that is missing a model", () => {
    expect(() => kitFromScene(sceneWith(KIT_MODELS.filter((name) => name !== "egg")))).toThrow("missing egg");
  });

  it("swaps only the recoloured material and shares everything else", () => {
    const kit = kitFromScene(sceneWith(KIT_MODELS));
    const health = namedMaterial("good");
    const [swapped] = kit.parts("hq", { Accent: health });
    const [plain] = kit.parts("hq");
    const [untouched] = kit.parts("tower_ci", { Accent: health });
    expect(swapped!.material).toBe(health);
    expect(plain!.material).toBe(kit.template("hq", "Accent"));
    expect(swapped!.geometry).toBe(plain!.geometry);
    expect(untouched!.material.name).toBe("Stone");
  });
});

describe("instanced batches", () => {
  it("draws every copy of a model, however many, and names the one a ray hits", () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.computeBoundingSphere();
    const batch = new ModelBatch([{ geometry, material: namedMaterial("Stone") }]);
    const matrix = new THREE.Matrix4();
    batch.begin();
    // More copies than the batch starts with room for.
    for (let index = 0; index < 40; index += 1) batch.add(`tower-${index}`, matrix.makeTranslation(index * 3, 0, 0));
    batch.end();
    batch.group.updateMatrixWorld(true);

    const mesh = batch.group.children[0] as THREE.InstancedMesh;
    expect(mesh.count).toBe(40);
    const raycaster = new THREE.Raycaster(new THREE.Vector3(37 * 3, 10, 0), new THREE.Vector3(0, -1, 0));
    expect(batch.pick(raycaster, [])?.id).toBe("tower-37");

    // Refilling with fewer copies forgets the rest.
    batch.begin();
    batch.add("only", matrix.makeTranslation(0, 0, 0));
    batch.end();
    expect((batch.group.children[0] as THREE.InstancedMesh).count).toBe(1);
    expect(batch.pick(raycaster, [])).toBeNull();
  });
});

describe("shipped kit", () => {
  it("contains every model and the materials the renderer recolours", async () => {
    const kit = await shippedKit();
    expect(kit.template("hq", "Accent").name).toBe("Accent");
    expect(kit.template("creature", "Body").name).toBe("Body");
    expect(kit.template("egg", "Body").name).toBe("Body");
  });

  it("gives every pipeline status a tower stage that shows the status as paint and as light", async () => {
    const kit = await shippedKit();
    for (const status of Object.keys(TOWER_STAGE) as RunResult[]) {
      for (const kind of ["ci", "release"] as const) {
        const model = TOWER_MODELS[kind][TOWER_STAGE[status]];
        expect(kit.template(model, "Status").name).toBe("Status");
        expect(kit.template(model, "Beacon").name).toBe("Beacon");
      }
    }
  });

  it("tells a tower's stage by its height: foundations low, a broken tower a stump, scaffolding in between", async () => {
    const kit = await shippedKit();
    for (const kind of ["ci", "release"] as const) {
      const built = kit.top(TOWER_MODELS[kind].built);
      expect(kit.top(TOWER_MODELS[kind].building)).toBeLessThan(built);
      expect(kit.top(TOWER_MODELS[kind].broken)).toBeLessThan(built * 0.6);
      expect(kit.top(TOWER_MODELS[kind].foundation)).toBeLessThan(built * 0.35);
    }
  });
});
